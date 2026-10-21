/* LIGO.universe3d: universo 3D (binaria, malla espacio-tiempo, ondas, fusión). */
(function () {
  'use strict';

  var LIGO = (window.LIGO = window.LIGO || {});
  var TAU = Math.PI * 2;
  var GRID_N = 60;
  var GRID_R = 7;
  var BASE_Y = -0.9;
  var SOFT = 0.9;
  var S2 = SOFT * SOFT;
  var WELL_K = 0.8 * SOFT;
  var RING_POOL = 14;
  var RING_LIFE = 3.2;
  var RING_SPEED = 2.2;
  var STAR_N = 1600;
  var TARGET_Y = -0.6;
  var C_CYAN = [0.2, 0.9, 1.0];
  var C_VIOLET = [0.62, 0.36, 1.0];

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rBH(m) { return 0.1 + 0.16 * Math.cbrt(m / 30); }

  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function additiveSprite(tex, color, opacity) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }

  function additiveMat(color, opacity) {
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
  }

  function buildStars() {
    var rand = rng(20150914);
    var pos = new Float32Array(STAR_N * 3), col = new Float32Array(STAR_N * 3);
    var size = new Float32Array(STAR_N), ph = new Float32Array(STAR_N);
    var tints = [[0.75, 0.85, 1], [1, 0.95, 0.85], [1, 0.8, 0.65], [0.85, 0.75, 1]];
    for (var i = 0; i < STAR_N; i++) {
      var u = rand() * 2 - 1, th = rand() * TAU, s = Math.sqrt(1 - u * u), R = 70 + rand() * 40;
      pos[i * 3] = R * s * Math.cos(th);
      pos[i * 3 + 1] = R * u;
      pos[i * 3 + 2] = R * s * Math.sin(th);
      var tc = tints[Math.floor(rand() * tints.length)];
      var b = 0.35 + 0.65 * rand() * rand();
      col[i * 3] = tc[0] * b; col[i * 3 + 1] = tc[1] * b; col[i * 3 + 2] = tc[2] * b;
      size[i] = 1.0 + Math.pow(rand(), 4) * 4.5;
      ph[i] = rand();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: [
        'attribute float aSize; attribute float aPhase; attribute vec3 aColor;',
        'uniform float uTime; uniform float uScale;',
        'varying vec3 vColor; varying float vA;',
        'void main(){',
        '  vColor = aColor;',
        '  vA = 0.7 + 0.3 * sin(uTime * (0.5 + aPhase * 0.8) + aPhase * 40.0);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = aSize * uScale;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor; varying float vA;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  float a = 1.0 - smoothstep(0.0, 0.5, d);',
        '  a = a * a * vA;',
        '  gl_FragColor = vec4(vColor * a, 1.0);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    return { points: new THREE.Points(g, mat), mat: mat };
  }

  function diskMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBright: { value: 1 } },
      vertexShader: 'varying vec2 vL;\nvoid main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform float uTime; uniform float uBright; varying vec2 vL;',
        'void main(){',
        '  float r = length(vL);',
        '  float t = clamp((r - 1.0) / 1.8, 0.0, 1.0);',
        '  float ang = atan(vL.y, vL.x);',
        '  float streak = 0.55 + 0.45 * sin(ang * 6.0 - t * 14.0 + uTime * 3.0);',
        '  float m = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.55, 1.0, t));',
        '  vec3 c = mix(vec3(1.0, 0.93, 0.75), vec3(1.0, 0.5, 0.15), smoothstep(0.0, 0.35, t));',
        '  c = mix(c, vec3(0.6, 0.12, 0.04), smoothstep(0.35, 1.0, t));',
        '  gl_FragColor = vec4(c * m * streak * uBright, 1.0);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
  }

  function rimMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uGain: { value: 1.2 } },
      vertexShader: 'varying float vF;\nvoid main(){ vF = normalize(normalMatrix * normal).z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uGain; varying float vF;\nvoid main(){ float rim = pow(1.0 - clamp(vF, 0.0, 1.0), 2.2); gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * rim * uGain, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  }

  function stub() {
    var noop = function () {};
    return { update: noop, resize: noop, setPaused: noop, dispose: noop };
  }

  function create(containerEl) {
    if (!containerEl || typeof THREE === 'undefined') return stub();
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      return stub();
    }
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var gain = reduce ? 0.5 : 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x03040a, 1);
    var canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    containerEl.appendChild(canvas);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    var target = new THREE.Vector3(0, TARGET_Y, 0);
    var theta = 0.5, phi = 0.8, radius = 12;
    var glowTex = glowTexture();

    var stars = buildStars();
    scene.add(stars.points);

    var haze = additiveSprite(glowTex, 0x4a2a8a, 0.22);
    haze.position.set(0, -5, -45);
    haze.scale.set(70, 45, 1);
    scene.add(haze);

    // Malla espacio-tiempo (líneas con color por vértice).
    var S = GRID_N + 1, NV = S * S;
    var gX = new Float32Array(NV), gZ = new Float32Array(NV), gFade = new Float32Array(NV);
    var gPos = new Float32Array(NV * 3), gCol = new Float32Array(NV * 3);
    var j, i, q;
    for (j = 0; j < S; j++) {
      for (i = 0; i < S; i++) {
        q = j * S + i;
        var gx = -GRID_R + 2 * GRID_R * i / GRID_N, gz = -GRID_R + 2 * GRID_R * j / GRID_N;
        gX[q] = gx; gZ[q] = gz;
        gPos[q * 3] = gx; gPos[q * 3 + 1] = BASE_Y; gPos[q * 3 + 2] = gz;
        gFade[q] = 1 - smooth(4.2, GRID_R, Math.sqrt(gx * gx + gz * gz));
      }
    }
    var idx = new Uint16Array(4 * S * GRID_N), n = 0, a;
    for (j = 0; j < S; j++) {
      for (i = 0; i < GRID_N; i++) { a = j * S + i; idx[n++] = a; idx[n++] = a + 1; }
    }
    for (j = 0; j < GRID_N; j++) {
      for (i = 0; i < S; i++) { a = j * S + i; idx[n++] = a; idx[n++] = a + S; }
    }
    var gGeo = new THREE.BufferGeometry();
    var gPosAttr = new THREE.BufferAttribute(gPos, 3);
    var gColAttr = new THREE.BufferAttribute(gCol, 3);
    gPosAttr.setUsage(THREE.DynamicDrawUsage);
    gColAttr.setUsage(THREE.DynamicDrawUsage);
    gGeo.setAttribute('position', gPosAttr);
    gGeo.setAttribute('color', gColAttr);
    gGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    var grid = new THREE.LineSegments(gGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    grid.frustumCulled = false;
    scene.add(grid);

    // Agujeros negros: esfera negra, borde fresnel naranja, disco y halo.
    var sphereGeo = new THREE.SphereGeometry(1, 40, 28);
    var diskGeo = new THREE.RingGeometry(1.0, 2.8, 128, 1);
    function makeBH() {
      var grp = new THREE.Group();
      var sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
      var rimMat = rimMaterial();
      var rim = new THREE.Mesh(sphereGeo, rimMat);
      var dmat = diskMaterial();
      var disk = new THREE.Mesh(diskGeo, dmat);
      disk.rotation.x = -Math.PI / 2;
      var glow = additiveSprite(glowTex, 0xff8a3c, 0.3);
      grp.add(glow, sphere, rim, disk);
      scene.add(grp);
      return { grp: grp, sphere: sphere, rim: rim, rimMat: rimMat, disk: disk, dmat: dmat, glow: glow };
    }
    var bh1 = makeBH(), bh2 = makeBH();

    // Anillos de onda emitidos en cada ciclo GW.
    var ringGeo = new THREE.RingGeometry(0.97, 1, 160, 1);
    var ringMesh = [], ringMat = [], ringAge = [];
    for (i = 0; i < RING_POOL; i++) {
      var rm = new THREE.MeshBasicMaterial({
        color: 0x33e6ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var mesh = new THREE.Mesh(ringGeo, rm);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      ringMesh.push(mesh); ringMat.push(rm); ringAge.push(-1);
    }

    // Flash de fusión y resplandor del remanente.
    var flashSpriteMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var flashSprite = new THREE.Sprite(flashSpriteMat);
    scene.add(flashSprite);
    var flashRingMat = additiveMat(0xfff2d0, 0);
    var flashRing = new THREE.Mesh(ringGeo, flashRingMat);
    flashRing.rotation.x = -Math.PI / 2;
    scene.add(flashRing);
    var remGlow = additiveSprite(glowTex, 0xffb060, 0);
    scene.add(remGlow);

    // Estado recibido de frames.
    var mass1 = 36, mass2 = 29, fPhase = 0, fPhase2 = 0, fSep = 0, fF = 20;
    var fMerged = false, fAfter = 0, fHMag = 0;
    var wasMerged = false, lastCyc = 0, pendingSpawn = false, lastSpawnT = -1e9;
    var flashT = 0, blend = 0, ampCur = 0.2, ampTarget = 0.2;
    var simT = 0, paused = false, last = 0, raf = 0, disposed = false;
    var p1x = 0, p1z = 0, p2x = 0, p2z = 0, KW1 = 0, KW2 = 0;

    function wellAt(x, z) {
      var d1 = x - p1x, e1 = z - p1z, d2 = x - p2x, e2 = z - p2z;
      return KW1 / Math.sqrt(d1 * d1 + e1 * e1 + S2) + KW2 / Math.sqrt(d2 * d2 + e2 * e2 + S2);
    }

    function setBH(bh, x, z, r, visible, glowOp) {
      var y = BASE_Y - wellAt(x, z) + r * 0.9;
      bh.grp.position.set(x, y, z);
      bh.grp.visible = visible;
      bh.sphere.scale.setScalar(r);
      bh.rim.scale.setScalar(r * 1.03);
      bh.disk.scale.setScalar(r);
      bh.glow.scale.set(r * 7, r * 7, 1);
      bh.glow.material.opacity = glowOp;
      bh.rimMat.uniforms.uGain.value = 1.1 * gain + 0.3 * flashT;
      bh.dmat.uniforms.uBright.value = (1.2 - 0.5 * blend) * (reduce ? 0.7 : 1);
      bh.dmat.uniforms.uTime.value = simT;
    }

    function spawnRing() {
      var idx2 = 0, oldest = -1, i2;
      for (i2 = 0; i2 < RING_POOL; i2++) {
        if (ringAge[i2] < 0) { idx2 = i2; oldest = -2; break; }
        if (ringAge[i2] > oldest) { oldest = ringAge[i2]; idx2 = i2; }
      }
      ringAge[idx2] = 0;
      ringMesh[idx2].visible = true;
    }

    function update(frame, state) {
      if (!frame) return;
      if (state && state.m1 > 0) mass1 = state.m1;
      if (state && state.m2 > 0) mass2 = state.m2;
      fPhase = frame.phase || 0;
      fPhase2 = frame.phase2 || 0;
      fSep = frame.sepKm || 0;
      fF = frame.f || 20;
      fMerged = !!frame.merged;
      fHMag = Math.abs(frame.hPlus || 0) + Math.abs(frame.hCross || 0);
      fAfter = Math.max(0, -(frame.tToMerge || 0));
      if (fMerged && !wasMerged) flashT = 1;
      wasMerged = fMerged;
      var cyc = Math.floor(fPhase2 / TAU);
      if (cyc < lastCyc) lastCyc = cyc;
      else if (cyc > lastCyc) {
        lastCyc = cyc;
        if (!fMerged && (!reduce || cyc % 2 === 0)) pendingSpawn = true;
      }
    }

    function animate(dt, now) {
      var dtS = paused ? 0 : dt;
      simT += dtS;

      if (!reduce && ptrs.size === 0 && now - lastInteract > 4000) theta += 0.06 * dt;
      var cr = radius * Math.sin(phi);
      camera.position.set(cr * Math.sin(theta), TARGET_Y + radius * Math.cos(phi), cr * Math.cos(theta));
      camera.lookAt(target);

      blend += ((fMerged ? 1 : 0) - blend) * Math.min(1, dtS * 2.5);

      var M = mass1 + mass2, w1 = mass1 / M, w2 = mass2 / M;
      var r1 = rBH(mass1), r2 = rBH(mass2), rRem = rBH(M * 0.95);
      var u = clamp((Math.log10(fSep + 10) - 1.6) / 1.8, 0, 1);
      var sep = Math.max(0.5 + 3.0 * smooth(0, 1, u), (r1 + r2) * 1.08);
      var c = Math.cos(fPhase), s = Math.sin(fPhase);
      var k = 1 - blend;
      var a1 = sep * w2 * k, a2 = sep * w1 * k;
      p1x = -a1 * c; p1z = -a1 * s;
      p2x = a2 * c; p2z = a2 * s;
      KW1 = WELL_K * w1; KW2 = WELL_K * w2;

      var ringAmp = fMerged ? Math.exp(-fAfter * 1.2) : 0;
      var rr1 = lerp(r1, rRem, blend), rr2 = lerp(r2, rRem, blend);
      var glowBase = 0.3 + 0.25 * ringAmp;
      setBH(bh1, p1x, p1z, rr1, true, glowBase);
      setBH(bh2, p2x, p2z, rr2, blend < 0.92, glowBase * (1 - blend * 0.5));

      // Malla: pozo gravitacional + ondas viajeras.
      var hAmp = clamp((Math.log10(fHMag + 1e-30) + 24) / 4.5, 0, 1);
      ampTarget = (0.1 + 0.3 * hAmp) * gain;
      ampCur += (ampTarget - ampCur) * Math.min(1, dtS * 6);
      var amp = ampCur * (1 - 0.7 * blend);
      var kW = 3.2 + 0.03 * clamp(fF, 10, 400);
      var ph = fPhase2;
      var ringS = ringAmp * gain;
      var colCyan = C_CYAN, colViolet = C_VIOLET;
      for (q = 0; q < NV; q++) {
        var x = gX[q], z = gZ[q];
        var rad = Math.sqrt(x * x + z * z);
        var fd = gFade[q];
        var rip = Math.sin(kW * rad - ph) / (1 + 0.22 * rad);
        var rg = ringS * Math.sin(9.0 * rad - simT * 13.0) * Math.exp(-rad * 0.35);
        var disp = (rip * amp + rg * 0.5) * fd;
        var y = BASE_Y - wellAt(x, z) + disp;
        gPos[q * 3 + 1] = y;
        var depth = clamp((BASE_Y - y) * 0.7, 0, 1);
        var br = (0.3 + 0.5 * depth + Math.abs(disp) * 2.5) * (0.25 + 0.75 * fd);
        br = clamp(br, 0, 1);
        gCol[q * 3] = lerp(colCyan[0], colViolet[0], depth) * br;
        gCol[q * 3 + 1] = lerp(colCyan[1], colViolet[1], depth) * br;
        gCol[q * 3 + 2] = lerp(colCyan[2], colViolet[2], depth) * br;
      }
      gPosAttr.needsUpdate = true;
      gColAttr.needsUpdate = true;

      if (pendingSpawn && simT - lastSpawnT >= (reduce ? 0.45 : 0.2)) {
        spawnRing();
        lastSpawnT = simT;
        pendingSpawn = false;
      }
      var ringAlpha = reduce ? 0.45 : 0.7;
      for (var ri = 0; ri < RING_POOL; ri++) {
        if (ringAge[ri] < 0) continue;
        ringAge[ri] += dtS;
        var age = ringAge[ri];
        if (age > RING_LIFE) {
          ringAge[ri] = -1;
          ringMesh[ri].visible = false;
          continue;
        }
        var t = age / RING_LIFE;
        var rs = 0.6 + age * RING_SPEED;
        ringMesh[ri].scale.set(rs, rs, 1);
        ringMat[ri].opacity = Math.pow(1 - t, 1.6) * ringAlpha;
        ringMat[ri].color.setRGB(lerp(C_CYAN[0], C_VIOLET[0], t), lerp(C_CYAN[1], C_VIOLET[1], t), lerp(C_CYAN[2], C_VIOLET[2], t));
      }

      flashT = Math.max(0, flashT - dtS * 0.8);
      var fe = 1 - flashT;
      flashSprite.scale.set(1 + 12 * fe, 1 + 12 * fe, 1);
      flashSpriteMat.opacity = Math.pow(flashT, 1.5) * 0.95 * gain;
      flashRing.scale.set(0.5 + 9 * Math.pow(fe, 0.6), 0.5 + 9 * Math.pow(fe, 0.6), 1);
      flashRingMat.opacity = flashT * 0.9 * gain;

      remGlow.scale.set(2 + 4 * ringAmp + blend, 2 + 4 * ringAmp + blend, 1);
      remGlow.material.opacity = blend * (0.25 + 0.5 * ringAmp) * (0.85 + 0.15 * Math.sin(simT * 9)) * gain;

      stars.mat.uniforms.uTime.value = simT;
    }

    // Órbita: arrastre, pinza y rueda.
    var ptrs = new Map();
    var lastInteract = -1e9, pinch0 = 0, radius0 = 0;
    function pinchDist() {
      var it = ptrs.values();
      var pa = it.next().value, pb = it.next().value;
      return Math.hypot(pa.x - pb.x, pa.y - pb.y);
    }
    function onDown(e) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      if (ptrs.size === 2) { pinch0 = pinchDist(); radius0 = radius; }
      lastInteract = performance.now();
      canvas.style.cursor = 'grabbing';
    }
    function onMove(e) {
      var p = ptrs.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) {
        theta -= dx * 0.008;
        phi = clamp(phi + dy * 0.006, 0.2, 1.5);
      } else if (ptrs.size >= 2 && pinch0 > 0) {
        radius = clamp(radius0 * pinch0 / Math.max(1, pinchDist()), 5, 30);
      }
      lastInteract = performance.now();
    }
    function onUp(e) {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch0 = 0;
      if (ptrs.size === 0) canvas.style.cursor = 'grab';
    }
    function onWheel(e) {
      e.preventDefault();
      radius = clamp(radius * Math.exp(e.deltaY * 0.0012), 5, 30);
      lastInteract = performance.now();
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    function resize() {
      if (disposed) return;
      var w = Math.max(1, containerEl.clientWidth), h = Math.max(1, containerEl.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      stars.mat.uniforms.uScale.value = renderer.getPixelRatio() * Math.max(h, 400) / 700;
    }

    function loop(now) {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      animate(dt, now);
      renderer.render(scene, camera);
    }

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(containerEl);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();
    raf = requestAnimationFrame(loop);

    return {
      update: update,
      resize: resize,
      setPaused: function (b) { paused = !!b; },
      dispose: function () {
        disposed = true;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onUp);
        canvas.removeEventListener('wheel', onWheel);
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  LIGO.universe3d = { create: create };
})();
