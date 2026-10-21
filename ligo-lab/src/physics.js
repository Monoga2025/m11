window.LIGO = window.LIGO || {};

LIGO.physics = (function () {
  var G = 6.674e-11, C = 299792458, MSUN = 1.98847e30, MPC = 3.0857e22;
  var FS = 2048, F0 = 20, MAX_DUR = 12, Q_RING = 3, MIN_RING = 0.3;
  var ARM = 4000, LAMBDA = 1064e-9, PROTON = 1.7e-15;
  var NOISE_RMS = 1e-22;
  var PI = Math.PI;

  var PRESETS = [
    { id: 'GW150914', name: 'GW150914', m1: 36, m2: 29, distMpc: 410,
      desc: 'Primera detección: dos agujeros negros de 36 y 29 M☉ a 410 Mpc' },
    { id: 'GW170817', name: 'GW170817', m1: 1.46, m2: 1.27, distMpc: 40,
      desc: 'Fusión de estrellas de neutrones a 40 Mpc' },
    { id: 'ligeros', name: 'Agujeros ligeros 10+8 @ 200 Mpc', m1: 10, m2: 8, distMpc: 200,
      desc: 'Agujeros negros poco masivos: el chirp dura más en banda' },
    { id: 'supermasivos', name: 'Supermasivos-juguete 100+90 @ 800 Mpc', m1: 100, m2: 90, distMpc: 800,
      desc: 'Masas enormes: la fusión ocurre a frecuencias muy bajas' }
  ];

  function chirpMass(m1, m2) { return Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2); }
  function totalMass(m1, m2) { return m1 + m2; }
  function fIsco(m1, m2) { return 4400 / (m1 + m2); }

  function hAmplitude(f, mc, distMpc) {
    var Tc = G * mc * MSUN / (C * C);
    return 4 / (distMpc * MPC) * Math.pow(Tc, 5 / 3) * Math.pow(PI * f / C, 2 / 3);
  }

  function tauOf(f, Tc) { return (5 / 256) * Math.pow(PI * f, -8 / 3) * Math.pow(Tc, -5 / 3); }
  function fOfTau(tau, Tc) { return Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(Tc, -5 / 8) / PI; }
  function sepKmOf(f, M) { return Math.pow(G * M * MSUN / Math.pow(PI * f, 2), 1 / 3) / 1000; }

  function peakStrain(state) {
    var mc = chirpMass(state.m1, state.m2);
    var h = hAmplitude(fIsco(state.m1, state.m2), mc, state.distMpc);
    var c = Math.cos(state.incl || 0);
    return h * Math.max((1 + c * c) / 2, Math.abs(c));
  }

  function buildTrack(state) {
    var m1 = state.m1, m2 = state.m2, D = state.distMpc;
    var c = Math.cos(state.incl || 0);
    var mc = chirpMass(m1, m2), M = totalMass(m1, m2);
    var Tc = G * mc * MSUN / (C * C * C);
    var fI = fIsco(m1, m2);
    // Ringdown: QNM fit (Berti) con a_f ~ 0.69, M_f = 0.95 M, Q ~ 3
    var fR = 0.08446 * C * C * C / (G * 0.95 * M * MSUN);
    var tauR = Q_RING / (PI * fR);
    var Tring = Math.max(MIN_RING, 5 * tauR);

    var tauI = tauOf(fI, Tc);
    var budget = MAX_DUR - Tring;
    var f0 = Math.min(F0, 0.5 * fI);
    if (tauOf(f0, Tc) - tauI > budget) {
      var lo = f0, hi = fI * 0.999;
      for (var it = 0; it < 80; it++) {
        var mid = Math.sqrt(lo * hi);
        if (tauOf(mid, Tc) - tauI > budget) lo = mid; else hi = mid;
      }
      f0 = hi;
    }

    var tau0 = tauOf(f0, Tc);
    var tMerge = tau0 - tauI;
    var dt = 1 / FS;
    var n = Math.ceil((tMerge + Tring) * FS) + 1;
    var A = Math.pow(5 / 256, 3 / 8) * Math.pow(Tc, -5 / 8);
    var phiM = 8 / 5 * A * (Math.pow(tau0, 5 / 8) - Math.pow(tauI, 5 / 8));
    var Am = hAmplitude(fI, mc, D);
    var sepI = sepKmOf(fI, M);

    var fArr = new Float32Array(n), hP = new Float32Array(n), hX = new Float32Array(n);
    var sepArr = new Float32Array(n), phArr = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var t = k * dt;
      if (t <= tMerge) {
        var tau = Math.max(tau0 - t, tauI);
        var phi = 8 / 5 * A * (Math.pow(tau0, 5 / 8) - Math.pow(tau, 5 / 8));
        var fk = fOfTau(tau, Tc);
        var amp = hAmplitude(fk, mc, D);
        var psi = 2 * phi;
        hP[k] = amp * (1 + c * c) / 2 * Math.cos(psi);
        hX[k] = amp * c * Math.sin(psi);
        fArr[k] = fk;
        phArr[k] = phi;
        sepArr[k] = sepKmOf(fk, M);
      } else {
        var dtm = t - tMerge;
        var env = Math.exp(-dtm / tauR);
        var psiR = 2 * phiM + 2 * PI * fR * dtm;
        hP[k] = Am * (1 + c * c) / 2 * env * Math.cos(psiR);
        hX[k] = Am * c * env * Math.sin(psiR);
        fArr[k] = fR;
        phArr[k] = psiR / 2;
        sepArr[k] = sepI;
      }
    }

    return {
      n: n, dt: dt, duration: (n - 1) * dt, tMerge: tMerge,
      f: fArr, hPlus: hP, hCross: hX, sepKm: sepArr, phase: phArr
    };
  }

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v);
  }

  function lerpAt(arr, i, a) { return arr[i] + (arr[i + 1] - arr[i]) * a; }

  function sample(tr, t, state) {
    state = state || {};
    var tt = Math.min(Math.max(t, 0), tr.duration);
    var x = tt / tr.dt;
    var i = Math.min(Math.floor(x), tr.n - 2);
    if (i < 0) i = 0;
    var a = x - i;

    var f = lerpAt(tr.f, i, a);
    var hp = lerpAt(tr.hPlus, i, a);
    var hx = lerpAt(tr.hCross, i, a);
    var sep = lerpAt(tr.sepKm, i, a);
    var ph = lerpAt(tr.phase, i, a);
    if (state.noise) {
      hp += gauss() * NOISE_RMS;
      hx += gauss() * NOISE_RMS;
    }

    var dL = hp * ARM / 2;
    var exag = state.exag || 1;
    var dLVisual = state.realistic ? dL : dL * exag;
    var dPhi = 4 * PI * (2 * dLVisual) / LAMBDA;
    var intensity = Math.pow(Math.cos(dPhi / 2 + PI / 2), 2);

    return {
      t: tt,
      tToMerge: tr.tMerge - tt,
      f: f,
      hPlus: hp,
      hCross: hx,
      sepKm: sep,
      phase: ph,
      phase2: 2 * ph,
      merged: tt >= tr.tMerge,
      dL: dL,
      dLVisual: dLVisual,
      dPhi: dPhi,
      intensity: intensity,
      progress: tr.duration > 0 ? tt / tr.duration : 0
    };
  }

  var PREFIXES = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'], [1e-18, 'a']
  ];
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function sup(e) { return String(e).split('').map(function (ch) { return SUP[ch]; }).join(''); }

  function formatSI(x, unit) {
    var sp = unit ? ' ' + unit : '';
    if (!isFinite(x)) return '—';
    if (x === 0) return '0' + sp;
    var ax = Math.abs(x);
    if (ax < 1e-18 || ax >= 1e15) {
      var e = Math.floor(Math.log10(ax));
      var m = x / Math.pow(10, e);
      if (Math.abs(m) >= 9.95) { m /= 10; e += 1; }
      return m.toFixed(1) + '×10' + sup(e) + sp;
    }
    for (var i = 0; i < PREFIXES.length; i++) {
      if (ax >= PREFIXES[i][0] * 0.9999999) {
        var mant = x / PREFIXES[i][0];
        var txt = Math.abs(mant) < 10 ? String(Number(mant.toPrecision(2))) : String(Math.round(mant));
        return txt + ' ' + PREFIXES[i][1] + unit;
      }
    }
    return formatSI(x, unit);
  }

  function selfTest() {
    var h = peakStrain({ m1: 36, m2: 29, distMpc: 410, incl: 0 });
    var mc = chirpMass(36, 29);
    return h > 3e-22 && h < 3e-21 && mc >= 27 && mc <= 30;
  }

  return {
    PRESETS: PRESETS,
    armLength: ARM,
    lambda: LAMBDA,
    protonDiameter: PROTON,
    chirpMass: chirpMass,
    totalMass: totalMass,
    fIsco: fIsco,
    hAmplitude: hAmplitude,
    peakStrain: peakStrain,
    buildTrack: buildTrack,
    sample: sample,
    formatSI: formatSI,
    selfTest: selfTest,
    init: function () {}
  };
})();

if (typeof module !== 'undefined' && typeof window !== 'undefined') module.exports = window.LIGO;
