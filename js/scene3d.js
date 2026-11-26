/**
 * 3D scene (Three.js r128).
 *
 * - On-demand rendering: frames are drawn only when something changes (model update,
 *   camera move, resize). The rAF loop runs only while the camera is easing to its target,
 *   then stops, so an idle page does no GPU work.
 * - Lighting rig: hemisphere sky/ground fill + one key DirectionalLight with a soft
 *   PCF shadow whose frustum is fitted to the model's bounds on every update.
 * - Ground is a ShadowMaterial catcher over a lit lot, so shadows read on the site.
 * - Filmic tone mapping (ACES) + sRGB output for natural falloff.
 * - Pauses rendering when the canvas is off-screen or the tab is hidden.
 *
 * World units = metres. Origin = lot centre. Front lot line at z = -lotDepth/2; road at z < front line.
 */
(function (root) {
  'use strict';

  const REDUCED_MOTION = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function createScene3D(container) {
    if (!root.THREE) {
      container.innerHTML = '<p class="hint">3D needs internet access to load Three.js.</p>';
      return { update() {}, reset() {}, dispose() {}, setSize() {}, setAutoRotate() { return false; }, isAutoRotate() { return false; }, setSun() {}, snapshot() { return null; }, setPickMode() {}, setWind() {}, invalidate() {}, available: false };
    }
    const THREE = root.THREE;

    // ---------- renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;       // r128 name (outputColorSpace arrived in r152)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'ภาพจำลองอาคาร 3 มิติ / 3D building model');
    canvas.tabIndex = 0;                                  // keyboard-focusable for accessibility
    container.appendChild(canvas);

    // ---------- scene & camera ----------
    const scene = new THREE.Scene();
    // sky gradient (zenith -> horizon); fog matches the horizon so distant ground melts into the sky
    (function () {
      const c = root.document.createElement('canvas'); c.width = 4; c.height = 256;
      const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#cfe0f5'); grd.addColorStop(0.55, '#e6eef8'); grd.addColorStop(1, '#f3f1ea');
      g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      scene.background = tex;
    })();
    scene.fog = new THREE.Fog(0xeaeff6, 150, 340);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 800);

    // Fill: sky/ground hemisphere
    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x9aa6b8, 0.75);
    scene.add(hemi);

    // Key: sun with a soft shadow. Frustum is refit in fitShadow().
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.35);
    sun.castShadow = true;
    const hiRes = !(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    sun.shadow.mapSize.set(hiRes ? 4096 : 2048, hiRes ? 4096 : 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;                                // softens PCF edges where supported
    scene.add(sun);
    scene.add(sun.target);

    // Fill: cool, shadowless light from the opposite side keeps shaded walls readable (no flat black)
    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.35);
    scene.add(fill);
    scene.add(fill.target);

    // Ground: lit lot tint + shadow catcher on top
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xf3f6fa, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    scene.add(ground);

    const catcher = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.02;
    catcher.receiveShadow = true;
    scene.add(catcher);

    const dynamic = new THREE.Group();
    scene.add(dynamic);

    const analysis = new THREE.Group();     // geographic (not rotated with the lot): sun path + wind rose
    scene.add(analysis);
    const roadTexture = makeRoadTexture();

    // HTML labels for setback dimensions, projected from 3D points every frame
    const labelLayer = root.document.createElement('div');
    labelLayer.className = 'dim-labels';
    container.appendChild(labelLayer);
    let labelItems = [];

    // North arrow overlay: rotated with the camera so it always shows true north on screen
    const compass = root.document.createElement('div');
    compass.className = 'compass';
    compass.setAttribute('aria-hidden', 'true');
    compass.innerHTML = '<svg viewBox="0 0 40 48"><path d="M20 2 L30 30 L20 24 L10 30 Z" fill="#dc2626"/>' +
      '<path d="M20 24 L30 30 L20 46 L10 30 Z" fill="#cbd5e1"/></svg><span class="compass-n">N</span>';
    container.appendChild(compass);


    function updateLabels() {
      if (!labelItems.length) return;
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 420;
      labelItems.forEach(item => {
        const v = item.pos.clone().project(camera);
        if (v.z > 1 || v.z < -1) { item.el.style.display = 'none'; return; }
        item.el.style.display = '';
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        item.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      });
    }

    function addWorldLabel(text, pos, cls) {
      const el = root.document.createElement('div');
      el.className = 'dim-label geo-label ' + (cls || '');
      el.textContent = text;
      labelLayer.appendChild(el);
      labelItems.push({ el, pos: pos.clone() });
    }

    function addLabel(text, pos, fail) {
      const el = root.document.createElement('div');
      el.className = 'dim-label' + (fail ? ' is-fail' : '');
      el.textContent = text;
      labelLayer.appendChild(el);
      labelItems.push({ el, pos: pos.clone().applyMatrix4(dynamic.matrixWorld) });
    }

    /** Deterministic PRNG so surroundings do not reshuffle on every update. */
    function rng(seed) {
      return function () {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function addBox(w, h, d, color, x, y, z) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 }));
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      dynamic.add(mesh);
      return mesh;
    }

    function addTree(x, z, scale, rand) {
      const trunkH = 2.0 * scale;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, trunkH, 6),
        new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 })
      );
      trunk.position.set(x, trunkH / 2, z);
      trunk.castShadow = true;
      dynamic.add(trunk);
      const greens = [0x4f7d4a, 0x5b8c52, 0x3f6e43, 0x6a9a5b];
      const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5 * scale, 1),
        new THREE.MeshStandardMaterial({ color: greens[Math.floor(rand() * greens.length)], roughness: 0.85, metalness: 0, flatShading: true })
      );
      canopy.position.set(x, trunkH + 1.1 * scale, z);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      dynamic.add(canopy);
    }

    /** Context items (neighbours, buildings across the road, trees) from state.ctx or the auto layout. */
    function addSurroundings(state, b) {
      const { W, D } = b;
      const palette = [0xeee9df, 0xdfe6ee, 0xf3efe6, 0xdcd4c6, 0xe6ebef];
      const roofs = [0x7b6f63, 0x5b6573, 0x8a5a44];
      const items = Array.isArray(state.ctx) ? state.ctx : root.ArchLaw.defaultContext(state);
      items.forEach(it => {
        if (it.g === 'neighbor' ? state.hasNeighbors === false : (it.g === 'user' ? false : state.showContext === false)) return;
        const x = it.x - W / 2, z = it.y - D / 2;
        const first = dynamic.children.length;
        if (it.k === 't') addTree(x, z, it.s || 1, rng((it.c || 0) * 7919 + 11));
        else {
          const w = Math.max(1, it.w || 8), d = Math.max(1, it.d || 8), h = Math.max(1, it.h || 6);
          addBox(w, h, d, palette[(it.c || 0) % palette.length], x, 0, z);
          if (it.g === 'neighbor') addBox(w + 0.4, 0.5, d + 0.4, roofs[(it.c || 0) % roofs.length], x, h, z).castShadow = false;
        }
        for (let i = first; i < dynamic.children.length; i++) dynamic.children[i].userData.ctxId = it.id;   // for click-to-delete
      });
    }

    /** Setback dimension lines (3D) with HTML labels showing measured vs. legal distance. */
    function addDimensions(result, state, b) {
      const { W, D, RW, bxMin, bxMax, bzMin, bzMax } = b;
      const r = result.required;
      const m = result.metrics;
      const isEn = root.ArchI18n && root.ArchI18n.getLang() === 'en';
      const unit = isEn ? 'm' : 'ม.';
      const lineMat = (fail) => new THREE.LineBasicMaterial({ color: fail ? 0xef4444 : 0x0f172a, depthTest: false });
      const dotMat = (fail) => new THREE.MeshBasicMaterial({ color: fail ? 0xef4444 : 0x0f172a, depthTest: false });
      const y = 0.35;
      const zMid = (bzMin + bzMax) / 2;
      const xMid = (bxMin + bxMax) / 2;
      const roadZ = -D / 2 - RW / 2;

      function dim(a, c, text, fail) {
        const geo = new THREE.BufferGeometry().setFromPoints([a, c]);
        const line = new THREE.Line(geo, lineMat(fail));
        line.renderOrder = 10;
        dynamic.add(line);
        [a, c].forEach(p => {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), dotMat(fail));
          dot.position.copy(p);
          dot.renderOrder = 10;
          dynamic.add(dot);
        });
        const mid = new THREE.Vector3((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
        if (state.showDims !== false) addLabel(text, mid, fail);
      }

      const fF = state.frontSetback >= r.reqFrontFromCenter;
      const fL = state.leftSetback >= r.reqLeft;
      const fR = m.rightSetback >= r.reqRight;
      const fB = m.rearSetback >= r.reqRear;
      const txt = (name, v, req) => `${name} ${v.toFixed(1)} ${unit} (≥ ${req.toFixed(1)})`;

      // front: road centre -> building front, drawn on the building's right side
      const xFront = bxMax + 2.4;
      dim(new THREE.Vector3(xFront, y, roadZ), new THREE.Vector3(xFront, y, bzMin),
        txt(root.ArchI18n.t('dimFront'), state.frontSetback, r.reqFrontFromCenter), !fF);

      // left: lot line -> building left wall
      dim(new THREE.Vector3(-W / 2, y, zMid), new THREE.Vector3(bxMin, y, zMid),
        txt(root.ArchI18n.t('dimLeft'), state.leftSetback, r.reqLeft), !fL);

      // right: building right wall -> lot line
      dim(new THREE.Vector3(bxMax, y, zMid), new THREE.Vector3(W / 2, y, zMid),
        txt(root.ArchI18n.t('dimRight'), m.rightSetback, r.reqRight), !fR);

      // rear: building rear wall -> rear lot line (waterway edge when a river is present)
      dim(new THREE.Vector3(xMid, y, bzMax), new THREE.Vector3(xMid, y, D / 2),
        txt(root.ArchI18n.t('dimRear'), m.rearSetback, r.reqRear), !fB);
    }


    // ---------- orbit (eased) ----------
    const DEFAULT = { theta: -0.6, phi: 1.0, radius: 60 };
    const view = { theta: DEFAULT.theta, phi: DEFAULT.phi, radius: DEFAULT.radius };
    const goal = { theta: view.theta, phi: view.phi, radius: view.radius };
    const target = new THREE.Vector3(0, 2, 0);
    let frameQueued = false;
    let visible = true;
    let autoRotate = false;
    let dragging = false;
    let lastTime = 0;
    let flow = null;                      // wind-flow streaks (geographic, not rotated with the lot)
    let sunRef = null;                    // sun marker, moved in place while the sun animates
    let site = null;                      // last site bounds, so the sun slider can refresh cheaply

    function clampGoal() {
      goal.phi = Math.min(Math.max(goal.phi, 0.15), 1.45);
      goal.radius = Math.min(220, Math.max(12, goal.radius));
    }

    function placeCamera() {
      const p = view.phi;
      camera.position.set(
        target.x + view.radius * Math.sin(p) * Math.sin(view.theta),
        target.y + view.radius * Math.cos(p),
        target.z + view.radius * Math.sin(p) * Math.cos(view.theta)
      );
      camera.lookAt(target);
      compass.style.transform = 'rotate(' + view.theta.toFixed(4) + 'rad)';
    }

    /** Request a redraw (coalesced to one per animation frame). */
    function invalidate() {
      if (frameQueued) return;
      frameQueued = true;
      root.requestAnimationFrame(tick);
    }

    function animating() {
      return visible && ((flow && !REDUCED_MOTION) || (autoRotate && !dragging));
    }

    function tick(now) {
      frameQueued = false;
      const t = typeof now === 'number' ? now : lastTime;
      const dt = lastTime ? Math.min(0.05, (t - lastTime) / 1000) : 0.016;
      lastTime = t;
      if (autoRotate && !dragging) goal.theta += dt * 0.35;
      // ease the camera toward its goal; keep ticking only until it settles
      if (!REDUCED_MOTION || autoRotate) {
        const k = 0.18;
        view.theta += (goal.theta - view.theta) * k;
        view.phi += (goal.phi - view.phi) * k;
        view.radius += (goal.radius - view.radius) * k;
      } else {
        Object.assign(view, goal);
      }
      const settled =
        Math.abs(goal.theta - view.theta) < 1e-3 &&
        Math.abs(goal.phi - view.phi) < 1e-3 &&
        Math.abs(goal.radius - view.radius) < 1e-2;
      if (flow && !REDUCED_MOTION) stepFlow(dt);
      placeCamera();
      if (visible) { renderer.render(scene, camera); updateLabels(); }
      if (!settled || animating()) {
        frameQueued = true;
        root.requestAnimationFrame(tick);
      } else {
        lastTime = 0;
      }
    }

    // ---------- sizing ----------
    function resize() {
      const w = Math.max(1, container.clientWidth || 600);
      const h = Math.max(1, container.clientHeight || 420);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    }

    // Resize via ResizeObserver so split-view changes are caught, not just window resize.
    if (root.ResizeObserver) {
      new root.ResizeObserver(resize).observe(container);
    } else {
      root.addEventListener('resize', resize);
    }

    // Pause when off-screen (e.g. 2D-only view) to save GPU.
    if (root.IntersectionObserver) {
      new root.IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) invalidate();
      }).observe(container);
    }

    // ---------- pointer & keyboard input ----------
    let last = { x: 0, y: 0 };
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

    canvas.addEventListener('pointerdown', e => {
      dragging = true;
      downAt = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    // Click-to-place / click-to-delete: a tap (not a drag) in pick mode reports a plan position or a context id.
    let pickMode = null, onPick = null, downAt = null;
    const ray = new THREE.Raycaster();
    function pickAt(e) {
      if (!pickMode || !site) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
      if (pickMode === 'del') {
        const hit = ray.intersectObjects(dynamic.children, false).find(h => h.object.userData.ctxId);
        if (hit && onPick) onPick({ type: 'del', id: hit.object.userData.ctxId });
        return;
      }
      const hit = ray.intersectObject(ground, false)[0];
      if (!hit) return;
      dynamic.updateMatrixWorld(true);
      const local = dynamic.worldToLocal(hit.point.clone());
      if (onPick) onPick({ type: 'add', k: pickMode === 'tree' ? 't' : 'b', x: local.x + site.W / 2, y: local.z + site.D / 2 });
    }
    canvas.addEventListener('pointerup', e => {
      dragging = false; canvas.style.cursor = pickMode ? 'crosshair' : 'grab';
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) pickAt(e);
      downAt = null;
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      goal.theta -= (e.clientX - last.x) * 0.008;
      goal.phi -= (e.clientY - last.y) * 0.008;
      last = { x: e.clientX, y: e.clientY };
      clampGoal();
      // while dragging, follow the pointer directly (no lag)
      Object.assign(view, goal);
      invalidate();
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      goal.radius *= 1 + e.deltaY * 0.001;
      clampGoal();
      invalidate();
    }, { passive: false });

    // Keyboard orbit: arrows rotate/zoom, so the canvas is usable without a pointer.
    canvas.addEventListener('keydown', e => {
      const step = 0.08;
      const keys = {
        ArrowLeft: () => (goal.theta += step),
        ArrowRight: () => (goal.theta -= step),
        ArrowUp: () => (goal.phi -= step),
        ArrowDown: () => (goal.phi += step),
        '+': () => (goal.radius *= 0.92),
        '=': () => (goal.radius *= 0.92),
        '-': () => (goal.radius *= 1.08)
      };
      const fn = keys[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
      clampGoal();
      invalidate();
    });

    // ---------- shadow fitting ----------
    /** Fit the sun's shadow frustum to the model bounds so the 2048 map is not wasted. */
    function fitShadow(bounds) {
      const { cx, cz, span, height } = bounds;
      const half = Math.max(span * 0.75, 12);
      const cam = sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = Math.max(120, height * 4 + span * 2);
      cam.updateProjectionMatrix();
      // sun position: upper-front-right, looking at the model centre
      const dist = cam.far * 0.5;
      const sb = (Number(bounds.sunBearing) || 0) * Math.PI / 180;
      const alt = (bounds.sunAlt || 58) * Math.PI / 180;
      const hr = dist * Math.cos(alt);
      sun.position.set(cx + hr * Math.sin(sb), dist * Math.sin(alt), cz - hr * Math.cos(sb));
      sun.target.position.set(cx, 0, cz);
      sun.target.updateMatrixWorld();
      fill.position.set(cx - hr * Math.sin(sb), dist * 0.5, cz + hr * Math.cos(sb));
      fill.target.position.set(cx, 0, cz);
      fill.target.updateMatrixWorld();
    }

    // ---------- model ----------
    /** Traffic-noise heat map over the lot plus dB(A) readings at lot edge and building faces. */
    function addNoise(state, result, W, D) {
      const L = root.ArchLaw;
      const nx = Math.min(96, Math.max(8, Math.round(W * 3))), ny = Math.min(96, Math.max(8, Math.round(D * 3)));
      const cv = root.document.createElement('canvas'); cv.width = nx; cv.height = ny;
      const cg = cv.getContext('2d');
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = L.noiseColor(L.noiseAt(state, (i + 0.5) / nx * W, (j + 0.5) / ny * D));
        cg.fillStyle = 'rgb(' + c.join(',') + ')'; cg.fillRect(i, j, 1, 1);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const heat = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
      heat.rotation.x = -Math.PI / 2; heat.position.y = 0.03; heat.renderOrder = 1;
      dynamic.add(heat);
      const sm = L.noiseSummary(state, result);
      Object.keys(sm.points).forEach(k => {
        const [px, py] = sm.points[k];
        addLabel(sm[k] + ' dB', new THREE.Vector3(px - W / 2, 0.6, py - D / 2), false);
        labelItems[labelItems.length - 1].el.classList.add('noise-label');
      });
    }

    // ---------- wind flow effect ----------
    function clearFlow() {
      if (!flow) return;
      scene.remove(flow.mesh);
      flow.mesh.geometry.dispose();
      flow.mesh.material.dispose();
      flow = null;
    }

    /** Streaks drifting across the site in the direction the wind blows (from windBearing toward the opposite side). */
    function buildFlow(state, cx, cz, R) {
      clearFlow();
      const N = 170, half = R * 0.95, span = half * 2;
      const wb = (Number(state.windBearing) || 0) * Math.PI / 180;
      const dirX = -Math.sin(wb), dirZ = Math.cos(wb);          // blows toward the opposite bearing
      const perpX = -dirZ, perpZ = dirX;
      const rnd = rng(7);
      const items = [];
      for (let i = 0; i < N; i++) {
        items.push({ t: rnd(), side: (rnd() * 2 - 1) * half, y: 0.6 + rnd() * 11, speed: 0.07 + rnd() * 0.07,
          len: 2.2 + rnd() * 3.2, ph: rnd() * 6.28, amp: 0.4 + rnd() * 1.2 });
      }
      const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      flow = { mesh, items, pos, col, cx, cz, half, span, dirX, dirZ, perpX, perpZ, time: 0 };
      stepFlow(0);
    }

    function stepFlow(dt) {
      const f = flow; if (!f) return;
      f.time += dt;
      const head = [0.11, 0.44, 0.78], tail = [0.8, 0.9, 1];
      f.items.forEach((it, i) => {
        it.t += it.speed * dt; if (it.t > 1) it.t -= 1;
        const fade = Math.sin(Math.PI * it.t);                  // fade in/out at both ends
        const along = (it.t - 0.5) * f.span;
        const side = it.side + Math.sin(f.time * 0.9 + it.ph) * it.amp;
        const y = it.y + Math.sin(f.time * 0.7 + it.ph * 2) * 0.5;
        const L = it.len * (0.3 + 0.7 * fade);
        const hx = f.cx + f.dirX * along + f.perpX * side, hz = f.cz + f.dirZ * along + f.perpZ * side;
        const o = i * 6;
        f.pos[o] = hx; f.pos[o + 1] = y; f.pos[o + 2] = hz;
        f.pos[o + 3] = hx - f.dirX * L; f.pos[o + 4] = y; f.pos[o + 5] = hz - f.dirZ * L;
        for (let k = 0; k < 3; k++) { f.col[o + k] = head[k] * fade + (1 - fade); f.col[o + 3 + k] = tail[k]; }
      });
      f.mesh.geometry.attributes.position.needsUpdate = true;
      f.mesh.geometry.attributes.color.needsUpdate = true;
    }

    function clearAnalysis() {
      while (analysis.children.length) {
        const obj = analysis.children.pop();
        obj.traverse(n => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose());
        });
      }
    }

    /** Ground compass ring, sun-path dome arc with hour marks, sun marker and wind rose. */
    function buildAnalysis(state, cx, cz, R) {
      const L = root.ArchLaw;
      const D2R = Math.PI / 180;
      const C = new THREE.Vector3(cx, 0, cz);
      const polar = (az, r, y) => new THREE.Vector3(cx + r * Math.sin(az * D2R), y, cz - r * Math.cos(az * D2R));
      const mat = (c, o) => new THREE.LineBasicMaterial({ color: c, transparent: o != null, opacity: o == null ? 1 : o });

      // ring + degree ticks
      const ringPts = [];
      for (let a = 0; a <= 360; a += 3) ringPts.push(polar(a, R, 0.06));
      analysis.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), mat(0x64748b, 0.9)));
      const tickPts = [];
      for (let a = 0; a < 360; a += 10) {
        const len = a % 30 === 0 ? 1.8 : 0.9;
        tickPts.push(polar(a, R, 0.06), polar(a, R - len, 0.06));
      }
      analysis.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), mat(0x64748b, 0.9)));
      [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => addWorldLabel(t, polar(a, R + 4, 0.2), 'geo-card'));
      for (let a = 30; a < 360; a += 30) if (a % 90) addWorldLabel(a + '°', polar(a, R + 2.4, 0.2), 'geo-deg');

      const showSun = !!state.showSun, showWind = !!state.showWind;
      // sun path: sampled every 15 min while above the horizon
      const decl = Number(state.sunDecl) || 0;
      const to3 = (hr, rad) => {
        const sp = L.sunPosition(hr, decl);
        const h = Math.cos(sp.alt * D2R) * rad;
        return { sp, v: new THREE.Vector3(cx + h * Math.sin(sp.az * D2R), Math.sin(sp.alt * D2R) * rad, cz - h * Math.cos(sp.az * D2R)) };
      };
      const pts = [];
      for (let hr = 4; hr <= 20; hr += 0.25) { const q = to3(hr, R); if (q.sp.alt > 0) pts.push(q.v); }
      if (showSun && pts.length > 2) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.22, 6),
          new THREE.MeshBasicMaterial({ toneMapped: false, color: 0x0f172a }));
        analysis.add(tube);
      }
      for (let hr = 6; showSun && hr <= 18; hr++) {
        const q = to3(hr, R);
        if (q.sp.alt > 1) addWorldLabel(String(hr), q.v.clone().add(new THREE.Vector3(0, 1.2, 0)), 'geo-hour');
      }

      // current sun
      const cur = to3(Number(state.sunHour) || 10, R);
      sunRef = null;
      if (showSun) {
        const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xf59e0b }));
        sunMesh.position.copy(cur.v);
        const sunLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([C.clone().setY(0.2), cur.v]), mat(0xf97316));
        sunMesh.visible = sunLine.visible = cur.sp.alt > 0;
        analysis.add(sunMesh);
        analysis.add(sunLine);
        sunRef = { mesh: sunMesh, line: sunLine, to3, C, decl, R, showWind: !!state.showWind };
      }

      // prevailing wind: three flowing streamlines with arrowheads, in the outer band of the ring, pointing the way the air moves
      if (!showWind) return;
      const wb = Number(state.windBearing) || 0;
      const sDir = new THREE.Vector3().subVectors(polar(wb, R * 0.42, 0), polar(wb, R * 0.98, 0)).normalize();
      const sPerp = new THREE.Vector3(-sDir.z, 0, sDir.x);
      const len = R * 0.56, tubeR = Math.max(0.35, R * 0.012);
      [[-0.2, 0.0, 0x6fb6ec, 0.6], [0, 1.1, 0x2f8fd6, 0.95], [0.2, 2.2, 0x9ccdf3, 0.75]].forEach(([off, ph, col, op]) => {
        const start = polar(wb, R * 0.98, 0.7).addScaledVector(sPerp, off * R);
        const pts = [];
        for (let i = 0; i <= 28; i++) {
          const t = i / 28;
          pts.push(start.clone().addScaledVector(sDir, t * len).addScaledVector(sPerp, Math.sin(Math.PI * 3 * t + ph) * R * 0.035));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, toneMapped: false, depthWrite: false });
        const body = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, tubeR, 8, false), mat);
        body.renderOrder = 3;
        analysis.add(body);
        const tip = pts[pts.length - 1];
        const head = new THREE.Mesh(new THREE.ConeGeometry(tubeR * 2.6, tubeR * 6, 14), mat);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(1).normalize());
        head.position.copy(tip).addScaledVector(curve.getTangent(1).normalize(), tubeR * 2);
        head.renderOrder = 3;
        analysis.add(head);
      });
      addWorldLabel((state.windBearing | 0) + '° ' + (root.ArchI18n && root.ArchI18n.getLang() === 'en' ? 'wind' : 'ลม'), polar(wb, R + 17, 0.5), 'geo-wind');
    }

    function clearDynamic() {
      while (dynamic.children.length) {
        const obj = dynamic.children.pop();
        obj.traverse(n => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose());
        });
      }
    }

    function dashedLoop(pts, color) {
      const geo = new THREE.BufferGeometry().setFromPoints(
        pts.concat([pts[0]]).map(([x, z]) => new THREE.Vector3(x, 0.06, z))
      );
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4 }));
      line.computeLineDistances();
      return line;
    }

    // ---------- helpers for the new models ----------

    /** Road lane texture: asphalt, dashed centre line, solid edge lines. One tile = 10 m. */
    function makeRoadTexture() {
      const c = root.document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#4a5160';
      g.fillRect(0, 0, 256, 256);
      // subtle asphalt speckle
      for (let i = 0; i < 260; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      g.fillStyle = '#f8fafc';
      g.fillRect(0, 126, 128, 4);           // dashed centre line (3 m dash)
      g.fillRect(0, 8, 256, 5);             // edge lines
      g.fillRect(0, 243, 256, 5);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      return tex;
    }


    /**
     * Split an orthogonal footprint (points [x, z]) into axis-aligned rectangles that exactly cover it.
     * Sweeps vertical strips between the distinct x values and merges strips with the same z-span.
     */
    function footprintRects(P) {
      const n = P.length;
      const xsU = [...new Set(P.map(p => p[0]))].sort((a, b) => a - b);
      const out = [];
      const open = new Map();                       // "z0|z1" -> { x0, z0, z1 }
      const close = (key, x1) => { const r = open.get(key); out.push({ x0: r.x0, x1, z0: r.z0, z1: r.z1 }); open.delete(key); };
      for (let i = 0; i < xsU.length - 1; i++) {
        const x0 = xsU[i], x1 = xsU[i + 1], xm = (x0 + x1) / 2;
        const cuts = [];
        for (let j = 0; j < n; j++) {
          const p = P[j], q = P[(j + 1) % n];
          if (p[1] === q[1] && xm > Math.min(p[0], q[0]) && xm < Math.max(p[0], q[0])) cuts.push(p[1]);
        }
        cuts.sort((a, b) => a - b);
        const current = new Set();
        for (let k = 0; k + 1 < cuts.length; k += 2) {
          const key = cuts[k] + '|' + cuts[k + 1];
          current.add(key);
          if (!open.has(key)) open.set(key, { x0, z0: cuts[k], z1: cuts[k + 1] });
        }
        [...open.keys()].forEach(key => { if (!current.has(key)) close(key, x0); });
      }
      const last = xsU[xsU.length - 1];
      [...open.keys()].forEach(key => close(key, last));
      return out;
    }

    /**
     * Gable roof. Ridge runs along local Z; halfAlong = half-length along the ridge,
     * halfAcross = half-width across it (eaves included). Returns a non-indexed geometry
     * centred on the origin, base at y = 0.
     */
    function gableGeometry(halfAlong, halfAcross, rise) {
      const a = [-halfAcross, 0, -halfAlong];
      const b = [ halfAcross, 0, -halfAlong];
      const c = [ halfAcross, 0,  halfAlong];
      const d = [-halfAcross, 0,  halfAlong];
      const r1 = [0, rise, -halfAlong];
      const r2 = [0, rise,  halfAlong];
      const tris = [
        a, r1, r2,  a, r2, d,     // left slope
        b, c, r2,   b, r2, r1,    // right slope
        a, b, r1,                 // front gable
        d, r2, c                  // back gable
      ];
      const pos = new Float32Array(tris.flat());
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      return geo;
    }

    /** Hip roof (ปั้นหยา): four sloping faces; a short ridge when the footprint is oblong. */
    function hipGeometry(halfAlong, halfAcross, rise) {
      const rr = Math.max(0, halfAlong - halfAcross);
      const a = [-halfAcross, 0, -halfAlong], b = [halfAcross, 0, -halfAlong];
      const c = [halfAcross, 0, halfAlong], d = [-halfAcross, 0, halfAlong];
      const r1 = [0, rise, -rr], r2 = [0, rise, rr];
      const tris = [
        a, b, r1,                 // front hip
        d, r2, c,                 // back hip
        a, r1, r2,  a, r2, d,     // left slope
        b, c, r2,   b, r2, r1     // right slope
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
      geo.computeVertexNormals();
      return geo;
    }

    /** Mono-pitch roof (หมาแหงน): one slope falling from the -X edge to the +X edge, walls on the ends. */
    function shedGeometry(halfAlong, halfAcross, rise) {
      const a = [-halfAcross, rise, -halfAlong], d = [-halfAcross, rise, halfAlong];
      const b = [halfAcross, 0, -halfAlong], c = [halfAcross, 0, halfAlong];
      const p = [-halfAcross, 0, -halfAlong], q = [-halfAcross, 0, halfAlong];
      const tris = [
        a, b, c,  a, c, d,        // sloping top
        p, a, b,  q, c, d,        // end walls
        p, a, d,  p, d, q         // high side wall
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Rebuild the model from a law evaluation result.
     * @param {object} result  output of ArchLaw.evaluate()
     * @param {object} state   normalised state (lotWidth, lotDepth, roadWidth, height, …)
     */
    function update(result, state) {
      if (!result) return;
      clearDynamic();
      clearAnalysis();
      clearFlow();
      labelLayer.textContent = '';
      labelItems = [];
      const W = state.lotWidth;
      const D = state.lotDepth;
      const RW = state.roadWidth;
      const H = state.height;
      const g = result.geometry;
      const m = result.metrics;
      const ok = result.isAllValid;
      const riverW = state.hasRiver ? state.riverWidth : 0;
      const rearOff = state.secRear ? (state.secRearW || 6) : 0;
      const riverZ0 = D / 2 + rearOff;

      // lot orientation: the front (main road) faces siteBearing degrees clockwise from north.
      // World north is -z, so rotating the site about y by -bearing turns its front to that bearing.
      const bearing = (Number(state.siteBearing) || 0) * Math.PI / 180;
      dynamic.rotation.y = -bearing;
      dynamic.updateMatrixWorld(true);


      // lot (lit, receives shadows)
      const lot = new THREE.Mesh(
        new THREE.PlaneGeometry(W, D),
        new THREE.MeshStandardMaterial({ color: ok ? 0xd7f5e6 : 0xfbe3e3, roughness: 0.95, metalness: 0 })
      );
      lot.rotation.x = -Math.PI / 2;
      lot.position.y = 0.005;
      lot.receiveShadow = true;
      dynamic.add(lot);
      dynamic.add(lineLoop([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], 0x059669, 0.02));

      // ----- road: textured lanes + kerbs on both edges -----
      const roadZ = -D / 2 - RW / 2;
      const roadTex = roadTexture.clone();
      roadTex.repeat.set(160 / 10, 1);
      roadTex.needsUpdate = true;
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(160, RW),
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0 })
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.004, roadZ);
      road.receiveShadow = true;
      dynamic.add(road);

      const kerbMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
      [-D / 2, -D / 2 - RW].forEach(z => {
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(160, 0.16, 0.3), kerbMat);
        kerb.position.set(0, 0.08, z);
        kerb.receiveShadow = true;
        kerb.castShadow = true;
        dynamic.add(kerb);
      });

      // ----- secondary roads on the left, right and/or rear, joined to the main road -----
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x66707c, roughness: 0.95, metalness: 0 });
      const sideZ0 = -D / 2 - RW;
      const sideZ1 = riverZ0 + riverW + 30;
      const sideLen = sideZ1 - sideZ0;
      const sideZc = (sideZ0 + sideZ1) / 2;
      const addStrip = (w, len, x, z, alongZ, y) => {
        const strip = new THREE.Mesh(alongZ ? new THREE.PlaneGeometry(w, len) : new THREE.PlaneGeometry(len, w), sideMat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(x, y, z);
        strip.receiveShadow = true;
        dynamic.add(strip);
      };
      const addKerb = (w, len, x, z, alongZ) => {
        const k = new THREE.Mesh(alongZ ? new THREE.BoxGeometry(w, 0.16, len) : new THREE.BoxGeometry(len, 0.16, w), kerbMat);
        k.position.set(x, 0.08, z);
        k.castShadow = true;
        k.receiveShadow = true;
        dynamic.add(k);
      };
      const wl = state.secLeft ? (state.secLeftW || 6) : 0;
      const wr = state.secRight ? (state.secRightW || 6) : 0;
      const wre = state.secRear ? (state.secRearW || 6) : 0;
      if (state.secLeft) {
        addStrip(wl, sideLen, -W / 2 - wl / 2, sideZc, true, 0.006);
        addKerb(0.3, sideLen, -W / 2, sideZc, true);
        addKerb(0.3, sideLen, -W / 2 - wl, sideZc, true);
      }
      if (state.secRight) {
        addStrip(wr, sideLen, W / 2 + wr / 2, sideZc, true, 0.006);
        addKerb(0.3, sideLen, W / 2, sideZc, true);
        addKerb(0.3, sideLen, W / 2 + wr, sideZc, true);
      }
      if (state.secRear) {
        addStrip(wre, 160, 0, D / 2 + wre / 2, false, 0.008);
        addKerb(0.3, 160, 0, D / 2, false);
        addKerb(0.3, 160, 0, D / 2 + wre, false);
      }

      // ----- river behind the lot (starts at the rear edge of the rear road, if any) -----
      if (riverW > 0) {
        const riverZc = riverZ0 + riverW / 2;
        // riverbed / banks (slightly larger, under the water)
        const bed = new THREE.Mesh(
          new THREE.PlaneGeometry(200, riverW + 3),
          new THREE.MeshStandardMaterial({ color: 0x8b7f63, roughness: 1, metalness: 0 })
        );
        bed.rotation.x = -Math.PI / 2;
        bed.position.set(0, -0.012, riverZc);
        bed.receiveShadow = true;
        dynamic.add(bed);
        // water surface
        const water = new THREE.Mesh(
          new THREE.PlaneGeometry(200, riverW),
          new THREE.MeshPhysicalMaterial({
            color: 0x3b8fd1, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.88,
            clearcoat: 1, clearcoatRoughness: 0.08
          })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, 0.03, riverZc);
        water.receiveShadow = true;
        dynamic.add(water);
      }

      // ----- bridge across the river (beside the lot, running in Z) -----
      if (state.hasBridge && riverW > 0) {
        const deckW = 4.0;
        const bx = W / 2 + (state.secRight ? (state.secRightW || 6) : 0) + 3.0;
        const deckH = 0.8;
        const z0 = riverZ0 - 3.0;
        const z1 = riverZ0 + riverW + 3.0;
        const span = z1 - z0;
        const zc = (z0 + z1) / 2;
        const concrete = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85, metalness: 0 });

        const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.4, span), concrete);
        deck.position.set(bx, deckH, zc);
        deck.castShadow = true;
        deck.receiveShadow = true;
        dynamic.add(deck);

        [-1, 1].forEach(side => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, span), concrete);
          rail.position.set(bx + side * (deckW / 2 - 0.08), deckH + 0.65, zc);
          rail.castShadow = true;
          dynamic.add(rail);
        });

        // piers in the water
        [0.33, 0.67].forEach(t => {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, deckH, 1.2), concrete);
          pier.position.set(bx, deckH / 2 - 0.1, z0 + span * t);
          pier.castShadow = true;
          pier.receiveShadow = true;
          dynamic.add(pier);
        });
      }

      // ----- waterways along the left / right sides (from the lot's front line to well behind it) -----
      {
        const reachAll = root.ArchLaw.sideReach(state);
        const zA = -D / 2, zB = D / 2 + reachAll.rear + 40, zcS = (zA + zB) / 2, lenS = zB - zA;
        const sides = [];
        if (state.riverLeft) sides.push({ x: -W / 2 - wl - (state.riverLeftW || 8) / 2, w: state.riverLeftW || 8, bridge: state.bridgeLeft });
        if (state.riverRight) sides.push({ x: W / 2 + wr + (state.riverRightW || 8) / 2, w: state.riverRightW || 8, bridge: state.bridgeRight });
        const concreteS = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85, metalness: 0 });
        sides.forEach(sd => {
          const bed = new THREE.Mesh(new THREE.PlaneGeometry(sd.w + 3, lenS), new THREE.MeshStandardMaterial({ color: 0x8b7f63, roughness: 1, metalness: 0 }));
          bed.rotation.x = -Math.PI / 2; bed.position.set(sd.x, -0.012, zcS); bed.receiveShadow = true; dynamic.add(bed);
          const water = new THREE.Mesh(new THREE.PlaneGeometry(sd.w, lenS), new THREE.MeshPhysicalMaterial({
            color: 0x3b8fd1, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 1, clearcoatRoughness: 0.08 }));
          water.rotation.x = -Math.PI / 2; water.position.set(sd.x, 0.032, zcS); water.receiveShadow = true; dynamic.add(water);
          if (sd.bridge) {        // bridge across the waterway at mid-depth of the lot, running in X
            const len = sd.w + 6, deckH = 0.8;
            const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 4), concreteS);
            deck.position.set(sd.x, deckH, 0); deck.castShadow = true; deck.receiveShadow = true; dynamic.add(deck);
            [-1, 1].forEach(k => {
              const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.15), concreteS);
              rail.position.set(sd.x, deckH + 0.65, k * 1.92); rail.castShadow = true; dynamic.add(rail);
            });
            [0.33, 0.67].forEach(t => {
              const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, deckH, 1.2), concreteS);
              pier.position.set(sd.x - len / 2 + len * t, deckH / 2 - 0.1, 0); pier.castShadow = true; dynamic.add(pier);
            });
          }
        });
      }

      // ----- railway / expressway / elevated rail (+ station) -----
      (state.infra || []).forEach(it => {
        const pl = root.ArchLaw.infraPlacement(state, it);
        const grp = new THREE.Group();
        const LEN = 260;
        const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02 });
        const box = (w, h, d, c, x, y, z, cast) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
          m.position.set(x, y + h / 2, z); m.castShadow = cast !== false; m.receiveShadow = true; grp.add(m); return m;
        };
        if (it.k === 'rail') {
          box(pl.w, 0.35, LEN, 0x8d8578, 0, 0, 0, false);                         // ballast bed
          [-1.1, 1.1].forEach(dx => { box(0.14, 0.18, LEN, 0x3f3f46, dx - 0.75, 0.35, 0, false); box(0.14, 0.18, LEN, 0x3f3f46, dx + 0.75, 0.35, 0, false); });
          for (let z = -LEN / 2; z < LEN / 2; z += 1.6) box(pl.w * 0.55, 0.12, 0.3, 0x6b5b4b, 0, 0.35, z, false);   // sleepers
        } else {
          const h = pl.h, deckT = it.k === 'skytrain' ? 1.4 : 1.3;
          box(pl.w, deckT, LEN, it.k === 'skytrain' ? 0xd4d8de : 0xb8bec6, 0, h - deckT, 0);
          [-1, 1].forEach(k => box(0.4, 0.9, LEN, 0xe5e7eb, k * (pl.w / 2 - 0.2), h, 0));
          if (it.k === 'skytrain') [-1, 1].forEach(k => box(0.14, 0.2, LEN, 0x3f3f46, k * 0.75, h, 0, false));
          if (it.k === 'expressway') box(0.16, 0.05, LEN, 0xfef08a, 0, h + 0.02, 0, false);
          const step = it.k === 'skytrain' ? 18 : 22;
          for (let z = -LEN / 2 + 6; z < LEN / 2; z += step) {
            if (it.station && Math.abs(z) < 22) continue;
            const cw = it.k === 'skytrain' ? 1.5 : 2.2;
            box(cw, h - deckT, cw, 0xc2c7ce, 0, 0, z);                                  // pier
            box(pl.w * 0.55, 0.9, cw * 1.6, 0xc2c7ce, 0, h - deckT - 0.9, z);            // pier cap
          }
          if (it.station && it.k === 'skytrain') {
            const sw = pl.w + 5;
            box(sw, 0.5, 40, 0xe2e8f0, 0, h, 0);                                       // platform deck
            box(sw - 0.6, 0.35, 40, 0x7c3aed, 0, h + 4.2, 0);                          // roof
            [-1, 1].forEach(k => [-17, -6, 6, 17].forEach(z => box(0.35, 4.2, 0.35, 0x94a3b8, k * (sw / 2 - 0.5), h, z)));
            box(sw - 1, 3.6, 18, 0xc4b5fd, 0, h - deckT - 3.6, 0);                      // concourse under the deck
            [-1, 1].forEach(k => box(0.5, h - deckT - 3.6, 0.5, 0xc2c7ce, k * (sw / 2 - 1), 0, 0));
            box(3, 0.3, 8, 0xe2e8f0, sw / 2 + 1.6, h * 0.4, 0, false);                 // stair landing
          }
        }
        grp.position.set(pl.vertical ? pl.pos - W / 2 : 0, 0, pl.vertical ? 0 : pl.pos - D / 2);
        grp.rotation.y = pl.vertical ? 0 : Math.PI / 2;
        dynamic.add(grp);
      });

      const pivot = new THREE.Group();
      dynamic.add(pivot);

      // ----- building footprint: plan (px, py) → world (x, z) with origin at lot centre -----
      const bx0 = g.minX;
      const by0 = m.frontLotOffset;
      const pts = g.polygon2D.map(([px, py]) => [bx0 + px, by0 + py]);
      const shape = new THREE.Shape();
      // Shape drawn in (x, -z) so the -90° X-rotation maps it to the ground with +z = rear.
      pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -(z - D / 2)) : shape.moveTo(x, -(z - D / 2))));
      shape.closePath();
      const geom = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
      const wallColor = ok ? 0xf4f7fb : 0xfde7e7;
      const body = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.62, metalness: 0.02 }));
      body.rotation.x = -Math.PI / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      pivot.add(body);

      // ----- roof over the footprint bounding box (eaves = eavesProj); type & visibility from state -----
      const xs = pts.map(p => p[0]);
      const zs = pts.map(p => p[1] - D / 2);
      const eave = Math.max(0, state.eavesProj || 0);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      // building pivot: rotates only the building (about its own centre) by building-vs-lot bearing
      pivot.position.set(cx, 0, cz);
      const relDeg = (((Number(state.bldgBearing) || 0) - (Number(state.siteBearing) || 0)) % 360 + 360) % 360;
      pivot.rotation.y = -relDeg * Math.PI / 180;
      pivot.visible = state.showBuilding !== false;
      // soft contact shadow hugging the footprint (ambient-occlusion feel where wall meets ground)
      {
        const w = Math.max(...xs) - Math.min(...xs) + 3, d = Math.max(...zs) - Math.min(...zs) + 3;
        const cv = root.document.createElement('canvas'); cv.width = cv.height = 128;
        const cg = cv.getContext('2d'); const rg = cg.createRadialGradient(64, 64, 20, 64, 64, 64);
        rg.addColorStop(0, 'rgba(15,23,42,0.42)'); rg.addColorStop(0.6, 'rgba(15,23,42,0.16)'); rg.addColorStop(1, 'rgba(15,23,42,0)');
        cg.fillStyle = rg; cg.fillRect(0, 0, 128, 128);
        const ao = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, d * 1.25),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
        ao.rotation.x = -Math.PI / 2; ao.position.set(0, 0.012, 0); ao.renderOrder = 1;
        pivot.add(ao);
      }
      body.position.set(-cx, 0, -cz);
      // wall heat: colour the walls by the solar gain they receive over the chosen season (06:00–18:00)
      if (state.showHeat) {
        const Lw = root.ArchLaw;
        const decl = Number(state.sunDecl) || 0;
        dynamic.updateMatrixWorld(true);
        const nm = new THREE.Matrix3().getNormalMatrix(body.matrixWorld);
        const geomB = body.geometry;
        const nrm = geomB.attributes.normal, count = nrm.count;
        const col = new Float32Array(count * 3);
        const cache = new Map();
        const v = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
          v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
          let c;
          if (Math.abs(v.y) >= 0.5) c = [0.92, 0.93, 0.95];                // roof / floor caps stay neutral
          else {
            const key = v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2);
            c = cache.get(key);
            if (!c) { c = Lw.heatColor(Lw.wallHeat([v.x, v.y, v.z], decl) / 4.5); cache.set(key, c); }
          }
          col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        }
        geomB.setAttribute('color', new THREE.BufferAttribute(col, 3));
        body.material.dispose();
        body.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
      }
      const halfX = (Math.max(...xs) - Math.min(...xs)) / 2 + eave;
      const halfZ = (Math.max(...zs) - Math.min(...zs)) / 2 + eave;
      let roofTop = H;
      if (state.roofVisible !== false) {
        const type = state.roofType || 'gable';
        const roofMat = new THREE.MeshStandardMaterial({
          color: type === 'flat' ? (ok ? 0xcbd5e1 : 0xf1c4c4) : (ok ? 0x8a97ab : 0xd98a8a),
          roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide
        });
        // L / U / notched footprints get one roof per rectangle of the footprint, not one box over the bounding box
        const parts = footprintRects(pts.map(([x, z]) => [x, z - D / 2]));
        parts.forEach(rc => {
          const rcx = (rc.x0 + rc.x1) / 2 - cx, rcz = (rc.z0 + rc.z1) / 2 - cz;
          const hX = (rc.x1 - rc.x0) / 2 + eave, hZ = (rc.z1 - rc.z0) / 2 + eave;
          let roof, top;
          if (type === 'flat') {
            roof = new THREE.Mesh(new THREE.BoxGeometry(hX * 2, 0.4, hZ * 2), roofMat);
            roof.position.set(rcx, H + 0.2, rcz);
            top = H + 0.4;
          } else {
            const ridgeAlongX = hX > hZ;
            const hA = ridgeAlongX ? hX : hZ;   // half-length along the ridge (local z)
            const hB = ridgeAlongX ? hZ : hX;   // half-width across it
            let geo, rise;
            if (type === 'hip') {
              rise = hB * Math.tan(25 * Math.PI / 180);
              geo = hipGeometry(hA, hB, rise);
            } else if (type === 'shed') {
              rise = 2 * hB * Math.tan(12 * Math.PI / 180);
              geo = shedGeometry(hA, hB, rise);
            } else {
              rise = hB * Math.tan(25 * Math.PI / 180);
              geo = gableGeometry(hA, hB, rise);
            }
            roof = new THREE.Mesh(geo, roofMat);
            roof.position.set(rcx, H, rcz);
            if (ridgeAlongX) roof.rotation.y = Math.PI / 2;
            top = H + rise;
          }
          roof.castShadow = true;
          roof.receiveShadow = true;
          pivot.add(roof);
          roofTop = Math.max(roofTop, top);
        });
      }

      // ----- surroundings and setback dimensions -----
      const bBounds = {
        W, D, RW, riverW,
        bxMin: Math.min(...xs), bxMax: Math.max(...xs),
        bzMin: Math.min(...zs), bzMax: Math.max(...zs)
      };
      addSurroundings(state, bBounds);
      addDimensions(result, state, bBounds);
      if (state.showNoise) addNoise(state, result, W, D);

      // edge highlight: thresholded so only true outline edges show, not every triangle
      const edgeColor = ok ? 0x2563eb : 0xef4444;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 20),
        new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.85 })
      );
      edges.rotation.x = -Math.PI / 2;
      edges.position.set(-cx, 0, -cz);
      pivot.add(edges);

      // required setback outline (dashed)
      const r = result.required;
      const z0 = -RW / 2 + r.reqFrontFromCenter - D / 2;
      const z1 = D / 2 - r.reqRear;
      const x0 = -W / 2 + r.reqLeft;
      const x1 = W / 2 - r.reqRight;
      dynamic.add(dashedLoop([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0xef4444));

      // fit shadow & camera to the model, including river and bridge depth
      const reachAll = root.ArchLaw.sideReach(state);
      const depthExtent = D + reachAll.front + reachAll.rear + (riverW > 0 ? 4 : 0);
      const widthExtent = W + reachAll.left + reachAll.right;
      const span = Math.max(widthExtent, depthExtent, H * 1.6);
      // centre of the site in local coords, rotated into world space by dynamic.rotation.y
      const cLocalZ = (reachAll.rear - reachAll.front) / 4;
      const cLocalX = (reachAll.right - reachAll.left) / 4;
      const phi = dynamic.rotation.y;
      const cWorldX = cLocalX * Math.cos(phi) + cLocalZ * Math.sin(phi);
      const cWorldZ = -cLocalX * Math.sin(phi) + cLocalZ * Math.cos(phi);
      const sp = root.ArchLaw.sunPosition(Number(state.sunHour) || 10, Number(state.sunDecl) || 0);
      fitShadow({ cx: cWorldX, cz: cWorldZ, span, height: roofTop, sunBearing: sp.az, sunAlt: Math.max(sp.alt, 15) });
      const analysisR = Math.max(32, span * 0.8);
      site = { cx: cWorldX, cz: cWorldZ, span, roofTop, R: analysisR, W, D };
      if (state.showSun || state.showWind) buildAnalysis(state, cWorldX, cWorldZ, analysisR);
      if (state.showWind && state.windFlow) buildFlow(state, cWorldX, cWorldZ, analysisR);
      target.set(cWorldX, Math.max(2, roofTop / 2), cWorldZ);
      goal.radius = Math.max(30, Math.max(widthExtent, depthExtent) * 1.4, roofTop * 3) * ((state.showSun || state.showWind) ? 1.9 : 1);
      goal.theta = view.theta;
      goal.phi = view.phi;
      clampGoal();
      invalidate();
    }

    function lineLoop(pts, color, y) {
      const geo = new THREE.BufferGeometry().setFromPoints(
        pts.concat([pts[0]]).map(([x, z]) => new THREE.Vector3(x, y, z))
      );
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    }

    function reset() {
      Object.assign(goal, DEFAULT);
      invalidate();
    }

    function setSize() { resize(); }

    /** Cheap refresh for the sun slider: moves the sun marker and the shadow without rebuilding the model. */
    function setSun(state) {
      if (!site) return;
      const sp = root.ArchLaw.sunPosition(Number(state.sunHour) || 10, Number(state.sunDecl) || 0);
      fitShadow({ cx: site.cx, cz: site.cz, span: site.span, height: site.roofTop, sunBearing: sp.az, sunAlt: Math.max(sp.alt, 15) });
      if (sunRef && state.showSun && sunRef.decl === (Number(state.sunDecl) || 0) && sunRef.showWind === !!state.showWind) {
        const cur = sunRef.to3(Number(state.sunHour) || 10, sunRef.R);
        sunRef.mesh.position.copy(cur.v);
        sunRef.line.geometry.setFromPoints([sunRef.C.clone().setY(0.2), cur.v]);
        sunRef.mesh.visible = sunRef.line.visible = cur.sp.alt > 0;
        invalidate();
        return;
      }
      clearAnalysis();
      labelItems = labelItems.filter(it => { const geo = it.el.classList.contains('geo-label'); if (geo && it.el.parentNode) it.el.parentNode.removeChild(it.el); return !geo; });
      if (state.showSun || state.showWind) buildAnalysis(state, site.cx, site.cz, site.R);
      invalidate();
    }

    /** mode: null | 'building' | 'tree' | 'del'. cb receives {type:'add',k,x,y} or {type:'del',id}. */
    function setPickMode(mode, cb) {
      pickMode = mode || null; onPick = cb || null;
      canvas.style.cursor = pickMode ? 'crosshair' : 'grab';
    }

    function setAutoRotate(on) { autoRotate = !!on; lastTime = 0; invalidate(); return autoRotate; }

    resize();
    placeCamera();
    invalidate();

    /** Renders the current frame synchronously and returns the WebGL canvas, so the caller can copy it in the same task. */
    function snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement;
    }

    return {
      update,
      reset,
      setSun,
      snapshot,
      setPickMode,
      setAutoRotate,
      isAutoRotate() { return autoRotate; },
      setSize,
      dispose() {
        clearDynamic();
        groundGeo.dispose();
        roadTexture.dispose();
        ground.material.dispose();
        catcher.material.dispose();
        renderer.dispose();
      },
      available: true
    };
  }

  root.ArchScene3D = { createScene3D };
})(typeof window !== 'undefined' ? window : globalThis);
