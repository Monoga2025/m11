(function () {
  'use strict';

  var LIGO = window.LIGO || (window.LIGO = {});

  var ARM_M = 4000;
  var L0 = 3.0;
  var GAIN = 1.6;
  var MAX_DEF = 0.08;
  var LASER_D = 1.8;
  var DIODE_D = 1.5;
  var TUBE_R = 0.11;
  var BEAM_R = 0.03;
  var MIRROR_R = 0.42;
  var RED = 0xff5a3c;
  var ORANGE = 0xffa040;
  var STEEL = 0x4a6b8a;
  var TUBE = 0x5a7fa6;
  var HP = Math.PI / 2;
  var LBL_W = 512;
  var LBL_H = 128;
  var SCALE = 2;
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  var GROUP_COUNT = [6, 10, 10, 6];
  var GROUP_RATE = [0.7, 0.35, 0.35, 0.7];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function sup(n) {
    return String(n).split('').map(function (ch) {
      return ch === '-' ? '⁻' : SUP[+ch];
    }).join('');
  }

  function expLabel(ex) {
    if (!(ex > 1)) return '×1';
    return '×10' + sup(Math.round(Math.log10(ex)));
  }

  function fmtReal(x) {
    if (LIGO.physics && LIGO.physics.formatSI) return LIGO.physics.formatSI(x, 'm');
    return x.toExponential(1) + ' m';
  }

  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function createLabel(H) {
    var canvas = document.createElement('canvas');
    canvas.width = LBL_W * SCALE;
    canvas.height = LBL_H * SCALE;
    var ctx = canvas.getContext('2d');
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false
    }));
    sprite.scale.set(H * LBL_W / LBL_H, H, 1);
    sprite.renderOrder = 10;
    var lastKey = '';

    function paint(lines) {
      var key = lines.map(function (l) { return l.text + '|' + l.color; }).join('\n');
      if (key === lastKey) return;
      lastKey = key;
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.clearRect(0, 0, LBL_W, LBL_H);
      var n = lines.length;
      var lineH = 52;
      var fonts = [];
      var maxW = 0;
      for (var i = 0; i < n; i++) {
        var fs = i === 0 ? 44 : 38;
        ctx.font = '600 ' + fs + 'px ' + FONT;
        var w = ctx.measureText(lines[i].text).width;
        if (w > LBL_W - 48) {
          fs = fs * (LBL_W - 48) / w;
          ctx.font = '600 ' + fs + 'px ' + FONT;
          w = LBL_W - 48;
        }
        fonts.push('600 ' + fs + 'px ' + FONT);
        if (w > maxW) maxW = w;
      }
      var boxW = Math.min(LBL_W - 8, maxW + 40);
      var boxH = n * lineH + 16;
      var bx = (LBL_W - boxW) / 2;
      var by = (LBL_H - boxH) / 2;
      pill(ctx, bx, by, boxW, boxH, boxH / 2);
      ctx.fillStyle = 'rgba(7,11,22,0.74)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,165,230,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var j = 0; j < n; j++) {
        ctx.font = fonts[j];
        ctx.fillStyle = lines[j].color;
        ctx.fillText(lines[j].text, LBL_W / 2, by + 8 + lineH * (j + 0.5));
      }
      tex.needsUpdate = true;
    }

    return { sprite: sprite, paint: paint };
  }

  function create(containerEl) {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      containerEl.textContent = 'WebGL no disponible en este navegador.';
      return { update: function () {}, resize: function () {} };
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interferómetro de Michelson en L con láser, divisor de haz, dos espejos de 40 kg y fotodiodo');
    containerEl.appendChild(canvas);

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    scene.add(new THREE.AmbientLight(0x6f86b0, 0.6));
    var sun = new THREE.DirectionalLight(0xdfe9ff, 0.9);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    var laserLight = new THREE.PointLight(RED, 0.8, 4);
    laserLight.position.set(-LASER_D + 0.3, 0.4, 0);
    scene.add(laserLight);

    var glow = glowTexture();

    var grid = new THREE.GridHelper(20, 40, 0x2b4a7a, 0x14233d);
    grid.position.y = -0.85;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.material.depthWrite = false;
    scene.add(grid);

    var floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({
      map: glow, color: 0x1d3a6e, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    floorGlow.rotation.x = -HP;
    floorGlow.position.y = -0.86;
    scene.add(floorGlow);

    var steelMat = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.7, roughness: 0.35 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x26364d, metalness: 0.5, roughness: 0.5 });
    var mirrorMat = new THREE.MeshStandardMaterial({ color: 0xdde9f5, metalness: 1, roughness: 0.06 });
    var tubeMat = new THREE.MeshStandardMaterial({
      color: TUBE, metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.2, depthWrite: false
    });
    var beamMat = new THREE.MeshBasicMaterial({ color: RED });
    var outMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.4, depthWrite: false });
    var bsMat = new THREE.MeshStandardMaterial({
      color: 0xa8dcff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false
    });
    var diodeMat = new THREE.MeshStandardMaterial({
      color: 0x2a3a50, emissive: ORANGE, emissiveIntensity: 0, metalness: 0.3, roughness: 0.4
    });
    var barMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    var ghostMat = new THREE.MeshBasicMaterial({
      color: 0x7fa3d6, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false
    });

    var tubeGeo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, 1, 20, 1, true);
    tubeGeo.translate(0, 0.5, 0);
    var beamGeo = new THREE.CylinderGeometry(BEAM_R, BEAM_R, 1, 10);
    beamGeo.translate(0, 0.5, 0);

    function orient(mesh, dir) {
      if (dir === '+x') mesh.rotation.z = -HP;
      else if (dir === '-x') mesh.rotation.z = HP;
      else if (dir === '+z') mesh.rotation.x = HP;
      else mesh.rotation.x = -HP;
    }

    function seg(geo, mat, dir, x, y, z, len) {
      var m = new THREE.Mesh(geo, mat);
      orient(m, dir);
      m.position.set(x, y, z);
      m.scale.y = len;
      scene.add(m);
      return m;
    }

    function addMesh(geo, mat, x, y, z) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    }

    addMesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), bsMat, 0, 0, 0).rotation.y = -Math.PI / 4;

    var laserBody = addMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), darkMat, -LASER_D, 0, 0);
    laserBody.rotation.z = HP;
    seg(beamGeo, beamMat, '+x', -LASER_D + 0.3, 0, 0, LASER_D - 0.3);

    var tubeX = seg(tubeGeo, tubeMat, '+x', 0, 0, 0, L0);
    var tubeY = seg(tubeGeo, tubeMat, '+z', 0, 0, 0, L0);
    var beamX = seg(beamGeo, beamMat, '+x', 0, 0, 0, L0);
    var beamY = seg(beamGeo, beamMat, '+z', 0, 0, 0, L0);

    var mirrorDiscGeo = new THREE.CylinderGeometry(MIRROR_R, MIRROR_R, 0.12, 36);

    var mirrorX = new THREE.Group();
    var discX = new THREE.Mesh(mirrorDiscGeo, mirrorMat);
    discX.rotation.z = HP;
    mirrorX.add(discX);
    var mountX = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.9), darkMat);
    mountX.position.x = 0.25;
    mirrorX.add(mountX);
    mirrorX.position.set(L0, 0, 0);
    scene.add(mirrorX);

    var mirrorY = new THREE.Group();
    var discY = new THREE.Mesh(mirrorDiscGeo, mirrorMat);
    discY.rotation.x = HP;
    mirrorY.add(discY);
    var mountY = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), darkMat);
    mountY.position.z = 0.25;
    mirrorY.add(mountY);
    mirrorY.position.set(0, 0, L0);
    scene.add(mirrorY);

    var ringX = addMesh(new THREE.RingGeometry(MIRROR_R + 0.04, MIRROR_R + 0.1, 48), ghostMat, L0, 0, 0);
    ringX.rotation.y = HP;
    addMesh(new THREE.RingGeometry(MIRROR_R + 0.04, MIRROR_R + 0.1, 48), ghostMat, 0, 0, L0);

    var barX = addMesh(new THREE.BoxGeometry(1, 0.04, 0.04), barMat, L0, 0.75, 0);
    var barY = addMesh(new THREE.BoxGeometry(0.04, 0.04, 1), barMat, 0, 0.75, L0);

    var diode = addMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 24), diodeMat, 0, 0, -DIODE_D);
    diode.rotation.x = HP;
    var diodeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: ORANGE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    diodeGlow.position.set(0, 0, -DIODE_D + 0.3);
    scene.add(diodeGlow);
    var outBeam = seg(beamGeo, outMat, '-z', 0, 0, 0, DIODE_D - 0.15);

    var laserGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: RED, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    laserGlow.position.set(-LASER_D + 0.3, 0, 0);
    laserGlow.scale.set(0.7, 0.7, 1);
    scene.add(laserGlow);

    var packetCount = 0;
    GROUP_COUNT.forEach(function (c) { packetCount += c; });
    var packetPos = new Float32Array(packetCount * 3);
    var packetPhase = new Float32Array(packetCount);
    var packetGroup = new Uint8Array(packetCount);
    var pi = 0;
    for (var g = 0; g < GROUP_COUNT.length; g++) {
      for (var k = 0; k < GROUP_COUNT[g]; k++) {
        packetPhase[pi] = (k + 0.5) / GROUP_COUNT[g];
        packetGroup[pi] = g;
        pi++;
      }
    }
    var packetGeo = new THREE.BufferGeometry();
    packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
    var packets = new THREE.Points(packetGeo, new THREE.PointsMaterial({
      map: glow, color: RED, size: 0.18, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    packets.frustumCulled = false;
    scene.add(packets);

    var lblLaser = createLabel(0.6);
    lblLaser.sprite.position.set(-LASER_D - 0.2, 0.9, 0.6);
    lblLaser.paint([{ text: 'Láser 1064 nm', color: '#ffb09a' }]);
    scene.add(lblLaser.sprite);

    var lblBS = createLabel(0.6);
    lblBS.sprite.position.set(-1.0, 0.85, -0.6);
    lblBS.paint([{ text: 'Divisor de haz', color: '#cfe6ff' }]);
    scene.add(lblBS.sprite);

    var lblDiode = createLabel(0.6);
    lblDiode.sprite.position.set(0.9, 0.5, -DIODE_D - 0.2);
    lblDiode.paint([{ text: 'Fotodiodo', color: '#ffd29a' }]);
    scene.add(lblDiode.sprite);

    var lblMirX = createLabel(0.6);
    lblMirX.paint([{ text: 'Espejo 40 kg', color: '#cfe6ff' }]);
    scene.add(lblMirX.sprite);

    var lblMirY = createLabel(0.6);
    lblMirY.paint([{ text: 'Espejo 40 kg', color: '#cfe6ff' }]);
    scene.add(lblMirY.sprite);

    var lblArmX = createLabel(0.5);
    lblArmX.sprite.position.set(L0 / 2, -0.5, -0.5);
    lblArmX.paint([{ text: 'Brazo X · 4 km', color: '#9fb6d8' }]);
    scene.add(lblArmX.sprite);

    var lblArmY = createLabel(0.5);
    lblArmY.sprite.position.set(-1.0, -0.5, L0 / 2);
    lblArmY.paint([{ text: 'Brazo Y · 4 km', color: '#9fb6d8' }]);
    scene.add(lblArmY.sprite);

    var lblRead = createLabel(0.75);
    lblRead.sprite.position.set(2.3, 1.1, -1.6);
    scene.add(lblRead.sprite);

    var target = new THREE.Vector3(0.5, 0, 0.7);
    var theta = 0.45;
    var phi = 0.9;
    var radius = 9.2;
    var pts = new Map();
    var pinchD = 0;
    var idle = 0;

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.style.cursor = 'grabbing';
      pinchD = 0;
      idle = 0;
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        theta -= (e.clientX - p.x) * 0.006;
        phi = clamp(phi - (e.clientY - p.y) * 0.005, 0.2, 1.45);
        p.x = e.clientX;
        p.y = e.clientY;
      } else {
        p.x = e.clientX;
        p.y = e.clientY;
        var it = pts.values();
        var a = it.next().value;
        var b = it.next().value;
        if (a && b) {
          var d = dist(a, b);
          if (pinchD > 0 && d > 0) radius = clamp(radius * pinchD / d, 4.5, 18);
          pinchD = d;
        }
      }
    });
    function endPointer(e) {
      pts.delete(e.pointerId);
      pinchD = 0;
      if (pts.size === 0) canvas.style.cursor = 'grab';
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      idle = 0;
      radius = clamp(radius * Math.exp(e.deltaY * 0.0015), 4.5, 18);
    }, { passive: false });

    var frame = null;
    var st = null;
    var clock = 0;
    var last = 0;
    var lastLabel = 0;
    var smoothI = 0.5;
    var visible = true;
    var sizeW = 0;
    var sizeH = 0;

    function resize() {
      var w = containerEl.clientWidth || 640;
      var h = containerEl.clientHeight || 400;
      sizeW = w;
      sizeH = h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function readoutLines() {
      var realistic = !!(st && st.realistic);
      var ex = st ? +st.exag : 1;
      var head = realistic
        ? { text: 'Escala real (sin exagerar)', color: '#cfe6ff' }
        : { text: 'Exagerado ' + expLabel(ex) + ' (visual)', color: '#ffc49a' };
      var dl = frame && isFinite(frame.dL) ? fmtReal(frame.dL) : '—';
      return [head, { text: 'ΔL real = ' + dl, color: '#e8f1ff' }];
    }

    function loop(now) {
      requestAnimationFrame(loop);
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (!visible || sizeW === 0) return;

      var speed = st && isFinite(st.speed) ? st.speed : 1;
      if (!st || st.playing !== false) clock += dt * speed * (reduced ? 0.35 : 1);

      var dLV = frame && isFinite(frame.dLVisual) ? frame.dLVisual : 0;
      var s = clamp((dLV / ARM_M) * GAIN, -MAX_DEF, MAX_DEF);
      var armX = L0 * (1 + s);
      var armY = L0 * (1 - s);

      tubeX.scale.y = armX;
      beamX.scale.y = armX;
      tubeY.scale.y = armY;
      beamY.scale.y = armY;
      mirrorX.position.x = armX;
      mirrorY.position.z = armY;
      lblMirX.sprite.position.set(armX, 0.95, 0);
      lblMirY.sprite.position.set(0, 0.95, armY);

      var dX = armX - L0;
      var dY = armY - L0;
      barX.visible = Math.abs(dX) > 0.004;
      barX.position.x = L0 + dX / 2;
      barX.scale.x = Math.max(Math.abs(dX), 1e-4);
      barY.visible = Math.abs(dY) > 0.004;
      barY.position.z = L0 + dY / 2;
      barY.scale.z = Math.max(Math.abs(dY), 1e-4);

      var I = frame && isFinite(frame.intensity) ? clamp(frame.intensity, 0, 1) : 0;
      smoothI += (I - smoothI) * 0.3;
      diodeMat.emissiveIntensity = 0.05 + 1.4 * smoothI;
      diodeGlow.material.opacity = 0.08 + 0.9 * smoothI;
      diodeGlow.scale.set(0.5 + 0.7 * smoothI, 0.5 + 0.7 * smoothI, 1);
      outMat.opacity = 0.15 + 0.85 * smoothI;
      laserGlow.material.opacity = 0.55 + 0.2 * Math.sin(clock * 5);

      for (var i = 0; i < packetCount; i++) {
        var sp = packetPhase[i] + clock * GROUP_RATE[packetGroup[i]];
        sp -= Math.floor(sp);
        var grp = packetGroup[i];
        var x = 0, y = 0, z = 0;
        if (grp === 0) {
          x = (-LASER_D + 0.3) * (1 - sp);
        } else if (grp === 1 || grp === 2) {
          var d = sp < 0.5 ? 2 * sp : 2 - 2 * sp;
          if (grp === 1) x = d * armX;
          else z = d * armY;
        } else {
          z = -sp * (DIODE_D - 0.2);
        }
        packetPos[i * 3] = x;
        packetPos[i * 3 + 1] = y;
        packetPos[i * 3 + 2] = z;
      }
      packetGeo.attributes.position.needsUpdate = true;

      if (now - lastLabel > 150) {
        lastLabel = now;
        lblRead.paint(readoutLines());
      }

      if (!reduced && !pts.size) {
        idle += dt;
        if (idle > 4) theta += dt * 0.04;
      }
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);

      renderer.render(scene, camera);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    resize();
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { resize(); }).observe(containerEl);
    } else {
      window.addEventListener('resize', resize);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
      }).observe(containerEl);
    }
    requestAnimationFrame(loop);

    return {
      update: function (f, state) {
        frame = f;
        st = state;
      },
      resize: resize
    };
  }

  LIGO.detector3d = { create: create };
})();
