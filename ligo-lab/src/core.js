window.LIGO = window.LIGO || {};
(function () {
  const listeners = {};
  LIGO.bus = {
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
    emit(e, d) { (listeners[e] || []).forEach(fn => { try { fn(d); } catch (err) { console.error(e, err); } }); }
  };
  LIGO.state = { preset: 'GW150914', m1: 36, m2: 29, distMpc: 410, incl: 0, exag: 1e20, realistic: false, speed: 1, playing: true, noise: false, view: 'both' };
  LIGO.frame = null;
  LIGO.track = null;
  LIGO.setState = function (partial) {
    Object.assign(LIGO.state, partial);
    const keys = Object.keys(partial);
    if (keys.some(k => ['m1', 'm2', 'distMpc', 'incl'].includes(k))) { LIGO.track = LIGO.physics.buildTrack(LIGO.state); LIGO.clock.t = 0; LIGO.clock.merged = false; LIGO.bus.emit('reset'); }
    LIGO.bus.emit('state', partial);
  };
  LIGO.clock = { t: 0, merged: false };
  LIGO.reset = function () { LIGO.clock.t = 0; LIGO.clock.merged = false; LIGO.bus.emit('reset'); };

  LIGO.boot = function () {
    LIGO.track = LIGO.physics.buildTrack(LIGO.state);
    ['universe3d', 'detector3d'].forEach(k => { /* creados por boot según contenedores */ });
    const uni = LIGO.universe3d && document.getElementById('universe') ? LIGO.universe3d.create(document.getElementById('universe')) : null;
    const det = LIGO.detector3d && document.getElementById('detector') ? LIGO.detector3d.create(document.getElementById('detector')) : null;
    LIGO.views = { uni, det };
    ['ui', 'charts'].forEach(k => { if (LIGO[k] && LIGO[k].init) LIGO[k].init(); });
    window.addEventListener('resize', () => { uni && uni.resize(); det && det.resize(); });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { uni && uni.resize(); det && det.resize(); });
      ['universe', 'detector'].forEach(id => { const el = document.getElementById(id); el && ro.observe(el); });
    }
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = LIGO.state, tr = LIGO.track;
      if (s.playing) {
        LIGO.clock.t += dt * s.speed;
        if (LIGO.clock.t > tr.duration + 1.5) { LIGO.clock.t = 0; LIGO.clock.merged = false; LIGO.bus.emit('reset'); }
      }
      const fr = LIGO.physics.sample(tr, Math.min(LIGO.clock.t, tr.duration), s);
      LIGO.frame = fr;
      if (fr.merged && !LIGO.clock.merged) { LIGO.clock.merged = true; LIGO.bus.emit('merger', fr); }
      uni && uni.update(fr, s); det && det.update(fr, s);
      LIGO.bus.emit('frame', fr);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  };
})();
