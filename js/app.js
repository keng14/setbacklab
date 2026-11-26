/**
 * App controller: owns the project state, binds the form, and re-renders
 * the status, rule cards, 2D plan and 3D model on every change.
 */
(function () {
  'use strict';

  const Law = window.ArchLaw;
  const I18n = window.ArchI18n;
  const Plan = window.ArchPlan2D;
  const Scene = window.ArchScene3D;

  // opening view: lot, roads and setbacks only (building, neighbours and context start hidden)
  let state = Object.assign({}, Law.DEFAULT_STATE, { showBuilding: false, hasNeighbors: false, showContext: false });
  Object.assign(state, Law.centerBuilding(state), { infra: [] });
  let result = null;
  let scene3d = null;

  const ICON_OK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  const ICON_WARN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></svg>';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------- form binding ----------

  function readField(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT') {
      const v = el.value;
      return isNaN(Number(v)) ? v : Number(v);
    }
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? 0 : Number(el.value);
    return el.value;
  }

  function writeField(el, value) {
    if (el.type === 'checkbox') el.checked = !!value;
    else if (document.activeElement !== el) el.value = value;
  }

  function syncFormFromState() {
    $$('[data-field]').forEach(el => {
      const key = el.getAttribute('data-field');
      if (key in state) writeField(el, state[key]);
    });
    $$('[data-category]').forEach(btn => {
      const on = btn.getAttribute('data-category') === state.buildingCategory;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    $$('[data-template]').forEach(btn => {
      const t = btn.getAttribute('data-template');
      const on = t === 'blank' ? !state.showBuilding : (!!state.showBuilding && state.buildingCategory === t);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    $$('[data-season]').forEach(btn => {
      const on = Number(btn.getAttribute('data-season')) === Number(state.windBearing);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    applyConditionalVisibility();
    updateSunLabel();
    syncNumberSliders();
  }

  /**
   * Evaluates data-show-when expressions:
   *   "key"          → truthy
   *   "key=a|b"      → state[key] is one of a, b
   *   "key>=n"/"key<n" → numeric comparison
   */
  function matchesCondition(expr) {
    const m = expr.match(/^(\w+)(>=|<=|=|>|<)?(.*)$/);
    if (!m) return true;
    const [, key, op, rhs] = m;
    const val = state[key];
    if (!op) return !!val;
    if (op === '=') return rhs.split('|').includes(String(val));
    const a = Number(val), b = Number(rhs);
    if (op === '>=') return a >= b;
    if (op === '<=') return a <= b;
    if (op === '>') return a > b;
    if (op === '<') return a < b;
    return true;
  }

  function applyConditionalVisibility() {
    $$('[data-show-when]').forEach(el => {
      const exprs = el.getAttribute('data-show-when').split(',');
      el.hidden = !exprs.every(matchesCondition);
    });
  }

  function bindForm() {
    $$('[data-field]').forEach(el => {
      el.addEventListener('input', () => onFieldChange(el));
      el.addEventListener('change', () => onFieldChange(el));
    });
    $$('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        // Case studies start from clean defaults so one preset never leaks into the next.
        // Only the building type changes; lot, roads, zoning, orientation, context and view settings stay.
        const keep = {};
        Law.SITE_KEYS.forEach(k => { if (state[k] !== undefined) keep[k] = state[k]; });
        state = Law.applyCategoryPreset(Object.assign({}, Law.DEFAULT_STATE, keep), btn.getAttribute('data-category'));
        afterStateChange();
      });
    });
    $$('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'center') Object.assign(state, Law.centerBuilding(state));
        if (action === 'fit') Object.assign(state, Law.fitBuildingToLegal(state, I18n.getLang()));
        afterStateChange();
      });
    });
    $$('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.getAttribute('data-view')));
    });
    $$('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => I18n.setLang(btn.getAttribute('data-lang')));
    });
    $('#btnResetCam').addEventListener('click', () => scene3d && scene3d.reset());
    bindContext();
    $('#btnToggleRules').addEventListener('click', toggleAllRules);
  }

  // ---------- context editor (add / remove / move buildings and trees) ----------
  function ctxEnsureCustom() {
    if (!Array.isArray(state.ctx)) state.ctx = Law.defaultContext(state).map(o => Object.assign({}, o));
  }
  function ctxNewId() { return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }

  function bindContext() {
    $$('[data-ctx]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-ctx');
      const W = state.lotWidth, D = state.lotDepth;
      if (act === 'reset') state.ctx = null;
      else {
        ctxEnsureCustom();
        if (act === 'clear') state.ctx = [];
        if (act === 'add-building') state.ctx.push({ id: ctxNewId(), g: 'user', k: 'b', x: W + (state.secRight ? state.secRightW : 0) + 10, y: D / 2, w: 8, d: 8, h: 6, c: state.ctx.length % 5 });
        if (act === 'add-tree') state.ctx.push({ id: ctxNewId(), g: 'user', k: 't', x: W + 3, y: 3, s: 1, c: state.ctx.length % 4 });
      }
      afterStateChange();
      $('#ctxDetails').open = true;
      renderCtxList();
      if (act.indexOf('add') === 0) { const l = $('#ctxList'); l.scrollTop = l.scrollHeight; }
    }));
    $('#ctxDetails').addEventListener('toggle', renderCtxList);
    $('#ctxList').addEventListener('input', e => {
      const f = e.target.getAttribute('data-cf'); if (!f) return;
      const it = state.ctx.find(o => o.id === e.target.closest('.ctx-row').dataset.id);
      if (it) { it[f] = Number(e.target.value) || 0; afterStateChange(); }
    });
    $('#ctxList').addEventListener('click', e => {
      const b = e.target.closest('[data-cdel]'); if (!b) return;
      ctxEnsureCustom();
      state.ctx = state.ctx.filter(o => o.id !== b.getAttribute('data-cdel'));
      afterStateChange(); renderCtxList();
    });
  }

  function renderCtxList() {
    const items = Array.isArray(state.ctx) ? state.ctx : Law.defaultContext(state);
    $('#ctxCount').textContent = items.length;
    if (!$('#ctxDetails').open) return;
    const num = (it, f, label) => `<label>${label}<input type="number" step="0.5" data-cf="${f}" value="${Number((it[f] || 0).toFixed(1))}"></label>`;
    $('#ctxList').innerHTML = items.map(it => {
      const name = I18n.t(it.k === 't' ? 'ctxTree' : 'ctxBuilding');
      const fields = it.k === 't'
        ? num(it, 'x', 'X') + num(it, 'y', 'Y') + num(it, 's', 'S')
        : num(it, 'x', 'X') + num(it, 'y', 'Y') + num(it, 'w', 'W') + num(it, 'd', 'D') + num(it, 'h', 'H');
      return `<div class="ctx-row" data-id="${it.id}"><div class="ctx-head"><span>${name} · ${it.id}</span>` +
        `<button type="button" data-cdel="${it.id}" aria-label="${I18n.t('ctxDelete')} ${name}">${I18n.t('ctxDelete')}</button></div>` +
        `<div class="ctx-fields">${fields}</div></div>`;
    }).join('');
  }

  function renderNoise() {
    const el = $('#noiseReadout');
    if (!el || !state.showNoise) return;
    const sm = Law.noiseSummary(state, result);
    const word = v => v > 70 ? I18n.t('nzLoud') : (v >= 55 ? I18n.t('nzMid') : I18n.t('nzQuiet'));
    const row = (k, key) => `<div class="nz-row"><span>${I18n.t(key)}</span><b>${sm[k]} dB · ${word(sm[k])}</b></div>`;
    el.innerHTML = row('lotFront', 'nzLotFront') + row('bldgFront', 'nzBldgFront') + row('bldgRear', 'nzBldgRear') +
      row('bldgLeft', 'nzBldgLeft') + row('bldgRight', 'nzBldgRight') + row('lotRear', 'nzLotRear') +
      `<div class="nz-note">${I18n.t('nzNote')}</div>`;
  }

  function fmtHour(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function updateSunLabel() {
    $$('[data-sunlabel]').forEach(el => { el.textContent = fmtHour(Number(state.sunHour) || 10); });
  }

  function onFieldChange(el) {
    const key = el.getAttribute('data-field');
    state[key] = readField(el);
    if (key === 'sunHour') {       // slider
      stopSunAnim();   // slider: move the sun and shadow only, no full rebuild
      $$('[data-field="sunHour"]').forEach(o => { if (o !== el) o.value = state.sunHour; });
      updateSunLabel();
      if (scene3d && scene3d.setSun) scene3d.setSun(state);
      renderPlan();
      return;
    }
    afterStateChange();
  }

  // ---------- rendering ----------

  function afterStateChange() {
    result = Law.evaluate(state, I18n.getLang());
    // Row buildings derive bWidth/bDepth from unit size × count; keep the normalised copy.
    state = Object.assign({}, state, result.state);
    syncFormFromState();
    render();
    if (!Array.isArray(state.ctx) && !$('#ctxList').contains(document.activeElement)) renderCtxList();
    else $('#ctxCount').textContent = state.ctx.length;
  }

  function render() {
    const lang = I18n.getLang();
    const isEn = lang === 'en';
    const card = $('#statusCard');
    const pass = result.isAllValid;
    card.classList.toggle('is-pass', pass);
    card.classList.toggle('is-fail', !pass);
    $('#statusIcon').innerHTML = pass ? ICON_OK : ICON_WARN;
    const chip = $('#statusChip');
    if (chip) { chip.className = 'status-chip ' + (pass ? 'is-pass' : 'is-fail'); chip.textContent = (pass ? '✓ ' : '✕ ') + I18n.t(pass ? 'passBadge' : 'failBadge'); }
    $('#statusTitle').textContent = `${pass ? I18n.t('passTitle') : I18n.t('failTitle')} — ${result.categoryName}`;
    $('#statusSub').textContent = pass ? I18n.t('passSub') : I18n.t('failSub');

    renderRules(lang);
    renderNoise();
    renderPlan();
    if (scene3d) scene3d.update(result, state);
  }

  // User's open/closed choice per rule id. Survives re-renders, so an edit doesn't snap cards shut.
  const ruleOpen = new Map();

  function renderRules(lang) {
    const host = $('#rules');
    host.replaceChildren();
    result.rules.forEach(rule => {
      const card = document.createElement('details');
      card.className = 'rule ' + (rule.info ? 'is-info' : (rule.pass ? 'is-pass' : 'is-fail'));
      card.dataset.ruleId = rule.id;
      card.open = ruleOpen.has(rule.id) ? ruleOpen.get(rule.id) : false; // rule cards start closed
      card.addEventListener('toggle', () => {
        ruleOpen.set(rule.id, card.open);
        syncToggleAllLabel();
      });

      const summary = document.createElement('summary');
      summary.className = 'rule-head';
      const title = document.createElement('h3');
      title.textContent = rule.title;
      const badge = document.createElement('span');
      badge.className = 'badge ' + (rule.info ? 'badge-info' : (rule.pass ? 'badge-pass' : 'badge-fail'));
      badge.textContent = rule.info ? I18n.t('infoBadge') : (rule.pass ? I18n.t('passBadge') : I18n.t('failBadge'));
      summary.append(title, badge);

      const body = document.createElement('div');
      body.className = 'rule-content';
      const dl = document.createElement('dl');
      dl.className = 'rule-body';
      [[I18n.t('current'), rule.current], [I18n.t('required'), rule.required]].forEach(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        dl.append(dt, dd);
      });
      const desc = document.createElement('p');
      desc.className = 'rule-desc';
      desc.textContent = rule.desc;
      body.append(dl, desc);

      card.append(summary, body);
      host.appendChild(card);
    });
    syncToggleAllLabel();
  }

  function allRuleCards() {
    return Array.from(document.querySelectorAll('#rules details.rule'));
  }

  function syncToggleAllLabel() {
    const btn = $('#btnToggleRules');
    if (!btn) return;
    const cards = allRuleCards();
    const allOpen = cards.length > 0 && cards.every(c => c.open);
    btn.setAttribute('data-state', allOpen ? 'open' : 'closed');
    btn.querySelector('span').textContent = I18n.t(allOpen ? 'collapseAll' : 'expandAll');
    btn.setAttribute('aria-expanded', String(allOpen));
  }

  function toggleAllRules() {
    const cards = allRuleCards();
    const allOpen = cards.length > 0 && cards.every(c => c.open);
    cards.forEach(c => { c.open = !allOpen; ruleOpen.set(c.dataset.ruleId, !allOpen); });
    syncToggleAllLabel();
  }

  function renderPlan() {
    const canvas = $('#canvas2d');
    if (canvas.offsetParent !== null) Plan.drawPlan(canvas, result, state, I18n.getLang());
  }

  function setView(mode) {
    $$('[data-view]').forEach(b => {
      const on = b.getAttribute('data-view') === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('.viewports').setAttribute('data-mode', mode);
    // 3D and 2D need to re-measure after becoming visible
    requestAnimationFrame(() => {
      if (scene3d) scene3d.setSize && scene3d.setSize();
      renderPlan();
      if (scene3d) scene3d.update(result, state);
    });
  }



  // ---------- phone: number fields get a slider beside them ----------
  // Typing a value on a phone is slow and error-prone; a slider next to each number field lets the thumb set it.
  // The number box stays editable, and both stay in step. Desktop keeps the plain number fields.
  const SLIDER_RANGE = {
    lotWidth: [8, 60, 0.5], lotDepth: [8, 80, 0.5], roadWidth: [3, 30, 0.5],
    bWidth: [3, 40, 0.5], bDepth: [3, 40, 0.5], bHeight: [2, 30, 0.5], height: [2, 30, 0.5],
    frontSetback: [0, 40, 0.5], leftSetback: [0, 30, 0.5], rightSetback: [0, 30, 0.5], rearSetback: [0, 40, 0.5],
    secLeftW: [2, 20, 0.5], secRightW: [2, 20, 0.5], secRearW: [2, 20, 0.5], secRoadW: [2, 20, 0.5],
    riverLeftW: [1, 30, 0.5], riverRightW: [1, 30, 0.5], riverWidth: [1, 40, 0.5],
    unitWidth: [4, 15, 0.5], unitDepth: [4, 30, 0.5], rowUnits: [1, 10, 1], rowGap: [0, 10, 0.5],
    noiseMain: [30, 110, 1], noiseSec: [30, 110, 1], windBearing: [0, 360, 1], siteBearing: [0, 360, 1], bldgBearing: [0, 360, 1]
  };

  const mobileMQ = window.matchMedia('(max-width: 700px), (pointer: coarse)');

  function buildNumberSliders() {
    $$('input[type="number"][data-field]').forEach(inp => {
      if (inp.parentNode.querySelector('.num-slider')) return;
      const key = inp.getAttribute('data-field');
      const r = SLIDER_RANGE[key] || [0, Math.max(20, (Number(inp.value) || 0) * 2), Number(inp.step) || 0.5];
      const sl = document.createElement('input');
      sl.type = 'range';
      sl.className = 'num-slider';
      sl.min = inp.min !== '' ? inp.min : r[0];
      sl.max = inp.max !== '' ? inp.max : r[1];
      sl.step = r[2];
      sl.setAttribute('aria-label', inp.closest('label') ? inp.closest('label').textContent.trim().slice(0, 60) : key);
      sl.dataset.for = key;
      inp.insertAdjacentElement('afterend', sl);
      sl.addEventListener('input', () => {
        inp.value = sl.value;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      sl.addEventListener('change', () => inp.dispatchEvent(new Event('change', { bubbles: true })));
    });
    syncNumberSliders();
  }

  function syncNumberSliders() {
    $$('.num-slider').forEach(sl => {
      const inp = $('input[data-field="' + sl.dataset.for + '"]');
      if (!inp || inp.value === '') return;
      const v = Number(inp.value);
      // widen the range if the typed value is outside it, so the thumb is never stuck at the end
      if (v > Number(sl.max)) sl.max = Math.ceil(v * 1.5);
      if (v < Number(sl.min)) sl.min = Math.floor(v - 5);
      sl.value = v;
    });
  }

  function applyPhoneMode() {
    document.documentElement.classList.toggle('phone-sliders', mobileMQ.matches);
    if (mobileMQ.matches) buildNumberSliders();
  }
  mobileMQ.addEventListener ? mobileMQ.addEventListener('change', applyPhoneMode) : mobileMQ.addListener(applyPhoneMode);

  // ---------- infrastructure editor (railway, expressway, elevated rail, station) ----------
  function infraEnsure() { if (!Array.isArray(state.infra)) state.infra = []; }

  function renderInfraList() {
    const box = $('#infraList'); if (!box) return;
    const kinds = { rail: 'infRail', expressway: 'infExpressway', skytrain: 'infSkytrain' };
    const sideKeys = { front: 'infSideFront', frontRoad: 'infSideRoad', left: 'infSideLeft', right: 'infSideRight', rear: 'infSideRear' };
    box.innerHTML = (state.infra || []).map(it => {
      const sides = Law.INFRA_SIDES.filter(sd => sd !== 'frontRoad' || it.k !== 'rail')
        .map(sd => `<option value="${sd}"${it.side === sd ? ' selected' : ''}>${I18n.t(sideKeys[sd])}</option>`).join('');
      const k = Law.INFRA_KINDS[it.k];
      return `<div class="ctx-row" data-iid="${it.id}"><div class="ctx-head"><span>${I18n.t(kinds[it.k])}${it.station ? ' + ' + I18n.t('infAddStation').replace('+ ', '') : ''}</span>` +
        `<button type="button" data-idel="${it.id}">${I18n.t('ctxDelete')}</button></div>` +
        `<div class="ctx-fields"><label>${I18n.t('infSide')}<select data-if="side">${sides}</select></label>` +
        `<label>${I18n.t('infGap')}<input type="number" step="1" min="0" data-if="gap" value="${it.gap == null ? 6 : it.gap}"></label>` +
        `<label>${I18n.t('infWidth')}<input type="number" step="1" min="2" data-if="w" value="${it.w || k.w}"></label>` +
        (it.k === 'skytrain' ? `<label class="check"><input type="checkbox" data-if="station"${it.station ? ' checked' : ''}> ${I18n.t('infStationOn')}</label>` : '') +
        `</div></div>`;
    }).join('');
  }

  function bindInfra() {
    let n = 0;
    $$('[data-infra]').forEach(btn => btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-infra');
      infraEnsure();
      if (kind === 'clear') state.infra = [];
      else {
        const sky = kind === 'station' || kind === 'skytrain';
        state.infra.push({ id: 'i' + Date.now().toString(36) + (n++), k: kind === 'station' ? 'skytrain' : kind, side: kind === 'rail' ? 'rear' : 'front',
          gap: 6, w: Law.INFRA_KINDS[kind === 'station' ? 'skytrain' : kind].w, station: kind === 'station' && sky });
      }
      afterStateChange();
      renderInfraList();
    }));
    const box = $('#infraList');
    const find = el => (state.infra || []).find(o => o.id === el.closest('.ctx-row').dataset.iid);
    const edit = e => {
      const f = e.target.getAttribute && e.target.getAttribute('data-if'); if (!f) return;
      const it = find(e.target); if (!it) return;
      it[f] = f === 'station' ? e.target.checked : (f === 'side' ? e.target.value : Number(e.target.value) || 0);
      afterStateChange();
      if (f === 'station' || f === 'side') renderInfraList();
    };
    box.addEventListener('input', e => { if (e.target.type === 'number') edit(e); });
    box.addEventListener('change', edit);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-idel]'); if (!b) return;
      state.infra = state.infra.filter(o => o.id !== b.getAttribute('data-idel'));
      afterStateChange(); renderInfraList();
    });
  }

  // ---------- onboarding, full screen & orbit ----------

  function bindWelcome() {
    const wel = $('#welcome');
    const step = n => {
      $$('.wel-step', wel).forEach(el => { el.hidden = el.getAttribute('data-step') !== String(n); });
      const target = n === 1 ? $('[data-pick="th"]', wel) : n === 3 ? $('[data-template="house"]', wel) : $('#welGo');
      if (target) target.focus();
    };
    let firstRun = true;
    const open = n => { wel.hidden = false; step(n); };
    const close = () => { wel.hidden = true; const b = $('#btnHelp'); if (b) b.focus(); };
    $$('[data-pick]', wel).forEach(b => b.addEventListener('click', () => { I18n.setLang(b.getAttribute('data-pick')); step(2); }));
    $('#welGo').addEventListener('click', () => { if (firstRun) { firstRun = false; step(3); } else close(); });
    $('#btnHelp').addEventListener('click', () => { firstRun = false; open(2); });
    $$('[data-template]', wel).forEach(b => b.addEventListener('click', () => { applyTemplate(b.getAttribute('data-template')); close(); }));
    wel.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('[data-step="2"]', wel).hidden) close(); });
    open(1);
  }

  // Sun animation: sweeps 05:00 → 19:00 and loops; any manual slider move pauses it.
  let sunAnim = null;
  function stopSunAnim() {
    if (!sunAnim) return;
    cancelAnimationFrame(sunAnim.raf); sunAnim = null;
    const b = $('#btnSunPlay'); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = I18n.t('sunPlay');
  }
  function startSunAnim() {
    const b = $('#btnSunPlay'); b.setAttribute('aria-pressed', 'true'); b.querySelector('span').textContent = I18n.t('sunPause');
    sunAnim = { last: 0, raf: 0 };
    const step = now => {
      if (!sunAnim) return;
      const dt = sunAnim.last ? Math.min(0.1, (now - sunAnim.last) / 1000) : 0;
      sunAnim.last = now;
      let h = (Number(state.sunHour) || 5) + dt * 1.2;            // ~12 s per day
      if (h > 19) h = 5;
      state.sunHour = h;
      $$('[data-field="sunHour"]').forEach(o => { o.value = h; });
      updateSunLabel();
      if (scene3d && scene3d.setSun) scene3d.setSun(state);
      renderPlan();
      sunAnim.raf = requestAnimationFrame(step);
    };
    sunAnim.raf = requestAnimationFrame(step);
  }

  // Click in the 3D view to place or delete context buildings / trees.
  function bindPick3d() {
    const btns = $$('[data-pick3d]'), note = $('#pickNote');
    let mode = null;
    const setMode = m => {
      mode = m;
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-pick3d') === m)));
      $('#pickNoteRow').hidden = !m;
      if (m && $('.viewports').getAttribute('data-mode') === '2d') setView('3d');
      if (m) note.textContent = I18n.t(m === 'del' ? 'pickDelNote' : 'pickAddNote');
      scene3d.setPickMode(m, ev => {
        ctxEnsureCustom();
        if (ev.type === 'del') state.ctx = state.ctx.filter(o => o.id !== ev.id);
        else if (ev.k === 't') state.ctx.push({ id: ctxNewId(), g: 'user', k: 't', x: ev.x, y: ev.y, s: 1, c: state.ctx.length % 4 });
        else state.ctx.push({ id: ctxNewId(), g: 'user', k: 'b', x: ev.x, y: ev.y, w: 8, d: 8, h: 6, c: state.ctx.length % 5 });
        afterStateChange();
        renderCtxList();
      });
    };
    btns.forEach(b => b.addEventListener('click', () => setMode(mode === b.getAttribute('data-pick3d') ? null : b.getAttribute('data-pick3d'))));
    I18n.onChange(() => { if (mode) note.textContent = I18n.t(mode === 'del' ? 'pickDelNote' : 'pickAddNote'); });
  }

  /* ---------- export: PNG snapshots and the three-period sun/wind sheet ---------- */
  const PERIOD_DEFAULT = [9, 12, 15];
  const SEASON_TEXT = { '23.4': 'มิ.ย. · ครีษมายัน', '0': 'มี.ค./ก.ย. · วิษุวัต', '-23.4': 'ธ.ค. · เหมายัน' };
  const WIND_TEXT = { '0': 'N', '45': 'NE', '90': 'E', '135': 'SE', '180': 'S', '225': 'SW', '270': 'W', '315': 'NW' };

  function fillPeriodPickers() {
    document.querySelectorAll('[data-period]').forEach((sel, i) => {
      if (sel.options.length) return;
      for (let h = 6; h <= 18; h++) {
        const o = document.createElement('option');
        o.value = String(h);
        o.textContent = `${String(h).padStart(2, '0')}:00`;
        sel.appendChild(o);
      }
      sel.value = String(PERIOD_DEFAULT[i]);
    });
  }

  function downloadPNG(canvas, name) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function periodName(h) {
    return h < 11 ? I18n.t('periodMorning') : (h < 14 ? I18n.t('periodNoon') : I18n.t('periodAfternoon'));
  }

  function buildPeriodSheet() {
    if (!scene3d || !scene3d.snapshot || !scene3d.snapshot()) return; // no WebGL: nothing to capture
    const hours = [...document.querySelectorAll('[data-period]')].map(s => Number(s.value));
    // grab one 3D frame per hour; the sun and wind follow the season and wind direction currently chosen
    const frames = hours.map(h => {
      scene3d.setSun(Object.assign({}, state, { sunHour: h, showSun: true }));
      const src = scene3d.snapshot();
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      return { h, c };
    });
    scene3d.setSun(state); // put the sun back where the user left it

    const gap = 12, head = 72, foot = 64;
    const fw = frames[0].c.width, fh = frames[0].c.height;
    const out = document.createElement('canvas');
    out.width = fw * 3 + gap * 2;
    out.height = head + fh + foot;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${I18n.t('subPeriods')} · ${SEASON_TEXT[String(state.sunDecl)] || ''}`, 20, head / 2);
    frames.forEach((f, i) => {
      const x = i * (fw + gap);
      ctx.drawImage(f.c, x, head, fw, fh);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillText(`${String(f.h).padStart(2, '0')}:00 · ${periodName(f.h)}`, x + 12, head - 16);
    });
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    const wind = state.showWind ? `${I18n.t('windBearing')}: ${WIND_TEXT[String(state.windBearing)] || ''}` : '';
    ctx.fillText(wind, 20, head + fh + foot / 2);
    downloadPNG(out, 'setbacklab-3periods.png');
  }

  // ---------- templates & seasonal wind ----------

  /** Template buttons start from the same lot (site fields kept); "blank" leaves the building hidden. */
  function applyTemplate(t) {
    const keep = {};
    Law.SITE_KEYS.forEach(k => { if (state[k] !== undefined) keep[k] = state[k]; });
    const blank = t === 'blank';
    state = Law.applyCategoryPreset(Object.assign({}, Law.DEFAULT_STATE, keep), blank ? 'house' : t);
    state.showBuilding = !blank;
    if (!blank) Object.assign(state, { showSun: true, showWind: true, windFlow: true, hasNeighbors: true, showContext: true });
    Object.assign(state, Law.centerBuilding(state));
    afterStateChange();
  }

  function bindPresets() {
    $$('[data-season]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.windBearing = Number(btn.getAttribute('data-season'));
        afterStateChange();
      });
    });
  }

  // ---------- project save / load (.json) ----------

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function projectMsg(text, bad) {
    const el = $('#projectMsg');
    el.textContent = text;
    el.classList.toggle('is-bad', !!bad);
  }

  /** Returns { state, skipped } or { error }. Never throws; the current project is untouched on error. */
  function parseProject(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { error: 'json' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !obj.state || typeof obj.state !== 'object' || Array.isArray(obj.state)) {
      return { error: 'format' };
    }
    const base = Law.DEFAULT_STATE;
    const out = {};
    let skipped = 0;
    for (const k of Object.keys(obj.state)) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) { skipped++; continue; }
      const v = obj.state[k];
      const ref = base[k];
      let ok;
      if (ref === null) ok = v === null || Array.isArray(v);
      else if (Array.isArray(ref)) ok = Array.isArray(v);
      else if (typeof ref === 'number') ok = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000;
      else ok = typeof v === typeof ref;
      if (!ok) return { error: 'field', key: k };
      out[k] = v;
    }
    if (!Object.keys(out).length) return { error: 'format' };
    return { state: Object.assign({}, base, out), skipped };
  }

  function bindProject() {
    $('#btnSaveProject').addEventListener('click', () => {
      const data = { app: 'SetbackLab', version: 1, savedAt: new Date().toISOString(), state: Object.assign({}, state) };
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'setbacklab-project.json');
      projectMsg(I18n.t('projectSaved'), false);
    });
    $('#loadProjectFile').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 2000000) { projectMsg(I18n.t('projectBad'), true); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const res = parseProject(String(reader.result));
        if (res.error) { projectMsg(I18n.t('projectBad'), true); return; }
        state = res.state;
        afterStateChange();
        projectMsg(I18n.t('projectOk') + (res.skipped ? ' · ' + I18n.t('projectSkip') : ''), false);
      };
      reader.onerror = () => projectMsg(I18n.t('projectBad'), true);
      reader.readAsText(file);
    });
  }

  function bindExport() {
    fillPeriodPickers();
    $('#btnSave3d').addEventListener('click', () => {
      const src = scene3d && scene3d.snapshot ? scene3d.snapshot() : null;
      if (src) downloadPNG(src, 'setbacklab-3d.png');
    });
    $('#btnSave2d').addEventListener('click', () => downloadPNG($('#canvas2d'), 'setbacklab-2d.png'));
    $('#btnPeriods').addEventListener('click', buildPeriodSheet);
  }

  function bindStageTools() {
    const tb = $('#btnTools');
    const closeTools = () => { $('#vpTools').classList.remove('open'); tb.setAttribute('aria-expanded', 'false'); };
    tb.addEventListener('click', () => {
      const open = $('#vpTools').classList.toggle('open');
      tb.setAttribute('aria-expanded', String(open));
    });
    // once a choice is made (checkbox or dropdown), the panel tucks itself away so the model and its labels stay visible;
    // the sun slider keeps the panel open while it is dragged
    $('#vtMore').addEventListener('change', e => {
      if (e.target.matches('input[type=checkbox], select')) closeTools();
    });
    $('#btnSunPlay').addEventListener('click', () => (sunAnim ? stopSunAnim() : startSunAnim()));
    bindPick3d();
    const vp = $('#vp3d'), full = $('#btnFull'), orbit = $('#btnOrbit');
    const setFull = on => {
      vp.classList.toggle('is-full', on);
      document.body.classList.toggle('has-full', on);
      full.setAttribute('aria-pressed', String(on));
      full.querySelector('span').textContent = I18n.t(on ? 'exitFull' : 'fullscreen');
      requestAnimationFrame(() => scene3d && scene3d.setSize());
    };
    full.addEventListener('click', () => {
      const on = !vp.classList.contains('is-full');
      setFull(on);
      try {
        if (on && vp.requestFullscreen) vp.requestFullscreen().catch(() => {});
        else if (!on && document.fullscreenElement) document.exitFullscreen();
      } catch (e) { /* CSS full screen still applies */ }
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vp.classList.contains('is-full')) setFull(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && vp.classList.contains('is-full')) setFull(false); });
    orbit.addEventListener('click', () => {
      const on = scene3d.setAutoRotate(!scene3d.isAutoRotate());
      orbit.setAttribute('aria-pressed', String(on));
      orbit.querySelector('span').textContent = I18n.t(on ? 'stopOrbit' : 'autoOrbit');
    });
    I18n.onChange(() => {
      full.querySelector('span').textContent = I18n.t(vp.classList.contains('is-full') ? 'exitFull' : 'fullscreen');
      orbit.querySelector('span').textContent = I18n.t(scene3d && scene3d.isAutoRotate() ? 'stopOrbit' : 'autoOrbit');
    });
  }

  // ---------- boot ----------

  function boot() {
    I18n.applyDom();
    bindForm();
    I18n.onChange(lang => {
      I18n.applyDom();
      document.documentElement.setAttribute('lang', lang);
      $$('[data-lang]').forEach(b => {
        const on = b.getAttribute('data-lang') === lang;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      result = Law.evaluate(state, lang);
      render();
      renderCtxList();
      renderInfraList();
    });
    I18n.setLang(I18n.getLang()); // notify listeners once so pressed states are set

    scene3d = Scene.createScene3D($('#canvas3d'));
    bindStageTools();
    bindExport();
    bindProject();
    bindPresets();
    bindInfra();
    applyPhoneMode();
    bindWelcome();
    window.addEventListener('resize', () => {
      if (scene3d && scene3d.setSize) scene3d.setSize();
      renderPlan();
    });

    result = Law.evaluate(state, I18n.getLang());
    syncFormFromState();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Exposed for debugging in the console.
  window.SetbackLab = { get state() { return state; }, get result() { return result; } };
})();
