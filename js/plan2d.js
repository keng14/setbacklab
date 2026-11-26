/**
 * 2D plan renderer. Pure canvas drawing; takes the output of ArchLaw.evaluate().
 *
 * Plan coordinate system (metres):
 *   x : 0 at lot-left, lotWidth at lot-right
 *   y : 0 at the front lot line, lotDepth at the rear lot line
 *   the road sits at y < 0 (its centre is at y = -roadWidth / 2)
 */
(function (root) {
  'use strict';

  const COLORS = {
    bg: '#f8fafc',
    lot: '#ecfdf5',
    lotLine: '#059669',
    road: '#cbd5e1',
    roadLine: '#94a3b8',
    building: '#dbeafe',
    buildingLine: '#2563eb',
    fail: '#ef4444',
    pass: '#10b981',
    dim: '#334155',
    req: '#ef4444',
    grid: '#e2e8f0'
  };

  function drawPlan(canvas, result, state, lang) {
    if (!canvas || !result) return;
    const ctx = canvas.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 420;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isEn = lang === 'en';
    const L = (th, en) => (isEn ? en : th);
    const { lotWidth: W, lotDepth: D, roadWidth: RW } = state;
    const g = result.geometry;
    const m = result.metrics;
    const req = result.required;
    const bw = state.bWidth;
    const bd = state.bDepth;
    const bx0 = g.minX + W / 2;                 // geometry.minX is lot-centred; plan x starts at lot-left
    const by0 = m.frontLotOffset;               // building front from lot line
    const rightGap = W - state.leftSetback - bw;
    const isRow = state.buildingCategory === 'townhome' || state.buildingCategory === 'shophouse';
    const wL = state.secLeft ? (state.secLeftW || 6) : 0;
    const wR = state.secRight ? (state.secRightW || 6) : 0;
    const wRe = state.secRear ? (state.secRearW || 6) : 0;
    const reach = root.ArchLaw.sideReach(state);
    const offL = reach.left, offR = reach.right, offRear = reach.rear;

    // World → screen transform, fitting the whole plan (road + lot + margin)
    const pad = 44;
    const minX = -offL - 1.5, maxX = W + offR + 1.5;
    const minY = -reach.front - 1.5, maxY = D + offRear + 1.5;
    const scale = Math.min((cssW - pad * 2) / (maxX - minX), (cssH - pad * 2) / (maxY - minY));
    const ox = (cssW - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (cssH - (maxY - minY) * scale) / 2 - minY * scale;
    const X = x => ox + x * scale;
    const Y = y => oy + y * scale;

    // background grid
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(minX); gx <= maxX; gx += 1) {
      ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), cssH); ctx.stroke();
    }
    for (let gy = Math.ceil(minY); gy <= maxY; gy += 1) {
      ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(cssW, Y(gy)); ctx.stroke();
    }

    // roads run past the plan edges to the canvas edges (EXT metres each way), so they read as continuing streets
    const EXT = 400;
    // public road (main, in front)
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(X(-EXT), Y(-RW), (2 * EXT + W) * scale, RW * scale);
    ctx.setLineDash([10, 6]);
    ctx.strokeStyle = COLORS.roadLine;
    ctx.beginPath(); ctx.moveTo(X(-EXT), Y(-RW / 2)); ctx.lineTo(X(W + EXT), Y(-RW / 2)); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, L(`ถนนสาธารณะ กว้าง ${RW.toFixed(1)} ม.`, `Public road ${RW.toFixed(1)} m wide`), X(W + 4), Y(-RW / 2) - 6, COLORS.dim, 12, 'left');

    // secondary roads: left and right run from the main road down past the lot; rear runs behind the lot
    ctx.fillStyle = COLORS.road;
    if (state.secLeft) {
      ctx.fillStyle = COLORS.road;   // label() leaves the text colour behind
      ctx.fillRect(X(-wL), Y(-RW), wL * scale, (EXT + RW) * scale);
      label(ctx, L(`ถนนรอง ${wL.toFixed(1)} ม.`, `Side road ${wL.toFixed(1)} m`), X(-wL / 2), Y(-RW) - 6, COLORS.dim, 11, 'center');
    }
    if (state.secRight) {
      ctx.fillStyle = COLORS.road;   // label() leaves the text colour behind
      ctx.fillRect(X(W), Y(-RW), wR * scale, (EXT + RW) * scale);
      label(ctx, L(`ถนนรอง ${wR.toFixed(1)} ม.`, `Side road ${wR.toFixed(1)} m`), X(W + wR / 2), Y(-RW) - 6, COLORS.dim, 11, 'center');
    }
    if (state.secRear) {
      ctx.fillStyle = COLORS.road;   // label() leaves the text colour behind
      ctx.fillRect(X(-EXT), Y(D), (2 * EXT + W) * scale, wRe * scale);
      label(ctx, L(`ถนนรอง (ด้านหลัง) ${wRe.toFixed(1)} ม.`, `Rear road ${wRe.toFixed(1)} m`), X(W / 2), Y(D + wRe) + 14, COLORS.dim, 11, 'center');
    }

    // waterways (left / right / rear), bridges and linear infrastructure (railway, expressway, elevated rail, station)
    {
      const rect = (x0, y0, x1, y1) => ctx.fillRect(X(x0), Y(y0), (x1 - x0) * scale, (y1 - y0) * scale);
      const water = '#93c5fd', waterLine = '#3b82f6', deck = '#64748b';
      const rivers = [];
      if (state.riverLeft) rivers.push({ v: true, a: -wL - (state.riverLeftW || 8), b: -wL, bridge: state.bridgeLeft });
      if (state.riverRight) rivers.push({ v: true, a: W + wR, b: W + wR + (state.riverRightW || 8), bridge: state.bridgeRight });
      if (state.hasRiver) rivers.push({ v: false, a: D + wRe, b: D + wRe + (state.riverWidth || 12), bridge: state.hasBridge });
      rivers.forEach(r => {
        ctx.fillStyle = water;
        if (r.v) rect(r.a, minY, r.b, maxY); else rect(minX, r.a, maxX, r.b);
        ctx.strokeStyle = waterLine; ctx.lineWidth = 1.5;
        ctx.beginPath();
        [r.a, r.b].forEach(c => { if (r.v) { ctx.moveTo(X(c), Y(minY)); ctx.lineTo(X(c), Y(maxY)); } else { ctx.moveTo(X(minX), Y(c)); ctx.lineTo(X(maxX), Y(c)); } });
        ctx.stroke();
        const mid = (r.a + r.b) / 2;
        label(ctx, L('แหล่งน้ำ', 'Waterway'), r.v ? X(mid) : X(W / 2), r.v ? Y(D + 2) : Y(mid) + 4, '#1d4ed8', 11, 'center');
        if (r.bridge) {
          ctx.fillStyle = deck;
          if (r.v) rect(r.a - 2.5, D / 2 - 2, r.b + 2.5, D / 2 + 2); else rect(W + wR + 1, r.a - 2.5, W + wR + 5, r.b + 2.5);
          label(ctx, L('สะพาน', 'Bridge'), r.v ? X(mid) : X(W + wR + 3), r.v ? Y(D / 2) - 6 : Y(r.a) - 6, COLORS.dim, 10, 'center');
        }
      });
      const kinds = { rail: ['#a8a29e', L('ทางรถไฟ', 'Railway')], expressway: ['#475569', L('ทางด่วน', 'Expressway')], skytrain: ['#7c3aed', L('รถไฟฟ้า', 'Elevated rail')] };
      (state.infra || []).forEach(it => {
        const pl = root.ArchLaw.infraPlacement(state, it), [col, name] = kinds[it.k] || kinds.rail;
        const a = pl.pos - pl.w / 2, b = pl.pos + pl.w / 2;
        ctx.globalAlpha = it.k === 'rail' ? 1 : 0.85;
        ctx.fillStyle = col;
        if (pl.vertical) rect(a, minY, b, maxY); else rect(minX, a, maxX, b);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = it.k === 'rail' ? '#57534e' : '#e2e8f0'; ctx.lineWidth = 1.2; ctx.setLineDash(it.k === 'rail' ? [3, 4] : [10, 8]);
        ctx.beginPath();
        if (pl.vertical) { ctx.moveTo(X(pl.pos), Y(minY)); ctx.lineTo(X(pl.pos), Y(maxY)); } else { ctx.moveTo(X(minX), Y(pl.pos)); ctx.lineTo(X(maxX), Y(pl.pos)); }
        ctx.stroke(); ctx.setLineDash([]);
        if (it.station && it.k === 'skytrain') {
          ctx.fillStyle = '#c4b5fd'; ctx.strokeStyle = '#5b21b6'; ctx.lineWidth = 1.5;
          const sl = 40, sw = pl.w + 5;
          const x0 = pl.vertical ? pl.pos - sw / 2 : W / 2 - sl / 2, y0 = pl.vertical ? D / 2 - sl / 2 : pl.pos - sw / 2;
          const wx = pl.vertical ? sw : sl, wy = pl.vertical ? sl : sw;
          rect(x0, y0, x0 + wx, y0 + wy); ctx.strokeRect(X(x0), Y(y0), wx * scale, wy * scale);
          label(ctx, L('สถานีรถไฟฟ้า', 'Station'), X(x0 + wx / 2), Y(y0 + wy / 2) + 4, '#4c1d95', 11, 'center');
        } else if (pl.vertical) {
          label(ctx, name, X(pl.pos), Y(minY) + 14, '#fff', 11, 'center');
        } else {
          label(ctx, name, X(W / 2 + 12), Y(pl.pos) + 4, '#fff', 11, 'center');
        }
      });
    }

    // lot
    ctx.fillStyle = COLORS.lot;
    ctx.fillRect(X(0), Y(0), W * scale, D * scale);
    ctx.strokeStyle = COLORS.lotLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(X(0), Y(0), W * scale, D * scale);

    // context items (neighbours, buildings, trees) as simple footprints
    {
      const items = Array.isArray(state.ctx) ? state.ctx : root.ArchLaw.defaultContext(state);
      items.forEach(it => {
        if (it.g === 'neighbor' ? state.hasNeighbors === false : (it.g === 'user' ? false : state.showContext === false)) return;
        if (it.k === 't') {
          ctx.fillStyle = 'rgba(74,140,84,.75)';
          ctx.beginPath(); ctx.arc(X(it.x), Y(it.y), Math.max(2.5, 1.5 * (it.s || 1) * scale), 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(148,163,184,.55)'; ctx.strokeStyle = 'rgba(100,116,139,.8)'; ctx.lineWidth = 1;
          ctx.fillRect(X(it.x - it.w / 2), Y(it.y - it.d / 2), it.w * scale, it.d * scale);
          ctx.strokeRect(X(it.x - it.w / 2), Y(it.y - it.d / 2), it.w * scale, it.d * scale);
        }
      });
    }

    // traffic-noise heat map over the lot, with dB readings
    if (state.showNoise) {
      const nx = Math.min(60, Math.max(8, Math.round(W * 2))), ny = Math.min(60, Math.max(8, Math.round(D * 2)));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = root.ArchLaw.noiseColor(root.ArchLaw.noiseAt(state, (i + 0.5) / nx * W, (j + 0.5) / ny * D));
        ctx.fillStyle = 'rgba(' + c.join(',') + ',.62)';
        ctx.fillRect(X(i / nx * W), Y(j / ny * D), W / nx * scale + 0.6, D / ny * scale + 0.6);
      }
      ctx.strokeStyle = COLORS.lotLine; ctx.lineWidth = 2; ctx.strokeRect(X(0), Y(0), W * scale, D * scale);
      const sm = root.ArchLaw.noiseSummary(state, result);
      Object.keys(sm.points).forEach(k => {
        const [px, py] = sm.points[k];
        const t = sm[k] + ' dB', tw = ctx.measureText(t).width;
        ctx.font = '700 11px Prompt, sans-serif';
        const w2 = ctx.measureText(t).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(X(px) - w2 / 2, Y(py) - 9, w2, 18);
        ctx.fillStyle = '#7f1d1d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, X(px), Y(py));
      });
    }

    // required setback lines (dashed red)
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = COLORS.req;
    ctx.lineWidth = 1.5;
    const reqFrontY = -RW / 2 + req.reqFrontFromCenter;
    line(ctx, X(0), Y(reqFrontY), X(W), Y(reqFrontY));
    line(ctx, X(req.reqLeft), Y(0), X(req.reqLeft), Y(D));
    line(ctx, X(W - req.reqRight), Y(0), X(W - req.reqRight), Y(D));
    line(ctx, X(0), Y(D - req.reqRear), X(W), Y(D - req.reqRear));
    ctx.setLineDash([]);

    // building footprint (polygon from geometry, offset to building origin)
    // building layout: rotate the footprint about its own centre by (building - lot) bearing, clockwise
    const rel = (((Number(state.bldgBearing) || 0) - (Number(state.siteBearing) || 0)) % 360 + 360) % 360;
    const a = rel * Math.PI / 180;
    const plan = g.polygon2D.map(([px, py]) => [bx0 + px, by0 + py]);
    const bxs = plan.map(p => p[0]), bys = plan.map(p => p[1]);
    const pcx = (Math.min(...bxs) + Math.max(...bxs)) / 2, pcy = (Math.min(...bys) + Math.max(...bys)) / 2;
    const poly = plan.map(([x, y]) => {
      const dx = x - pcx, dy = y - pcy;
      return [X(pcx + dx * Math.cos(a) - dy * Math.sin(a)), Y(pcy + dx * Math.sin(a) + dy * Math.cos(a))];
    });
    const ok = result.isAllValid;
    const showBuilding = state.showBuilding !== false;
    if (showBuilding) {
    ctx.beginPath();
    poly.forEach(([sx, sy], i) => (i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy)));
    ctx.closePath();
    ctx.fillStyle = COLORS.building;
    ctx.fill();
    ctx.strokeStyle = ok ? COLORS.pass : COLORS.fail;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    }

    // dimensions for the actual gaps (numbers can be hidden)
    showDimText = state.showDims !== false;
    dimV(ctx, X(bx0 + bw / 2), Y(-RW / 2), Y(by0), `${L('ร่นหน้า', 'Front')} ${state.frontSetback.toFixed(1)}m`, COLORS.dim, -18);
    dimH(ctx, X(0), X(bx0), Y(by0 + bd / 2), `${state.leftSetback.toFixed(1)}m`, COLORS.dim);
    dimH(ctx, X(bx0 + bw), X(W), Y(by0 + bd / 2), `${rightGap.toFixed(1)}m`, COLORS.dim);
    dimV(ctx, X(bx0 + bw / 2), Y(by0 + bd), Y(D), `${m.rearSetback.toFixed(1)}m`, COLORS.dim, 18);

    // labels
    label(ctx, L('เขตที่ดิน', 'Lot line'), X(0) + 6, Y(0) + 16, COLORS.lotLine, 11, 'left');
    label(ctx, `${W}×${D}m`, X(0), Y(D) + 14, COLORS.dim, 11, 'left');
    if (showBuilding) label(ctx, isRow ? `${state.rowUnits} × ${state.unitWidth}m` : `${bw}×${bd}m`,
      X(bx0 + bw / 2), Y(by0 + bd / 2), COLORS.buildingLine, 12, 'center');

    // north arrow: the front (main road) faces siteBearing, so north is -bearing from screen-up
    const bearing = Number(state.siteBearing) || 0;
    drawNorthArrow(ctx, cssW - 30, 44, -bearing * Math.PI / 180);

    // site analysis: compass ring, sun path (plan projection), wind rose
    if (state.showSun || state.showWind) drawAnalysis(ctx, state, bearing, X(W / 2), Y(D / 2), Math.min(cssW, cssH) / 2 - 30, L);
  }

  function drawAnalysis(ctx, state, bearing, cx, cy, R, L) {
    const law = root.ArchLaw, d2r = Math.PI / 180;
    const P = (az, r) => { const a = (az - bearing) * d2r; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(100,116,139,.85)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (let a = 0; a < 360; a += 10) {
      const len = a % 30 === 0 ? 9 : 5; const p1 = P(a, R), p2 = P(a, R - len);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    ctx.font = '700 13px Prompt, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#334155';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => { const p = P(a, R + 0); ctx.fillStyle = '#fff'; ctx.fillRect(p[0] - 9, p[1] - 9, 18, 18); ctx.fillStyle = '#334155'; ctx.fillText(t, p[0], p[1]); });


    // sun path (azimuth on the ground, radius = cos(altitude)), hour marks and current sun
    const decl = Number(state.sunDecl) || 0;
    if (state.showSun) {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3; ctx.beginPath();
    let started = false;
    for (let h = 4; h <= 20; h += 0.25) {
      const sp = law.sunPosition(h, decl); if (sp.alt <= 0) continue;
      const p = P(sp.az, R * Math.cos(sp.alt * d2r));
      if (started) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); started = true; }
    }
    ctx.stroke();
    ctx.font = '600 10px Prompt, sans-serif'; ctx.fillStyle = '#0f172a';
    for (let h = 6; h <= 18; h++) {
      const sp = law.sunPosition(h, decl); if (sp.alt <= 1) continue;
      const p = P(sp.az, R * Math.cos(sp.alt * d2r) - 10); ctx.fillText(String(h), p[0], p[1]);
    }
    const cur = law.sunPosition(Number(state.sunHour) || 10, decl);
    if (cur.alt > 0) {
      const p = P(cur.az, R * Math.cos(cur.alt * d2r));
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
    }

    }

    // prevailing wind: three flowing streamlines with arrowheads in the outer band of the ring (same look as the 3D view)
    if (state.showWind) {
      const wb = Number(state.windBearing) || 0;
      const sA = P(wb, R * 0.98), sB = P(wb, R * 0.42);
      const dx = sB[0] - sA[0], dy = sB[1] - sA[1], Ln = Math.hypot(dx, dy) || 1;
      const ux = dx / Ln, uy = dy / Ln, px = -uy, py = ux;
      const lw = Math.max(3, R * 0.04);
      [[-0.2, 0, 'rgba(111,182,236,.6)'], [0, 1.1, 'rgba(47,143,214,.95)'], [0.2, 2.2, 'rgba(156,205,243,.8)']].forEach(([off, ph, col]) => {
        const ox = px * off * R, oy = py * off * R;
        const pts = [];
        for (let i = 0; i <= 28; i++) {
          const t = i / 28, amp = R * 0.035 * Math.sin(Math.PI * 3 * t + ph);
          pts.push([sA[0] + ox + dx * t + px * amp, sA[1] + oy + dy * t + py * amp]);
        }
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
        const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]), hl = lw * 2.6;
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(tip[0] + Math.cos(ang) * hl, tip[1] + Math.sin(ang) * hl);
        ctx.lineTo(tip[0] + Math.cos(ang + 2.5) * hl, tip[1] + Math.sin(ang + 2.5) * hl);
        ctx.lineTo(tip[0] + Math.cos(ang - 2.5) * hl, tip[1] + Math.sin(ang - 2.5) * hl);
        ctx.closePath(); ctx.fill();
      });
    }
    ctx.restore();
  }

  /** Compass arrow (red = north tip) rotated to the site's orientation; N sits at the tip. */
  function drawNorthArrow(ctx, cx, cy, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(7, 5); ctx.lineTo(0, 0); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 5); ctx.lineTo(0, 20); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.dim;
    ctx.font = '700 12px Prompt, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 0, -22);
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function label(ctx, text, x, y, color, size, align) {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px Prompt, Sarabun, sans-serif`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  let showDimText = true;
  function dimH(ctx, x1, x2, y, text, color) {
    if (Math.abs(x2 - x1) < 6) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    line(ctx, x1, y, x2, y);
    line(ctx, x1, y - 5, x1, y + 5);
    line(ctx, x2, y - 5, x2, y + 5);
    if (showDimText) label(ctx, text, (x1 + x2) / 2, y - 9, color, 11, 'center');
  }

  function dimV(ctx, x, y1, y2, text, color, offset) {
    if (Math.abs(y2 - y1) < 6) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    line(ctx, x, y1, x, y2);
    line(ctx, x - 5, y1, x + 5, y1);
    line(ctx, x - 5, y2, x + 5, y2);
    if (showDimText) label(ctx, text, x + offset, (y1 + y2) / 2, color, 11, offset < 0 ? 'right' : 'left');
  }

  const api = { drawPlan, COLORS };
  root.ArchPlan2D = api;
})(typeof window !== 'undefined' ? window : globalThis);
