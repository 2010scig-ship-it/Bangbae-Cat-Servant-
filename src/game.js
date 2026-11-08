'use strict';
// ===== 세계: 상태, 시뮬레이션, 고양이 행동, 렌더링 =====
const SAVE_KEY = 'nyang-house-v1';
const PHOTO_KEY = 'nyang-house-photos-v1';
const rand = (a, b) => a + Math.random() * (b - a);
const josa = (name, a, b) => { const c = name.charCodeAt(name.length - 1); return (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28) ? a : b; };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const floorY = z => CFG.FLOOR_Y0 + z * CFG.FLOOR_DEPTH;
const depthScale = z => CFG.DEPTH_BASE + CFG.DEPTH_K * z;
const CAT_SIZE = 1.12;
const CALM_TASKS = ['idle', 'wander', 'window', 'scratch', 'approach'];
const PERCH_WEIGHT = { cattree: 7, tower: 5, bigtower: 7, sofa: 6, table: 3 };
const BUSY_TASKS = ['hunt', 'showOff', 'wheel', 'lure', 'catnip', 'ballplay', 'pursue', 'flee', 'tunnel', 'mouseChase', 'hiss'];

const World = {
  state: null, canvas: null, g: null,
  cam: 0, scale: 1, viewW: 300, cssW: 0, cssH: 0, dpr: 1,
  t: 0, particles: [], fx: [], lizard: null, _lizNext: null, snackHand: null, toolHand: null, ballHeld: false, userPaused: false, lure: null, call: null, catnip: null, stray: null, pet: null,
  placing: null, paused: false, listeners: {},
  _saveT: 0, _checkT: 0,

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  emit(ev, data) { (this.listeners[ev] || []).forEach(fn => fn(data)); },

  catById(id) { return this.state.cats.find(c => c.id === id); },
  bowlCap() { return CFG.BOWL_PER_CAT * this.state.cats.length + 1; },
  roomW() { return CFG.BASE_W + CFG.W_PER_CAT * (this.state.cats.length - 1) + (this.state.roomLv || 0) * EXPAND.roomAdd; },
  worldW() { return Math.max(this.viewW, this.roomW()); },
  maxCats() { return CFG.MAX_CATS + (this.state.slotLv || 0); },
  absMin() { return this.state.day * 1440 + this.state.minute; },
  isNight() { const m = this.state.minute; return m >= 21 * 60 || m < 6 * 60; },
  nightAmt() {
    const h = this.state.minute / 60;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 21) return (h - 18) / 3;
    if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
    return 1;
  },
  maxBond() { return Math.max(...this.state.cats.map(c => c.stats.bond)); },
  furn(type) { return this.state.furniture.filter(f => f.type === type); },

  // ---------- 저장 ----------
  save() {
    if (this.noSave) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state, (k, v) => k[0] === '_' ? undefined : v)); } catch (e) {}
  },
  load() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  exportJSON() { return JSON.stringify(this.state, (k, v) => k[0] === '_' ? undefined : v); },
  wipe() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(PHOTO_KEY); } catch (e) {} },

  newState(firstCat) {
    return {
      v: 1, day: 1, minute: CFG.START_MINUTE, coins: CFG.START_COINS, cats: [firstCat], bowl: 0,
      furniture: [
        { id: 'f7', type: 'lamp', x: 24, z: 0.02 },
        { id: 'f8', type: 'cattree', x: 118, z: 0.03 },
        { id: 'f9', type: 'sofa', x: 330, z: 0.05 },
        { id: 'f3', type: 'wheel', x: 640, z: 0.02 },
        { id: 'f10', type: 'table', x: 500, z: 0.42 },
        { id: 'f4', type: 'scratcher', x: 300, z: 0.55 },
        { id: 'f1', type: 'bowl', x: 70, z: 0.8 },
        { id: 'f6', type: 'water', x: 140, z: 0.92 },
        { id: 'f5', type: 'box', x: 220, z: 0.72 },
        { id: 'f2', type: 'litter', x: 640, z: 0.82, clumps: [] },
      ],
      water: 100, poops: [], ball: { x: 420, z: 0.85, vx: 0, vz: 0 }, layoutV: 3,
      inv: { churu: 1, bugeo: 2, chicken: 1, catnip: 0 },
      decor: { owned: {}, wall: 'pink', floor: 'wood', sofa: 'mint', tree: 'beige' }, film: FILM.start, album: { moments: {} },
      owned: {}, seenUnlock: {}, strayIdx: 0, strayNextDay: 0, catnipDay: 0, tut: 1,
      settings: { sfx: 0.8, bgm: 0.35, mute: false, meow: 'normal', vibrate: true, speed: 1 },
    };
  },
  makeCat(name, coat, eye, day) {
    return {
      id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name, coat, eye,
      pers: pick(Object.keys(PERS)), pitch: rand(0.9, 1.2), adopted: day || 1, newUntil: 0,
      stats: { hunger: 75, happy: 70, energy: 80, comfort: 90, bond: 5 },
      daily: {}, lastPetReward: -999, litterRefuse: 0,
      x: 150, z: 0.58, alt: 0, facing: 1, acc: { neck: null, head: null },
    };
  },

  // 예전 버전 저장 데이터에 새 항목 채우기
  migrate(S) {
    S.settings = S.settings || {};
    if (!S.settings.speed) S.settings.speed = 1;
    if (S.water == null) S.water = 100;
    S.decor = S.decor || { owned: {}, wall: 'pink', floor: 'wood', sofa: 'mint', tree: 'beige' };
    if (S.film == null) S.film = FILM.start;
    S.album = S.album || { moments: {} };
    S.shelter = S.shelter || { total: 0, tier: 0 };
    S.garden = S.garden || Array(GARDEN.pots).fill(null);
    if (!Array.isArray(S.comm)) S.comm = [];
    S.cats.forEach(c => { c.acc = c.acc || { neck: null, head: null }; });
    if (!S.furniture.some(f => f.type === 'water')) S.furniture.push({ id: 'f6', type: 'water', x: 175, z: 0.92 });
    // 집 꾸미기 가구 (예전 저장 데이터에는 빈 곳에 추가)
    [['lamp', 24, 0.02], ['cattree', 118, 0.03], ['sofa', 330, 0.05], ['table', 500, 0.42]].forEach(([type, x, z]) => {
      if (!S.furniture.some(f => f.type === type)) S.furniture.push({ id: 'f' + type, type, x, z });
    });
    // 방을 한 화면에 맞추면서 기본 가구 자리를 새 배치로 옮김
    if ((S.layoutV || 0) < 3) {
      const def = { lamp: [24, 0.02], cattree: [118, 0.03], sofa: [330, 0.05], wheel: [640, 0.02], table: [500, 0.42], scratcher: [300, 0.55], bowl: [70, 0.8], water: [140, 0.92], box: [220, 0.72], litter: [640, 0.82] };
      const done = {};
      S.furniture.forEach(f => { const d = def[f.type]; if (d && !done[f.type] && f.v !== 2) { done[f.type] = true; f.x = d[0]; f.z = d[1]; } });
      const maxX = CFG.BASE_W + CFG.W_PER_CAT * (S.cats.length - 1) - 40;
      S.furniture.forEach(f => { if (f.x > maxX) f.x = maxX - Math.random() * 120; });
      if (S.ball) { S.ball.x = Math.min(S.ball.x, maxX); }
      S.poops.forEach(p => { p.x = Math.min(p.x, maxX); });
      S.cats.forEach(c => { c.x = Math.min(c.x, maxX); });
      S.layoutV = 3;
    }
    return S;
  },
  init(canvas, state) {
    this.migrate(state);
    this.canvas = canvas; this.g = canvas.getContext('2d'); this.state = state;
    state.cats.forEach(c => { c.alt = 0; c.facing = c.facing || 1; c._anim = Math.random() * 10; });
    this.resize();
    this.ensureDeals(); this.ensureMissions(); this.ensureCommissions();
  },
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    const fitW = this.roomW();
    const minRoomH = CFG.FLOOR_Y0 + CFG.BASE_DEPTH + 20;
    this.scale = Math.max(CFG.MIN_SCALE, Math.min(r.width / fitW, r.height / minRoomH));
    const worldH = r.height / this.scale;
    CFG.FLOOR_DEPTH = clamp(worldH - CFG.FLOOR_Y0 - 20, CFG.BASE_DEPTH, CFG.MAX_DEPTH);
    CFG.DEPTH_K = 0.3 + (CFG.FLOOR_DEPTH - CFG.BASE_DEPTH) / 1100;
    CFG.DEPTH_BASE = 0.84 * (1 + (CFG.FLOOR_DEPTH - CFG.BASE_DEPTH) / 1300);   // 깊은 바닥이면 전체를 조금 크게
    CFG.ROOM_H = CFG.FLOOR_Y0 + CFG.FLOOR_DEPTH + 20;
    this.viewW = r.width / this.scale;
    this.offY = worldH - CFG.ROOM_H;   // 남는 세로 공간은 벽을 위로 늘려 채움
    this.uiK = clamp(0.95 / this.scale, 1, 2.4);   // 축소돼도 말풍선·글자는 읽히게
    this.hk = Math.min(this.uiK, 1.5);
    this.clampCam();
  },
  clampCam() { this.cam = clamp(this.cam, 0, Math.max(0, this.worldW() - this.viewW)); },
  toWorld(px, py) { return { x: this.cam + px / this.scale, y: py / this.scale - this.offY }; },
  zFromY(wy) { return clamp((wy - CFG.FLOOR_Y0) / CFG.FLOOR_DEPTH, 0, 1); },
  catY(c) { return floorY(c.z) - c.alt * depthScale(c.z); },

  // ---------- 코인/알림 ----------
  addCoins(n, x, y) {
    this.state.coins += n;
    this.particles.push({ x, y, vx: 0, vy: -28, life: 1.4, text: `+${n}🪙`, size: 13 });
    Sound.play('coin');
    this.emit('hud');
  },
  floatText(x, y, text, size = 14, life = 1.2) { this.particles.push({ x, y, vx: rand(-6, 6), vy: -24, life, text, size }); },
  hearts(c, n = 1) { for (let i = 0; i < n; i++) this.floatText(c.x + rand(-12, 12), this.catY(c) - 55 * depthScale(c.z), pick(['💗', '💕', '💖']), 12); },
  meow(c, kind = 'meow') { Sound.play(kind, { pitch: c.pitch }); },
  // 고양이 말풍선. force가 아니면 너무 자주 말하지 않게 간격을 둠
  say(c, key, force) {
    const lines = (LINES[c.pers] || LINES.dog)[key]; if (!lines) return;
    if (!force && ((c._sayCool || 0) > this.t || (this._sayCool || 0) > this.t)) return;
    c._say = { text: pick(lines), until: this.t + 3 };
    c._sayCool = this.t + 7; this._sayCool = this.t + 2.5;
  },

  // ---------- 메인 업데이트 ----------
  update(dt) {
    const S = this.state;
    this.t += dt;
    const gm = dt * 1440 / CFG.DAY_REAL_SEC * (S.settings.speed || 1);
    S.minute += gm;
    if (S.minute >= 1440) { S.minute -= 1440; this.newDay(); }
    const dh = gm / 60;
    S.water = clamp((S.water == null ? 100 : S.water) - 4 * dh, 0, 100);
    Sound.setNight(this.isNight());
    for (const c of S.cats) this.updateCat(c, dt, dh);
    this.updateToys(dt);
    this.updateSnackHand(dt);
    this.updateStray();
    this.updateLizard(dt);
    this.updateNewcomers(dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    this.fx.forEach(e => { e.t += dt; }); this.fx = this.fx.filter(e => e.t < e.dur);
    if (this.catnip && (this.catnip.t -= dt) <= 0) this.catnip = null;
    if (this._camTarget != null) {
      this.cam += (this._camTarget - this.cam) * Math.min(1, dt * 6);
      if (Math.abs(this._camTarget - this.cam) < 1) this._camTarget = null;
    }
    if ((this._checkT += dt) > 2) { this._checkT = 0; this.checkUnlocks(); }
    if ((this._saveT += dt) > 10) { this._saveT = 0; this.save(); }
  },

  newDay() {
    const S = this.state;
    S.day++;
    S.cats.forEach(c => { c.daily = {}; });
    const ok = S.cats.every(c => c.stats.hunger >= 40 && c.stats.happy >= 40 && c.stats.comfort >= 40);
    this.emit('toast', `🌅 ${S.day}일차 아침이에요!`);
    if (S.cats.length) this.say(pick(S.cats), 'morning', true);
    if (ok) { this.addCoins(CFG.DAILY_BONUS, this.cam + this.viewW / 2, 120); this.emit('toast', `🎉 모두 잘 돌봐줘서 하루 보너스 +${CFG.DAILY_BONUS}🪙`); }
    this.checkUnlocks();
    this.ensureDeals(); this.emit('deals');
    // 화분: 어제 물을 줬으면 한 단계 자라고, 안 줬으면 시들시들
    S.garden.forEach(p => { if (!p) return; const sd = GARDEN.seeds[p.seed]; if (p.watered === S.day - 1) { p.stage = Math.min(sd.days, p.stage + 1); p.dry = 0; } else if (p.stage < sd.days) p.dry = (p.dry || 0) + 1; });
    this.ensureMissions(); this.emit('missions');
    this.save();
  },

  checkUnlocks() {
    const S = this.state, mb = this.maxBond();
    for (const [k, it] of Object.entries(ITEMS)) {
      if (!S.seenUnlock[k] && S.day >= it.day && mb >= it.bond) {
        S.seenUnlock[k] = true;
        this.emit('unlock', k);
      }
    }
  },

  // ---------- 고양이 ----------
  updateCat(c, dt, dh) {
    const S = this.state, P = PERS[c.pers], st = c.stats;
    const active = c._task && BUSY_TASKS.includes(c._task.type);
    st.hunger += RATES.hunger * P.hungerRate * dh;
    st.comfort += RATES.comfort * dh;
    st.energy += (c._sleeping ? RATES.energySleep : active ? RATES.energyActive : RATES.energyAwake) * dh;
    let hd = RATES.happy;
    if (st.hunger < 25) hd -= 3;
    if (st.comfort < 20) hd -= 2;
    hd -= S.poops.length * 1.5;
    if (S.water < 20) hd -= 1.5;
    st.happy += hd * dh;
    if (st.happy < 15) st.bond -= 0.3 * dh;
    for (const k in st) st[k] = clamp(st[k], 0, 100);

    c._anim = (c._anim || 0) + dt;
    c._blinkT = (c._blinkT || rand(2, 5)) - dt;
    if (c._blinkT < -0.12) c._blinkT = rand(2, 5);

    if (c._jump) {
      const j = c._jump; j.t += dt;
      const p = Math.min(1, j.t / j.dur);
      c.x = j.x0 + (j.x1 - j.x0) * p;
      c.alt = j.a0 + (j.a1 - j.a0) * p + Math.sin(Math.PI * p) * (24 + Math.abs(j.a1 - j.a0) * 0.25);
      c._pose = 'jump';
      if (p >= 1) { c.alt = j.a1; c.x = j.x1; c._jump = null; c._pose = 'sit'; }
      return;
    }
    if (this.pet && this.pet.cat === c) {
      if (!c._sleeping && !['loaf', 'front', 'sit'].includes(c._pose)) c._pose = 'sit';
      return;
    }
    if (!c._task) this.chooseTask(c);
    this.runTask(c, dt);

    // 자발적 울음
    const freq = { low: 0.35, normal: 1, high: 2.2 }[S.settings.meow] || 1;
    if (!c._sleeping && !c._hidden && Math.random() < 0.04 * freq * dt) {
      if (st.hunger < 30) this.meow(c, 'beg');
      else if (Math.random() < 0.3) this.meow(c, 'trill');
      else this.meow(c, 'meow');
      c._mouthT = 0.4;
    }
    if (c._mouthT) c._mouthT = Math.max(0, c._mouthT - dt);

    this.updateRequest(c);
    if (!c._sleeping && Math.random() < dt * 0.05) { if (st.hunger < 25) this.say(c, 'hungry'); else if (c.litterRefuse > 0) this.say(c, 'litter'); }
    c._icon = st.hunger < 25 ? '🐟' : (st.comfort < 25 || c.litterRefuse > 0) ? '💩' : S.water < 20 ? '💧' : (st.energy < 15 && !c._sleeping) ? '💤' : st.happy < 20 ? '💢' : null;
  },

  // ---------- 부탁 ----------
  updateRequest(c) {
    const S = this.state, now = this.absMin();
    if (S.tut && S.tut <= 3) return;
    if (c.req) {
      if (c._sleeping) { c.req = null; c.reqNext = now + rand(...REQ.INTERVAL); return; }
      if (now > c.req.until) {
        c.req = null; c.reqNext = now + rand(...REQ.INTERVAL);
        c.stats.happy = clamp(c.stats.happy - REQ.MISS_HAPPY, 0, 100);
        this.emit('toast', `😿 ${c.name}의 부탁을 못 들어줬어요`);
      }
      return;
    }
    if (c.reqNext == null) c.reqNext = now + rand(20, 60);
    if (now < c.reqNext || c._sleeping || this.isNight() || (this.pet && this.pet.cat === c)) return;
    const W = REQ_WEIGHTS[c.pers], opts = Object.keys(REQUESTS).filter(k => k !== 'gift' || c.stats.bond >= 15);
    let sum = opts.reduce((a, k) => a + W[k], 0), r = Math.random() * sum, type = opts[0];
    for (const k of opts) if ((r -= W[k]) <= 0) { type = k; break; }
    c.req = { type, until: now + REQ.DURATION };
    if (type === 'gift') c.req.gift = pick(GIFTS);
    this.meow(c, type === 'snack' || type === 'play' ? 'beg' : 'meow'); c._mouthT = 0.6;
    if (!c._task || CALM_TASKS.includes(c._task.type)) this.setTask(c, 'approach');
    this.emit('request', c);
  },
  fulfill(c, type) {
    if (!c.req || c.req.type !== type) return false;
    const P = PERS[c.pers], gift = c.req.gift;
    this.track('request');
    c.req = null; c.reqNext = this.absMin() + rand(...REQ.INTERVAL);
    c.stats.happy = clamp(c.stats.happy + REQ.REWARD_HAPPY, 0, 100);
    c.stats.bond = clamp(c.stats.bond + REQ.REWARD_BOND * P.bondMul, 0, 100);
    const coins = type === 'gift' ? Math.floor(rand(2, 6)) : REQ.REWARD_COINS;
    this.addCoins(coins, c.x, this.catY(c) - 70);
    this.hearts(c, 3);
    this.meow(c, 'trill');
    if (type === 'gift') {
      const g = gift.split(' ')[1];
      this.emit('toast', `🎁 ${c.name}${josa(c.name, '이가', '가')} ${gift}${josa(g, '을', '를')} 선물했어요!`);
    } else this.say(c, 'thanks', true);
    return true;
  },

  startJump(c, x1, a1, dur) {
    const d = dur || clamp(0.4 + Math.abs(a1 - c.alt) / 400, 0.4, 0.9);
    if (Math.abs(x1 - c.x) > 1) c.facing = x1 > c.x ? 1 : -1;
    c._jump = { x0: c.x, a0: c.alt, x1, a1, t: 0, dur: d };
  },

  // 바닥 위에서 이동 (높은 곳에 있으면 먼저 뛰어내림). 도착하면 true
  go(c, x, z, dt, speed = 38) {
    if (c.alt > 0.5) {
      this.endInside(c);
      this.startJump(c, clamp(c.x + c.facing * 28, 20, this.worldW() - 20), 0);
      return false;
    }
    x = clamp(x, 16, this.worldW() - 16); z = clamp(z, 0, 1);
    const dx = x - c.x, dz = (z - c.z) * CFG.FLOOR_DEPTH, d = Math.hypot(dx, dz);
    if (d < 2.5) { c.x = x; c.z = z; return true; }
    const step = Math.min(d, speed * dt);
    c.x += dx / d * step; c.z += dz / d * step / CFG.FLOOR_DEPTH;
    if (Math.abs(dx) > 1.5) c.facing = dx > 0 ? 1 : -1;
    c._pose = speed > 60 ? 'run' : 'walk';
    return false;
  },

  endInside(c) {
    if (c._spotFurn && c._spotFurn._occupant === c.id) c._spotFurn._occupant = null;
    c._spotFurn = null; c._inside = null; c._hidden = false;
  },
  setTask(c, type, data = {}) {
    this.endTask(c);
    c._task = Object.assign({ type, ph: 0, t: 0, sp: 0 }, data);
  },
  endTask(c) {
    const tk = c._task;
    if (tk && tk.partner) { const p = this.catById(tk.partner); if (p && p._task && p._task.partner === c.id) { p._task = null; } }
    if (tk && tk.slotFurn && tk.slotFurn._slots) delete tk.slotFurn._slots[c.id];
    if (c.alt <= 0.5 || !c._inside) this.endInside(c);
    c._sleeping = false;
    c._task = null;
  },

  // 자리(가구 위/안)로 가기. 도착하면 true
  toSpot(c, tk, spot, dt) {
    if (tk.sp === 0) {
      if (spot.furn && spot.furn._occupant && spot.furn._occupant !== c.id) { this.endTask(c); return false; }
      const needJump = spot.alt > 0;
      const fx = needJump ? spot.x - 34 : spot.x;
      if (this.go(c, fx, spot.z, dt, spot.speed || 40)) {
        if (spot.furn) spot.furn._occupant = c.id;
        c._spotFurn = spot.furn || null;
        if (needJump) { this.startJump(c, spot.x, spot.alt); tk.sp = 1; } else tk.sp = 2;
        if (spot.front) c._inside = spot.furn;
        if (spot.hidden) c._hidden = true;
      }
      return false;
    }
    if (tk.sp === 1) { tk.sp = 2; c.facing = spot.facing || c.facing; }
    return true;
  },

  chooseTask(c) {
    const S = this.state, st = c.stats, P = PERS[c.pers], night = this.isNight();
    const opts = [];
    const add = (w, type, data) => { if (w > 0) opts.push([w, type, data]); };
    const free = f => f && !f._occupant;
    if (st.hunger < 40) add((40 - st.hunger) * 6 + 20, 'eat');
    if (st.comfort < 30) add((30 - st.comfort) * 5 + 15, 'litter');
    if (st.energy < 25) add((25 - st.energy) * 5 + 20, 'sleep');
    else if (night && st.energy < 90) add(70, 'sleep');
    else if (st.energy < 60) add(4, 'sleep');
    add(10, 'wander'); add(12, 'idle');
    if (c.req && !night) add(c.req.type === 'gift' ? 60 : 22, 'approach');
    if (S.water > 10 && this.furn('water')[0]) add(3, 'drink', { furn: this.furn('water')[0] });
    if (st.energy > 35) {
      const wh = this.furn('wheel')[0]; if (free(wh)) add(9 * P.play, 'wheel', { furn: wh });
      const sc = this.furn('scratcher')[0]; if (sc) add(4, 'scratch', { furn: sc });
      if (S.ball && !this.ballHeld) add(3 * P.play, 'ballplay');
      this.furn('tunnel').forEach(f => add(3 * P.play, 'tunnel', { furn: f }));
      this.furn('mouse').forEach(f => { if (f._active) add(14 * P.play, 'mouseChase', { furn: f }); });
      this.furn('feather').forEach(f => { if (f._active) add(10 * P.play, 'feather', { furn: f }); });
    }
    const birds = S.owned.hammock && !night;
    add(4 + (birds ? 6 : 0), 'window');
    this.furn('box').forEach(f => { if (free(f)) add(4, 'box', { furn: f }); });
    this.furn('hideout').forEach(f => { if (free(f)) add(4, 'hideout', { furn: f }); });
    Object.entries(PERCH_WEIGHT).forEach(([tp, w]) => this.furn(tp).forEach(f => add(w, 'perch', { furn: f })));
    this.furn('hammock').forEach(f => { if (free(f)) add(6, 'hammock', { furn: f }); });
    if (!night) add((st.happy >= 20 ? 3 : 0.4) * P.approach, 'approach');
    const others = S.cats.filter(o => o !== c && !o._sleeping && !o._hidden && o.alt < 1 && !o._jump && (!o._task || CALM_TASKS.includes(o._task.type)));
    if (others.length) add(9, 'social', { partner: pick(others).id });

    let sum = opts.reduce((a, o) => a + o[0], 0), r = Math.random() * sum;
    for (const [w, type, data] of opts) { if ((r -= w) <= 0) { this.setTask(c, type, data); break; } }
    if (!c._task) this.setTask(c, 'idle');
    // 작업별 초기화
    const tk = c._task;
    if (tk.type === 'sleep') tk.spot = this.pickSleepSpot(c);
    if (tk.type === 'idle') { tk.pose = st.happy < 20 ? 'loaf' : pick(['sit', 'sit', 'loaf', 'groom', 'stretch', 'look']); tk.dur = tk.pose === 'stretch' ? 2 : rand(4, 10); }
    if (tk.type === 'wander') { tk.x = rand(30, this.worldW() - 30); tk.z = rand(0.1, 0.95); }
  },

  pickSleepSpot(c) {
    const S = this.state, cands = [];
    const free = f => !f._occupant;
    this.furn('box').forEach(f => free(f) && cands.push([4, { x: f.x, z: f.z, alt: 3, furn: f, front: true }]));
    this.furn('hideout').forEach(f => free(f) && cands.push([5, { x: f.x, z: f.z, alt: 0, furn: f, hidden: true }]));
    this.furn('hammock').forEach(f => free(f) && cands.push([5, { x: f.x, z: f.z, alt: 128, furn: f, front: true }]));
    Object.keys(PERCH_WEIGHT).forEach(tp => this.furn(tp).forEach(f => {
      const lv = towerLevels(f).filter(l => l.bed && !this.levelTaken(f, l));
      if (lv.length) { const l = pick(lv); cands.push([tp === 'table' ? 2 : 5, { x: f.x + l.dx, z: f.z + 0.002, alt: l.alt, furn: null, tower: f, level: l }]); }
    }));
    const sleeper = S.cats.find(o => o !== c && o._sleeping && o.alt < 1 && !o._hidden);
    if (sleeper) cands.push([6, { x: sleeper.x + (Math.random() < 0.5 ? -36 : 36), z: sleeper.z, alt: 0 }]);
    cands.push([3, { x: rand(40, this.worldW() - 40), z: rand(0.3, 0.9), alt: 0 }]);
    let sum = cands.reduce((a, o) => a + o[0], 0), r = Math.random() * sum;
    for (const [w, s] of cands) if ((r -= w) <= 0) return s;
    return cands[cands.length - 1][1];
  },
  levelTaken(f, l) {
    return this.state.cats.some(o => o._task && o._task.spot && o._task.spot.tower === f && o._task.spot.level === l);
  },

  runTask(c, dt) {
    const S = this.state, tk = c._task, st = c.stats;
    tk.t += dt;
    switch (tk.type) {
      case 'idle': {
        if (c.alt > 0.5 && !c._inside) { this.go(c, c.x, c.z, dt); break; }
        c._pose = tk.pose;
        if (tk.t > tk.dur) this.endTask(c);
        break;
      }
      case 'wander': {
        if (tk.ph === 0) { if (this.go(c, tk.x, tk.z, dt)) { tk.ph = 1; tk.t = 0; } }
        else { c._pose = 'sit'; if (tk.t > rand(1, 3)) this.endTask(c); }
        break;
      }
      case 'eat': {
        const bowl = this.furn('bowl')[0];
        if (!bowl) { this.endTask(c); break; }
        if (tk.ph === 0) {
          bowl._slots = bowl._slots || {};
          if (tk.slot == null) {
            const used = Object.values(bowl._slots); let i = 0; while (used.includes(i)) i++;
            tk.slot = i; bowl._slots[c.id] = i; tk.slotFurn = bowl;
          }
          const SL = [[-30, 0, 1], [30, 0, -1], [-26, -0.14, 1], [26, -0.14, -1], [0, -0.22, 1]][tk.slot % 5];
          if (this.go(c, bowl.x + SL[0], bowl.z + SL[1], dt, tk.excited ? 125 : S.bowl >= 1 ? 62 : 40)) {
            c.facing = SL[2]; tk.ph = 1;
            if (tk.excited) { this.startJump(c, c.x, 0, 0.3); this.hearts(c, 2); }   // 도착하면 깡총
          }
        } else if (tk.ph === 1) {
          if (S.bowl >= 1) { S.bowl -= 1; tk.ph = 2; tk.t = 0; tk.wasHungry = st.hunger < 50; this.meow(c, 'eat'); this.emit('hud'); }
          else { tk.ph = 3; tk.t = 0; tk.begT = 0; }
        } else if (tk.ph === 2) {
          c._pose = 'eat';
          if (tk.t > 2.5 && !tk.second) { tk.second = true; Sound.play('eat', { vol: 0.7 }); }
          if (tk.t > 5) {
            st.hunger += 45; st.happy += 5;
            if (tk.wasHungry) { this.addCoins(1, c.x, this.catY(c) - 60); this.say(c, 'fed'); this.track('feed'); }
            this.endTask(c);
          }
        } else if (tk.ph === 3) {
          c._pose = 'beg'; c.facing = (bowl.x > c.x ? 1 : -1);
          if ((tk.begT -= dt) <= 0) { this.meow(c, 'beg'); c._mouthT = 0.8; tk.begT = 3.5; }
          if (S.bowl >= 1) tk.ph = 1;
          if (tk.t > 9) this.endTask(c);
        }
        break;
      }
      case 'sleep': {
        if (this.toSpot(c, tk, tk.spot, dt)) {
          c._sleeping = true;
          c._pose = 'sleep';
          if ((tk.zT = (tk.zT || 0) - dt) <= 0) { tk.zT = 1.6; if (!c._hidden) this.floatText(c.x + 10 * c.facing, this.catY(c) - 30, 'z', 11, 1.6); }
          const wake = st.energy >= 98 && (!this.isNight() || Math.random() < 0.002);
          if (wake || (!this.isNight() && st.energy > 85 && (st.hunger < 20 || st.comfort < 20))) {
            this.endTask(c);
            this.setTask(c, 'idle'); c._task.pose = 'stretch'; c._task.dur = 2;
          }
        }
        break;
      }
      case 'litter': {
        if (tk.ph === 0) {
          const boxes = this.furn('litter').filter(f => !f._occupant || f._occupant === c.id);
          if (!boxes.length) { if (tk.t > 6) this.endTask(c); c._pose = 'sit'; break; }
          tk.box = boxes.sort((a, b) => a.clumps.length - b.clumps.length)[0];
          tk.ph = 1;
        }
        const box = tk.box;
        if (tk.ph === 1) {
          if (this.go(c, box.x - 52, box.z, dt)) {
            c.facing = 1;
            if (box.clumps.length >= CFG.LITTER_HESITATE_CLUMPS) { tk.ph = 5; tk.t = 0; this.meow(c, 'beg'); c._mouthT = 0.8; }
            else { tk.ph = 2; }
          }
        } else if (tk.ph === 2) {
          if (box._occupant && box._occupant !== c.id) { this.endTask(c); break; }
          box._occupant = c.id; c._spotFurn = box; c._inside = box;
          this.startJump(c, box.x, 8); tk.ph = 3; tk.t = 0;
        } else if (tk.ph === 3) {
          c._pose = 'squat';
          if (!tk.dug) { tk.dug = true; Sound.play('scoop', { vol: 0.5 }); }
          if (tk.t > 4) {
            box.clumps.push({ kind: 'pee' });
            if (Math.random() < 0.55) box.clumps.push({ kind: 'poo' });
            st.comfort = 100; st.happy += 3; c.litterRefuse = 0;
            Sound.play('scoop', { vol: 0.5 });
            this.emit('litter');
            this.endTask(c);
          }
        } else if (tk.ph === 5) {
          c._pose = 'look';
          if (tk.t > 3.5) {
            c.litterRefuse++;
            if (c.litterRefuse >= 2 && st.comfort < 15) {
              S.poops.push({ x: c.x - 20, z: c.z });
              st.comfort = 100; st.happy -= 10; c.litterRefuse = 0;
              this.emit('toast', `💦 ${c.name}${josa(c.name, '이가', '가')} 화장실 밖에 실수했어요. 🧹로 치워주세요`);
            } else if (c.litterRefuse === 1) this.say(c, 'litter', true);
            this.endTask(c);
          }
        }
        break;
      }
      case 'wheel': {
        const f = tk.furn;
        if (this.toSpot(c, tk, { x: f.x, z: f.z + 0.003, alt: 16, furn: f, facing: 1, speed: 58 }, dt)) {
          if (!tk.dur) { tk.dur = rand(9, 16) * (c.pers === 'zoom' ? 1.6 : 1); tk.t = 0; this.say(c, 'wheel'); }
          c._pose = 'run'; c.facing = 1;
          f._angle = (f._angle || 0) + dt * 3.2;
          st.happy += 1.2 * dt;
          if (tk.t > tk.dur + 1 || st.energy < 15) this.endTask(c);
        }
        break;
      }
      case 'wantSnack': {
        const H = this.snackHand;
        if (!H || tk.t > 12) { this.endTask(c); break; }
        const dx = H.x - c.x;

        if (Math.abs(dx) > 2) c.facing = dx > 0 ? 1 : -1;
        if (c.alt > 0.5) { c._pose = H.y < this.catY(c) - 40 ? 'look' : 'beg'; break; }
        const hz = H.y > CFG.FLOOR_Y0 ? this.zFromY(H.y + 30) : c.z;
        // 여러 마리가 겹치지 않게 손 주변에 나눠 섬
        const off = [0, 22, -22, 40, -40][(tk.slot || 0) % 5];
        if (Math.abs(dx) > 40 + Math.abs(off) * 0.5) this.go(c, H.x - c.facing * 32 + off, hz, dt, Math.abs(dx) > 90 ? 120 : 60);
        else {
          const headY = this.catY(c) - 52 * depthScale(c.z) * CAT_SIZE;
          c._pose = H.y < headY - 18 ? 'reach' : 'beg';
          if (H.movedAt && this.t - H.movedAt < 0.3) tk.t = 0;
          // 제자리에서 깡총거리며 조름
          if ((tk.hop = (tk.hop == null ? rand(0.8, 1.6) : tk.hop) - dt) <= 0) {
            tk.hop = rand(1.4, 2.6);
            this.startJump(c, c.x, 0, 0.32);
            if (Math.random() < 0.5) { this.meow(c, 'beg'); c._mouthT = 0.6; }
          }
        }
        break;
      }
      case 'hunt': {
        const L = this.lizard;
        if (!L || L.state !== 'roam' || tk.t > 25 || (tk.miss || 0) >= 3) { this.endTask(c); break; }
        const dx = L.x - c.x, d = Math.hypot(dx, (L.z - c.z) * 140);
        if (c.alt > 0.5) { this.go(c, c.x, c.z, dt); break; }
        if (!tk.landed && tk.pounced) {
          // 덮친 뒤 착지: 잡았는지 확인
          tk.landed = true;
          if (d < 24 && Math.random() < LIZARD.CATCH + (c.pers === 'zoom' ? 0.2 : 0)) {
            Object.assign(L, { state: 'caught', by: c.id });
            this.state.cats.forEach(o => { if (o !== c && o._task && o._task.type === 'hunt') this.endTask(o); });
            this.setTask(c, 'showOff');
            this.emit('caught', c);
          } else { tk.miss = (tk.miss || 0) + 1; tk.pounced = false; L.flee = 1; L.pause = 0; L.tx = clamp(L.x + (dx > 0 ? 1 : -1) * rand(100, 170), 15, this.worldW() - 15); }
          break;
        }
        if (d > 60) { this.go(c, L.x - Math.sign(dx || 1) * 26, L.z, dt, L.moving ? 70 : 45); }
        else if (!tk.pounced) { tk.pounced = true; tk.landed = false; c.z = L.z; this.startJump(c, L.x, 0, 0.42); }
        break;
      }
      case 'showOff': {
        if (!this.lizard || this.lizard.by !== c.id) { this.endTask(c); break; }
        if (tk.ph === 0) {
          if (tk.x == null) tk.x = clamp(this.cam + this.viewW * rand(0.35, 0.65), 30, this.worldW() - 30);
          if (this.go(c, tk.x, 0.95, dt, 50)) { tk.ph = 1; tk.t = 0; this.say(c, 'caught', true); this.meow(c, 'meow'); }
        } else {
          c._pose = 'front';
          if (tk.t > LIZARD.SHOW_SEC) { this.lizardEscape(c.x, c.z); this.endTask(c); }
        }
        break;
      }
      case 'drink': {
        const f = tk.furn;
        if (!f) { this.endTask(c); break; }
        if (tk.ph === 0) { if (this.go(c, f.x - 26, f.z, dt)) { tk.ph = 1; tk.t = 0; c.facing = 1; } }
        else {
          if (S.water < 15) { c._pose = 'beg'; if (!tk.m) { tk.m = true; this.meow(c, 'beg'); } if (tk.t > 4) this.endTask(c); break; }
          c._pose = 'eat';
          if (tk.t > 3) { S.water = clamp(S.water - 3, 0, 100); st.happy += 2; this.endTask(c); }
        }
        break;
      }
      case 'scratch': {
        const f = tk.furn;
        if (tk.ph === 0) { if (this.go(c, f.x - 20, f.z + 0.01, dt)) { tk.ph = 1; tk.t = 0; c.facing = 1; Sound.play('rustle', { vol: 0.5 }); } }
        else { c._pose = 'scratch'; c.facing = 1; if (tk.t > 3.5) { st.happy += 3; this.endTask(c); } }
        break;
      }
      case 'approach': {
        if (tk.ph === 0) {
          if (tk.x == null) tk.x = clamp(this.cam + this.viewW * rand(0.3, 0.7), 30, this.worldW() - 30);
          if (this.go(c, tk.x, 0.97, dt, 45)) { tk.ph = 1; tk.t = 0; this.meow(c, Math.random() < 0.5 ? 'trill' : 'meow'); c._mouthT = 0.5; c._awaitPet = true; if (!c.req) this.say(c, c.stats.hunger < 30 ? 'hungry' : 'greet'); }
        } else {
          c._pose = 'front';
          if (tk.t > 3 && !tk.m2) { tk.m2 = true; this.meow(c); c._mouthT = 0.4; }
          if (tk.t > 8) { c._awaitPet = false; this.endTask(c); }
        }
        break;
      }
      case 'toOwner': {
        const call = this.call;
        if (tk.ph === 0) {
          if (!call) { this.endTask(c); break; }
          tk.x = call.x + tk.off;
          if (this.go(c, tk.x, 0.96, dt, 60)) { tk.ph = 1; tk.t = 0; this.meow(c, 'trill'); }
        } else {
          c._pose = 'front';
          if (!call) { if (!tk.left) { tk.left = true; tk.t = 0; } if (tk.t > 2) this.endTask(c); }
          else if (Math.abs(call.x + tk.off - c.x) > 20) tk.ph = 0;
          else if (Math.random() < dt * 0.6) this.hearts(c);
        }
        break;
      }
      case 'window': {
        if (tk.ph === 0) { if (tk.x == null) tk.x = CFG.WINDOW_X + rand(-40, 40); if (this.go(c, tk.x, 0.02, dt)) { tk.ph = 1; tk.t = 0; tk.dur = rand(7, 13); } }
        else {
          c._pose = 'look';
          if (S.owned.hammock && !this.isNight() && Math.random() < dt * 0.25) { this.meow(c, 'trill'); c._mouthT = 0.3; }
          if (tk.t > tk.dur) this.endTask(c);
        }
        break;
      }
      case 'box': {
        const f = tk.furn;
        if (this.toSpot(c, tk, { x: f.x, z: f.z, alt: 3, furn: f, front: true }, dt)) {
          if (!tk.dur) { tk.dur = rand(8, 15); tk.pose = pick(['loaf', 'sit', 'loaf']); tk.t = 0; }
          c._pose = tk.pose;
          if (tk.t > tk.dur + 1) this.endTask(c);
        }
        break;
      }
      case 'hideout': {
        const f = tk.furn;
        if (this.toSpot(c, tk, { x: f.x, z: f.z, alt: 0, furn: f, hidden: true }, dt)) {
          if (!tk.dur) { tk.dur = rand(10, 20); tk.t = 0; }
          c._pose = 'loaf';
          if (tk.t > tk.dur) { this.endTask(c); c.x = f.x + 40; }
        }
        break;
      }
      case 'perch': {
        if (!tk.spot) {
          const f = tk.furn, lv = towerLevels(f).filter(l => !this.levelTaken(f, l));
          if (!lv.length) { this.endTask(c); break; }
          const l = pick(lv);
          tk.spot = { x: f.x + l.dx, z: f.z + 0.002, alt: l.alt, tower: f, level: l };
        }
        if (this.toSpot(c, tk, tk.spot, dt)) {
          if (!tk.dur) { tk.dur = rand(12, 20); tk.pose = pick(['loaf', 'look', 'sit']); tk.t = 0; }
          c._pose = tk.pose;
          if (tk.t > tk.dur + 1) this.endTask(c);
        }
        break;
      }
      case 'hammock': {
        const f = tk.furn;
        if (this.toSpot(c, tk, { x: f.x, z: f.z, alt: 128, furn: f, front: true }, dt)) {
          if (!tk.dur) { tk.dur = rand(14, 24); tk.pose = pick(['loaf', 'look', 'loaf']); tk.t = 0; }
          c._pose = tk.pose;
          if (tk.t > tk.dur + 1) this.endTask(c);
        }
        break;
      }
      case 'tunnel': {
        const f = tk.furn;
        if (tk.ph === 0) { if (this.go(c, f.x - 64, f.z, dt, 60)) { tk.ph = 1; tk.t = 0; c._hidden = true; Sound.play('rustle', { vol: 0.6 }); } }
        else if (tk.ph === 1) {
          c.x = f.x - 64 + 128 * Math.min(1, tk.t / 1.6); c.facing = 1;
          if (tk.t > 1.6) { c._hidden = false; tk.ph = 2; tk.t = 0; Sound.play('rustle', { vol: 0.4 }); }
        } else { c._pose = 'sit'; if (tk.t > 1.5) { st.happy += 4; this.endTask(c); } }
        break;
      }
      case 'ballplay': {
        const b = S.ball;
        if (!b || this.ballHeld || tk.t > 16 || (tk.kicks || 0) >= 4) { this.endTask(c); break; }
        const side = c.x < b.x ? -1 : 1;
        if (this.go(c, b.x + side * 16, b.z, dt, 75)) {
          c._pose = 'bat'; c.facing = -side;
          if ((tk.cool = (tk.cool || 0) - dt) <= 0) {
            tk.cool = 0.7; tk.kicks = (tk.kicks || 0) + 1;
            if (tk.kicks >= 2 && tk.byOwner) this.fulfill(c, 'play');
            b.vx = -side * rand(60, 140); b.vz = rand(-0.4, 0.4);
            Sound.play('pop', { vol: 0.4, pitch: 0.8 }); st.happy += 3;
          }
        }
        break;
      }
      case 'mouseChase': {
        const f = tk.furn;
        if (!f._active || tk.t > 14) { this.endTask(c); break; }
        if (this.go(c, f.x - 14 * Math.sign(f._vx || 1), f.z, dt, 95)) { c._pose = 'bat'; }
        st.happy += 1.5 * dt;
        break;
      }
      case 'feather': {
        const f = tk.furn;
        if (!f._active || tk.t > 12) { this.endTask(c); break; }
        if (this.go(c, f.x - 26, f.z + 0.01, dt, 60)) { c._pose = 'bat'; c.facing = 1; st.happy += 1.5 * dt; }
        break;
      }
      case 'lure': {
        const L = this.lure;
        if (!L) { if (tk.t > 0.5) this.endTask(c); break; }
        tk.t = 0;
        const lz = L.y > CFG.FLOOR_Y0 ? this.zFromY(L.y) : 0.35;
        const near = Math.abs(L.x - c.x) < 26;
        if (near) {
          const headY = floorY(c.z) - 45 * depthScale(c.z);
          if (L.y < headY - 25 && L.type === 'rod' && !c._jump && c.alt < 1 && (tk.jumpCool = (tk.jumpCool || 0) - dt) <= 0) {
            tk.jumpCool = 1.4;
            this.startJump(c, L.x + rand(-8, 8), clamp(floorY(c.z) - L.y - 30, 10, 120), 0.6);
          } else if (c.alt > 0.5) { this.go(c, c.x, c.z, dt); }
          else { c._pose = 'bat'; c.facing = L.x >= c.x ? 1 : -1; }
          tk.play = (tk.play || 0) + dt * (L.moving ? 1 : 0.4);
        } else {
          this.go(c, L.x - 16 * Math.sign(L.x - c.x), lz, dt, L.type === 'laser' ? 120 : 90);
        }
        if (tk.play >= 3 && c.req && c.req.type === 'play') this.fulfill(c, 'play');
        if (tk.play >= 6) { tk.play = 0; this.rewardPlay(c); }
        break;
      }
      case 'catnip': {
        const n = this.catnip;
        if (tk.ph === 0) {
          if (!n) { this.endTask(c); break; }
          if (this.go(c, n.x + rand(-6, 6), n.z, dt, 65)) { tk.ph = 1; tk.t = 0; this.meow(c, 'trill'); }
        } else if (tk.ph === 1) {
          c._pose = 'roll'; st.happy += 4 * dt;
          if (tk.t > 3.5) { tk.ph = 2; tk.t = 0; }
        } else if (tk.ph === 2) {
          if (tk.tx == null || this.go(c, tk.tx, tk.tz, dt, 130)) { tk.tx = rand(30, this.worldW() - 30); tk.tz = rand(0, 1); }
          st.happy += 0.5 * dt;
          if (tk.t > 25) { st.energy -= 25; this.setTask(c, 'idle'); c._task.pose = 'loaf'; c._task.dur = 6; }
        }
        break;
      }
      case 'snack': {
        const sn = SNACKS[tk.kind];
        c._pose = tk.kind === 'chicken' ? 'eat' : tk.kind === 'churu' ? 'sit' : 'eat';
        c._mouthT = tk.kind === 'churu' ? 0.2 : 0;
        if (!tk.chew && tk.t > 0.4) { tk.chew = true; Sound.play('eat', { vol: 0.8 }); }
        if (tk.t > 3) {
          st.hunger += sn.hunger; st.happy += sn.happy; st.bond += sn.bond * PERS[c.pers].bondMul;
          this.hearts(c, 3);
          if (Math.random() < 0.6) this.meow(c, 'trill');
          this.say(c, 'snack', true);
          this.endTask(c);
        }
        break;
      }
      case 'social': {
        const p = this.catById(tk.partner);
        if (!p || p._sleeping || p._jump || p.alt > 1 || (p._task && !CALM_TASKS.includes(p._task.type) && p._task.partner !== c.id)) { this.endTask(c); break; }
        if (!tk.kind) {
          const fresh = c.newUntil > this.absMin() || p.newUntil > this.absMin();
          tk.kind = fresh ? 'sniff' : pick(['groom', 'groom', 'chase']);
          if (tk.kind === 'chase') {
            this.setTask(p, 'flee', { partner: c.id });
            c._task = Object.assign({ type: 'pursue', ph: 0, t: 0, sp: 0, partner: p.id });
            break;
          }
          this.setTask(p, 'held', { partner: c.id });
        }
        if (tk.ph === 0) {
          const side = c.x < p.x ? -1 : 1;
          if (this.go(c, p.x + side * 30, p.z, dt)) { tk.ph = 1; tk.t = 0; c.facing = -side; p.facing = side; }
        } else {
          if (tk.kind === 'groom') { c._pose = 'groom'; if (Math.random() < dt) this.hearts(c); }
          else c._pose = 'sit';
          if (tk.t > 5) {
            if (tk.kind === 'groom') { c.stats.happy += 8; p.stats.happy += 8; }
            this.endTask(c);
          }
        }
        break;
      }
      case 'held': {
        if (!this.catById(tk.partner) || tk.t > 12) { this.endTask(c); break; }
        c._pose = c.alt > 0.5 ? c._pose : 'loaf';
        break;
      }
      case 'flee': case 'pursue': {
        if (tk.t > 6) { this.endTask(c); break; }
        if (tk.type === 'flee') {
          if (tk.tx == null || this.go(c, tk.tx, tk.tz, dt, 105)) { tk.tx = rand(30, this.worldW() - 30); tk.tz = rand(0.1, 0.95); }
        } else {
          const p = this.catById(tk.partner);
          if (!p) { this.endTask(c); break; }
          this.go(c, p.x - 20 * p.facing, p.z, dt, 98);
        }
        break;
      }
      case 'hiss': {
        c._pose = 'hiss';
        if (tk.t > 1.8) this.endTask(c);
        break;
      }
      case 'runAway': {
        if (this.go(c, tk.x, tk.z, dt, 110)) this.endTask(c);
        break;
      }
      default: this.endTask(c);
    }
  },

  rewardPlay(c) {
    const st = c.stats, d = c.daily;
    st.happy += 15; st.energy -= 8; st.bond += 1 * PERS[c.pers].bondMul;
    this.hearts(c, 2);
    d.play = (d.play || 0) + 1;
    this.track('play');
    if (d.play <= CFG.PLAY_DAILY) this.addCoins(CFG.PLAY_REWARD, c.x, this.catY(c) - 60);
  },

  updateNewcomers(dt) {
    const S = this.state, now = this.absMin();
    for (const c of S.cats) {
      if (!(c.newUntil > now) || c._sleeping || c._hidden || c.alt > 1) continue;
      if ((c._hissCool = (c._hissCool || 0) - dt) > 0) continue;
      const o = S.cats.find(o => o !== c && !o._sleeping && !o._hidden && o.alt < 1 && Math.abs(o.x - c.x) < 45 && Math.abs(o.z - c.z) < 0.25);
      if (o && Math.random() < dt * 1.5) {
        c._hissCool = 40; o._hissCool = 40;
        [c, o].forEach(k => { this.setTask(k, 'hiss'); });
        c.facing = o.x > c.x ? 1 : -1; o.facing = -c.facing;
        Sound.play('hiss', { pitch: c.pitch });
      }
    }
  },

  // ---------- 장난감 ----------
  updateToys(dt) {
    const S = this.state, W = this.worldW();
    const b = S.ball;
    if (b && !this.ballHeld) {
      b.x += b.vx * dt; b.z += b.vz * dt;
      const fr = Math.pow(0.35, dt); b.vx *= fr; b.vz *= fr;
      if (b.x < 12 || b.x > W - 12) { b.vx *= -1; b.x = clamp(b.x, 12, W - 12); }
      if (b.z < 0.02 || b.z > 1) { b.vz *= -1; b.z = clamp(b.z, 0.02, 1); }
      b.rot = (b.rot || 0) + b.vx * dt / 7;
    }
    for (const f of this.furn('mouse')) {
      if (!f._active) {
        f._next = (f._next == null ? rand(15, 35) : f._next) - dt;
        if (f._next <= 0) { f._active = 10; f._vx = rand(50, 80) * (Math.random() < 0.5 ? -1 : 1); f._vz = rand(-0.3, 0.3); }
      } else {
        f._active -= dt;
        f.x += f._vx * dt; f.z += f._vz * dt;
        if (Math.random() < dt * 0.8) { f._vx = rand(50, 80) * (Math.random() < 0.5 ? -1 : 1); f._vz = rand(-0.3, 0.3); }
        if (f.x < 20 || f.x > W - 20) { f._vx *= -1; f.x = clamp(f.x, 20, W - 20); }
        if (f.z < 0.05 || f.z > 0.98) { f._vz *= -1; f.z = clamp(f.z, 0.05, 0.98); }
        if (f._active <= 0) { f._active = 0; f._next = rand(30, 60); }
      }
    }
    for (const f of this.furn('feather')) {
      if (!f._active) { f._next = (f._next == null ? rand(20, 40) : f._next) - dt; if (f._next <= 0) { f._active = 9; } }
      else { f._active -= dt; if (f._active <= 0) { f._active = 0; f._next = rand(30, 60); } }
    }
    // 낚싯대/레이저: 관심 있는 고양이 끌어오기
    if (this.lure) {
      this.lure.moving = (this.t - (this.lure.movedAt || 0)) < 0.35;
      if ((this.lure.recruit = (this.lure.recruit || 0) - dt) <= 0) {
        this.lure.recruit = 1.5;
        for (const c of S.cats) {
          if (c._task && ['lure', 'eat', 'litter', 'snack', 'hiss'].includes(c._task.type)) continue;
          if (c._hidden && !c._sleeping) continue;
          const P = PERS[c.pers];
          const chance = c._sleeping ? 0.05 : (c.stats.energy > 15 ? 0.35 * P.play : 0.05);
          if (Math.random() < chance) this.setTask(c, 'lure');
        }
      }
    }
  },

  // ---------- 길고양이 ----------
  updateStray() {
    const S = this.state;
    if (this.stray) {
      if (S.minute > 21 * 60) { this.stray = null; S.strayNextDay = S.day + 1; this.emit('strayGone'); }
      return;
    }
    if (S.cats.length >= this.maxCats()) return;
    const idx = Math.min(S.strayIdx, CFG.STRAY_DAYS.length - 1);
    if (S.strayIdx < CFG.STRAY_DAYS.length && S.day < CFG.STRAY_DAYS[S.strayIdx]) return;
    if (S.day < S.strayNextDay) return;
    if (this.maxBond() < CFG.STRAY_BOND[idx]) return;
    if (S.minute < 9 * 60 || S.minute > 20 * 60) return;
    this.stray = { coat: pick(Object.keys(COATS)), eye: pick(Object.keys(EYES)) };
    Sound.play('beg', { pitch: 1.15 });
    this.emit('strayArrived');
  },

  // ---------- 플레이어 행동 ----------
  fillBowl() {
    const S = this.state, cap = this.bowlCap();
    if (S.bowl >= cap) { this.emit('toast', '밥그릇이 이미 가득 차 있어요'); return false; }
    S.bowl = cap;
    if (this.furn('bowl')[0]) this.fx.push({ kind: 'pour', what: 'food', f: this.furn('bowl')[0], t: 0, dur: 1.5 });
    Sound.play('bowl');
    const b = this.furn('bowl')[0];
    // 배고픈 고양이는 바로 달려옴
    S.cats.forEach(c => {
      if (c.stats.hunger >= 85 || c._hidden && !c._sleeping) return;
      if (c._task && (BUSY_TASKS.includes(c._task.type) || ['eat', 'snack', 'litter'].includes(c._task.type))) return;
      if (c._sleeping && (c.stats.energy < 45 || Math.random() < 0.4)) return;   // 깊이 자는 고양이는 그대로
      this.cheer(c, 'foodcall');
      this.setTask(c, 'eat', { excited: true });
    });
    this.emit('hud'); this.emit('fed');
    return true;
  },

  // 먹이를 보고 신난 반응
  cheer(c, key) {
    this.floatText(c.x, this.catY(c) - 70 * depthScale(c.z) * CAT_SIZE, '❗', 15, 0.9);
    this.meow(c, Math.random() < 0.5 ? 'trill' : 'meow'); c._mouthT = 0.5;
    this.say(c, key, true);
  },

  // ---------- 간식을 쥔 손 ----------
  startSnackHand(kind, nearCat) {
    const x = nearCat ? nearCat.x + (nearCat.x < this.cam + this.viewW / 2 ? 70 : -70) : this.cam + this.viewW / 2;
    this.snackHand = { kind, x, y: CFG.FLOOR_Y0 + 10, recruit: 0, cool: {} };
  },
  moveSnackHand(x, y) {
    const H = this.snackHand; if (!H) return;
    H.x = clamp(x, this.cam + 10, this.cam + this.viewW - 10); H.y = clamp(y, -this.offY + 20, CFG.ROOM_H - 8); H.movedAt = this.t;
  },
  // 고양이 입 위치 (현재 자세의 머리 위치에서 계산)
  mouthOf(c) {
    const L = catLayout(c._pose || 'sit', c._anim || 0), s = depthScale(c.z) * CAT_SIZE, h = L.head;
    const mx = (L.view === 'front' ? h.x : h.x + h.r * 0.22) * c.facing, my = h.y + h.r * 0.4;
    return { x: c.x + mx * s, y: this.catY(c) + my * s };
  },
  updateSnackHand(dt) {
    const H = this.snackHand; if (!H) return;
    const S = this.state;
    // 입에 닿으면 그 고양이가 먹음
    for (const c of S.cats) {
      if (c._hidden || c._jump || c._sleeping && Math.abs(c.x - H.x) > 40) continue;
      const m = this.mouthOf(c), r = 20 * depthScale(c.z);
      if (Math.hypot(m.x - H.x, m.y - H.y) < r && !(H.cool[c.id] > this.t)) {
        H.cool[c.id] = this.t + 1.5;
        if (this.giveSnack(c, H.kind)) { this.snackHand = null; this.emit('snackGiven'); return; }
      }
    }
    // 간식 냄새를 맡은 고양이들이 쳐다보고 다가옴
    if ((H.recruit -= dt) <= 0) {
      H.recruit = 0.5;
      for (const c of S.cats) {
        if (c._hidden || c._jump) continue;
        if (c._sleeping && (c.stats.energy < 45 || H.woke && H.woke[c.id])) continue;
        if (c._task && !CALM_TASKS.concat(['wantSnack', 'perch', 'box', 'sleep', 'hammock', 'hideout', 'wheel', 'drink', 'ballplay', 'feather', 'mouseChase']).includes(c._task.type)) continue;
        if (!c._task || c._task.type !== 'wantSnack') {
          if (c._sleeping) { H.woke = H.woke || {}; H.woke[c.id] = true; if (Math.random() < 0.5) continue; }
          this.setTask(c, 'wantSnack', { slot: S.cats.indexOf(c) });
          this.cheer(c, 'snackcall');
        }
      }
    }
  },

  // ---------- 도마뱀 ----------
  updateLizard(dt) {
    const S = this.state, now = this.absMin();
    let L = this.lizard;
    if (!L) {
      if (S.tut && S.tut <= 3) return;
      if (this._lizNext == null) this._lizNext = now + rand(40, 120);
      if (now < this._lizNext || this.isNight()) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      L = this.lizard = { x: side < 0 ? 12 : this.worldW() - 12, z: rand(0.35, 0.95), y: null, state: 'roam', dir: -side, life: LIZARD.LIFE, pause: 0.6, recruit: 0.3 };
      L.tx = L.x - side * rand(80, 200); L.tz = rand(0.3, 1);
      this.emit('toast', '🦎 도마뱀이 나타났어요!');
      const watcher = S.cats.filter(c => !c._sleeping).sort((a, b) => Math.abs(a.x - L.x) - Math.abs(b.x - L.x))[0];
      if (watcher) { this.say(watcher, 'lizard', true); this.meow(watcher, 'trill'); }
      return;
    }
    const W = this.worldW();
    if (L.state === 'roam') {
      L.life -= dt;
      // 가까운 고양이에게서 달아나며 멈췄다 달렸다
      const near = S.cats.find(c => !c._sleeping && c.alt < 1 && Math.hypot(c.x - L.x, (c.z - L.z) * 140) < 55);
      if (near && L.pause <= 0 && !L.flee) { L.flee = 1; L.tx = clamp(L.x + (L.x > near.x ? 1 : -1) * rand(90, 160), 15, W - 15); L.tz = clamp(L.z + rand(-0.3, 0.3), 0.25, 1); }
      if (L.pause > 0) L.pause -= dt;
      else {
        const sp = L.flee ? 190 : 120, dx = L.tx - L.x, dz = (L.tz - L.z) * 140, d = Math.hypot(dx, dz);
        if (d < 4) { L.flee = 0; L.pause = rand(0.4, 1.6); L.tx = clamp(L.x + rand(-160, 160), 15, W - 15); L.tz = rand(0.25, 1); }
        else { const st = Math.min(d, sp * dt); L.x += dx / d * st; L.z += dz / d * st / 140; if (Math.abs(dx) > 1) L.dir = dx > 0 ? 1 : -1; }
      }
      L.moving = L.pause <= 0;
      if (L.life <= 0) this.lizardEscape(L.x, L.z);
      if ((L.recruit -= dt) <= 0) {
        L.recruit = 1;
        for (const c of S.cats) {
          if (c._sleeping || c._hidden || c._jump) continue;
          if (c._task && !CALM_TASKS.concat(['perch', 'box', 'wantSnack']).includes(c._task.type)) continue;
          if (Math.random() < 0.3 + 0.25 * PERS[c.pers].play) this.setTask(c, 'hunt');
        }
      }
    } else if (L.state === 'escape') {
      // 창문 쪽으로 달려가서 벽을 타고 창밖으로
      if (L.y == null) {
        const dx = CFG.WINDOW_X - L.x, dz = (0 - L.z) * 140, d = Math.hypot(dx, dz);
        if (d < 4) L.y = floorY(0);
        else { const st = Math.min(d, 170 * dt); L.x += dx / d * st; L.z += dz / d * st / 140; L.dir = dx > 0 ? 1 : -1; }
      } else {
        L.y -= 90 * dt;
        if (L.y < 170) { this.lizard = null; this._lizNext = now + rand(...LIZARD.GAP); }
      }
      L.moving = true;
    }
  },
  lizardEscape(x, z) {
    const L = this.lizard; if (!L) return;
    Object.assign(L, { state: 'escape', x, z, y: null, by: null });
    this.state.cats.forEach(c => { if (c._task && c._task.type === 'hunt') this.endTask(c); });
  },
  praiseCatch(c) {
    if (!c._task || c._task.type !== 'showOff') return false;
    const P = PERS[c.pers];
    c.stats.happy = clamp(c.stats.happy + 10, 0, 100);
    c.stats.bond = clamp(c.stats.bond + LIZARD.PRAISE_BOND * P.bondMul, 0, 100);
    this.addCoins(LIZARD.PRAISE_COINS, c.x, this.catY(c) - 70);
    this.hearts(c, 4); this.meow(c, 'trill');
    this.say(c, 'praised', true);
    this.lizardEscape(c.x + c.facing * 20, c.z);
    this.track('lizard');
    this.emit('toast', '🦎 도마뱀은 다치지 않고 창밖으로 돌아갔어요');
    this.endTask(c);
    return true;
  },

  refreshWater() {
    const S = this.state, f = this.furn('water')[0];
    if (S.water > 80) { this.emit('toast', '💧 물이 아직 깨끗해요'); return false; }
    const wasLow = S.water < 40;
    S.water = 100;
    if (f) this.fx.push({ kind: 'pour', what: 'water', f, t: 0, dur: 1.5 });
    Sound.play('bowl', { pitch: 0.6 }); Sound.play('scoop', { vol: 0.4, pitch: 1.4 });
    if (f && wasLow) this.addCoins(1, f.x, floorY(f.z) - 40);
    this.track('water');
    this.emit('hud'); this.emit('water');
    return true;
  },

  giveSnack(c, kind) {
    const S = this.state, sn = SNACKS[kind];
    if ((S.inv[kind] || 0) <= 0) { this.emit('toast', `${sn.icon} ${sn.name}${josa(sn.name, '이', '가')} 없어요. 상점에서 사주세요`); return false; }
    const used = c.daily[kind] || 0;
    if (used >= sn.limit) {
      this.say(c, 'refuse', true);
      this.emit('toast', `😾 ${sn.name}는 하루 ${sn.limit}번까지예요 (${used}/${sn.limit})`);
      if (!c._sleeping && c.alt < 1) { this.setTask(c, 'idle'); c._task.pose = 'sit'; c._task.dur = 2; c.facing *= -1; }
      return false;
    }
    if (c._hidden) { this.emit('toast', '숨숨집 안에 숨어 있어요'); return false; }
    S.inv[kind]--; c.daily[kind] = used + 1;
    this.fulfill(c, 'snack');
    this.track('snack');
    this.setTask(c, 'snack', { kind });
    this.fx.push({ kind: 'feed', cat: c, snack: kind, t: 0, dur: 3.1 });
    this.emit('hud');
    return true;
  },

  scatterCatnip(x, z) {
    const S = this.state;
    if (S.catnipDay === S.day) { this.emit('toast', '🌿 캣잎은 하루에 한 번만 줄 수 있어요'); return false; }
    if ((S.inv.catnip || 0) <= 0) { this.emit('toast', '🌿 캣잎이 없어요. 상점에서 사주세요'); return false; }
    S.inv.catnip--; S.catnipDay = S.day;
    this.catnip = { x, z, t: 40 };
    this.fx.push({ kind: 'sprinkle', x, z, t: 0, dur: 1.4 });
    Sound.play('rustle');
    S.cats.forEach(c => { if (!c._sleeping || Math.random() < 0.6) this.setTask(c, 'catnip'); });
    this.emit('hud');
    return true;
  },

  startToolHand(kind) {
    this.toolHand = { kind, x: this.cam + this.viewW / 2, y: CFG.FLOOR_Y0 + 20 };
    if (kind === 'ball') this.pickBall();
  },
  endToolHand() {
    if (this.ballHeld) this.dropBall(0, 0);
    this.toolHand = null;
  },
  moveToolHand(x, y) {
    const T = this.toolHand; if (!T) return;
    T.x = clamp(x, this.cam + 10, this.cam + this.viewW - 10); T.y = clamp(y, -this.offY + 20, CFG.ROOM_H - 8);
  },
  pickBall() {
    const S = this.state;
    if (!S.ball) S.ball = { x: 0, z: 0.5, vx: 0, vz: 0 };
    this.ballHeld = true;
    this.state.cats.forEach(c => { if (c._task && c._task.type === 'ballplay') this.endTask(c); });
  },
  // 손을 놓은 자리에서 손을 움직이던 방향으로 공이 날아감
  dropBall(vx, vy) {
    const S = this.state, T = this.toolHand, b = S.ball;
    if (!b || !this.ballHeld) return;
    this.ballHeld = false;
    b.x = T ? T.x : b.x; b.z = T ? clamp(this.zFromY(T.y + 20), 0.02, 1) : b.z;
    b.vx = clamp(vx * 0.9, -260, 260); b.vz = clamp(vy / CFG.FLOOR_DEPTH * 0.9, -1.6, 1.6);
    if (Math.hypot(vx, vy) > 40) {
      this.fx.push({ kind: 'toss', x: b.x, z: b.z, dir: vx >= 0 ? 1 : -1, t: 0, dur: 0.6 });
      Sound.play('pop', { vol: 0.5 });
      S.cats.forEach(c => { if (!c._sleeping && c.stats.energy > 20 && Math.random() < 0.55 * PERS[c.pers].play && (!c._task || !['eat', 'litter', 'snack'].includes(c._task.type))) { this.setTask(c, 'ballplay'); c._task.byOwner = true; } });
    }
  },

  throwBall(x, z) {
    const S = this.state;
    if (!S.ball) S.ball = { x, z, vx: 0, vz: 0 };
    const b = S.ball;
    this.fx.push({ kind: 'toss', x: b.x, z: b.z, dir: x >= b.x ? 1 : -1, t: 0, dur: 0.6 });
    b.vx = (x - b.x) * 1.6; b.vz = (z - b.z) * 1.6;
    Sound.play('pop', { vol: 0.5 });
    S.cats.forEach(c => { if (!c._sleeping && c.stats.energy > 20 && Math.random() < 0.5 * PERS[c.pers].play && (!c._task || !['eat', 'litter', 'snack'].includes(c._task.type))) { this.setTask(c, 'ballplay'); c._task.byOwner = true; } });
  },

  callCats(x) {
    this.call = { x };
    this.state.cats.forEach((c, i) => {
      if (c._sleeping || c._hidden) return;
      if (c._task && ['eat', 'litter', 'snack', 'toOwner', 'hiss'].includes(c._task.type)) return;
      const P = PERS[c.pers];
      const chance = clamp(0.25 * P.approach + c.stats.bond / 200, 0.05, 0.95) * (c.stats.happy < 20 ? 0.3 : 1);
      if (Math.random() < chance) this.setTask(c, 'toOwner', { off: (i % 2 ? 1 : -1) * (14 + i * 10) });
    });
  },

  // 쓰다듬기
  petStart(c, brush) {
    if (c._hidden || c._jump) return false;
    if (c._task && BUSY_TASKS.includes(c._task.type)) return false;
    this.pet = { cat: c, total: 0, heartT: 0, moving: 0, bonus: c._awaitPet, brush: !!brush };
    c._awaitPet = false;
    Sound.startPurr();
    return true;
  },
  petMove(dist) { if (this.pet) this.pet.moving = 0.3; },
  petTick(dt) {
    const p = this.pet; if (!p) return;
    const c = p.cat, P = PERS[c.pers];
    if (p.moving > 0) {
      p.moving -= dt; p.total += dt;
      c.stats.happy = clamp(c.stats.happy + 4 * dt, 0, 100);
      c.stats.bond = clamp(c.stats.bond + 0.12 * dt * P.bondMul, 0, 100);
      if ((p.heartT -= dt) <= 0) {
        p.heartT = 0.45;
        if (p.brush) this.floatText(c.x + rand(-18, 18), this.catY(c) - 30 * depthScale(c.z), '✨', 12, 1);
        else this.hearts(c);
      }
      if (this.state.settings.vibrate && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive) && (p.vibT = (p.vibT || 0) - dt) <= 0) { p.vibT = 0.5; try { navigator.vibrate(18); } catch (e) {} }
    }
    if (p.total >= 3 && !p.rewarded) {
      p.rewarded = true;
      this.fulfill(c, p.brush ? 'brush' : 'pet');
      this.track(p.brush ? 'brush' : 'pet');
      if (p.brush) c.stats.happy = clamp(c.stats.happy + 8, 0, 100);
      this.emit('petDone');
      this.say(c, 'pet');
      if (this.absMin() - c.lastPetReward >= CFG.PET_REWARD_COOLDOWN_MIN) {
        c.lastPetReward = this.absMin();
        c.stats.bond = clamp(c.stats.bond + 1 * P.bondMul + (p.bonus ? 1.5 * P.bondMul : 0), 0, 100);
        this.addCoins(1, c.x, this.catY(c) - 60);
        if (p.bonus) this.floatText(c.x, this.catY(c) - 80, '친밀도 보너스!', 11);
      }
    }
    const limit = c.pers === 'tsun' ? 6 : 9;
    if (p.total > limit && !p.biteChecked) {
      p.biteChecked = true;
      if (Math.random() < 0.4 && !c._sleeping) {
        this.petEnd();
        Sound.play('meow', { pitch: c.pitch * 1.25 });
        c.stats.happy -= 5;
        this.say(c, 'bite', true);
        this.setTask(c, 'runAway', { x: clamp(c.x + (Math.random() < 0.5 ? -160 : 160), 30, this.worldW() - 30), z: rand(0.1, 0.6) });
      }
    }
  },
  petEnd() {
    if (!this.pet) return;
    this.pet = null;
    Sound.stopPurr();
  },

  // ---------- 터치 판정 ----------
  hitCat(wx, wy) {
    let best = null;
    for (const c of this.state.cats) {
      if (c._hidden) continue;
      const s = depthScale(c.z), cy = this.catY(c);
      // 박스·화장실 안에 있을 때 아랫부분(가구 앞면)은 가구를 잡는 자리
      if (c._inside && c._inside.type !== 'hammock' && wy > floorY(c._inside.z) - 24 * depthScale(c._inside.z)) continue;
      if (Math.abs(wx - c.x) < 40 * s && wy > cy - 80 * s && wy < cy + 8) {
        if (!best || c.z > best.z) best = c;
      }
    }
    return best;
  },
  furnBox(f) {
    const B = { bowl: [26, 26], water: [24, 26], litter: [42, 34], wheel: [62, 140], scratcher: [22, 90], box: [36, 42], hideout: [38, 62],
      tunnel: [64, 36], tower: [42, 210], bigtower: [58, 345], cattree: [52, 285], sofa: [88, 84], table: [100, 120], lamp: [24, 212], feather: [22, 95], mouse: [12, 14] }[f.type];
    if (f.type === 'hammock') return { x0: f.x - 42, x1: f.x + 42, y0: floorY(f.z) - 180, y1: floorY(f.z) - 110 };
    if (!B) return null;
    const s = depthScale(f.z), y = floorY(f.z);
    return { x0: f.x - B[0] * s, x1: f.x + B[0] * s, y0: y - B[1] * s, y1: y + 4 };
  },
  hitFurn(wx, wy, types) {
    const list = this.state.furniture.filter(f => !types || types.includes(f.type)).sort((a, b) => b.z - a.z);
    return list.find(f => { const b = this.furnBox(f); return b && wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1; });
  },
  hitPoop(wx, wy) {
    return this.state.poops.findIndex(p => Math.abs(p.x - wx) < 18 && Math.abs(floorY(p.z) - 4 - wy) < 18);
  },
  hitWindow(wx, wy) { return Math.abs(wx - CFG.WINDOW_X) < 66 && wy > 50 && wy < 180; },

  placeFurniture(type, wx, wy) {
    const S = this.state, it = ITEMS[type];
    const x = clamp(wx, 40, this.worldW() - 40);
    let f;
    if (type === 'hammock') f = { id: 'f' + Date.now(), type: 'hammock', x, z: -0.02 };
    else if (type === 'litter2') f = { id: 'f' + Date.now(), type: 'litter', v: 2, x, z: clamp(this.zFromY(wy), 0.02, 0.9), clumps: [] };
    else f = { id: 'f' + Date.now(), type, x, z: clamp(this.zFromY(wy), 0.02, 0.9) };
    S.furniture.push(f);
    Sound.play('pop');
    this.save();
    return f;
  },
  // 가구를 손으로 집어서 옮기기
  dragStart(f) {
    this.state.cats.forEach(c => { if (c._spotFurn === f || c._inside === f || (c._task && (c._task.furn === f || c._task.box === f || c._task.slotFurn === f || (c._task.spot && c._task.spot.tower === f)))) { this.endTask(c); this.endInside(c); if (c.alt > 0.5) this.startJump(c, c.x + 30, 0); } });
    f._occupant = null; f._drag = true;
    if (f.type === 'mouse') f._active = 0;
    Sound.play('pop', { pitch: 1.2, vol: 0.5 });
  },
  dragMove(f, wx, wy) {
    f.x = clamp(wx, 30, this.worldW() - 30);
    if (f.type !== 'hammock') f.z = clamp(this.zFromY(wy), 0.02, f.type === 'bowl' || f.type === 'water' ? 1 : 0.9);
  },
  dragEnd(f) {
    f._drag = false;
    Sound.play('pop', { pitch: 0.8, vol: 0.5 });
    this.floatText(f.x, floorY(f.z) - 20, '✨', 14, 0.8);
    this.save();
  },

  moveFurniture(f, wx, wy) {
    f.x = clamp(wx, 40, this.worldW() - 40);
    if (f.type !== 'hammock') f.z = clamp(this.zFromY(wy), 0.02, f.type === 'bowl' ? 1 : 0.9);
    // 그 가구를 쓰던 고양이는 내려옴
    this.state.cats.forEach(c => { if (c._spotFurn === f || (c._task && (c._task.furn === f || c._task.box === f || (c._task.spot && c._task.spot.tower === f)))) { this.endTask(c); this.endInside(c); c.alt = 0; } });
    f._occupant = null;
    Sound.play('pop');
    this.save();
  },

  // ---------- 렌더링 ----------
  render() {
    const g = this.g, S = this.state, k = this.dpr * this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(k, 0, 0, k, -this.cam * k, this.offY * k);
    const W = this.worldW(), night = this.nightAmt();
    this.now = this.absMin();
    this.drawRoom(g, W, night);

    const list = [];
    for (const f of S.furniture) list.push({ z: f.z, l: 0, f });
    S.poops.forEach(p => list.push({ z: p.z, l: 0.5, poop: p }));
    if (S.ball && !this.ballHeld) list.push({ z: S.ball.z, l: 0.6, ball: S.ball });
    if (this.lizard && this.lizard.state !== 'caught') list.push({ z: this.lizard.y == null ? this.lizard.z : -0.05, l: 0.7, liz: this.lizard });
    if (this.catnip) list.push({ z: this.catnip.z, l: 0.4, nip: this.catnip });
    for (const c of S.cats) list.push({ z: c._inside ? c._inside.z : c.z, l: 1, c });
    list.sort((a, b) => a.z - b.z || a.l - b.l);
    for (const it of list) {
      if (it.f) this.drawFurn(g, it.f);
      else if (it.c) this.drawCat(g, it.c);
      else if (it.poop) { const p = it.poop, y = floorY(p.z); g.save(); g.translate(p.x, y); g.fillStyle = '#8a5a35'; ell(g, 0, -3, 8, 4); g.fill(); ell(g, 1, -7, 5.5, 3.5); g.fill(); ell(g, 2, -10, 3, 2.5); g.fill(); g.restore(); }
      else if (it.ball) this.drawBall(g, it.ball);
      else if (it.liz) {
        const L = it.liz, s = depthScale(L.y == null ? L.z : 0);
        g.save(); g.translate(L.x, L.y == null ? floorY(L.z) - 1 : L.y);
        if (L.y != null) g.rotate(-Math.PI / 2);
        g.scale(L.dir * s * 1.5, s * 1.5); drawLizard(g, this.t, L.moving, false); g.restore();
      }
      else if (it.nip) {
        const n = it.nip, y = floorY(n.z);
        for (let i = 0; i < 7; i++) { const a = i * 2.4; g.save(); g.translate(n.x + Math.cos(a) * 14, y - 2 + Math.sin(a) * 4); g.rotate(a); ell(g, 0, 0, 5, 2.4); g.fillStyle = '#5cb85c'; g.fill(); g.restore(); }
      }
    }
    // 말풍선끼리 겹치면 위로 쌓음
    const placed = [];
    const fit = (x, top, w, h) => {
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(p => x < p.x + p.w && x + w > p.x && top < p.y + p.h && top + h > p.y);
        if (!hit) break;
        top = hit.y - h - 3;
      }
      placed.push({ x, y: top, w, h });
      return top;
    };
    // 고양이 말풍선
    for (const c of S.cats) {
      if (!c._say || c._say.until < this.t || c._hidden) continue;
      const K = this.uiK || 1, s = depthScale(c.z), txt = c._say.text;
      g.font = `${11 * K}px "Jua", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      // 길면 두 줄로
      let lines = [txt];
      if (txt.length > 11) { const mid = Math.floor(txt.length / 2); let cut = txt.lastIndexOf(' ', mid); if (cut < 3) cut = txt.indexOf(' ', mid); if (cut > 0) lines = [txt.slice(0, cut), txt.slice(cut + 1)]; }
      const lh = 14 * K, bw = Math.max(...lines.map(l => g.measureText(l).width)) + 16 * K, bh = lines.length * lh + 9 * K;
      const bx = clamp(c.x - bw / 2, this.cam + 4, this.cam + this.viewW - bw - 4);
      const top = fit(bx, this.catY(c) - 84 * s * CAT_SIZE - 8 * K - bh, bw, bh + 7 * K);
      g.globalAlpha = Math.min(1, (c._say.until - this.t) * 3);
      rrect(g, bx, top, bw, bh, 10 * K); g.fillStyle = '#fffaf3'; g.fill();
      g.strokeStyle = '#f2b3c4'; g.lineWidth = 1.6 * K; g.stroke();
      g.beginPath(); g.moveTo(c.x - 4 * K, top + bh - 1); g.lineTo(c.x, top + bh + 7 * K); g.lineTo(c.x + 4 * K, top + bh - 1); g.fillStyle = '#fffaf3'; g.fill();
      g.fillStyle = '#5a3b2e';
      lines.forEach((l, i) => g.fillText(l, bx + bw / 2, top + 5 * K + lh * (i + 0.5)));
      g.globalAlpha = 1;
    }
    // 부탁 말풍선
    for (const c of S.cats) {
      if (!c.req || c._hidden) continue;
      if (c._say && c._say.until > this.t) continue;
      if (c._task && (c._task.type === 'wantSnack' || (c._task.type === 'eat' && c._task.excited))) continue;   // 먹이에 정신 팔린 동안은 숨김
      const rq = REQUESTS[c.req.type], s = depthScale(c.z);
      const K = this.uiK || 1;
      const y0 = this.catY(c) - 84 * s * CAT_SIZE - 12 * K + Math.sin(this.t * 4) * 2.5, txt = `${rq.icon} ${((LINES[c.pers] || LINES.dog).req || {})[c.req.type] || rq.text}`;
      g.font = `${12 * K}px "Jua", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(txt).width + 18 * K, hurry = c.req.until - this.now < 40;
      const y = fit(c.x - w / 2, y0 - 12 * K, w, 31 * K) + 12 * K;
      rrect(g, c.x - w / 2, y - 12 * K, w, 24 * K, 12 * K); g.fillStyle = hurry ? '#ffe1e8' : '#fff'; g.fill();
      g.strokeStyle = '#ff8fab'; g.lineWidth = 2 * K; g.stroke();
      g.beginPath(); g.moveTo(c.x - 5 * K, y + 11 * K); g.lineTo(c.x, y + 19 * K); g.lineTo(c.x + 5 * K, y + 11 * K); g.fillStyle = hurry ? '#ffe1e8' : '#fff'; g.fill();
      g.fillStyle = '#5a3b2e'; g.fillText(txt, c.x, y + 1);
    }
    // 머리 위 아이콘
    for (const c of S.cats) {
      if (!c._icon || c._hidden || c.req || (c._say && c._say.until > this.t)) continue;
      const K = this.uiK || 1, s = depthScale(c.z), y = this.catY(c) - 82 * s * CAT_SIZE - 10 * K + Math.sin(this.t * 3) * 2;
      g.fillStyle = 'rgba(255,255,255,0.92)'; circ(g, c.x, y, 10 * K); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.stroke();
      g.font = `${12 * K}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c._icon, c.x, y + 1);
    }
    // 밤 조명
    if (night > 0) {
      g.fillStyle = `rgba(24,26,70,${0.38 * night})`;
      g.fillRect(0, -this.offY - 2, W, CFG.ROOM_H + this.offY + 2);
      g.save(); g.globalCompositeOperation = 'lighter';
      this.furn('lamp').forEach(f => {
        const s = depthScale(f.z), lx = f.x, ly = floorY(f.z) - 180 * s;
        const grd = g.createRadialGradient(lx, ly, 5, lx, ly, 220);
        grd.addColorStop(0, `rgba(255,200,120,${0.42 * night})`); grd.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = grd; g.fillRect(lx - 220, ly - 220, 440, 440);
      });
      g.restore();
    }
    // 장난감 표시
    if (this.lure) {
      const L = this.lure;
      if (L.type === 'laser') {
        const hx = clamp(L.x + 70, this.cam + 30, this.cam + this.viewW - 20), hy = Math.min(L.y + 70, CFG.ROOM_H - 30);
        const ang = Math.atan2(L.y - hy, L.x - hx);
        const tx = hx + Math.cos(ang) * 26, ty = hy + Math.sin(ang) * 26;
        g.strokeStyle = 'rgba(255,70,70,0.22)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(tx, ty); g.lineTo(L.x, L.y); g.stroke();
        g.save(); g.translate(hx, hy); g.rotate(ang + Math.PI / 2); drawLaserPen(g); g.restore();
        g.save(); g.translate(hx + 4, hy + 6); g.scale(0.8, 0.8); drawHand(g, 'grab', 0); g.restore();
        g.save(); g.globalCompositeOperation = 'lighter';
        const grd = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, 9); grd.addColorStop(0, 'rgba(255,40,40,1)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = grd; circ(g, L.x, L.y, 9); g.fill(); g.restore();
      } else {
        const wob = Math.sin(this.t * 9) * (L.moving ? 3 : 1);
        const hx = L.x + 62, hy = Math.max(L.y - 105, -this.offY + 40);
        const tipx = hx - 44, tipy = hy - 22 + wob;
        g.strokeStyle = '#b07a45'; g.lineWidth = 3.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx + 6, hy + 8); g.lineTo(tipx, tipy); g.stroke();
        g.strokeStyle = 'rgba(90,70,50,0.7)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(tipx, tipy); g.quadraticCurveTo(tipx - (tipx - L.x) * 0.3, (tipy + L.y) / 2 + 14, L.x, L.y - 8); g.stroke();
        g.save(); g.translate(hx + 4, hy + 4); g.scale(0.85, 0.85); drawHand(g, 'grab', wob * 0.02); g.restore();
        ['#ff8fb1', '#ffd36b', '#8fd3ff'].forEach((col, i) => { g.save(); g.translate(L.x, L.y); g.rotate(-0.6 + i * 0.6 + Math.sin(this.t * 10) * 0.2); ell(g, 0, 6, 3.5, 10); g.fillStyle = col; g.fill(); g.restore(); });
      }
    }
    if (this.call) {
      const r = 16 + Math.sin(this.t * 6) * 2.5;
      g.fillStyle = 'rgba(255,170,200,0.35)'; circ(g, this.call.x, this.call.y, r); g.fill();
    }
    // 플레이어 손 / 빗 (손가락에 가리지 않게 조금 위에 그림)
    const H = this.hand;
    if (H) {
      const moving = this.t - (H.movedAt || 0) < 0.25;
      const wob = H.kind === 'call' ? Math.sin(this.t * 7) * 0.18 : moving ? Math.sin(this.t * 16) * 0.16 : 0;
      g.save(); g.translate(H.x, H.y - 14); g.scale(0.95 * this.hk, 0.95 * this.hk);
      if (H.kind === 'brush') drawBrushHand(g, wob); else drawHand(g, H.kind, wob);
      g.restore();
    }
    if (this.lizard && this.lizard.state === 'caught') {
      const c = this.catById(this.lizard.by);
      if (c && !c._hidden) { const m = this.mouthOf(c), s = depthScale(c.z); g.save(); g.translate(m.x, m.y + 4); g.scale(c.facing * s * 1.3, s * 1.3); drawLizard(g, this.t, true, true); g.restore(); }
    }
    this.drawFx(g);
    const T = this.toolHand;
    if (T && !this.hand) {
      g.save(); g.translate(T.x, T.y - 14 + Math.sin(this.t * 3) * 1.5); g.scale(0.95 * this.hk, 0.95 * this.hk);
      if (T.kind === 'brush') drawBrushHand(g, 0); else drawBallHand(g, this.ballHeld, this.t);
      g.restore();
    }
    if (this.snackHand) {
      const H = this.snackHand, near = this.state.cats.reduce((a, c) => (!a || Math.abs(c.x - H.x) < Math.abs(a.x - H.x)) ? c : a, null);
      const dir = near && near.x > H.x ? -1 : 1, bob = Math.sin(this.t * 3) * 1.5;
      g.save(); g.translate(H.x, H.y + bob); g.scale(dir * this.hk, this.hk);
      drawSnackItem(g, H.kind, this.t);
      g.translate(20, 3); g.scale(0.85, 0.85); drawHand(g, 'grab', 0);
      g.restore();
    }
    this.drawEdgeArrows(g);
    // 떠오르는 글자
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.particles) {
      g.globalAlpha = clamp(p.life, 0, 1);
      g.font = `bold ${p.size * (this.uiK || 1)}px sans-serif`;
      if (p.text === 'z') g.fillStyle = '#7f8cc8';
      else g.fillStyle = '#c58a1d';
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  },

  // 돌봄 행동을 하는 손 (밥 붓기, 물 갈기, 간식 주기, 공 던지기, 캣잎 뿌리기, 바닥 청소)
  drawFx(g) {
    for (const e of this.fx) {
      const p = clamp(e.t / e.dur, 0, 1), fade = Math.min(1, (e.dur - e.t) * 4, e.t * 6);
      g.save(); g.globalAlpha = clamp(fade, 0, 1);
      if (e.kind === 'pour') {
        const f = e.f, s = depthScale(f.z), bx = f.x, by = floorY(f.z) - 12 * s;
        const tilt = Math.sin(Math.min(1, p * 1.2) * Math.PI) * 1.15, hx = bx + 18, hy = by - 46;
        const mx = hx - 12 * Math.cos(tilt) - 2, my = hy - 10 + 12 * Math.sin(tilt);
        if (p > 0.2 && p < 0.85) {
          if (e.what === 'food') {
            for (let i = 0; i < 7; i++) { const q = (this.t * 2.6 + i / 7) % 1; circ(g, mx + (bx - mx) * q * 0.5 + Math.sin(i * 7) * 3, my + (by - my) * q, 2.2); g.fillStyle = '#b5743c'; g.fill(); }
          } else {
            g.strokeStyle = 'rgba(124,198,240,0.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo(mx - 2, (my + by) / 2, bx - 2, by); g.stroke();
          }
        }
        g.translate(hx, hy); g.rotate(-tilt);
        e.what === 'food' ? drawCan(g) : drawPitcher(g);
        g.translate(9, 4); g.scale(0.78, 0.78); drawHand(g, 'grab', 0);
      } else if (e.kind === 'feed') {
        const c = e.cat;
        if (!c._task || c._task.type !== 'snack') { e.t = e.dur; g.restore(); continue; }
        const s = depthScale(c.z) * CAT_SIZE, eat = c._pose === 'eat';
        const mx = c.x + c.facing * (eat ? 32 : 13) * s, my = this.catY(c) - (eat ? 14 : 41) * s;
        g.translate(mx, my); g.scale(c.facing, 1);
        drawSnackItem(g, e.snack, this.t);
        g.translate(20, 3); g.scale(0.78, 0.78); drawHand(g, 'grab', Math.sin(this.t * 6) * 0.05);
      } else if (e.kind === 'sprinkle') {
        const y = floorY(e.z) - 70, shake = Math.sin(this.t * 22) * 4;
        for (let i = 0; i < 8; i++) {
          const q = (e.t * 1.6 + i / 8) % 1, lx = e.x + Math.sin(i * 3.7) * 14;
          g.save(); g.translate(lx, y + 10 + q * 58); g.rotate(i + q * 4); ell(g, 0, 0, 3.6, 1.7); g.fillStyle = '#5cb85c'; g.fill(); g.restore();
        }
        g.translate(e.x + 10 + shake, y); g.rotate(Math.PI); g.scale(0.8, 0.8); drawHand(g, 'grab', 0);
      } else if (e.kind === 'toss') {
        const y = floorY(e.z) - 26 - p * 20;
        g.translate(e.x + e.dir * (-14 + p * 30), y); g.scale(e.dir * 0.8, 0.8); g.rotate(-0.4 + p * 0.8);
        drawHand(g, p < 0.4 ? 'grab' : 'pet', 0);
      } else if (e.kind === 'pourPot') {
        const tilt = Math.sin(Math.min(1, p * 1.2) * Math.PI) * 1.1, hx = e.x + 16, hy = e.y - 52;
        if (p > 0.2 && p < 0.85) { g.strokeStyle = 'rgba(124,198,240,0.85)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(hx - 12, hy - 4 + 10 * tilt); g.quadraticCurveTo(hx - 14, (hy + e.y) / 2, e.x, e.y - 16); g.stroke(); }
        g.translate(hx, hy); g.rotate(-tilt); g.scale(0.8, 0.8); drawPitcher(g); g.translate(9, 4); g.scale(0.78, 0.78); drawHand(g, 'grab', 0);
      } else if (e.kind === 'scoop') {
        g.translate(e.x, floorY(e.z) - 4); g.scale(0.85, 0.85); drawScoopHand(g, p);
      }
      g.restore();
    }
  },
  scoopFx(x, z) { this.fx.push({ kind: 'scoop', x, z, t: 0, dur: 0.7 }); },

  // 화면 밖에 있는 고양이를 가장자리 화살표로 알려줌
  edgeCats() {
    const out = [];
    for (const c of this.state.cats) {
      if (c._hidden) continue;
      if (c.x < this.cam + 8) out.push({ c, side: -1 });
      else if (c.x > this.cam + this.viewW - 8) out.push({ c, side: 1 });
    }
    return out;
  },
  edgeArrowPos(e, i) {
    return { x: e.side < 0 ? this.cam + 18 : this.cam + this.viewW - 18, y: CFG.FLOOR_Y0 - 40 - i * 40 };
  },
  drawEdgeArrows(g) {
    const counts = { '-1': 0, '1': 0 };
    for (const e of this.edgeCats()) {
      const p = this.edgeArrowPos(e, counts[e.side]++);
      g.fillStyle = 'rgba(255,255,255,0.92)'; rrect(g, p.x - 15, p.y - 15, 30, 30, 15); g.fill();
      g.strokeStyle = '#ffb3c7'; g.lineWidth = 2; g.stroke();
      g.save(); g.translate(p.x, p.y + 8); g.scale(0.32, 0.32);
      drawCatShape(g, e.c.coat, e.c.eye, { pose: 'front', t: this.t, mood: 'normal' }); g.restore();
      g.fillStyle = '#e0607e'; g.beginPath();
      const ax = p.x + e.side * 19; g.moveTo(ax + e.side * 6, p.y); g.lineTo(ax, p.y - 6); g.lineTo(ax, p.y + 6); g.fill();
    }
  },
  hitEdgeArrow(wx, wy) {
    const counts = { '-1': 0, '1': 0 };
    for (const e of this.edgeCats()) {
      const p = this.edgeArrowPos(e, counts[e.side]++);
      if (Math.abs(wx - p.x) < 22 && Math.abs(wy - p.y) < 20) return e.c;
    }
    return null;
  },
  focusCat(c) { this._camTarget = clamp(c.x - this.viewW / 2, 0, Math.max(0, this.worldW() - this.viewW)); },

  drawWall(g, W, top, style) {
    const P = { pink: ['#fff1e6', '#ffe2d2'], mint: ['#effaf5', '#e2f4ec'], sky: ['#e8f5ff', '#f5fbff'], cream: ['#fffaf0', '#fbefdc'], night: ['#3e4276', '#555a94'] }[style] || ['#fff1e6', '#ffe2d2'];
    const gr = g.createLinearGradient(0, 0, 0, CFG.WALL_H); gr.addColorStop(0, P[0]); gr.addColorStop(1, P[1]);
    g.fillStyle = P[0]; g.fillRect(0, top, W, -top + 1);
    g.fillStyle = gr; g.fillRect(0, 0, W, CFG.WALL_H + 2);
    const y0 = 20 + Math.floor(top / 40) * 40;
    if (style === 'mint') { g.fillStyle = 'rgba(140,205,180,0.22)'; for (let x = 0; x < W; x += 40) g.fillRect(x, top, 16, CFG.WALL_H - top); }
    else if (style === 'sky') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = 30, i = 0; x < W; x += 110, i++) for (let y = y0 + (i % 2) * 50; y < CFG.WALL_H - 30; y += 120) { ell(g, x, y, 18, 7); g.fill(); ell(g, x + 12, y - 5, 12, 7); g.fill(); ell(g, x - 10, y - 2, 9, 6); g.fill(); }
    } else if (style === 'cream') {
      g.strokeStyle = 'rgba(214,180,130,0.3)'; g.lineWidth = 3;
      for (let x = 0; x < W; x += 36) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, CFG.WALL_H); g.stroke(); }
      for (let y = y0; y < CFG.WALL_H; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    } else if (style === 'night') {
      for (let x = 15, i = 0; x < W; x += 37, i++) for (let y = y0 + (i * 17) % 40; y < CFG.WALL_H - 15; y += 53) { circ(g, x, y, (i + y) % 3 ? 1.2 : 2); g.fillStyle = (i + y) % 4 ? '#fff6c9' : '#ffe08a'; g.fill(); }
    } else {
      g.fillStyle = 'rgba(255,170,190,0.25)';
      for (let x = 20; x < W; x += 40) for (let y = y0; y < CFG.WALL_H - 20; y += 40) { circ(g, x + ((y / 40) % 2) * 20, y, 3); g.fill(); }
    }
  },
  drawFloor(g, W, style) {
    const P = { wood: ['#e2b989', '#f0cfa2', 'rgba(160,110,60,0.18)'], white: ['#e9dfd1', '#f9f4ec', 'rgba(170,150,120,0.18)'], pinktile: ['#f3cdd7', '#fbe8ed', 'rgba(215,150,170,0.45)'], check: ['#ead8f2', '#f7eefa', 'rgba(190,160,210,0.4)'] }[style] || ['#e2b989', '#f0cfa2', 'rgba(160,110,60,0.18)'];
    const fl = g.createLinearGradient(0, CFG.WALL_H, 0, CFG.ROOM_H); fl.addColorStop(0, P[0]); fl.addColorStop(1, P[1]);
    g.fillStyle = fl; g.fillRect(0, CFG.WALL_H, W, CFG.ROOM_H - CFG.WALL_H);
    const rows = [CFG.WALL_H]; for (let i = 1; i <= 7; i++) rows.push(CFG.WALL_H + (CFG.ROOM_H - CFG.WALL_H) * Math.pow(i / 7, 1.3));
    if (style === 'check') {
      g.fillStyle = 'rgba(200,170,220,0.35)';
      for (let i = 0; i < 7; i++) for (let x = (i % 2) * 60, j = 0; x < W; x += 120, j++) g.fillRect(x, rows[i], 60, rows[i + 1] - rows[i]);
    }
    g.strokeStyle = P[2]; g.lineWidth = 1;
    rows.slice(1, 7).forEach(y => { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
    if (style === 'pinktile' || style === 'white') {
      const step = style === 'pinktile' ? 60 : 140;
      for (let i = 0; i < 7; i++) for (let x = (style === 'white' && i % 2 ? step / 2 : 0); x < W; x += step) { g.beginPath(); g.moveTo(x, rows[i]); g.lineTo(x, rows[i + 1]); g.stroke(); }
    }
  },

  // ---------- 오늘의 특가 ----------
  ensureDeals() {
    const S = this.state;
    if (S.dealDay === S.day && S.deals) return;
    let seed = (S.day * 7919 + 13) % 2147483647;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const own = S.decor.owned, pool = [];
    for (const [k, a] of Object.entries(ACCESSORIES)) if (!a.dealOnly && !own['acc:' + k]) pool.push({ kind: 'acc', id: k, base: a.price });
    for (const [cat, map] of Object.entries(ROOM_STYLES)) for (const [k, v] of Object.entries(map)) if (v.price > 0 && !own[cat + ':' + k]) pool.push({ kind: cat, id: k, base: v.price });
    ['tuna', 'salmon', 'churu', 'catnip'].forEach(k => pool.push({ kind: 'snack', id: k, base: SNACKS[k].price * 3, qty: 3 }));
    const deals = [];
    for (let n = 0; n < 2 && pool.length; n++) {
      const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0], off = [30, 40, 50][Math.floor(rnd() * 3)];
      deals.push(Object.assign(d, { off, price: Math.max(1, Math.round(d.base * (1 - off / 100))) }));
    }
    const rare = Object.entries(ACCESSORIES).filter(([k, a]) => a.dealOnly && !own['acc:' + k]);
    if (rare.length) { const [k, a] = rare[Math.floor(rnd() * rare.length)]; deals.push({ kind: 'acc', id: k, base: a.price, price: a.price, only: true }); }
    else if (pool.length) { const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; deals.push(Object.assign(d, { off: 50, price: Math.round(d.base / 2) })); }
    S.deals = deals; S.dealDay = S.day; S.dealBought = {};
  },
  // 꾸미기·특가 구매 (성공하면 true)
  buyDecor(kind, id, price) {
    const S = this.state, key = (kind === 'acc' ? 'acc' : kind) + ':' + id;
    if (S.decor.owned[key]) return false;
    if (S.coins < price) { this.emit('toast', `🪙 코인이 ${price - S.coins}개 부족해요`); return false; }
    S.coins -= price; S.decor.owned[key] = true;
    if (kind !== 'acc') S.decor[kind] = id;   // 방 꾸미기는 사면 바로 적용
    Sound.play('coin'); this.emit('hud'); this.save();
    return true;
  },
  buyExpand(kind) {
    const S = this.state, lvKey = kind === 'room' ? 'roomLv' : 'slotLv', lv = S[lvKey] || 0, price = EXPAND[kind][lv];
    if (price == null) return false;
    if (S.coins < price) { this.emit('toast', `🪙 코인이 ${price - S.coins}개 부족해요`); return false; }
    S.coins -= price; S[lvKey] = lv + 1;
    if (kind === 'room') this.resize();
    else if (S.strayIdx >= CFG.STRAY_DAYS.length) S.strayNextDay = Math.min(S.strayNextDay || 0, S.day + 1);
    Sound.play('coin'); this.emit('hud'); this.save();
    return true;
  },

  // ---------- 소품 색 ----------
  accOwned(k, color) { const o = this.state.decor.owned; return color === 'base' ? !!o['acc:' + k] : !!o['acc:' + k + ':' + color]; },
  accColors(k) { return Object.keys(ACC_COLORS).filter(col => this.accOwned(k, col)); },
  accPrice(k, color) { const p = ACCESSORIES[k].price; return color === 'base' || color === 'gold' ? p : Math.max(20, Math.round(p * COLOR_PRICE_K / 5) * 5); },
  buyAccColor(k, color) {
    const S = this.state, info = ACC_COLORS[color];
    if (this.accOwned(k, color)) return false;
    if (info.shelter && S.shelter.tier < info.shelter) { this.emit('toast', `🏥 보호소 후원 ${info.shelter}단계가 되면 살 수 있어요`); return false; }
    if (color === 'base' && ACCESSORIES[k].dealOnly) { this.emit('toast', '🏷️ 이 소품은 오늘의 특가에서만 살 수 있어요'); return false; }
    const price = this.accPrice(k, color);
    if (S.coins < price) { this.emit('toast', `🪙 코인이 ${price - S.coins}개 부족해요`); return false; }
    S.coins -= price; S.decor.owned[color === 'base' ? 'acc:' + k : 'acc:' + k + ':' + color] = true;
    Sound.play('coin'); this.emit('hud'); this.save();
    return true;
  },

  // ---------- 보호소 후원 ----------
  donate(amount) {
    const S = this.state, sh = S.shelter;
    amount = Math.min(amount, S.coins);
    if (amount <= 0) { this.emit('toast', '🪙 후원할 코인이 없어요'); return false; }
    S.coins -= amount; sh.total += amount;
    Sound.play('coin');
    const ups = [];
    while (sh.total >= SHELTER.need(sh.tier + 1)) {
      sh.tier++;
      const [inv, n, label] = SHELTER.gifts[(sh.tier - 1) % SHELTER.gifts.length];
      if (inv === 'film') S.film = (S.film || 0) + n; else S.inv[inv] = (S.inv[inv] || 0) + n;
      ups.push({ tier: sh.tier, gift: label, gold: sh.tier === SHELTER.goldTier });
    }
    this.emit('hud'); this.save();
    return ups;
  },

  // ---------- 미션 ----------
  ensureMissions() {
    const S = this.state, week = Math.floor((S.day - 1) / 7);
    let seed = (S.day * 131 + 7) % 2147483647;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const hasPlant = S.garden.some(p => p && p.stage < GARDEN.seeds[p.seed].days);
    const kinds = MISSION_KINDS.filter(m => (m[0] !== 'garden' || hasPlant) && (m[0] !== 'lizard' || rnd() < 0.4));
    const make = (m, mul) => { const n = Math.round((m[2] + Math.floor(rnd() * (m[3] - m[2] + 1))) * mul); return { k: m[0], text: m[1], n, p: 0, done: false, reward: Math.round((10 + n / mul * m[4]) * (mul > 1 ? 3 : 1) / 5) * 5 }; };
    const pickN = (list, n) => { const a = list.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
    if (!S.mis || S.mis.day !== S.day) {
      const old = S.mis || {};
      S.mis = { day: S.day, daily: pickN(kinds, MISSION.dailyCount).map(m => make(m, 1)), bonus: false, week: old.week, weekly: old.weekly };
    }
    if (S.mis.week !== week || !S.mis.weekly) {
      seed = (week * 977 + 3) % 2147483647;
      const wk = MISSION_KINDS.filter(m => !['lizard', 'garden', 'water'].includes(m[0]));
      S.mis.week = week; S.mis.weekly = pickN(wk, MISSION.weeklyCount).map(m => Object.assign(make(m, MISSION.weeklyMul), { weekly: true }));
    }
  },
  track(kind, n = 1) {
    const S = this.state; if (!S || !S.mis) return;
    for (const m of S.mis.daily.concat(S.mis.weekly || [])) {
      if (m.k !== kind || m.done) continue;
      m.p = Math.min(m.n, m.p + n);
      if (m.p >= m.n) {
        m.done = true;
        S.coins += m.reward;
        if (m.weekly) { S.coins += MISSION.weeklyBonus; S.film = (S.film || 0) + MISSION.weeklyFilm; }
        Sound.play('coin');
        this.emit('toast', `✅ ${m.weekly ? '주간 ' : ''}미션 완료: ${m.text} +${m.reward + (m.weekly ? MISSION.weeklyBonus : 0)}🪙${m.weekly ? ` · 필름 ${MISSION.weeklyFilm}장` : ''}`);
      }
    }
    if (!S.mis.bonus && S.mis.daily.every(m => m.done)) { S.mis.bonus = true; S.coins += MISSION.allBonus; this.emit('toast', `🎉 오늘의 미션 모두 완료! 보너스 +${MISSION.allBonus}🪙`); }
    this.emit('hud'); this.emit('missionProgress');
  },

  // ---------- 사진 의뢰 ----------
  newCommission() {
    const S = this.state;
    const pool = MOMENT_INFO.filter(m => m[0] !== 'dressed' && (m[0] !== 'friends' || S.cats.length > 1));
    const m = pick(pool)[0];
    const accs = Object.keys(ACCESSORIES).filter(k => this.accColors(k).length);
    const acc = accs.length && Math.random() < 0.5 ? pick(accs) : null;
    const coat = Math.random() < 0.35 ? pick(S.cats).coat : null;
    const reward = COMMISSION.base + (COMMISSION.hardMoments.includes(m) ? COMMISSION.hard : 0) + (acc ? COMMISSION.acc : 0) + (coat ? COMMISSION.coat : 0);
    return { m, acc, coat, reward };
  },
  ensureCommissions() { const S = this.state; while (S.comm.length < COMMISSION.count) S.comm.push(this.newCommission()); },
  commText(q) {
    const name = (MOMENT_INFO.find(m => m[0] === q.m) || [])[2];
    const coat = q.coat ? COATS[q.coat].name.replace(' 고양이', '') + ' ' : '';
    const acc = q.acc ? `${ACCESSORIES[q.acc].icon} ${ACCESSORIES[q.acc].name}${josa(ACCESSORIES[q.acc].name, '을', '를')} 한 ` : '';
    return `${acc}${coat}고양이의 '${name}' 사진`;
  },
  rerollCommission(i) {
    const S = this.state;
    if (S.coins < COMMISSION.reroll) { this.emit('toast', '🪙 코인이 부족해요'); return false; }
    S.coins -= COMMISSION.reroll; S.comm[i] = this.newCommission(); this.emit('hud'); this.save();
    return true;
  },

  // ---------- 창가 화분 ----------
  potPos(i) { return { x: CFG.WINDOW_X - 38 + i * 38, y: 176 }; },
  hitPot(wx, wy) {
    for (let i = 0; i < GARDEN.pots; i++) { const p = this.potPos(i); if (Math.abs(wx - p.x) < 17 && wy > p.y - 44 && wy < p.y + 6) return i; }
    return -1;
  },
  plant(i, seed) {
    const S = this.state, sd = GARDEN.seeds[seed];
    if (S.garden[i] || !(S.inv[sd.inv] > 0)) return false;
    S.inv[sd.inv]--; S.garden[i] = { seed, stage: 0, watered: -1, dry: 0 };
    Sound.play('rustle'); this.save();
    return true;
  },
  waterPot(i) {
    const S = this.state, p = S.garden[i];
    if (!p || p.watered === S.day) return false;
    p.watered = S.day; p.dry = 0;
    const pos = this.potPos(i);
    this.fx.push({ kind: 'pourPot', x: pos.x, y: pos.y, t: 0, dur: 1.2 });
    Sound.play('bowl', { pitch: 0.7, vol: 0.6 });
    this.track('garden'); this.save();
    return true;
  },
  harvest(i) {
    const S = this.state, p = S.garden[i];
    if (!p || p.stage < GARDEN.seeds[p.seed].days) return null;
    S.garden[i] = null;
    const pos = this.potPos(i);
    let res;
    if (p.seed === 'nip') {
      S.inv.catnip = (S.inv.catnip || 0) + GARDEN.nipHarvest;
      res = { text: `🌿 캣잎 ${GARDEN.nipHarvest}개를 수확했어요!` };
      if (Math.random() < GARDEN.goldenChance) { this.addCoins(GARDEN.goldenCoins, pos.x, pos.y - 40); res.text = `✨ 황금 캣잎! 캣잎 ${GARDEN.nipHarvest}개 + 🪙${GARDEN.goldenCoins}`; }
    } else { this.addCoins(GARDEN.flowerCoins, pos.x, pos.y - 40); res = { text: `🌷 꽃을 보호소 바자회에 보냈어요! +${GARDEN.flowerCoins}🪙` }; }
    Sound.play('trill', { pitch: 1.3 }); this.floatText(pos.x, pos.y - 30, '✨', 16);
    this.emit('hud'); this.save();
    return res;
  },

  // ---------- 사진 ----------
  loadPhotos() { try { return JSON.parse(localStorage.getItem(PHOTO_KEY)) || []; } catch (e) { return []; } },
  savePhotos(list) { try { localStorage.setItem(PHOTO_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } },
  momentsOf(c) {
    const T = c._task || {}, spot = T.spot && T.spot.tower;
    const ok = {
      loaf: c._pose === 'loaf' && !c._sleeping, sleep: !!c._sleeping, eat: c._pose === 'eat' || T.type === 'snack',
      wheel: T.type === 'wheel' && c._pose === 'run', treetop: c.alt >= 180, sofa: !!spot && spot.type === 'sofa' && c.alt > 20,
      table: !!spot && spot.type === 'table' && c.alt >= 60, box: !!c._inside && c._inside.type === 'box', reach: c._pose === 'reach',
      stretch: c._pose === 'stretch', groom: c._pose === 'groom', punch: c._pose === 'bat', roll: c._pose === 'roll', lizard: T.type === 'showOff',
      friends: c.alt < 1 && this.state.cats.some(o => o !== c && o.alt < 1 && Math.abs(o.x - c.x) < 60 && Math.abs(o.z - c.z) < 0.2),
      dressed: !!(c.acc && (c.acc.neck || c.acc.head)),
    };
    return MOMENT_INFO.map(m => m[0]).filter(id => ok[id]);
  },
  takePhoto(c) {
    const S = this.state;
    if ((S.film || 0) <= 0) return null;
    S.film--;
    const prevHand = this.hand; this.hand = null; this.render(); this.hand = prevHand;
    const s = depthScale(c.z) * CAT_SIZE, k = this.dpr * this.scale;
    const cx = (c.x - this.cam) * k, cy = (this.catY(c) - 40 * s + this.offY) * k, half = Math.max(66 * s, 50) * k;
    const out = document.createElement('canvas'); out.width = out.height = 240;
    const og = out.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, 240, 240);
    og.drawImage(this.canvas, cx - half, cy - half, half * 2, half * 2, 0, 0, 240, 240);
    const img = out.toDataURL('image/jpeg', 0.8);
    const ms = this.momentsOf(c), fresh = ms.filter(id => !S.album.moments[id]);
    const id = 'p' + Date.now().toString(36);
    const photos = this.loadPhotos();
    photos.push({ id, day: S.day, cat: c.name, moments: ms, img });
    const keep = new Set(Object.values(S.album.moments).concat(fresh.length ? [id] : []));
    while (photos.length > 40) { const i = photos.findIndex(p => !keep.has(p.id)); photos.splice(i >= 0 ? i : 0, 1); }
    while (!this.savePhotos(photos) && photos.length > 1) { const i = photos.findIndex(p => !keep.has(p.id)); photos.splice(i >= 0 ? i : 0, 1); }
    fresh.forEach(m => { S.album.moments[m] = id; });
    if (fresh.length) this.addCoins(FILM.newMoment * fresh.length, c.x, this.catY(c) - 70);
    // 사진 의뢰
    const doneComm = [];
    S.comm.forEach((q, i) => {
      if (ms.includes(q.m) && (!q.acc || c.acc.neck === q.acc || c.acc.head === q.acc) && (!q.coat || c.coat === q.coat)) { doneComm.push(q); S.comm[i] = this.newCommission(); }
    });
    doneComm.forEach(q => this.addCoins(q.reward, c.x, this.catY(c) - 110));
    this.track('photo');
    let complete = false;
    if (!S.album.done && MOMENT_INFO.every(m => S.album.moments[m[0]])) { S.album.done = complete = true; this.addCoins(FILM.complete, c.x, this.catY(c) - 90); }
    Sound.play('pop', { pitch: 1.9, vol: 0.6 }); Sound.play('scoop', { pitch: 2.2, vol: 0.3 });
    this.save();
    return { img, ms, fresh, complete, doneComm };
  },

  drawRoom(g, W, night) {
    const top = -Math.ceil(this.offY || 0) - 2, D = this.state.decor || {};
    this.drawWall(g, W, top, D.wall || 'pink');
    this.drawFloor(g, W, D.floor || 'wood');
    g.fillStyle = '#f7e6d4'; g.fillRect(0, CFG.WALL_H - 8, W, 10);
    // 러그
    const ry = floorY(0.5), rh = 22 + CFG.FLOOR_DEPTH * 0.07;
    g.fillStyle = 'rgba(255,190,210,0.55)'; ell(g, 470, ry, 170, rh); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; ell(g, 470, ry, 150, rh * 0.78); g.stroke();
    // 윗벽: 가랜드와 선반
    const gy = top + 34;
    g.strokeStyle = 'rgba(180,130,110,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); for (let x = 0; x <= W; x += 10) { const y = gy + Math.sin(x / 60 * Math.PI) * 10; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const flags = ['#ffb3c7', '#ffe08a', '#a8e0c6', '#a9d4ff', '#d6c1ff'];
    for (let x = 15, i = 0; x < W; x += 30, i++) {
      const y = gy + Math.sin(x / 60 * Math.PI) * 10;
      g.fillStyle = flags[i % flags.length]; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x, y + 14); g.closePath(); g.fill();
      if (night > 0) { circ(g, x, y + 2, 2.2); g.fillStyle = `rgba(255,230,150,${0.5 + 0.5 * night})`; g.fill(); }
    }
    const shelf = (x, y, w, items) => {
      rrect(g, x, y, w, 7, 3); g.fillStyle = '#d9b48f'; g.fill();
      g.fillStyle = '#c49a6c'; g.fillRect(x + 8, y + 7, 4, 8); g.fillRect(x + w - 12, y + 7, 4, 8);
      g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      items.forEach((it, i) => g.fillText(it, x + (i + 0.5) * w / items.length, y + 1));
    };
    if (top < -60) { shelf(30, top + 120, 100, ['🪴', '📚', '🧸']); shelf(560, top + 140, 110, ['🐟', '🕯️', '🌵']); }
    if (top < -160) shelf(300, top + 200, 100, ['🖼️', '🍵', '🪴']);
    // 벽 소품: 램프, 시계, 액자
    this.drawClock(g, 490, 80);
    rrect(g, 205, 70, 60, 46, 4); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#d9b48f'; g.lineWidth = 4; g.stroke();
    g.font = '24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐟', 235, 94);
    rrect(g, 580, 80, 50, 60, 4); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#d9b48f'; g.stroke(); g.fillText('🌷', 605, 110);
    drawWindow(g, CFG.WINDOW_X, this.isNight() || night > 0.6, this.t, this.stray, this.state.owned.hammock);
    const S2 = this.state;
    S2.garden.forEach((p, i) => {
      const pos = this.potPos(i);
      g.save(); g.translate(pos.x, pos.y); drawPot(g, p, this.t, i); g.restore();
      if (p) {
        const ready = p.stage >= GARDEN.seeds[p.seed].days, K = this.uiK || 1;
        const icon = ready ? '✨' : p.watered !== S2.day ? '💧' : null;
        if (icon) { g.font = `${11 * K}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, pos.x + 10, pos.y - 34 + Math.sin(this.t * 3 + i) * 2); }
      }
    });
    if (S2.shelter.tier > 0) {
      rrect(g, 168, 124, 94, 24, 5); g.fillStyle = '#c9925e'; g.fill(); g.strokeStyle = '#a8743f'; g.lineWidth = 2; g.stroke();
      g.font = '11px "Jua", sans-serif'; g.fillStyle = '#fff8ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`🏥 보호소 후원 ${S2.shelter.tier}단계`, 215, 137);
    }
  },
  drawClock(g, x, y) {
    circ(g, x, y, 20); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#f2a7bb'; g.lineWidth = 4; g.stroke();
    const m = this.state.minute, ha = ((m / 60) % 12) / 12 * Math.PI * 2, ma = (m % 60) / 60 * Math.PI * 2;
    g.strokeStyle = '#6b4a3a'; g.lineCap = 'round';
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(ha) * 10, y - Math.cos(ha) * 10); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(ma) * 15, y - Math.cos(ma) * 15); g.stroke();
    [[-9, -16], [9, -16]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(x + dx - 6, y + dy + 6); g.lineTo(x + dx, y + dy - 6); g.lineTo(x + dx + 6, y + dy + 6); g.fillStyle = '#f2a7bb'; g.fill(); });
  },

  drawFurn(g, f, front) {
    const s = depthScale(f.z);
    g.save(); g.translate(f.x, floorY(f.z)); g.scale(s, s);
    if (this.placing && this.placing.moving === f) g.globalAlpha = 0.5;
    if (f._drag) { g.translate(0, -8); g.globalAlpha = 0.9; }
    if (f.type === 'hammock') drawHammock(g, f, !!front);
    else if (f.type === 'mouse') this.drawMouse(g, f);
    else if (front) { if (f.type === 'box') FURN_DRAW.boxFront(g, f); else if (f.type === 'litter') FURN_DRAW.litterFront(g, f); }
    else {
      const fn = FURN_DRAW[f.type];
      if (fn) fn(g, f, this.t);
    }
    g.restore();
    // 문 앞에 아무도 없을 때 해먹/박스 앞면도 그려야 함
    if (!front && (f.type === 'box' || f.type === 'hammock' || f.type === 'litter') && !this.state.cats.some(c => c._inside === f)) this.drawFurn(g, f, true);
  },
  drawMouse(g, f) {
    const dir = (f._vx || 1) > 0 ? 1 : -1;
    g.scale(dir, 1);
    ell(g, 0, -1, 10, 3); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    ell(g, 0, -6, 10, 6); g.fillStyle = '#b9b5c4'; g.fill();
    circ(g, 9, -8, 4); g.fill(); circ(g, 4, -12, 3.2); g.fillStyle = '#f7b5c6'; g.fill();
    circ(g, 11, -9, 1.2); g.fillStyle = '#333'; g.fill();
    g.beginPath(); g.moveTo(-10, -5); g.quadraticCurveTo(-20, -2, -22, -8); g.strokeStyle = '#999'; g.lineWidth = 1.2; g.stroke();
    g.save(); g.translate(-2, -12); g.rotate(f._active ? this.t * 10 : 0); g.fillStyle = '#e6c25a'; g.fillRect(-4, -1, 8, 2); g.restore();
  },
  drawBall(g, b) {
    const s = depthScale(b.z), y = floorY(b.z);
    g.save(); g.translate(b.x, y - 7 * s); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,0.12)'; ell(g, 0, 7, 8, 2.5); g.fill();
    g.rotate(b.rot || 0);
    circ(g, 0, 0, 7); g.fillStyle = '#ff8fb1'; g.fill();
    g.strokeStyle = '#e06590'; g.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * 3, 0, 6, -1.2, 1.2); g.stroke(); }
    g.restore();
  },

  drawCat(g, c) {
    if (c._hidden) return;
    const s = depthScale(c.z), y = this.catY(c);
    // 그림자
    if (c.alt < 2 || c._inside) { g.fillStyle = 'rgba(80,50,30,0.15)'; ell(g, c.x, floorY(c.z) - (c._inside ? c.alt * s : 0) - 1, 26 * s, 5 * s); g.fill(); }
    const K = CAT_SIZE;
    g.save(); g.translate(c.x, y); g.scale(s * K * c.facing, s * K);
    const petting = this.pet && this.pet.cat === c;
    const mood = petting || (c._task && ['snack', 'catnip'].includes(c._task.type)) ? 'happy' : c.stats.happy < 25 ? 'sad' : 'normal';
    drawCatShape(g, c.coat, c.eye, { pose: c._pose || 'sit', t: c._anim || 0, mood, blink: c._blinkT < 0, mouth: c._mouthT > 0, acc: c.acc });
    // 간식 들고 있는 모습
    g.restore();
    if (c._inside) this.drawFurn(g, c._inside, true);
    // 이름표(새로 온 고양이)
    if (c.newUntil > this.absMin()) {
      g.font = `bold ${9 * (this.uiK || 1)}px sans-serif`; g.textAlign = 'center'; g.fillStyle = '#e0607e';
      g.fillText('NEW', c.x, y + 10);
    }
  },
};
