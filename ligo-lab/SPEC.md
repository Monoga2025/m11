# SPEC técnico — LIGO Lab (contrato entre módulos)

Todo el código es JS clásico (no ES modules), ES2018, se concatena en un solo HTML. Three.js r128 ya está cargado como global `THREE` (NO hay OrbitControls: escribe tu propio orbit simple con pointer events si lo necesitas). Sin dependencias adicionales. Español en todo texto visible. Comenta poco. Cada archivo debe ser sintácticamente válido por sí solo (`node --check`). Cada archivo solo toca su propio namespace: `window.LIGO.<modulo>`.

## Núcleo (ya escrito por el orquestador: src/core.js)
- `LIGO.state`: `{ preset:'GW150914', m1:36, m2:29, distMpc:410, incl:0 /*rad, 0=cara*/, exag:1e20 /*factor visual sobre h real*/, realistic:false, speed:1, playing:true, noise:false, view:'both' }`
- `LIGO.bus.on(evento, fn)`, `LIGO.bus.emit(evento, datos)`. Eventos: `state` (cambió algo, datos = claves cambiadas), `frame` (cada frame, datos = Frame), `reset`, `merger` (al cruzar la fusión), `tourstep`.
- `LIGO.setState(partial)` mezcla y emite `state`. `LIGO.frame` = último Frame.
- Cada módulo expone `init()` llamada tras DOMContentLoaded.

## Frame (lo produce physics.sample)
```
{ t,            // s desde inicio de la simulación de la pista
  tToMerge,     // s hasta fusión (negativo tras fusión)
  f,            // Hz frecuencia GW
  hPlus, hCross,// strain adimensional REAL en el detector (con inclinación)
  sepKm,        // separación orbital en km (para dibujar)
  phase,        // fase orbital rad
  phase2,       // fase de la onda GW = 2*phase
  merged,       // boolean
  dL,           // m: cambio real del brazo X: +h*L/2 ; brazo Y: -h*L/2 (L=4000)
  dLVisual,     // m: dL * exag (o dL si realistic)
  dPhi,         // rad: 4π(ΔLx−ΔLy)/λ usando dLVisual*2 -> 2*dLVisual; λ=1064e-9
  intensity,    // 0..1 = cos²(dPhi/2 + π/2)  (punto de operación oscuro con fugas ->, pero mantenlo 0..1)
  progress }    // 0..1 posición en la pista
```
## 1) physics.js → `LIGO.physics` (puro, sin DOM)
- `PRESETS`: array `{id,name,m1,m2,distMpc,desc}` con GW150914, GW170817, 'Agujeros ligeros 10+8 @ 200Mpc', 'Supermasivos-juguete 100+90 @ 800Mpc'.
- `chirpMass(m1,m2)`, `totalMass(m1,m2)`, `fIsco(m1,m2)` (4400/Mtot Hz), `hAmplitude(f,mc,distMpc)`, `peakStrain(state)`.
- `buildTrack(state)` → `{ n, dt, duration, tMerge, f:Float32Array, hPlus:Float32Array, hCross:Float32Array, sepKm:Float32Array, phase:Float32Array }`; fs=2048 Hz, empieza en f≈20 Hz, pero si dura >12 s tomar f0 más alta para limitar a ~12 s de pista (aviso: GW170817 real dura 100 s; recortamos a f0≈ el valor que da 12 s). Inspiral post-newtoniano de orden 0, fusión suave, ringdown exponencial a f_ring≈ 1.2*fIsco*... (razonable). Incluye inclinación: h+ ∝ (1+cos²i)/2, h× ∝ cos i.
- `sample(track, t, state)` → Frame (interpola, aplica exag/realistic, noise opcional: ruido gaussiano con rms ~ 1e-22 si state.noise, sino 0).
- `armLength=4000`, `lambda=1064e-9`, `protonDiameter=1.7e-15`.
- `formatSI(x, unit)` → string con prefijo (p. ej. "3.2 am", "1.0×10⁻¹⁸ m"; usa notación científica con superíndices unicode cuando <1e-18).
- `selfTest()` devuelve true si GW150914 da pico h≈1e-21 (entre 3e-22 y 3e-21) y mc≈28 M☉ (27–30).

## 2) universe3d.js → `LIGO.universe3d`
`create(containerEl)` → `{ update(frame, state), resize(), setPaused(b) }`. Escena Three.js propia: fondo estrellado (Points), dos esferas negras con disco de acreción/glow orbitando según `frame.sepKm` y `frame.phase` (mapear sepKm a unidades de escena con escala suave), malla espacio-tiempo (PlaneGeometry segmentada, vértices con pozo gravitacional + ondulaciones radiales cuya amplitud y longitud de onda siguen `frame.f`, y propagación hacia afuera), anillos de onda que se emiten cada ciclo GW, flash y ringdown en la fusión (`frame.merged`). Orbit con arrastre de puntero/touch y zoom con rueda/pinch, auto-rotación suave. Colores: agujeros negros con borde naranja cálido, onda en cian→violeta. `renderer.setPixelRatio(min(devicePixelRatio,2))`, loop de render propio con requestAnimationFrame que llama a render; `update` solo guarda datos. Respetar reducción de movimiento (menos amplitud).

## 3) detector3d.js → `LIGO.detector3d`
`create(containerEl)` → `{ update(frame, state), resize() }`. Escena 3D del interferómetro en L: láser (emisor), beam splitter, espejo X, espejo Y, fotodiodo, tubos de brazos (cilindros), haz de luz que viaja (partículas/segmentos animados) por ambos brazos y vuelve, cavidades. Los brazos se estiran/comprimen visualmente: longitud visual = Lbase*(1 ± dLVisual/ armLength_visualScale) — usa `state.exag` ya aplicado en `frame.dLVisual`; mapea `dLVisual/4000` a una deformación relativa y amplifícala con un factor de escena de modo que con exag≈1e20 se vea claramente (±8%). En modo realistic no se ve nada y debe mostrarse (en un label 3D o sprite) "ΔL real = ...". Mostrar flechas de referencia, etiquetas con sprites de texto (canvas texture): "Láser 1064 nm", "Divisor de haz", "Espejo 40 kg", "Fotodiodo". El fotodiodo brilla con `frame.intensity`. Orbit con puntero/touch + zoom, vista inicial en perspectiva desde arriba. Suelo sutil con rejilla. Colores: haz láser rojo-anaranjado (#ff5a3c), estructura azul acero.

## 4) charts.js → `LIGO.charts`
`init()` busca canvases `#chart-strain`, `#chart-spectro`, `#chart-fringe` y se suscribe a `LIGO.bus` (`frame`, `state`, `reset`). Usa `LIGO.physics.buildTrack` (con `LIGO.state`) para precomputar la pista completa.
- strain: serie de h(t) completa en tono tenue, parte ya reproducida resaltada, cursor, marca de fusión, ejes con etiquetas reales (tiempo s, strain ×10⁻²¹), rejilla.
- spectro: espectrograma tiempo-frecuencia (f 20–500 Hz log o lineal) del chirp precalculado en un offscreen canvas (por STFT simple o directamente trazando f(t) con intensidad ∝ h) con cursor; paleta cálida (negro→violeta→naranja→blanco).
- fringe: arriba, patrón de franjas de interferencia circular (anillos) cuyo contraste/fase sigue `frame.dPhi`; abajo, tira temporal (osciloscopio) de `frame.intensity` de los últimos 4 s.
Todos con devicePixelRatio, ResizeObserver, colores desde variables CSS (`getComputedStyle(document.documentElement).getPropertyValue('--ink')` etc.: `--ink --ink-2 --line --text --muted --laser --wave --wave2 --warm`). Título pequeño dentro del canvas NO (los títulos van en HTML).

## 5) ui.js + style.css → `LIGO.ui` (DOM fijo en template.html, ver ids)
Rellena y da vida a: `#controls` (sliders m1 [3–120], m2 [3–120], distancia [10–1500 Mpc], inclinación [0–90°], exageración (log: 1, 1e10, 1e15, 1e20, 1e21), velocidad [0.1–2×], checkboxes ruido/realista, selector de presets como botones), botones play/pausa/reiniciar, lecturas en vivo `#readouts` (f, h, ΔL, Δφ, tiempo a fusión, masa de chirp), `#scale` (widget visual: barra log mostrando 4 km → 1 m → 1 mm → protón 1.7 fm → ΔL real ≈ 1e-18 m, con comparación textual "mil veces menor que un protón"), `#tour` (6 misiones con texto en español, botón siguiente/anterior, cada misión puede cambiar el estado de la simulación con LIGO.setState y resaltar un panel añadiendo clase `.spot` a un id), `#quiz` (5 preguntas con retroalimentación inmediata, puntaje), `#glossary` (términos: strain, chirp, interferómetro, Fabry-Pérot, polarización, masa de chirp, SNR; tooltips al hacer clic), `#lessons` ("Lo que debes recordar" 3 viñetas). Audio opcional: botón "Escuchar el chirp" con Web Audio (oscilador cuya frecuencia sigue frame.f, fade) que SOLO inicia al clic. Estilo en style.css (solo CSS de componentes de controles/tour/quiz/readouts/scale/glossary; el layout general y variables ya están en template.html).
