/* LIGO.charts: gráficas en Canvas 2D (strain, espectrograma, franjas + osciloscopio). */
(function () {
  'use strict';

  var LIGO = (window.LIGO = window.LIGO || {});
  var U = 1e-21;            // unidad del eje de strain
  var WIN = 512;            // ventana STFT: 0.25 s a 2048 Hz
  var NT = 480, NF = 200;   // espectrograma: columnas × filas (escala log)
  var F_MIN = 20, F_MAX = 500;
  var FREQ_TICKS = [20, 50, 100, 200, 500];
  var SCOPE_S = 4;          // ventana del osciloscopio (s de simulación)
  var RING_K = 60;          // fase radial: ~9.5 anillos hasta el borde
  var TRACK_KEYS = ['preset', 'm1', 'm2', 'distMpc', 'incl'];
  var M = { l: 54, r: 14, t: 18, b: 28 };
  var FALLBACK = {
    ink: '#07080f', ink2: '#11142a', line: '#2a2f4a', text: '#e8e9f3',
    muted: '#8b90ad', laser: '#ff5a3c', wave: '#5ce1e6', wave2: '#a78bfa', warm: '#ffb347'
  };

  var C = {};
  var fontStr = '11px sans-serif';
  var probeCtx = null;
  var inited = false, colorsDirty = true, trackDirty = true, rafId = 0;
  var track = null, trackId = 0, dur = 1, dt = 1 / 2048, n = 0, tMerge = null;
  var strainLim = 1, strainStep = 0.5, timeStep = 1;
  var spectroCv = null;
  var strainEnv = null, envKey = '';
  var lastFrame = null, hist = [];
  var charts = {};
  var ring = null;

  /* Tablas: FFT, ventana de Hann y paleta cálida (negro→violeta→naranja→blanco). */
  var cosT = new Float64Array(WIN / 2), sinT = new Float64Array(WIN / 2);
  var revT = new Uint16Array(WIN), hann = new Float64Array(WIN);
  var LUT = new Uint8ClampedArray(256 * 3);
  (function tables() {
    var i, b, r, x, bits = Math.round(Math.log2(WIN));
    for (i = 0; i < WIN / 2; i++) {
      cosT[i] = Math.cos(2 * Math.PI * i / WIN);
      sinT[i] = Math.sin(2 * Math.PI * i / WIN);
    }
    for (i = 0; i < WIN; i++) {
      r = 0; x = i;
      for (b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      revT[i] = r;
      hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN);
    }
    var stops = [[0, [0, 0, 0]], [0.35, [88, 28, 140]], [0.7, [255, 120, 30]], [1, [255, 250, 235]]];
    for (i = 0; i < 256; i++) {
      var u = i / 255, s = 0;
      while (s < stops.length - 2 && u > stops[s + 1][0]) s++;
      var a = stops[s], z = stops[s + 1], k = (u - a[0]) / (z[0] - a[0]);
      for (b = 0; b < 3; b++) LUT[i * 3 + b] = a[1][b] + (z[1][b] - a[1][b]) * k;
    }
  })();

  /* Utilidades */
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function niceStep(x) {
    x = Math.max(x, 1e-30);
    var p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function ticks(a, b, step) {
    var out = [], k0 = Math.ceil(a / step - 1e-9), k1 = Math.floor(b / step + 1e-9), k;
    for (k = k0; k <= k1; k++) out.push(k * step);
    return out;
  }
  function fmt(v, step) {
    if (Math.abs(v) < step * 1e-9) v = 0;
    var d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    return v.toFixed(d).replace(/-/g, '−');
  }
  function fmtPhi(x) {
    if (x === 0) return '0';
    if (Math.abs(x) >= 1e3 || Math.abs(x) < 1e-2) return x.toExponential(2).replace(/-/g, '−').replace('+', '');
    return x.toFixed(2).replace(/-/g, '−');
  }
  function touches(datos, keys) {
    if (datos == null) return true;
    var list = Array.isArray(datos) ? datos : (typeof datos === 'object' ? Object.keys(datos) : [String(datos)]);
    return list.some(function (k) { return keys.indexOf(k) !== -1; });
  }
  function curT() {
    var t = lastFrame ? num(lastFrame.t) : 0;
    return clamp(t, 0, dur);
  }
  function idxAt(t) {
    return Math.min(n - 1, Math.max(0, Math.round(t / dt)));
  }

  /* Colores desde variables CSS (convertidas a RGB con un canvas auxiliar). */
  function toRGB(css, fb) {
    if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    probeCtx.fillStyle = fb;
    probeCtx.fillStyle = css;
    probeCtx.fillRect(0, 0, 1, 1);
    var d = probeCtx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    Object.keys(FALLBACK).forEach(function (k) {
      var v = (cs.getPropertyValue('--' + k) || '').trim();
      C[k] = toRGB(v || FALLBACK[k], FALLBACK[k]);
    });
  }

  /* Lienzos: tamaño físico = CSS × devicePixelRatio. */
  function makeChart(id, label) {
    var cv = document.getElementById(id);
    if (!cv || !cv.getContext) return null;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', label);
    return { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 };
  }
  function sizeChart(ch) {
    var dpr = window.devicePixelRatio || 1;
    var w = ch.cv.clientWidth, h = ch.cv.clientHeight;
    if (!w || !h) return false;
    if (w !== ch.w || h !== ch.h || dpr !== ch.dpr) {
      ch.w = w; ch.h = h; ch.dpr = dpr;
      ch.cv.width = Math.round(w * dpr);
      ch.cv.height = Math.round(h * dpr);
    }
    ch.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  function requestDraw() {
    if (!rafId) rafId = window.requestAnimationFrame(drawAll);
  }

  /* Pista: strain completo, espectrograma precalculado y escalas. */
  function buildSpectro(h, dtv) {
    var fs = 1 / dtv, half = WIN / 2, len = h.length;
    var re = new Float64Array(WIN), im = new Float64Array(WIN), pw = new Float64Array(half + 1);
    var vals = new Float64Array(NT * NF), pmax = 0, c, k, r;
    for (c = 0; c < NT; c++) {
      var center = Math.round(c * (len - 1) / (NT - 1));
      for (k = 0; k < WIN; k++) {
        var idx = center - half + k;
        re[k] = idx >= 0 && idx < len ? h[idx] / U * hann[k] : 0;
        im[k] = 0;
      }
      fft(re, im);
      for (k = 0; k <= half; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (r = 0; r < NF; r++) {
        var f = F_MIN * Math.pow(F_MAX / F_MIN, r / (NF - 1));
        var b = f * WIN / fs, k0 = Math.floor(b), fr = b - k0;
        var p = pw[k0] * (1 - fr) + pw[Math.min(k0 + 1, half)] * fr;
        vals[c * NF + r] = p;
        if (p > pmax) pmax = p;
      }
    }
    pmax = pmax || 1;
    var cv = document.createElement('canvas');
    cv.width = NT; cv.height = NF;
    var cx = cv.getContext('2d'), img = cx.createImageData(NT, NF), d = img.data;
    for (c = 0; c < NT; c++) {
      for (r = 0; r < NF; r++) {
        var db = 10 * Math.log10(vals[c * NF + r] / pmax + 1e-12);
        var li = Math.round(clamp((db + 45) / 45, 0, 1) * 255);
        var o = ((NF - 1 - r) * NT + c) * 4;
        d[o] = LUT[li * 3]; d[o + 1] = LUT[li * 3 + 1]; d[o + 2] = LUT[li * 3 + 2]; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }
  function fft(re, im) {
    var i, j, k, len, half, step, a, b, wr, wi, tr, ti, tmp;
    for (i = 0; i < WIN; i++) {
      j = revT[i];
      if (j > i) {
        tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    for (len = 2; len <= WIN; len <<= 1) {
      half = len >> 1; step = WIN / len;
      for (i = 0; i < WIN; i += len) {
        for (k = 0; k < half; k++) {
          wr = cosT[k * step]; wi = -sinT[k * step];
          a = i + k; b = a + half;
          tr = re[b] * wr - im[b] * wi; ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  /* Envolvente min/máx por píxel (honesta: no pierde picos al submuestrear). */
  function buildEnv(h, w) {
    var mn = new Float32Array(w), mx = new Float32Array(w), len = h.length;
    for (var x = 0; x < w; x++) {
      var i0 = Math.floor(x * len / w), i1 = Math.max(i0 + 1, Math.floor((x + 1) * len / w));
      var lo = Infinity, hi = -Infinity;
      for (var i = i0; i < i1 && i < len; i++) {
        var v = h[i] / U;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      mn[x] = lo === Infinity ? 0 : lo;
      mx[x] = hi === -Infinity ? 0 : hi;
    }
    return { mn: mn, mx: mx };
  }
  function rebuild() {
    trackDirty = false;
    var LP = LIGO.physics;
    if (!LP || typeof LP.buildTrack !== 'function' || !LIGO.state) return;
    var tr = LP.buildTrack(LIGO.state);
    var h = tr.hPlus;
    n = h.length;
    dt = tr.dt > 0 ? tr.dt : 1 / 2048;
    dur = tr.duration > 0 ? tr.duration : Math.max(1e-9, (n - 1) * dt);
    tMerge = typeof tr.tMerge === 'number' && isFinite(tr.tMerge) ? tr.tMerge : null;
    var maxAbs = 0, i;
    for (i = 0; i < n; i++) {
      var a = Math.abs(h[i]);
      if (a > maxAbs) maxAbs = a;
    }
    var rawLim = (maxAbs / U || 1) * 1.12;
    strainStep = niceStep(rawLim / 3);
    strainLim = Math.ceil(rawLim / strainStep - 1e-9) * strainStep;
    timeStep = niceStep(dur / 6);
    spectroCv = buildSpectro(h, dt);
    track = tr;
    trackId++;
    envKey = '';
  }

  /* Ejes compartidos por las gráficas temporales. */
  function timeAxis(x, L, T, pw, ph, alpha) {
    x.font = fontStr; x.textAlign = 'center'; x.textBaseline = 'top';
    ticks(0, dur, timeStep).forEach(function (tt) {
      var px = L + tt / dur * pw;
      x.strokeStyle = rgba(C.line, alpha); x.lineWidth = 1;
      x.beginPath(); x.moveTo(Math.round(px) + 0.5, T); x.lineTo(Math.round(px) + 0.5, T + ph); x.stroke();
      x.fillStyle = rgba(C.muted, 1);
      x.fillText(fmt(tt, timeStep), px, T + ph + 6);
    });
  }
  function frameBox(x, L, T, pw, ph) {
    x.strokeStyle = rgba(C.line, 0.9); x.lineWidth = 1;
    x.strokeRect(L + 0.5, T + 0.5, pw, ph);
  }
  function topLabels(x, L, R, left, right, y) {
    x.font = fontStr; x.textBaseline = 'top';
    x.fillStyle = rgba(C.muted, 1);
    x.textAlign = 'left'; x.fillText(left, L, y);
    x.textAlign = 'right'; x.fillText(right, R, y);
  }
  function cursorLine(x, px, T, ph) {
    x.strokeStyle = rgba(C.text, 0.6); x.lineWidth = 1;
    x.beginPath(); x.moveTo(px + 0.5, T); x.lineTo(px + 0.5, T + ph); x.stroke();
  }
  function dot(x, px, py, color, r) {
    x.save();
    x.shadowColor = rgba(color, 0.9); x.shadowBlur = 10;
    x.fillStyle = rgba(C.text, 1);
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.restore();
  }

  /* 1) Strain h(t) */
  function drawStrain(ch) {
    if (!ch || !track || !sizeChart(ch)) return;
    var x = ch.ctx, W = ch.w, H = ch.h, L = M.l, T = M.t;
    var pw = W - L - M.r, ph = H - T - M.b;
    x.clearRect(0, 0, W, H);
    if (pw < 20 || ph < 20) return;
    var h = track.hPlus;
    var key = trackId + ':' + pw;
    if (envKey !== key) { strainEnv = buildEnv(h, pw); envKey = key; }
    var t = curT();
    var X = function (tt) { return L + tt / dur * pw; };
    var Y = function (v) { return T + (1 - (v + strainLim) / (2 * strainLim)) * ph; };

    x.font = fontStr;
    x.textAlign = 'right'; x.textBaseline = 'middle';
    ticks(-strainLim, strainLim, strainStep).forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      x.strokeStyle = v === 0 ? rgba(C.muted, 0.6) : rgba(C.line, 0.55);
      x.beginPath(); x.moveTo(L, y); x.lineTo(L + pw, y); x.stroke();
      x.fillStyle = rgba(C.muted, 1);
      x.fillText(fmt(v, strainStep), L - 8, y);
    });
    timeAxis(x, L, T, pw, ph, 0.45);
    frameBox(x, L, T, pw, ph);

    var strokeEnv = function (a, b) {
      x.beginPath();
      for (var c = a; c <= b; c++) {
        var px = L + c + 0.5;
        x.moveTo(px, Y(strainEnv.mx[c]));
        x.lineTo(px, Y(strainEnv.mn[c]));
      }
      x.stroke();
    };
    var cut = Math.round(clamp(t / dur, 0, 1) * (pw - 1));
    x.lineWidth = 1;
    x.strokeStyle = rgba(C.wave, 0.28); strokeEnv(0, pw - 1);
    x.strokeStyle = rgba(C.wave, 0.95); strokeEnv(0, cut);

    if (tMerge !== null && tMerge >= 0 && tMerge <= dur) {
      var mx = X(tMerge) + 0.5;
      x.setLineDash([4, 4]);
      x.strokeStyle = rgba(C.warm, 0.9);
      x.beginPath(); x.moveTo(mx, T); x.lineTo(mx, T + ph); x.stroke();
      x.setLineDash([]);
      x.font = fontStr; x.textAlign = 'right'; x.textBaseline = 'top';
      x.fillStyle = rgba(C.warm, 1);
      x.fillText('fusión', mx - 5, T + 4);
    }

    var px = X(t);
    cursorLine(x, px, T, ph);
    dot(x, px, Y(h[idxAt(t)] / U), C.laser, 3.5);

    topLabels(x, L, L + pw, 'h × 10⁻²¹ (real)', 't (s)', 3);
  }

  /* 2) Espectrograma tiempo-frecuencia */
  function drawSpectro(ch) {
    if (!ch || !track || !spectroCv || !sizeChart(ch)) return;
    var x = ch.ctx, W = ch.w, H = ch.h, L = M.l, T = M.t;
    var pw = W - L - M.r, ph = H - T - M.b;
    x.clearRect(0, 0, W, H);
    if (pw < 20 || ph < 20) return;
    var Yf = function (f) {
      return T + (1 - Math.log(clamp(f, F_MIN, F_MAX) / F_MIN) / Math.log(F_MAX / F_MIN)) * ph;
    };
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(spectroCv, L, T, pw, ph);

    x.font = fontStr; x.textAlign = 'right'; x.textBaseline = 'middle';
    FREQ_TICKS.forEach(function (f) {
      var y = Math.round(Yf(f)) + 0.5;
      x.strokeStyle = rgba(C.line, 0.7); x.lineWidth = 1;
      x.beginPath(); x.moveTo(L, y); x.lineTo(L + pw, y); x.stroke();
      x.fillStyle = rgba(C.muted, 1);
      x.fillText(String(f), L - 8, y);
    });
    timeAxis(x, L, T, pw, ph, 0.25);
    frameBox(x, L, T, pw, ph);

    var t = curT(), px = L + clamp(t / dur, 0, 1) * pw;
    cursorLine(x, px, T, ph);
    var fNow = track.f[idxAt(t)];
    dot(x, px, Yf(num(fNow)), C.text, 3);
    topLabels(x, L, L + pw, 'f (Hz)', 't (s)', 3);
  }

  /* 3) Franjas circulares + osciloscopio de intensidad */
  function ensureRing(S) {
    if (ring && ring.S === S) return ring;
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var cx = cv.getContext('2d'), img = cx.createImageData(S, S), d = img.data;
    var cosA = new Float32Array(S * S), sinA = new Float32Array(S * S), inside = new Uint8Array(S * S);
    var R = S / 2;
    for (var py = 0; py < S; py++) {
      for (var px = 0; px < S; px++) {
        var p = py * S + px;
        var dx = (px + 0.5 - R) / R, dy = (py + 0.5 - R) / R, r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        var ph = RING_K * r2;
        cosA[p] = Math.cos(ph); sinA[p] = Math.sin(ph);
        inside[p] = 1; d[p * 4 + 3] = 255;
      }
    }
    ring = { S: S, cv: cv, ctx: cx, img: img, cosA: cosA, sinA: sinA, inside: inside };
    return ring;
  }
  function drawFringe(ch) {
    if (!ch || !sizeChart(ch)) return;
    var x = ch.ctx, W = ch.w, H = ch.h, dpr = ch.dpr;
    x.clearRect(0, 0, W, H);
    var dP = lastFrame ? num(lastFrame.dPhi) : 0;
    var I = lastFrame ? clamp(num(lastFrame.intensity), 0, 1) : 0;

    /* Anillos: I(r) = ½(1 − cos(Δφ + k·r²)); en el centro coincide con frame.intensity. */
    var Hr = Math.floor(H * 0.6);
    var cx = W / 2, cy = Hr / 2, R = Math.min(W / 2, Hr / 2) - 6;
    if (R > 10) {
      var rc = ensureRing(Math.max(8, Math.round(2 * R * dpr)));
      var cD = Math.cos(dP), sD = Math.sin(dP);
      var d = rc.img.data, A = rc.cosA, B = rc.sinA, ink = C.ink, la = C.laser;
      var total = rc.S * rc.S;
      for (var p = 0, o = 0; p < total; p++, o += 4) {
        if (!rc.inside[p]) continue;
        var k = 0.5 * (1 - (cD * A[p] - sD * B[p]));
        d[o] = ink[0] + (la[0] - ink[0]) * k;
        d[o + 1] = ink[1] + (la[1] - ink[1]) * k;
        d[o + 2] = ink[2] + (la[2] - ink[2]) * k;
      }
      rc.ctx.putImageData(rc.img, 0, 0);
      x.drawImage(rc.cv, cx - R, cy - R, 2 * R, 2 * R);
      x.strokeStyle = rgba(C.line, 0.9); x.lineWidth = 1;
      x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    }
    x.font = fontStr; x.fillStyle = rgba(C.muted, 1);
    x.textBaseline = 'top'; x.textAlign = 'left';
    x.fillText('Δφ = ' + fmtPhi(dP) + ' rad', 6, 4);
    x.textAlign = 'right';
    x.fillText('I = ' + I.toFixed(2), W - 6, 4);

    /* Osciloscopio: últimos SCOPE_S s de simulación; el cursor queda a la derecha. */
    var L = 38, Rr = 12, T = Hr + 16, Bm = 22;
    var pw = W - L - Rr, ph = H - T - Bm;
    if (pw < 20 || ph < 10) return;
    var tc = curT(), t0 = tc - SCOPE_S;
    var X = function (tt) { return L + (tt - t0) / SCOPE_S * pw; };
    var Y = function (v) { return T + (1 - v) * ph; };
    x.textBaseline = 'middle'; x.textAlign = 'right';
    [0, 0.5, 1].forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      x.strokeStyle = rgba(C.line, 0.55); x.lineWidth = 1;
      x.beginPath(); x.moveTo(L, y); x.lineTo(L + pw, y); x.stroke();
      x.fillStyle = rgba(C.muted, 1);
      x.fillText(fmt(v, 0.5), L - 6, y);
    });
    x.textBaseline = 'top'; x.textAlign = 'center';
    for (var s = 0; s <= SCOPE_S; s++) {
      var gx = Math.round(X(t0 + s)) + 0.5;
      x.strokeStyle = rgba(C.line, 0.45);
      x.beginPath(); x.moveTo(gx, T); x.lineTo(gx, T + ph); x.stroke();
      x.fillStyle = rgba(C.muted, 1);
      x.fillText(fmt(s - SCOPE_S, 1), gx, T + ph + 6);
    }
    frameBox(x, L, T, pw, ph);

    x.beginPath();
    var started = false;
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].t < t0) continue;
      var px = X(hist[i].t), py = Y(hist[i].v);
      if (started) x.lineTo(px, py); else { x.moveTo(px, py); started = true; }
    }
    x.strokeStyle = rgba(C.wave, 0.95); x.lineWidth = 1.5;
    x.shadowColor = rgba(C.wave, 0.6); x.shadowBlur = 6;
    x.stroke();
    x.shadowBlur = 0;
    if (started) dot(x, X(tc), Y(I), C.wave, 3);

    topLabels(x, L, L + pw, 'intensidad', 't rel. (s)', T - 14);
    x.textBaseline = 'top';
  }

  /* Bucle de dibujo: se agrupa en un solo rAF por ráfaga de eventos. */
  function drawAll() {
    rafId = 0;
    if (colorsDirty) { readColors(); colorsDirty = false; }
    if (trackDirty) rebuild();
    drawStrain(charts.strain);
    drawSpectro(charts.spectro);
    drawFringe(charts.fringe);
  }

  /* Eventos del bus */
  function onFrame(f) {
    if (!f) return;
    lastFrame = f;
    var t = num(f.t);
    var last = hist.length ? hist[hist.length - 1].t : -Infinity;
    if (t < last) { hist.length = 0; last = -Infinity; }
    if (t > last) hist.push({ t: t, v: clamp(num(f.intensity), 0, 1) });
    var cut = t - SCOPE_S - 0.5;
    while (hist.length && hist[0].t < cut) hist.shift();
    requestDraw();
  }
  function onState(datos) {
    if (touches(datos, TRACK_KEYS)) trackDirty = true;
    requestDraw();
  }
  function onReset() {
    lastFrame = null;
    hist.length = 0;
    requestDraw();
  }

  function init() {
    if (inited) return;
    inited = true;
    charts.strain = makeChart('chart-strain', 'Deformación h(t) de la onda gravitacional con el cursor en el tiempo actual');
    charts.spectro = makeChart('chart-spectro', 'Espectrograma tiempo-frecuencia del chirp');
    charts.fringe = makeChart('chart-fringe', 'Franjas de interferencia del fotodiodo y señal temporal de intensidad');
    var ff = getComputedStyle(document.body).fontFamily;
    fontStr = '11px ' + (ff || 'sans-serif');
    readColors();

    var list = [charts.strain, charts.spectro, charts.fringe].filter(Boolean);
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function () { colorsDirty = true; requestDraw(); });
      list.forEach(function (ch) { ro.observe(ch.cv); });
    } else {
      window.addEventListener('resize', function () { colorsDirty = true; requestDraw(); });
    }

    if (LIGO.bus) {
      LIGO.bus.on('frame', onFrame);
      LIGO.bus.on('state', onState);
      LIGO.bus.on('reset', onReset);
    }
    trackDirty = true;
    requestDraw();
  }

  LIGO.charts = { init: init };
})();
