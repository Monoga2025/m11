# Prompt mejorado — Laboratorio interactivo 3D de LIGO

**Rol:** Eres un equipo de física computacional + diseño interactivo + pedagogía. Entrega UN solo archivo HTML (Three.js desde CDN, sin build) que funcione offline-friendly, en español, en tablet y escritorio.

**Objetivo de aprendizaje (el estudiante debe poder explicar al salir):**
1. Una onda gravitacional estira y comprime el espacio (h = ΔL/L), primero en una dirección y luego en la perpendicular (polarización +).
2. LIGO usa un interferómetro de Michelson con brazos de 4 km: dos haces se recombinan y la diferencia de fase revela ΔL.
3. La señal real es ~10⁻¹⁸ m (1/1000 del diámetro de un protón): por eso necesitamos cavidades Fabry-Pérot, espejos de 40 kg y aislamiento sísmico.
4. De la señal "chirp" se deduce la masa de chirp, la distancia y el tipo de fuente (agujeros negros vs. estrellas de neutrones).

**Modelo físico correcto (no negociable):**
- Inspiral de binaria: f(τ) = (1/π)(5/(256τ))^{3/8}(G·Mc/c³)^{-5/8}, Mc = (m1·m2)^{3/5}/(m1+m2)^{1/5}; h ∝ (G·Mc/c²)^{5/3}(πf/c)^{2/3}/D; fusión y ringdown amortiguado.
- Detector: Δφ = 4π(L_x − L_y)/λ con λ = 1064 nm; intensidad en el fotodiodo I = cos²(Δφ/2).
- Presets reales: GW150914 (36+29 M☉, 410 Mpc), GW170817 (1.46+1.27 M☉, 40 Mpc), agujeros negros ligeros, y fuente personalizada.
- Escalas honestas: el modo "Realista" muestra el valor verdadero; el modo "Exagerado" multiplica la deformación con un factor visible y SIEMPRE rotulado (×N).

**Experiencia tipo PhET (simplicidad):** controles mínimos (masas, distancia, inclinación, factor de exageración, velocidad, ruido on/off), play/pausa/reiniciar, lecturas en vivo (f, h, ΔL, Δφ), sin menús ocultos. Cada control tiene una frase de "qué pasa si lo cambio".

**Calidad visual (efecto "wow"):** universo con binaria orbitando y malla espacio-tiempo ondulante, anillos de onda que viajan; detector en L con láser que recorre los brazos, brazos que se estiran/comprimen, franjas de interferencia y fotodiodo parpadeando; espectrograma en vivo del chirp; sonido opcional del chirp (Web Audio) tras interacción. Tema oscuro cósmico, tipografía con carácter, 60 fps, tolerante a `prefers-reduced-motion`.

**Pedagogía guiada:** tour de 6 pasos (misiones) con micro-retos ("sube la masa y observa qué pasa con la frecuencia"), widget de escala (proton vs. ΔL), mini quiz con retroalimentación, glosario emergente. Cierra con "Lo que debes recordar" en 3 viñetas.

**Restricciones técnicas:** un solo HTML, Three.js r128 desde cdnjs, Canvas 2D para gráficas, sin `any`-style hacks, sin errores en consola, responsive (≥ 400 px), accesible (foco visible, contraste, etiquetas).
