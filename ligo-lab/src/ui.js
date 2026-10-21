/* LIGO.ui: controles, lecturas en vivo, escala, tour, quiz, glosario, lecciones y audio. */
(function () {
  'use strict';
  var LIGO = (window.LIGO = window.LIGO || {});

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  var EXAG_STEPS = [1, 1e10, 1e15, 1e20, 1e21];
  var EXAG_LABELS = ['×1', '×10¹⁰', '×10¹⁵', '×10²⁰', '×10²¹'];
  var ARM = 4000;
  var PROTON = 1.7e-15;
  var LOG_MIN = -19;
  var LOG_MAX = 4;
  var READ_MS = 66;

  var FALLBACK_PRESETS = [
    { id: 'GW150914', name: 'GW150914', m1: 36, m2: 29, distMpc: 410, desc: 'Primera detección: 36 y 29 M☉ a 410 Mpc' },
    { id: 'GW170817', name: 'GW170817', m1: 1.46, m2: 1.27, distMpc: 40, desc: 'Estrellas de neutrones a 40 Mpc' }
  ];

  var MISSIONS = [
    {
      title: 'La onda estira el espacio',
      body: 'La binaria gira y se acerca. Cada ciclo emite una onda gravitacional que ondula la malla del espacio-tiempo. No empuja la materia como una fuerza: es el propio espacio el que cambia de tamaño.',
      reto: 'Observa la malla: ¿cada cuánto se repite la ondulación?',
      spot: ['universe'],
      set: { preset: 'GW150914', m1: 36, m2: 29, distMpc: 410, incl: 0, exag: 1e20, realistic: false, playing: true }
    },
    {
      title: 'Más masa, otra frecuencia',
      body: 'La frecuencia de la onda sube durante la espiral y llega a su máximo en la fusión, donde f ≈ 4400 / M_total Hz. Más masa total significa una fusión a frecuencia más baja.',
      reto: 'Sube m1 hasta 60 y observa f y el tiempo hasta la fusión.',
      spot: ['readouts'],
      set: { preset: 'GW150914', m1: 36, m2: 29, distMpc: 410, playing: true }
    },
    {
      title: 'El interferómetro: dos brazos y franjas',
      body: 'La luz del láser se divide, recorre dos brazos perpendiculares de 4 km y vuelve a juntarse. Si la onda cambia la longitud de los brazos, cambia la diferencia de fase Δφ = 4π(L_x − L_y)/λ, y con ella el patrón de franjas.',
      reto: 'Con exageración ×10²⁰, mira cómo se mueven las franjas y el fotodiodo.',
      spot: ['detector', 'chart-fringe'],
      set: { exag: 1e20, realistic: false, incl: 0, playing: true }
    },
    {
      title: 'La señal real es minúscula',
      body: 'Con el valor real, ΔL ≈ 10⁻¹⁸ m, unas mil veces menos que un protón. Por eso LIGO necesita cavidades Fabry-Pérot, espejos de 40 kg y aislamiento sísmico.',
      reto: 'Activa «Valor realista» y compara la barra de escala con el protón.',
      spot: ['scale'],
      set: { realistic: true, playing: true }
    },
    {
      title: 'Escucha y mira el chirp',
      body: 'En el espectrograma la frecuencia sube como un gorjeo (chirp). Esa subida depende sobre todo de la masa de chirp, Mc = (m1·m2)^{3/5} / (m1+m2)^{1/5}.',
      reto: 'Pulsa «Escuchar el chirp» y pon la velocidad en 0.5×.',
      spot: ['chart-spectro'],
      set: { realistic: false, exag: 1e20, speed: 0.5, playing: true }
    },
    {
      title: 'Distancia e inclinación',
      body: 'La amplitud cae como 1/distancia: al doblar la distancia, h se reduce a la mitad. La inclinación cambia la polarización: a 90° (de canto) h× desaparece y h₊ baja a la mitad.',
      reto: 'Pon la inclinación en 90° y la distancia en 820 Mpc. Compara h.',
      spot: ['controls'],
      set: { preset: 'GW150914', m1: 36, m2: 29, distMpc: 410, incl: 0, speed: 1, playing: true }
    }
  ];

  var QUIZ = [
    {
      q: '¿Qué es lo que estira y comprime una onda gravitacional?',
      opts: ['El aire que rodea al detector', 'El propio espacio-tiempo', 'La luz del láser', 'La Tierra'],
      ans: 1,
      ok: 'Correcto. La onda cambia la distancia entre puntos del propio espacio-tiempo, y por eso cambia la longitud de los brazos.',
      bad: 'No. La onda no empuja el aire ni la Tierra: cambia la geometría del espacio-tiempo.'
    },
    {
      q: 'Si ambos brazos cambian su longitud exactamente igual, ¿qué ve el fotodiodo?',
      opts: ['Una señal enorme', 'Nada: Δφ = 0 porque la diferencia es cero', 'El chirp completo', 'La frecuencia del láser cambia'],
      ans: 1,
      ok: 'Exacto. El interferómetro mide ΔL_x − ΔL_y. Un cambio igual en ambos brazos no produce señal.',
      bad: 'No. El detector mide la diferencia entre brazos; si los dos cambian igual, la diferencia de fase es cero.'
    },
    {
      q: '¿Qué orden de magnitud tiene ΔL para GW150914 (h ≈ 10⁻²¹, L = 4 km)?',
      opts: ['1 m', '10⁻³ m (un milímetro)', '10⁻¹⁸ m', '4000 m'],
      ans: 2,
      ok: 'Sí: ΔL ≈ hL/2 ≈ 10⁻¹⁸ m, unas mil veces menor que un protón.',
      bad: 'Revisa la escala: con h ≈ 10⁻²¹ y L = 4 km, el cambio es del orden de 10⁻¹⁸ m.'
    },
    {
      q: 'Si subes la masa de la binaria, ¿qué pasa con la frecuencia a la que ocurre la fusión?',
      opts: ['Sube', 'Baja', 'No cambia', 'Se hace cero'],
      ans: 1,
      ok: 'Correcto: f_ISCO ≈ 4400 / M_total Hz. Más masa, fusión a frecuencia más baja.',
      bad: 'Piensa en f_ISCO ≈ 4400 / M_total Hz: si M_total crece, f baja.'
    },
    {
      q: 'En LIGO se opera en «franja oscura». ¿Qué significa?',
      opts: [
        'Sin onda casi no llega luz al fotodiodo, y la onda lo ilumina',
        'Sin onda el fotodiodo está saturado de luz',
        'El láser se apaga en el vacío',
        'Los espejos son negros para no reflejar'
      ],
      ans: 0,
      ok: 'Así es. Una señal pequeña aparece como un aumento de luz sobre un fondo oscuro, lo que da mucha sensibilidad.',
      bad: 'Piensa en el punto de operación: sin onda, los haces se cancelan y casi no llega luz.'
    }
  ];

  var TERMS = [
    { t: 'Strain (deformación h)', d: 'h = ΔL/L: fracción en que la onda cambia la longitud. Es adimensional y en LIGO es del orden de 10⁻²¹.' },
    { t: 'Chirp', d: 'Gorjeo: la frecuencia y la amplitud suben juntas mientras la binaria se acerca. Suena como un piar que se agudiza.' },
    { t: 'Interferómetro', d: 'Dos haces de luz recorren brazos perpendiculares y se recombinan. Si las longitudes cambian, cambia el patrón de franjas.' },
    { t: 'Fabry-Pérot', d: 'Cavidad: la luz rebota muchas veces entre dos espejos dentro del brazo. En LIGO da unas 280 vueltas, así que el camino efectivo es de unos 1100 km.' },
    { t: 'Polarización', d: 'La onda deforma el espacio en dos patrones: «+» (ejes X e Y) y «×» (rotado 45°). El detector ve una mezcla según la orientación de la fuente.' },
    { t: 'Masa de chirp (Mc)', d: 'Mc = (m1·m2)^{3/5} / (m1+m2)^{1/5}. Es la combinación de masas que más controla la frecuencia del chirp.' },
    { t: 'SNR (relación señal-ruido)', d: 'Cuántas veces la señal supera al ruido. Para aceptar una detección se exige un SNR alto; el umbral típico es ≈ 8.' }
  ];

  var LESSONS = [
    'Una onda gravitacional cambia la longitud de los brazos (h = ΔL/L). LIGO mide esa diferencia con luz láser y un interferómetro de Michelson.',
    'El ΔL real es del orden de 10⁻¹⁸ m, unas mil veces menor que un protón. Por eso usa cavidades Fabry-Pérot, espejos de 40 kg y aislamiento sísmico.',
    'El chirp revela la masa de chirp, la distancia y el tipo de fuente: agujeros negros frente a estrellas de neutrones.'
  ];

  var ctl = null;
  var ro = null;
  var sc = null;
  var lastRead = 0;
  var lastDL = 0;
  var aud = { ctx: null, osc: null, gain: null, on: false };

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function sup(n) {
    return String(n).replace(/[-0-9]/g, function (c) { return SUP[c]; });
  }

  function fmtNum(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  function fallbackSI(x, unit) {
    var u = unit ? ' ' + unit : '';
    if (!isFinite(x)) return '—';
    if (x === 0) return '0' + u;
    var a = Math.abs(x);
    if (a >= 1e-2 && a < 1e4) return String(Number(x.toPrecision(3))) + u;
    var e = Math.floor(Math.log10(a));
    return (x / Math.pow(10, e)).toFixed(1) + '×10' + sup(e) + u;
  }

  function fmtSI(x, unit) {
    var p = LIGO.physics;
    if (p && typeof p.formatSI === 'function') {
      try {
        var s = p.formatSI(x, unit);
        if (typeof s === 'string' && s.length) return s.trim();
      } catch (e) { /* usa el respaldo */ }
    }
    return fallbackSI(x, unit);
  }

  function chirpMassOf(m1, m2) {
    var p = LIGO.physics;
    if (p && typeof p.chirpMass === 'function') {
      try {
        var v = p.chirpMass(m1, m2);
        if (typeof v === 'number' && isFinite(v)) return v;
      } catch (e) { /* usa el respaldo */ }
    }
    return Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2);
  }

  function presetList() {
    var p = LIGO.physics;
    return p && Array.isArray(p.PRESETS) && p.PRESETS.length ? p.PRESETS : FALLBACK_PRESETS;
  }

  function findPreset(id) {
    var list = presetList();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function exagIndex(exag) {
    if (!(exag > 0)) return 0;
    var best = 0, bd = Infinity, lx = Math.log10(exag);
    for (var i = 0; i < EXAG_STEPS.length; i++) {
      var d = Math.abs(lx - Math.log10(EXAG_STEPS[i]));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function logPct(x) {
    return ((Math.log10(x) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
  }

  /* Controles */

  var RANGES = [
    {
      id: 'm1', label: 'Masa 1', min: 1, max: 120, step: 1,
      hint: 'Qué pasa si la subo: la señal es más fuerte y la fusión ocurre a frecuencia más baja.',
      get: function (s) { return s.m1; },
      set: function (v) { return { m1: v, preset: 'custom' }; },
      fmt: function (s) { return fmtNum(s.m1) + ' M☉'; }
    },
    {
      id: 'm2', label: 'Masa 2', min: 1, max: 120, step: 1,
      hint: 'Qué pasa si la subo: igual que la masa 1; el chirp depende sobre todo de la masa total y de la masa de chirp.',
      get: function (s) { return s.m2; },
      set: function (v) { return { m2: v, preset: 'custom' }; },
      fmt: function (s) { return fmtNum(s.m2) + ' M☉'; }
    },
    {
      id: 'dist', label: 'Distancia', min: 10, max: 1500, step: 1,
      hint: 'Qué pasa si la alejo: la amplitud cae como 1/distancia. Al doble de distancia, la mitad de h.',
      get: function (s) { return s.distMpc; },
      set: function (v) { return { distMpc: v, preset: 'custom' }; },
      fmt: function (s) { return Math.round(s.distMpc) + ' Mpc'; }
    },
    {
      id: 'incl', label: 'Inclinación', min: 0, max: 90, step: 1,
      hint: 'Qué pasa si la subo: 0° es de cara (h₊ máxima); 90° es de canto: h× se anula y h₊ baja a la mitad.',
      get: function (s) { return Math.round(s.incl * 180 / Math.PI); },
      set: function (v) { return { incl: v * Math.PI / 180 }; },
      fmt: function (s) { return Math.round(s.incl * 180 / Math.PI) + '°'; }
    },
    {
      id: 'exag', label: 'Exageración visual', min: 0, max: 4, step: 1,
      hint: 'Multiplica la deformación para verla. Siempre rotulada: ×N es un factor visual, no el valor real.',
      get: function (s) { return exagIndex(s.exag); },
      set: function (v) { return { exag: EXAG_STEPS[v] }; },
      fmt: function (s) { return 'Factor ' + EXAG_LABELS[exagIndex(s.exag)]; }
    },
    {
      id: 'speed', label: 'Velocidad', min: 0.1, max: 2, step: 0.1,
      hint: 'Qué pasa si la cambio: la simulación va más rápida o más lenta; la física no cambia.',
      get: function (s) { return s.speed; },
      set: function (v) { return { speed: Math.round(v * 10) / 10 }; },
      fmt: function (s) { return s.speed.toFixed(1) + '×'; }
    }
  ];

  var TOGGLES = [
    {
      key: 'noise', label: 'Ruido del detector',
      hint: 'Qué pasa si lo activo: aparece ruido gaussiano (rms ≈ 10⁻²²), como en un detector real. A veces la señal se esconde.'
    },
    {
      key: 'realistic', label: 'Valor realista (sin exagerar)',
      hint: 'Qué pasa si lo activo: se ve la deformación verdadera, tan pequeña que casi no se nota. Eso es lo que LIGO tiene que medir.'
    }
  ];

  function makeRange(cfg) {
    var wrap = el('div', 'ui-field');
    var head = el('div', 'ui-field-head');
    var lab = el('label', 'ui-label', cfg.label);
    var out = el('output', 'ui-out');
    var input = el('input', 'ui-range');
    var hint = el('p', 'ui-hint', cfg.hint);
    input.type = 'range';
    input.id = 'ui-' + cfg.id;
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.setAttribute('aria-describedby', input.id + '-hint');
    lab.htmlFor = input.id;
    hint.id = input.id + '-hint';
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (isFinite(v)) LIGO.setState(cfg.set(v));
    });
    head.appendChild(lab);
    head.appendChild(out);
    wrap.appendChild(head);
    wrap.appendChild(input);
    wrap.appendChild(hint);
    return { wrap: wrap, input: input, out: out, cfg: cfg };
  }

  function makeToggle(t) {
    var wrap = el('div', 'ui-field');
    var lab = el('label', 'ui-check-label');
    var input = el('input', 'ui-check');
    input.type = 'checkbox';
    input.id = 'ui-' + t.key;
    input.setAttribute('aria-describedby', input.id + '-hint');
    input.addEventListener('change', function () {
      var p = {};
      p[t.key] = input.checked;
      LIGO.setState(p);
    });
    lab.htmlFor = input.id;
    lab.appendChild(input);
    lab.appendChild(el('span', '', t.label));
    var hint = el('p', 'ui-hint', t.hint);
    hint.id = input.id + '-hint';
    wrap.appendChild(lab);
    wrap.appendChild(hint);
    return { wrap: wrap, input: input, key: t.key };
  }

  function audioSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  function audioOn() {
    try {
      if (!aud.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        aud.ctx = new AC();
      }
      if (aud.ctx.state === 'suspended') aud.ctx.resume();
      var now = aud.ctx.currentTime;
      var osc = aud.ctx.createOscillator();
      var g = aud.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(40, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.4);
      osc.connect(g);
      g.connect(aud.ctx.destination);
      osc.start(now);
      aud.osc = osc;
      aud.gain = g;
      aud.on = true;
      return true;
    } catch (e) {
      aud.on = false;
      return false;
    }
  }

  function audioOff() {
    try {
      if (aud.osc && aud.gain && aud.ctx) {
        var now = aud.ctx.currentTime;
        aud.gain.gain.cancelScheduledValues(now);
        aud.gain.gain.setValueAtTime(aud.gain.gain.value, now);
        aud.gain.gain.linearRampToValueAtTime(0, now + 0.3);
        aud.osc.stop(now + 0.35);
      }
    } catch (e) { /* ya detenido */ }
    aud.osc = null;
    aud.gain = null;
    aud.on = false;
  }

  function audioFrame(f) {
    if (!aud.on || !aud.osc || !aud.gain || !aud.ctx) return;
    try {
      var now = aud.ctx.currentTime;
      var playing = !!LIGO.state.playing;
      var target = Math.max(20, Math.min(400, f.f || 20));
      aud.osc.frequency.setTargetAtTime(target, now, 0.03);
      aud.gain.gain.setTargetAtTime(playing ? (f.merged ? 0.06 : 0.15) : 0, now, 0.1);
    } catch (e) { /* ignora */ }
  }

  function buildControls(root) {
    root.textContent = '';
    ctl = { ranges: [], toggles: [], presets: [], presetDesc: null, play: null, audio: null };
    root.appendChild(el('h2', 'ui-title', 'Controles'));

    var tr = el('div', 'ui-transport');
    ctl.play = el('button', 'ui-btn ui-btn-primary', 'Pausar');
    ctl.play.type = 'button';
    ctl.play.addEventListener('click', function () {
      LIGO.setState({ playing: !LIGO.state.playing });
    });
    var reset = el('button', 'ui-btn', 'Reiniciar');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      LIGO.bus.emit('reset', {});
      LIGO.setState({ playing: true });
    });
    tr.appendChild(ctl.play);
    tr.appendChild(reset);
    root.appendChild(tr);
    root.appendChild(el('p', 'ui-hint', 'Pausar congela la onda. Reiniciar vuelve a empezar la espiral desde el principio.'));

    root.appendChild(el('p', 'ui-group-label', 'Fuentes de ejemplo'));
    var chips = el('div', 'ui-chips');
    presetList().forEach(function (p) {
      var b = el('button', 'ui-chip', p.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        LIGO.setState({ preset: p.id, m1: p.m1, m2: p.m2, distMpc: p.distMpc });
      });
      chips.appendChild(b);
      ctl.presets.push({ id: p.id, btn: b });
    });
    root.appendChild(chips);
    ctl.presetDesc = el('p', 'ui-hint', '');
    root.appendChild(ctl.presetDesc);

    RANGES.forEach(function (cfg) {
      var r = makeRange(cfg);
      ctl.ranges.push(r);
      root.appendChild(r.wrap);
    });

    TOGGLES.forEach(function (t) {
      var tg = makeToggle(t);
      ctl.toggles.push(tg);
      root.appendChild(tg.wrap);
    });

    var audioWrap = el('div', 'ui-field');
    ctl.audio = el('button', 'ui-btn ui-audio', 'Escuchar el chirp');
    ctl.audio.type = 'button';
    ctl.audio.setAttribute('aria-pressed', 'false');
    if (!audioSupported()) {
      ctl.audio.disabled = true;
      audioWrap.appendChild(el('p', 'ui-hint', 'Tu navegador no permite reproducir audio.'));
    } else {
      audioWrap.appendChild(el('p', 'ui-hint', 'Qué suena: la frecuencia de la onda, en tono grave. Se activa solo al pulsar el botón.'));
    }
    ctl.audio.addEventListener('click', function () {
      if (aud.on) {
        audioOff();
      } else {
        audioOn();
      }
      ctl.audio.textContent = aud.on ? 'Silenciar el chirp' : 'Escuchar el chirp';
      ctl.audio.setAttribute('aria-pressed', aud.on ? 'true' : 'false');
    });
    audioWrap.insertBefore(ctl.audio, audioWrap.firstChild);
    root.appendChild(audioWrap);
  }

  function syncControls(s) {
    if (!ctl) return;
    ctl.ranges.forEach(function (r) {
      r.input.value = String(r.cfg.get(s));
      r.out.textContent = r.cfg.fmt(s);
    });
    ctl.toggles.forEach(function (t) {
      t.input.checked = !!s[t.key];
    });
    ctl.play.textContent = s.playing ? 'Pausar' : 'Reproducir';
    ctl.play.setAttribute('aria-pressed', s.playing ? 'true' : 'false');
    ctl.presets.forEach(function (p) {
      var on = s.preset === p.id;
      p.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      p.btn.classList.toggle('is-on', on);
    });
    var found = findPreset(s.preset);
    ctl.presetDesc.textContent = found
      ? found.desc
      : (s.preset === 'custom' ? 'Fuente personalizada: ajusta las masas y la distancia.' : '');
  }

  /* Lecturas en vivo */

  function buildReadouts(root) {
    root.textContent = '';
    ro = {};
    root.appendChild(el('h2', 'ui-title', 'Lecturas en vivo'));
    var dl = el('dl', 'ro-list');
    [
      ['f', 'Frecuencia de la onda f'],
      ['h', 'Deformación h₊ ahora'],
      ['dl', 'ΔL del brazo (real)'],
      ['dphi', 'Diferencia de fase Δφ'],
      ['tm', 'Tiempo hasta la fusión'],
      ['mc', 'Masa de chirp Mc']
    ].forEach(function (row) {
      var item = el('div', 'ro-item');
      item.appendChild(el('dt', 'ro-k', row[1]));
      var dd = el('dd', 'ro-v', '—');
      item.appendChild(dd);
      dl.appendChild(item);
      ro[row[0]] = dd;
    });
    root.appendChild(dl);
    root.appendChild(el('p', 'ui-hint', 'f sube durante la espiral. ΔL es el cambio real de un brazo de 4 km. Δφ es lo que mide el fotodiodo.'));
  }

  function updReadouts(f) {
    if (!ro) return;
    var s = LIGO.state || {};
    ro.f.textContent = isFinite(f.f) && f.f > 0 ? f.f.toFixed(1) + ' Hz' : '—';
    ro.h.textContent = fmtSI(f.hPlus, '');
    ro.dl.textContent = fmtSI(f.dL, 'm');
    var note = (!s.realistic && s.exag > 1) ? ' (exagerado ' + EXAG_LABELS[exagIndex(s.exag)] + ')' : '';
    ro.dphi.textContent = (isFinite(f.dPhi) ? (((f.dPhi + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI).toFixed(3) : '—') + ' rad (mod 2π)' + note;
    ro.tm.textContent = f.merged ? 'Ya fusionados (ringdown)' : (isFinite(f.tToMerge) ? f.tToMerge.toFixed(2) + ' s' : '—');
  }

  function syncChirp(s) {
    if (ro && ro.mc) ro.mc.textContent = chirpMassOf(s.m1, s.m2).toFixed(2) + ' M☉';
  }

  /* Escala */

  function buildScale(root) {
    root.textContent = '';
    sc = {};
    root.appendChild(el('h2', 'ui-title', 'Escala: ¿qué tan pequeño es ΔL?'));
    var track = el('div', 'scale-track');
    var marks = [
      { x: ARM, label: 'Brazo 4 km' },
      { x: 1, label: '1 m' },
      { x: 1e-3, label: '1 mm' },
      { x: PROTON, label: 'Protón ≈ 1.7 fm' }
    ];
    marks.forEach(function (m, i) {
      var mk = el('div', 'scale-mark' + (i === 1 ? ' alt' : ''));
      mk.style.left = logPct(m.x) + '%';
      mk.appendChild(el('span', 'scale-tick'));
      mk.appendChild(el('span', 'scale-label', m.label));
      track.appendChild(mk);
    });
    sc.dot = el('div', 'scale-dl');
    sc.dotLabel = el('span', 'scale-dl-label', '');
    sc.dot.appendChild(sc.dotLabel);
    track.appendChild(sc.dot);
    root.appendChild(track);
    sc.text = el('p', 'scale-text', '');
    root.appendChild(sc.text);
    root.appendChild(el('p', 'ui-hint', 'Escala logarítmica: la posición indica el orden de magnitud (potencias de 10). El punto es ΔL real, nunca exagerado.'));
  }

  function updScale(dLValue) {
    if (!sc) return;
    var a = Math.abs(dLValue || 0);
    if (a > 0) lastDL = a;
    var v = lastDL || 1e-18;
    sc.dot.style.left = logPct(v) + '%';
    sc.dotLabel.textContent = (a > 0 ? 'ΔL ' : 'ΔL último ') + '≈ ' + fmtSI(v, 'm');
    var ratio = PROTON / v;
    var msg;
    if (ratio >= 300 && ratio <= 5000) {
      msg = 'Es del orden de mil veces menor que un protón (diámetro del protón / ΔL ≈ ' + Math.round(ratio) + ').';
    } else if (ratio > 1) {
      msg = 'Es unas ' + Math.round(ratio) + ' veces menor que un protón.';
    } else {
      msg = 'Con este valor, ΔL ya es comparable o mayor que un protón.';
    }
    sc.text.textContent = msg;
  }

  /* Tour */

  function buildTour(root) {
    root.textContent = '';
    var idx = 0;
    root.appendChild(el('h2', 'ui-title', 'Tour guiado'));
    var dots = el('div', 'tour-dots');
    var dotBtns = [];
    MISSIONS.forEach(function (m, i) {
      var d = el('button', 'tour-dot');
      d.type = 'button';
      d.setAttribute('aria-label', 'Ir a la misión ' + (i + 1));
      d.addEventListener('click', function () { go(i, true); });
      dots.appendChild(d);
      dotBtns.push(d);
    });
    var meta = el('p', 'tour-meta', '');
    var h3 = el('h3', 'tour-h', '');
    var body = el('p', 'tour-body', '');
    var reto = el('p', 'tour-reto', '');
    var nav = el('div', 'tour-nav');
    var prev = el('button', 'ui-btn', 'Anterior');
    var next = el('button', 'ui-btn ui-btn-primary', 'Siguiente');
    prev.type = 'button';
    next.type = 'button';
    prev.addEventListener('click', function () { go(idx - 1, true); });
    next.addEventListener('click', function () {
      go(idx >= MISSIONS.length - 1 ? 0 : idx + 1, true);
    });
    nav.appendChild(prev);
    nav.appendChild(next);
    root.appendChild(dots);
    root.appendChild(meta);
    root.appendChild(h3);
    root.appendChild(body);
    var retoLabel = el('strong', '', 'Micro-reto: ');
    reto.appendChild(retoLabel);
    reto.appendChild(document.createTextNode(''));
    root.appendChild(reto);
    root.appendChild(nav);

    function clearSpots() {
      var old = document.querySelectorAll('.spot');
      for (var i = 0; i < old.length; i++) old[i].classList.remove('spot');
    }

    function go(i, apply) {
      idx = Math.max(0, Math.min(MISSIONS.length - 1, i));
      var m = MISSIONS[idx];
      meta.textContent = 'Misión ' + (idx + 1) + ' de ' + MISSIONS.length;
      h3.textContent = m.title;
      body.textContent = m.body;
      reto.lastChild.textContent = m.reto;
      dotBtns.forEach(function (d, k) {
        d.classList.toggle('is-on', k === idx);
        d.setAttribute('aria-current', k === idx ? 'step' : 'false');
      });
      prev.disabled = idx === 0;
      next.textContent = idx === MISSIONS.length - 1 ? 'Empezar de nuevo' : 'Siguiente';
      if (apply) LIGO.setState(m.set);
      clearSpots();
      m.spot.forEach(function (id) {
        var target = $(id);
        if (target) target.classList.add('spot');
      });
      LIGO.bus.emit('tourstep', { index: idx, title: m.title });
    }

    go(0, false);
  }

  /* Quiz */

  function buildQuiz(root) {
    root.textContent = '';
    var st = { i: 0, score: 0 };
    root.appendChild(el('h2', 'ui-title', 'Mini quiz'));
    var prog = el('p', 'ui-hint', '');
    var qEl = el('h3', 'quiz-q', '');
    var opts = el('div', 'quiz-opts');
    var fb = el('p', 'quiz-fb', '');
    fb.setAttribute('aria-live', 'polite');
    var nextBtn = el('button', 'ui-btn ui-btn-primary', 'Siguiente pregunta');
    nextBtn.type = 'button';
    nextBtn.hidden = true;
    root.appendChild(prog);
    root.appendChild(qEl);
    root.appendChild(opts);
    root.appendChild(fb);
    root.appendChild(nextBtn);

    function finish() {
      root.textContent = '';
      root.appendChild(el('h2', 'ui-title', 'Mini quiz'));
      var n = QUIZ.length;
      var msg = st.score === n ? '¡Excelente! Dominas la idea.'
        : st.score >= 3 ? 'Vas bien. Repasa las preguntas que fallaste.'
        : 'Conviene volver al tour y al glosario.';
      root.appendChild(el('p', 'quiz-q', 'Puntaje: ' + st.score + ' de ' + n));
      root.appendChild(el('p', 'ui-hint', msg));
      var again = el('button', 'ui-btn ui-btn-primary', 'Reintentar');
      again.type = 'button';
      again.addEventListener('click', function () {
        st.i = 0;
        st.score = 0;
        buildQuiz(root);
      });
      root.appendChild(again);
    }

    function render() {
      if (st.i >= QUIZ.length) { finish(); return; }
      var q = QUIZ[st.i];
      prog.textContent = 'Pregunta ' + (st.i + 1) + ' de ' + QUIZ.length;
      qEl.textContent = q.q;
      opts.textContent = '';
      fb.textContent = '';
      fb.className = 'quiz-fb';
      nextBtn.hidden = true;
      nextBtn.textContent = st.i === QUIZ.length - 1 ? 'Ver resultado' : 'Siguiente pregunta';
      q.opts.forEach(function (text, k) {
        var b = el('button', 'quiz-opt', text);
        b.type = 'button';
        b.addEventListener('click', function () { answer(k, b); });
        opts.appendChild(b);
      });
    }

    function answer(k, btn) {
      var q = QUIZ[st.i];
      var all = opts.querySelectorAll('.quiz-opt');
      var ok = k === q.ans;
      for (var j = 0; j < all.length; j++) all[j].disabled = true;
      if (ok) {
        st.score++;
        btn.classList.add('is-ok');
        fb.textContent = q.ok;
        fb.classList.add('ok');
      } else {
        btn.classList.add('is-bad');
        all[q.ans].classList.add('is-ok');
        fb.textContent = q.bad;
        fb.classList.add('bad');
      }
      nextBtn.hidden = false;
    }

    nextBtn.addEventListener('click', function () {
      st.i++;
      render();
    });

    render();
  }

  /* Glosario y lecciones */

  function buildGlossary(root) {
    root.textContent = '';
    root.appendChild(el('h2', 'ui-title', 'Glosario'));
    root.appendChild(el('p', 'ui-hint', 'Toca un término para ver su significado. Toca otro para cambiar.'));
    var list = el('ul', 'gl-list');
    var buttons = [];
    TERMS.forEach(function (term) {
      var li = el('li', '');
      var btn = el('button', 'gl-term', term.t);
      var tip = el('p', 'gl-tip', term.d);
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      tip.hidden = true;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') !== 'true';
        buttons.forEach(function (b) {
          b.btn.setAttribute('aria-expanded', 'false');
          b.tip.hidden = true;
        });
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        tip.hidden = !open;
      });
      buttons.push({ btn: btn, tip: tip });
      li.appendChild(btn);
      li.appendChild(tip);
      list.appendChild(li);
    });
    root.appendChild(list);
  }

  function buildLessons(root) {
    root.textContent = '';
    root.appendChild(el('h2', 'ui-title', 'Lo que debes recordar'));
    var ul = el('ul', 'lessons-list');
    LESSONS.forEach(function (t) { ul.appendChild(el('li', '', t)); });
    root.appendChild(ul);
  }

  /* Sincronización y arranque */

  function syncAll() {
    var s = LIGO.state;
    if (!s) return;
    syncControls(s);
    syncChirp(s);
  }

  function onFrame(data) {
    var f = data || LIGO.frame;
    if (!f) return;
    var now = Date.now();
    if (now - lastRead >= READ_MS) {
      lastRead = now;
      updReadouts(f);
      updScale(f.dL);
    }
    audioFrame(f);
  }

  function init() {
    var c = $('controls');
    if (c) buildControls(c);
    var r = $('readouts');
    if (r) buildReadouts(r);
    var s = $('scale');
    if (s) { buildScale(s); updScale(0); }
    var t = $('tour');
    if (t) buildTour(t);
    var q = $('quiz');
    if (q) buildQuiz(q);
    var g = $('glossary');
    if (g) buildGlossary(g);
    var l = $('lessons');
    if (l) buildLessons(l);
    syncAll();
    LIGO.bus.on('state', syncAll);
    LIGO.bus.on('frame', onFrame);
  }

  LIGO.ui = { init: init };
})();
