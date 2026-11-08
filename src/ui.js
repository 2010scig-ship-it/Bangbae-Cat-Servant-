'use strict';
// ===== 화면 UI, 터치 입력, 메인 루프 =====
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const UI = {
  mode: null,          // null | {type:'snack',kind} | {type:'rod'|'laser'|'ball'|'clean'|'place'|'move', ...}
  infoCat: null,

  // ---------- 공통 레이어 ----------
  toast(msg, ms = 2600) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    const box = $('#toasts'); box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), ms);
  },
  closeLayer() { $('#layer').innerHTML = ''; this.infoCat = null; },
  sheet(html, mount) {
    const L = $('#layer');
    L.innerHTML = `<div class="backdrop"></div><div class="sheet"><div class="handle"></div>${html}</div>`;
    L.querySelector('.backdrop').onclick = () => this.closeLayer();
    if (mount) mount(L.querySelector('.sheet'));
  },
  modal(html, mount, closable = true) {
    const L = $('#layer');
    L.innerHTML = `<div class="modal"><div class="modal-card">${html}</div></div>`;
    const m = L.querySelector('.modal');
    if (closable) m.addEventListener('click', e => { if (e.target === m) this.closeLayer(); });
    if (mount) mount(m.querySelector('.modal-card'));
  },

  hud() {
    const S = World.state, m = Math.floor(S.minute), h = Math.floor(m / 60), mm = m % 60;
    const ic = World.isNight() ? '🌙' : (h < 7 ? '🌅' : h >= 18 ? '🌇' : '☀️');
    $('#dayPill').innerHTML = `<span class="ico">🗓️ </span>${S.day}일차`;
    const sp = S.settings.speed || 1;
    $('#clockPill').textContent = `${ic} ${String(h).padStart(2, '0')}:${String(mm - mm % 10).padStart(2, '0')}`;
    const sb = $('#speedBtn');
    sb.textContent = `${sp < 1 ? '🐢' : sp > 1 ? '⏩' : '▶'} ${sp}x`;
    sb.classList.toggle('fast', sp !== 1);
    $('#coinPill').textContent = `🪙 ${S.coins}`;
  },

  // 간식을 쥔 손을 방에 띄움. 손을 끌어 고양이 입에 대면 그 고양이가 먹음
  startSnack(kind, nearCat) {
    const sn = SNACKS[kind];
    this.setMode({ type: 'snack', kind }, `${sn.icon} ${sn.name}: 손을 끌어서 고양이 입에 대 주세요`);
    if (nearCat) World.focusCat(nearCat);
    World.startSnackHand(kind, nearCat);
  },
  setMode(mode, text) {
    this.mode = mode;
    if (World.snackHand && (!mode || mode.type !== 'snack' || mode.kind === 'catnip')) World.snackHand = null;
    if (World.toolHand && (!mode || mode.type !== World.toolHand.kind)) World.endToolHand();
    if (mode && (mode.type === 'ball' || mode.type === 'brush') && !World.toolHand) World.startToolHand(mode.type);
    if (World.lure && (!mode || (mode.type !== 'rod' && mode.type !== 'laser'))) World.lure = null;
    World.placing = mode && (mode.type === 'place' || mode.type === 'move') ? mode : null;
    $('#modeChip').hidden = !mode;
    $('#modeText').textContent = text || '';
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('on'));
    if (mode) {
      const map = { snack: 'btnSnack', rod: 'btnToy', laser: 'btnToy', ball: 'btnToy', clean: 'btnClean' };
      if (map[mode.type]) $('#' + map[mode.type]).classList.add('on');
    }
  },

  // ---------- 툴바 ----------
  onTool(tool) {
    Sound.play('pop', { vol: 0.35, pitch: 1.2 });
    if (tool === 'food') { this.setMode(null); World.fillBowl(); return; }
    if (tool === 'snack') return this.openSnacks();
    if (tool === 'toy') return this.openToys();
    if (tool === 'clean') {
      const S = World.state, dirty = World.furn('litter').filter(f => f.clumps.length);
      if (!S.poops.length && dirty.length === 1) { this.setMode(null); return this.openLitter(dirty[0]); }
      if (!S.poops.length && !dirty.length) { this.toast('✨ 지금은 깨끗해요!'); return; }
      this.setMode({ type: 'clean' }, '🧹 화장실이나 바닥의 실수를 탭하세요');
      return;
    }
    if (tool === 'shop') return this.openShop();
  },

  openSnacks() {
    const S = World.state;
    const cards = Object.entries(SNACKS).map(([k, sn]) => {
      const n = S.inv[k] || 0;
      const used = k === 'catnip' && S.catnipDay === S.day;
      return `<button class="card ${n ? '' : 'locked'}" data-k="${k}"><span class="ic">${sn.icon}</span><b>${sn.name} · ${n}개</b>
        <small>${used ? '오늘은 이미 줬어요' : sn.how}</small><small>하루 ${sn.limit}번${k === 'catnip' ? '' : ' (고양이마다)'}</small></button>`;
    }).join('');
    this.sheet(`<h2>🍬 간식</h2><div class="grid">${cards}</div>
      <p style="font-size:13px;color:var(--ink2)">🥫 주식(캔형 습식)은 언제나 무료예요. 간식은 상점에서 사요.</p>
      <button class="btn sub" id="goShop">🏪 간식 사러 가기</button>`, el => {
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        const k = b.dataset.k, sn = SNACKS[k];
        if (!(S.inv[k] > 0)) { this.toast(`${sn.icon} ${sn.name}${josa(sn.name, '이', '가')} 없어요. 상점에서 사주세요`); return; }
        if (k === 'catnip' && S.catnipDay === S.day) { this.toast('🌿 캣잎은 하루에 한 번만 줄 수 있어요'); return; }
        this.closeLayer();
        if (k === 'catnip') this.setMode({ type: 'snack', kind: k }, '🌿 캣잎을 뿌릴 바닥을 탭하세요');
        else this.startSnack(k);
      });
      el.querySelector('#goShop').onclick = () => this.openShop();
    });
  },

  openToys() {
    const S = World.state;
    const list = ['rod', 'ball', 'brush'].concat(S.owned.laser ? ['laser'] : []);
    const cards = list.map(k => `<button class="card" data-k="${k}"><span class="ic">${TOYS[k].icon}</span><b>${TOYS[k].name}</b><small>${TOYS[k].desc}</small></button>`).join('');
    const placed = S.furniture.filter(f => !['bowl', 'litter'].includes(f.type)).map(f => ITEMS[f.type] ? ITEMS[f.type].icon : { wheel: '🎡', scratcher: '🪵', box: '📦' }[f.type] || '').join(' ');
    this.sheet(`<h2>🧶 장난감</h2><div class="grid">${cards}</div>
      <h3>📷 사진</h3><div class="grid"><button class="card" id="camBtn"><span class="ic">📷</span><b>사진 찍기</b><small>필름 ${S.film || 0}장 · 특별한 순간을 찍어 도감을 채워요</small></button><button class="card" id="albBtn"><span class="ic">📔</span><b>사진 앨범</b><small>순간 도감 ${MOMENT_INFO.filter(m => S.album.moments[m[0]]).length}/${MOMENT_INFO.length}</small></button></div>
      <h3>방에 있는 놀이 가구</h3><p style="font-size:22px;margin:4px 0">${placed}</p>
      <p style="font-size:13px;color:var(--ink2)">💡 방 안의 가구는 <b>손가락으로 끌면</b> 바로 옮길 수 있어요. 고양이들은 가구에서 알아서 놀아요.</p>`, el => {
      el.querySelector('#camBtn').onclick = () => { this.closeLayer(); this.startCamera(); };
      el.querySelector('#albBtn').onclick = () => this.openAlbum();
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        const k = b.dataset.k; this.closeLayer();
        const txt = { rod: '🎣 손가락으로 끌어서 흔들어 주세요', ball: '🧶 공을 쥔 손을 끌다가 놓으면 던져요', laser: '🔴 손가락으로 빨간 점을 움직여요', brush: '🪮 빗을 끌어서 고양이를 문질러 주세요' }[k];
        this.setMode({ type: k }, txt);
      });
    });
  },

  // ---------- 상점 (탭: 특가 · 간식 · 놀이 · 꾸미기 · 확장) ----------
  shopTab: 'deal',
  openShop(tab) {
    const S = World.state;
    if (tab) this.shopTab = tab;
    $('#shopBadge').hidden = true;
    World.ensureDeals();
    const TABS = [['deal', '🏷️ 오늘의 특가'], ['snack', '🍬 간식·필름'], ['item', '🧸 놀이'], ['style', '🎀 꾸미기'], ['expand', '🏠 확장·후원']];
    const price = p => `<span class="price">🪙 ${p}</span>`;
    const own = S.decor.owned;
    const styleName = (kind, id) => kind === 'acc' ? `${ACCESSORIES[id].icon} ${ACCESSORIES[id].name}` : `${STYLE_LABEL[kind].split(' ')[0]} ${ROOM_STYLES[kind][id].name}`;
    let body = '';
    if (this.shopTab === 'deal') {
      body = `<p style="font-size:13px;color:var(--ink2);margin:0 0 8px">매일 아침 바뀌어요. 🌈 표시는 특가에만 나오는 소품이에요.</p><div class="grid">` + S.deals.map((d, i) => {
        const done = S.dealBought[i] || (d.kind !== 'snack' && own[(d.kind === 'acc' ? 'acc' : d.kind) + ':' + d.id]);
        const name = d.kind === 'snack' ? `${SNACKS[d.id].icon} ${SNACKS[d.id].name} ${d.qty}개` : styleName(d.kind, d.id);
        const tag = d.only ? '<span class="tag gold">특가 한정</span>' : `<span class="tag">${d.off}% 할인</span>`;
        return `<button class="card ${done ? 'locked' : ''}" data-deal="${i}"><b>${name}</b>${tag}<small>${d.only ? '오늘만 살 수 있어요' : `원래 🪙 ${d.base}`}</small>${done ? '<span class="price" style="color:var(--mint)">✔ 구매 완료</span>' : price(d.price)}</button>`;
      }).join('') + '</div>';
    } else if (this.shopTab === 'snack') {
      body = '<div class="grid">' + Object.entries(SNACKS).map(([k, sn]) =>
        `<button class="card" data-buy-snack="${k}"><span class="ic">${sn.icon}</span><b>${sn.name}${sn.premium ? '<span class="tag gold">고급</span>' : ''}</b><small>보유 ${S.inv[k] || 0}개${sn.premium ? ' · 친밀도 +' + sn.bond : ''}</small>${price(sn.price)}</button>`).join('') +
        Object.entries(GARDEN.seeds).map(([k, sd]) => `<button class="card" data-seedbuy="${k}"><span class="ic">${sd.icon}</span><b>${sd.name}</b><small>보유 ${S.inv[sd.inv] || 0}개 · 창가 화분에 심어요</small>${price(sd.price)}</button>`).join('') +
        `<button class="card" data-film="1"><span class="ic">🎞️</span><b>사진 필름 ${FILM.pack}장</b><small>보유 ${S.film || 0}장 · 📷 고양이 사진 찍기</small>${price(FILM.price)}</button></div>`;
    } else if (this.shopTab === 'item') {
      body = '<div class="grid">' + Object.entries(ITEMS).map(([k, it]) => {
        if (S.owned[k]) return `<div class="card"><span class="ic">${it.icon}</span><b>${it.name}</b><small>${it.desc}</small><span class="price" style="color:var(--mint)">✔ 보유 중</span></div>`;
        if (!S.seenUnlock[k]) return `<div class="card locked"><span class="ic">🔒</span><b>${it.name}</b><small>${it.day}일차 + 친밀도 ${it.bond} 이상 고양이가 있으면 열려요</small></div>`;
        return `<button class="card" data-buy-item="${k}"><span class="ic">${it.icon}</span><b>${it.name}</b><small>${it.desc}</small>${price(it.price)}</button>`;
      }).join('') + '</div>';
    } else if (this.shopTab === 'style') {
      body = '<h3 style="margin-top:0">고양이 소품 <small style="font-size:12px">· 고양이를 탭해서 씌워요</small></h3><div class="grid">' + Object.entries(ACCESSORIES).map(([k, a]) => {
        const cols = World.accColors(k), total = a.noColor ? 1 : Object.keys(ACC_COLORS).length;
        if (a.dealOnly && !own['acc:' + k]) return `<div class="card locked"><span class="ic">${a.icon}</span><b>${a.name}</b><small>🏷️ 오늘의 특가에만 나와요</small></div>`;
        if (a.noColor && own['acc:' + k]) return `<div class="card on"><span class="ic">${a.icon}</span><b>${a.name}</b><small>${a.slot === 'neck' ? '목' : '머리'} 소품</small><span class="price" style="color:var(--mint)">✔ 보유 중</span></div>`;
        return `<button class="card ${cols.length ? 'on' : ''}" data-acc="${k}"><span class="ic">${a.icon}</span><b>${a.name}</b><small>${a.slot === 'neck' ? '목' : '머리'} 소품 · 색 ${cols.length}/${total}</small>${cols.length ? '<span class="price" style="color:var(--pink)">🎨 색 고르기</span>' : price(a.price)}</button>`;
      }).join('') + '</div>' + Object.entries(ROOM_STYLES).map(([kind, map]) => `<h3>${STYLE_LABEL[kind]}</h3><div class="grid">` + Object.entries(map).map(([k, v]) => {
        const has = v.price === 0 || own[kind + ':' + k], on = S.decor[kind] === k;
        const cols = v.sw || v.c;
        return `<button class="card ${on ? 'on' : ''}" data-style="${kind}:${k}"><div class="sw">${cols.map(c => `<i style="background:${c}"></i>`).join('')}</div><b>${v.name}</b>${on ? '<span class="price" style="color:var(--pink)">✔ 적용 중</span>' : has ? '<span class="price" style="color:var(--mint)">적용하기</span>' : price(v.price)}</button>`;
      }).join('') + '</div>').join('');
    } else {
      const rl = S.roomLv || 0, sl = S.slotLv || 0;
      body = `<div class="grid">
        <button class="card ${EXPAND.room[rl] == null ? 'locked' : ''}" data-expand="room"><span class="ic">📐</span><b>방 넓히기 (${rl}/${EXPAND.room.length})</b><small>방이 옆으로 넓어져서 가구를 더 넉넉하게 놓을 수 있어요</small>${EXPAND.room[rl] == null ? '<span class="price" style="color:var(--mint)">✔ 최대</span>' : price(EXPAND.room[rl])}</button>
        <button class="card ${EXPAND.slot[sl] == null ? 'locked' : ''}" data-expand="slot"><span class="ic">🏡</span><b>고양이 자리 +1 (${sl}/${EXPAND.slot.length})</b><small>최대 ${World.maxCats()}마리 → ${World.maxCats() + 1}마리. 길고양이가 또 찾아와요</small>${EXPAND.slot[sl] == null ? '<span class="price" style="color:var(--mint)">✔ 최대</span>' : price(EXPAND.slot[sl])}</button>
      </div>`;
      const sh = S.shelter, prev = SHELTER.need(sh.tier), next = SHELTER.need(sh.tier + 1), pct = Math.round((sh.total - prev) / (next - prev) * 100);
      body += `<h3>🏥 길고양이 보호소 후원</h3>
        <div class="card" style="min-height:0"><b>후원 ${sh.tier}단계 · 구조된 고양이 ${sh.tier * SHELTER.rescuedPerTier}마리</b>
        <small>다음 단계까지 🪙 ${next - sh.total} · 단계가 오를 때마다 보호소에서 선물이 와요${sh.tier < SHELTER.goldTier ? ` · ${SHELTER.goldTier}단계에 소품 '후원자 금색' 해금` : ''}</small>
        <div class="bar" style="margin:6px 0"><i style="width:${pct}%;background:#f2b53a"></i></div>
        <div class="chips" style="justify-content:flex-start;margin:0">${[10, 50, 100].map(n => `<button class="chip" data-donate="${n}">🪙 ${n} 후원</button>`).join('')}</div></div>`;
    }
    this.sheet(`<h2>🏪 상점 <span style="float:right;font-size:17px;color:#a8741a">🪙 ${S.coins}</span></h2>
      <div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${this.shopTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${body}
      <button class="btn sub" id="goAlbum">📷 사진 앨범 보기</button>
      <p style="font-size:12px;color:var(--ink2);margin-top:12px">🪙 코인은 쓰다듬기, 놀아주기, 화장실 청소, 부탁 들어주기, 새로운 순간 사진으로 모여요.</p>`, el => {
      const again = () => this.openShop();
      el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => this.openShop(b.dataset.tab));
      el.querySelector('#goAlbum').onclick = () => this.openAlbum();
      el.querySelectorAll('[data-deal]').forEach(b => b.onclick = () => {
        const i = +b.dataset.deal, d = S.deals[i];
        if (S.dealBought[i]) return;
        if (d.kind === 'snack') {
          if (S.coins < d.price) { this.toast(`🪙 코인이 ${d.price - S.coins}개 부족해요`); return; }
          S.coins -= d.price; S.inv[d.id] = (S.inv[d.id] || 0) + d.qty; Sound.play('coin'); this.hud(); World.save();
        } else if (!World.buyDecor(d.kind, d.id, d.price)) return;
        S.dealBought[i] = true; World.save();
        this.toast('🏷️ 특가 구매 완료!'); again();
      });
      el.querySelectorAll('[data-buy-snack]').forEach(b => b.onclick = () => {
        const k = b.dataset.buySnack, sn = SNACKS[k];
        if (S.coins < sn.price) { this.toast('🪙 코인이 부족해요'); return; }
        S.coins -= sn.price; S.inv[k] = (S.inv[k] || 0) + 1;
        Sound.play('coin'); this.hud(); World.save(); again();
      });
      el.querySelectorAll('[data-seedbuy]').forEach(b => b.onclick = () => {
        const sd = GARDEN.seeds[b.dataset.seedbuy];
        if (S.coins < sd.price) { this.toast('🪙 코인이 부족해요'); return; }
        S.coins -= sd.price; S.inv[sd.inv] = (S.inv[sd.inv] || 0) + 1; Sound.play('coin'); this.hud(); World.save(); again();
      });
      el.querySelectorAll('[data-film]').forEach(b => b.onclick = () => {
        if (S.coins < FILM.price) { this.toast('🪙 코인이 부족해요'); return; }
        S.coins -= FILM.price; S.film = (S.film || 0) + FILM.pack;
        Sound.play('coin'); this.hud(); World.save(); again();
      });
      el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => this.openAccColors(b.dataset.acc));
      el.querySelectorAll('[data-style]').forEach(b => b.onclick = () => {
        const [kind, k] = b.dataset.style.split(':'), v = ROOM_STYLES[kind][k];
        if (v.price === 0 || S.decor.owned[kind + ':' + k]) { S.decor[kind] = k; World.save(); Sound.play('pop'); again(); return; }
        if (World.buyDecor(kind, k, v.price)) { this.toast(`✨ ${v.name}${josa(v.name, '으로', '로')} 바꿨어요!`); again(); }
      });
      el.querySelectorAll('[data-donate]').forEach(b => b.onclick = () => {
        const ups = World.donate(+b.dataset.donate);
        if (!ups) return;
        if (ups.length) this.shelterLetter(ups); else { this.toast('💛 후원 고마워요!'); again(); }
      });
      el.querySelectorAll('[data-expand]').forEach(b => b.onclick = () => {
        const k = b.dataset.expand;
        if (World.buyExpand(k)) { this.toast(k === 'room' ? '📐 방이 넓어졌어요!' : `🏡 이제 ${World.maxCats()}마리까지 함께 살 수 있어요. 곧 길고양이가 찾아올 거예요`); again(); }
      });
      el.querySelectorAll('[data-buy-item]').forEach(b => b.onclick = () => {
        const k = b.dataset.buyItem, it = ITEMS[k];
        if (S.coins < it.price) { this.toast(`🪙 코인이 ${it.price - S.coins}개 부족해요`); return; }
        S.coins -= it.price; S.owned[k] = true;
        Sound.play('coin'); this.hud(); World.save();
        this.closeLayer();
        if (it.kind === 'floor' || it.kind === 'wall') this.setMode({ type: 'place', item: k }, `📍 ${it.icon} ${it.name}${josa(it.name, '을', '를')} 놓을 곳을 탭하세요`);
        else if (it.kind === 'tool') this.toast(`${it.icon} ${it.name}! 🧶 장난감에서 쓸 수 있어요`);
        else this.toast(`${it.icon} 캣휠이 ${it.name}로 바뀌었어요!`);
      });
    });
  },

  // ---------- 사진 앨범 ----------
  openAlbum() {
    const S = World.state, photos = World.loadPhotos(), byId = Object.fromEntries(photos.map(p => [p.id, p]));
    const got = MOMENT_INFO.filter(m => S.album.moments[m[0]]).length;
    const moments = MOMENT_INFO.map(([id, ic, name]) => {
      const pid = S.album.moments[id], p = pid && byId[pid];
      if (!pid) return `<div class="m"><b>❔</b>${name}</div>`;
      return `<div class="m got" data-n="${ic} ${name}" ${p ? `data-photo="${p.id}"` : ''}>${p ? `<img src="${p.img}" alt="${name}">` : `<b>${ic}</b>${name}`}</div>`;
    }).join('');
    const recent = photos.slice().reverse().map(p => `<div class="m" data-photo="${p.id}"><img src="${p.img}" alt="${esc(p.cat)}"></div>`).join('');
    this.sheet(`<h2>📷 사진 앨범</h2>
      <p style="font-size:13px;color:var(--ink2);margin:0 0 8px">🧶 장난감 → 📷 사진 찍기로 고양이를 찍어요. 처음 찍은 순간마다 🪙${FILM.newMoment}, 16개를 다 모으면 🪙${FILM.complete}! · 필름 ${S.film || 0}장</p>
      <h3 style="margin-top:4px">📮 사진 의뢰</h3>${S.comm.map((q, i) => `<div class="mis"><div class="tx">${World.commText(q)}</div><span class="rw">🪙 ${q.reward}</span><button class="chip" data-reroll="${i}" title="다른 의뢰로 바꾸기">🔄 ${COMMISSION.reroll}</button></div>`).join('')}
      <h3>순간 도감 ${got}/${MOMENT_INFO.length}</h3><div class="album">${moments}</div>
      <h3>최근 사진</h3>${recent ? `<div class="album photos">${recent}</div>` : '<p style="font-size:13px;color:var(--ink2)">아직 찍은 사진이 없어요.</p>'}
      <button class="btn" id="goCam">📷 사진 찍으러 가기</button>`, el => {
      el.querySelectorAll('[data-photo]').forEach(d => d.onclick = () => this.openPhoto(byId[d.dataset.photo]));
      el.querySelector('#goCam').onclick = () => { this.closeLayer(); this.startCamera(); };
      el.querySelectorAll('[data-reroll]').forEach(b => b.onclick = () => { if (World.rerollCommission(+b.dataset.reroll)) this.openAlbum(); });
    });
  },
  openPhoto(p) {
    if (!p) return;
    const names = p.moments.map(id => (MOMENT_INFO.find(m => m[0] === id) || [])[2]).filter(Boolean).join(', ');
    this.modal(`<img src="${p.img}" alt="${esc(p.cat)}" style="width:100%;border-radius:14px;display:block">
      <p style="margin:10px 0 0"><b>${esc(p.cat)}</b> · ${p.day}일차</p>${names ? `<p style="font-size:13px;color:var(--ink2);margin:4px 0 0">📸 ${names}</p>` : ''}
      <button class="btn sub" id="pBack">앨범으로</button><button class="btn danger" id="pDel">사진 지우기</button>`, el => {
      el.querySelector('#pBack').onclick = () => this.openAlbum();
      el.querySelector('#pDel').onclick = () => { World.savePhotos(World.loadPhotos().filter(x => x.id !== p.id)); this.toast('사진을 지웠어요. 순간 도감 기록은 남아요'); this.openAlbum(); };
    });
  },
  startCamera() {
    const S = World.state;
    if ((S.film || 0) <= 0) { this.toast('🎞️ 필름이 없어요. 상점에서 사 주세요'); this.openShop('snack'); return; }
    this.setMode({ type: 'camera' }, `📷 찍을 고양이를 탭하세요 · 필름 ${S.film}장`);
  },
  snap(c) {
    const r = World.takePhoto(c);
    if (!r) { this.setMode(null); this.toast('🎞️ 필름을 다 썼어요. 상점에서 더 살 수 있어요'); return; }
    const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const names = r.fresh.map(id => MOMENT_INFO.find(m => m[0] === id)[2]);
    (r.doneComm || []).forEach(q => this.toast(`📮 사진 의뢰 완료! ${World.commText(q)} +${q.reward}🪙`, 3500));
    if (r.complete) this.toast(`🎉 순간 도감 완성! 보너스 🪙${FILM.complete}`, 4000);
    else if (names.length) this.toast(`📸 새로운 순간: ${names.join(', ')}! +${FILM.newMoment * names.length}🪙`, 3500);
    else this.toast(r.ms.length ? '📸 찰칵! 이미 도감에 있는 순간이에요' : '📸 찰칵! 특별한 순간일 때 찍으면 도감이 채워져요');
    if (World.state.film > 0) $('#modeText').textContent = `📷 찍을 고양이를 탭하세요 · 필름 ${World.state.film}장`;
    else { this.setMode(null); this.toast('🎞️ 필름을 다 썼어요'); }
  },

  openCatInfo(c) {
    this.infoCat = c;
    const P = PERS[c.pers], coat = COATS[c.coat];
    const days = World.state.day - c.adopted + 1;
    const snackLine = ['churu', 'bugeo', 'chicken'].map(k => `${SNACKS[k].icon} ${c.daily[k] || 0}/${SNACKS[k].limit}`).join(' · ');
    this.sheet(`<h2>${esc(c.name)} <small style="font-size:14px;color:var(--ink2)">${coat.name} · ${P.name}</small></h2>
      <p style="margin:0 0 8px;font-size:14px;color:var(--ink2)">${P.desc} · 함께한 지 ${days}일</p>
      <div id="bars"></div>
      <div id="howBox"></div>
      <p style="font-size:13px;color:var(--ink2);margin:10px 0 0">오늘 먹은 간식: ${snackLine}</p>
      <h3>🎀 꾸미기</h3><div id="accBox"></div>`, el => { this.updateInfo(); this.renderAcc(el, c); });
  },
  renderAcc(el, c) {
    const box = el.querySelector('#accBox'), own = World.state.decor.owned;
    const owned = Object.entries(ACCESSORIES).filter(([k]) => World.accColors(k).length);
    if (!owned.length) { box.innerHTML = '<p style="font-size:13px;color:var(--ink2);margin:0">아직 소품이 없어요.</p><button class="btn sub" id="toStyle">🏪 소품 사러 가기</button>'; box.querySelector('#toStyle').onclick = () => this.openShop('style'); return; }
    box.innerHTML = [['neck', '목'], ['head', '머리']].map(([slot, label]) => `<div style="font-size:13px;color:var(--ink2);margin-top:6px">${label}</div><div class="chips" style="justify-content:flex-start">
      <button class="chip ${!c.acc[slot] ? 'on' : ''}" data-slot="${slot}" data-id="">없음</button>${owned.filter(([, a]) => a.slot === slot).map(([k, a]) => `<button class="chip ${c.acc[slot] === k ? 'on' : ''}" data-slot="${slot}" data-id="${k}">${a.icon} ${a.name}</button>`).join('')}</div>
      ${c.acc[slot] && World.accColors(c.acc[slot]).length > 1 ? `<div class="swatches" style="justify-content:flex-start;margin:4px 0 0">${World.accColors(c.acc[slot]).map(col => `<button data-col="${slot}:${col}" class="own ${(c.acc[slot + 'C'] || 'base') === col ? 'on' : ''}" style="width:30px;height:30px;background:${ACC_COLORS[col].c || '#eee'}" title="${ACC_COLORS[col].name}">${col === 'base' ? '기본' : ''}</button>`).join('')}</div>` : ''}`).join('');
    box.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
      const cols = b.dataset.id ? World.accColors(b.dataset.id) : [];
      c.acc[b.dataset.slot] = b.dataset.id || null; c.acc[b.dataset.slot + 'C'] = cols.includes('base') ? 'base' : cols[0] || null; World.save(); Sound.play('pop');
      if (b.dataset.id) { World.hearts(c, 2); World.say(c, 'thanks', true); }
      this.renderAcc(el, c);
    });
    box.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { const [slot, col] = b.dataset.col.split(':'); c.acc[slot + 'C'] = col; World.save(); Sound.play('pop'); World.hearts(c, 1); this.renderAcc(el, c); });
  },
  // 소품 색 고르기: 미리보기를 보고 원하는 색을 삼
  openAccColors(k, sel) {
    const a = ACCESSORIES[k], S = World.state, cols = Object.keys(ACC_COLORS);
    sel = sel || (World.accColors(k)[0] || 'base');
    const info = ACC_COLORS[sel], owned = World.accOwned(k, sel), locked = info.shelter && S.shelter.tier < info.shelter;
    this.modal(`<h2>${a.icon} ${a.name}</h2><canvas id="accPrev" style="width:100%;height:170px"></canvas>
      <div class="swatches">${(a.noColor ? ['base'] : cols).map(col => `<button data-c="${col}" class="${World.accOwned(k, col) ? 'own' : ''} ${col === sel ? 'on' : ''} ${ACC_COLORS[col].shelter && S.shelter.tier < ACC_COLORS[col].shelter ? 'lock' : ''}" style="background:${ACC_COLORS[col].c || '#f3e7df'}" title="${ACC_COLORS[col].name}">${col === 'base' ? '기본' : ''}</button>`).join('')}</div>
      <p style="text-align:center;margin:0;font-size:14px"><b>${info.name}</b>${locked ? ` · 🏥 보호소 후원 ${info.shelter}단계에 열려요` : ''}</p>
      ${owned ? '<button class="btn sub" disabled>✔ 보유 중 · 고양이를 탭해서 씌워요</button>' : locked ? '' : `<button class="btn" id="buyCol">🪙 ${World.accPrice(k, sel)} 구매</button>`}
      <button class="btn sub" id="colBack">상점으로</button>`, el => {
      const cv = el.querySelector('#accPrev'); let alive = true; const t0 = performance.now();
      const acc = { neck: a.slot === 'neck' ? k : null, head: a.slot === 'head' ? k : null, neckC: sel, headC: sel };
      const loop = now => { if (!alive || !cv.isConnected) return; const g = cv.getContext('2d'); drawCatPreview(cv, 'cheese', 'green', 'front', (now - t0) / 1000); const s = cv.clientHeight / 110, dpr = Math.min(2, window.devicePixelRatio || 1); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.save(); g.translate(cv.clientWidth / 2, cv.clientHeight * 0.86); g.scale(s, s); const L = catLayout('front', 0); if (acc.head) drawAccessory(g, L, acc.head, accHex(sel)); if (acc.neck) drawAccessory(g, L, acc.neck, accHex(sel)); g.restore(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { alive = false; this.openAccColors(k, b.dataset.c); });
      const buy = el.querySelector('#buyCol');
      if (buy) buy.onclick = () => { if (World.buyAccColor(k, sel)) { this.toast(`${a.icon} ${info.name} ${a.name}! 고양이를 탭해서 씌워 주세요`); alive = false; this.openAccColors(k, sel); } };
      el.querySelector('#colBack').onclick = () => { alive = false; this.openShop('style'); };
    });
  },

  shelterLetter(ups) {
    const last = ups[ups.length - 1], S = World.state;
    this.modal(`<h2>💌 보호소에서 감사 편지가 왔어요</h2>
      <p>후원 <b>${last.tier}단계</b>가 되었어요! 덕분에 지금까지 길고양이 <b>${last.tier * SHELTER.rescuedPerTier}마리</b>가 따뜻한 집을 찾았어요. 고마워요냥!</p>
      <p style="font-size:14px">🎁 선물: ${ups.map(u => u.gift).join(', ')}</p>
      ${ups.some(u => u.gold) ? '<p style="font-size:14px">✨ 소품 색 <b>후원자 금색</b>이 열렸어요!</p>' : ''}
      <button class="btn" id="ok">좋아요</button>`, el => { el.querySelector('#ok').onclick = () => this.openShop('expand'); });
    Sound.play('trill', { pitch: 1.2 });
    World.state.cats.forEach(c => World.hearts(c, 2));
  },

  // ---------- 미션 ----------
  updateMisBtn() {
    const S = World.state; if (!S || !S.mis) return;
    const done = S.mis.daily.filter(m => m.done).length, all = S.mis.daily.length;
    $('#misCount').textContent = `${done}/${all}`;
    $('#misBtn').classList.toggle('done', done === all);
  },
  openMissions() {
    const S = World.state; World.ensureMissions();
    const row = m => `<div class="mis ${m.done ? 'done' : ''}"><div class="tx">${m.done ? '✅ ' : ''}${m.text} ${m.n > 1 ? m.n + '번' : ''}<div class="bar"><i style="width:${m.p / m.n * 100}%;background:${m.weekly ? '#c3a3f0' : '#ff8fab'}"></i></div></div><span class="rw">${m.p}/${m.n}<br>🪙 ${m.reward + (m.weekly ? MISSION.weeklyBonus : 0)}</span></div>`;
    this.sheet(`<h2>📋 미션</h2>
      <h3 style="margin-top:0">오늘의 미션 <small style="font-size:12px">· 모두 끝내면 보너스 🪙${MISSION.allBonus}${S.mis.bonus ? ' ✔' : ''}</small></h3>${S.mis.daily.map(row).join('')}
      <h3>이번 주 미션 <small style="font-size:12px">· 완료하면 필름 ${MISSION.weeklyFilm}장도 줘요</small></h3>${(S.mis.weekly || []).map(row).join('')}
      <p style="font-size:12px;color:var(--ink2)">미션은 매일 아침(주간은 7일마다) 새로 바뀌어요. 달성하면 코인이 바로 들어와요.</p>`);
  },

  updateInfo() {
    const c = this.infoCat, el = $('#bars'); if (!c || !el) return;
    const st = c.stats;
    const rows = [['🐟 배부름', st.hunger, '#f2a65a'], ['💗 행복', st.happy, '#ff8fab'], ['⚡ 에너지', st.energy, '#9fd3ff'], ['🚽 화장실', st.comfort, '#8fd6b5'], ['🤝 친밀도', st.bond, '#c3a3f0']];
    const how = $('#howBox');
    if (how) {
      const HOW = { hunger: '🥫 밥그릇 채우기 · 🍗 닭가슴살', happy: '🎣 놀아주기 · 💗 쓰다듬기 · 🌿 캣잎', energy: '푹 자게 두기 (숨숨집·캣타워·해먹에서 잘 자요)',
        comfort: '🧹 화장실을 깨끗하게', bond: '💗 쓰다듬기 · 🍬 츄르 · 🎣 놀아주기 · 부탁 들어주기' + (c.pers === 'tsun' ? ' (새침이는 쓰다듬기 효과가 커요)' : '') };
      const NAME = { hunger: '배부름', happy: '행복', energy: '에너지', comfort: '화장실', bond: '친밀도' };
      const low = Object.keys(HOW).filter(k => st[k] < 50).sort((a, b) => st[a] - st[b]);
      const req = c.req ? `<div>💬 지금 부탁: <b>${REQUESTS[c.req.type].icon} ${REQUESTS[c.req.type].text}</b> · ${REQUESTS[c.req.type].hint}</div>` : '';
      const html = req + low.map(k => `<div>💡 <b>${NAME[k]}</b> 올리기: ${HOW[k]}</div>`).join('');
      if (how._html !== html) { how._html = html; how.innerHTML = html ? `<div class="how">${html}</div>` : ''; }
    }
    el.innerHTML = rows.map(([n, v, col]) => `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${v}%;background:${col}"></i></div><em>${Math.round(v)}</em></div>`).join('');
  },

  openLitter(f) {
    const html = `<h2>🧹 화장실 청소</h2><p style="margin:0;font-size:14px;color:var(--ink2)">감자와 맛동산을 탭해서 떠내세요 (하나에 🪙1)</p>
      <div class="sand ${f.v === 2 ? 'v2' : ''}" id="sand"></div><button class="btn sub" id="lclose">다 했어요</button>`;
    this.modal(html, el => {
      const sand = el.querySelector('#sand');
      const render = () => {
        sand.innerHTML = '';
        if (!f.clumps.length) { sand.innerHTML = '<p style="text-align:center;margin-top:90px;font-family:Jua;font-size:20px">✨ 깨끗해요! ✨</p>'; return; }
        f.clumps.forEach((c, i) => {
          const d = document.createElement('div');
          d.className = 'clump' + (c.kind === 'poo' ? ' poo' : '');
          const seed = (i * 73 + 17) % 100;
          d.style.left = (8 + (seed * 0.8) % 72) + '%'; d.style.top = (12 + ((i * 41) % 64)) + '%';
          d.onclick = () => {
            if (d.classList.contains('gone')) return;
            d.classList.add('gone');
            // 삽을 든 손이 떠내는 모습
            const fxc = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
            fxc.width = 100 * dpr; fxc.height = 120 * dpr;
            fxc.style.cssText = `position:absolute;pointer-events:none;width:100px;height:120px;left:${d.offsetLeft - 28}px;top:${d.offsetTop - 70}px`;
            sand.appendChild(fxc);
            const fg = fxc.getContext('2d'), t0 = performance.now();
            const anim = now => {
              const p = Math.min(1, (now - t0) / 550);
              fg.setTransform(dpr, 0, 0, dpr, 0, 0); fg.clearRect(0, 0, 100, 120);
              fg.save(); fg.translate(50, 86); fg.scale(1.3, 1.3); drawScoopHand(fg, p); fg.restore();
              if (p < 1) requestAnimationFrame(anim); else fxc.remove();
            };
            requestAnimationFrame(anim);
            Sound.play('scoop');
            const idx = f.clumps.indexOf(c); if (idx >= 0) f.clumps.splice(idx, 1);
            World.addCoins(1, f.x, floorY(f.z) - 40); World.track('clean');
            World.state.cats.forEach(k => { k.litterRefuse = 0; });
            if (!f.clumps.length) { World.emit('cleaned'); setTimeout(render, 300); }
          };
          sand.appendChild(d);
        });
      };
      render();
      el.querySelector('#lclose').onclick = () => this.closeLayer();
    });
  },

  openSettings() {
    const s = World.state.settings;
    this.modal(`<h2>⚙️ 설정</h2>
      <div class="row"><label>🔊 효과음</label><input type="range" min="0" max="1" step="0.05" id="sSfx" value="${s.sfx}"></div>
      <div class="row"><label>🎵 배경음악</label><input type="range" min="0" max="1" step="0.05" id="sBgm" value="${s.bgm}"></div>
      <div class="row" style="margin-bottom:0"><label>⏱️ 시간 속도</label></div>
      <div class="seg full" id="sSpeed">${SPEEDS.map(sp => `<button data-v="${sp.k}" class="${(s.speed || 1) === sp.k ? 'on' : ''}">${sp.name}<br><small>${sp.desc}</small></button>`).join('')}</div>
      <div class="row"><label>🔇 음소거</label><button class="toggle ${s.mute ? 'on' : ''}" id="sMute"></button></div>
      <div class="row"><label>📳 진동 (안드로이드)</label><button class="toggle ${s.vibrate ? 'on' : ''}" id="sVib"></button></div>
      <div class="row"><label>😺 우는 빈도</label><div class="seg" id="sMeow">
        ${[['low', '적게'], ['normal', '보통'], ['high', '많이']].map(([k, n]) => `<button data-v="${k}" class="${s.meow === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <h3 style="font-family:Jua;font-weight:400;margin:16px 0 4px;color:var(--ink2)">💾 백업</h3>
      <button class="btn sub" id="sExport">📤 백업 코드 만들기</button>
      <button class="btn sub" id="sImport">📥 백업 불러오기</button>
      <button class="btn danger" id="sReset">🔄 새로 시작</button>
      <button class="btn" id="sClose">닫기</button>`, el => {
      const apply = () => { Sound.apply(s); World.save(); };
      el.querySelector('#sSfx').oninput = e => { s.sfx = +e.target.value; apply(); };
      el.querySelector('#sSfx').onchange = () => Sound.play('meow', { pitch: 1.1 });
      el.querySelector('#sBgm').oninput = e => { s.bgm = +e.target.value; apply(); };
      el.querySelector('#sMute').onclick = e => { s.mute = !s.mute; e.target.classList.toggle('on', s.mute); apply(); };
      el.querySelector('#sVib').onclick = e => { s.vibrate = !s.vibrate; e.target.classList.toggle('on', s.vibrate); apply(); if (s.vibrate && navigator.vibrate) navigator.vibrate(30); };
      el.querySelectorAll('#sSpeed button').forEach(b => b.onclick = () => { s.speed = +b.dataset.v; el.querySelectorAll('#sSpeed button').forEach(x => x.classList.toggle('on', x === b)); apply(); this.hud(); });
      el.querySelectorAll('#sMeow button').forEach(b => b.onclick = () => { s.meow = b.dataset.v; el.querySelectorAll('#sMeow button').forEach(x => x.classList.toggle('on', x === b)); apply(); });
      el.querySelector('#sExport').onclick = () => this.exportBackup();
      el.querySelector('#sImport').onclick = () => this.openImport();
      el.querySelector('#sReset').onclick = () => this.confirmReset();
      el.querySelector('#sClose').onclick = () => this.closeLayer();
    });
  },
  // 백업: 파일 다운로드가 막힌 환경(아티팩트 등)에서도 되도록 글자로 복사/붙여넣기
  exportBackup() {
    const text = World.exportJSON();
    this.modal(`<h2>📤 백업 코드</h2><p style="font-size:14px;color:var(--ink2)">아래 글자를 통째로 복사해서 메모장이나 메신저 나에게 보내기에 저장해두세요.</p>
      <textarea id="bkText" readonly style="width:100%;height:140px;font-size:11px;border-radius:12px;border:2px solid var(--line);padding:8px;-webkit-user-select:text;user-select:text">${esc(text)}</textarea>
      <button class="btn" id="bkCopy">📋 복사하기</button><button class="btn sub" id="bkClose">닫기</button>`, el => {
      const ta = el.querySelector('#bkText');
      el.querySelector('#bkCopy').onclick = () => {
        const done = () => this.toast('📋 복사했어요! 안전한 곳에 붙여넣어 두세요');
        const fallback = () => { ta.focus(); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { this.toast('글자를 길게 눌러 직접 복사해주세요'); } };
        try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
      };
      el.querySelector('#bkClose').onclick = () => this.closeLayer();
    });
  },
  openImport() {
    this.modal(`<h2>📥 백업 불러오기</h2><p style="font-size:14px;color:var(--ink2)">저장해둔 백업 코드를 붙여넣거나 백업 파일을 골라주세요. 지금 키우는 고양이들은 백업 내용으로 바뀌어요.</p>
      <textarea id="imText" placeholder="여기에 백업 코드 붙여넣기" style="width:100%;height:120px;font-size:12px;border-radius:12px;border:2px solid var(--line);padding:8px;-webkit-user-select:text;user-select:text"></textarea>
      <button class="btn" id="imGo">불러오기</button>
      <button class="btn sub" id="imFile">📁 파일에서 고르기</button><input type="file" id="imPick" accept=".json,application/json,text/plain" hidden>
      <button class="btn sub" id="imClose">닫기</button>`, el => {
      el.querySelector('#imGo').onclick = () => this.importText(el.querySelector('#imText').value);
      el.querySelector('#imFile').onclick = () => el.querySelector('#imPick').click();
      el.querySelector('#imPick').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => this.importText(r.result); r.readAsText(f); };
      el.querySelector('#imClose').onclick = () => this.closeLayer();
    });
  },
  importText(text) {
    try {
      const s = JSON.parse(String(text).trim());
      if (!s || !Array.isArray(s.cats) || !s.cats.length || !Array.isArray(s.furniture)) throw new Error('bad');
      World.state = s; World.save(); World.noSave = true;
      location.reload();
    } catch (e) { this.toast('😿 올바른 백업 코드가 아니에요'); }
  },
  confirmReset() {
    this.modal(`<h2>🔄 새로 시작할까요?</h2><p>지금까지 키운 기록이 모두 지워져요.</p>
      <button class="btn sub" id="r1no">아니요</button><button class="btn danger" id="r1yes">네, 새로 시작할래요</button>`, el => {
      el.querySelector('#r1no').onclick = () => this.closeLayer();
      el.querySelector('#r1yes').onclick = () => {
        const names = World.state.cats.map(c => esc(c.name)).join(', ');
        this.modal(`<h2>😿 정말요?</h2><p><b>${names}</b>${josa(World.state.cats[World.state.cats.length - 1].name, '이', '가')} 모두 떠나요. 되돌릴 수 없어요.</p>
          <button class="btn sub" id="r2bak">📤 먼저 백업 코드 만들기</button>
          <button class="btn sub" id="r2no">취소</button>
          <button class="btn danger" id="r2yes">정말 새로 시작</button>`, el2 => {
          el2.querySelector('#r2bak').onclick = () => this.exportBackup();
          el2.querySelector('#r2no').onclick = () => this.closeLayer();
          el2.querySelector('#r2yes').onclick = () => { World.noSave = true; World.wipe(); location.reload(); };
        }, false);
      };
    }, false);
  },

  potAction(i) {
    const S = World.state, p = S.garden[i];
    if (!p) {
      const have = Object.entries(GARDEN.seeds).filter(([, sd]) => S.inv[sd.inv] > 0);
      this.modal(`<h2>🪴 빈 화분</h2><p style="font-size:14px">씨앗을 심고 매일 한 번 물을 주면 하루에 한 단계씩 자라요. 물을 안 주면 시들시들 멈춰요.</p>
        ${have.length ? have.map(([k, sd]) => `<button class="btn" data-seed="${k}">${sd.icon} ${sd.name} 심기 (${S.inv[sd.inv]}개 · ${sd.days}일)</button>`).join('') : '<p style="font-size:14px;color:var(--ink2)">씨앗이 없어요.</p>'}
        <button class="btn sub" id="toSeed">🏪 씨앗 사러 가기</button>`, el => {
        el.querySelectorAll('[data-seed]').forEach(b => b.onclick = () => { if (World.plant(i, b.dataset.seed)) { this.closeLayer(); World.waterPot(i); this.toast(`🌱 심고 물을 줬어요! 매일 물을 주세요 (${GARDEN.seeds[b.dataset.seed].days}일)`); } });
        el.querySelector('#toSeed').onclick = () => this.openShop('snack');
      });
      return;
    }
    const sd = GARDEN.seeds[p.seed];
    if (p.stage >= sd.days) { const r = World.harvest(i); if (r) this.toast(r.text, 3500); return; }
    if (World.waterPot(i)) this.toast(`💧 물을 줬어요 (${p.stage}/${sd.days}단계 · 내일 자라요)`);
    else this.toast(`🪴 오늘은 물을 줬어요. 내일 또 주세요 (${p.stage}/${sd.days}단계)`);
  },

  // ---------- 고양이 만들기 / 입양 ----------
  createCat(opts, done) {
    let coat = opts.coat || 'cheese', eye = opts.eye || 'yellow';
    const scr = document.createElement('div'); scr.className = 'screen'; scr.style.zIndex = 45;
    scr.innerHTML = `<div class="create"><h1 style="font-size:30px">${opts.title}</h1><p>${opts.sub}</p>
      <canvas id="preview"></canvas>
      <div class="chips" id="coatChips">${Object.entries(COATS).map(([k, c]) => `<button class="chip" data-c="${k}"><span class="dot" style="background:${c.pattern === 'calico' ? `linear-gradient(90deg,${c.patch} 33%,#fff 33% 66%,${c.dark} 66%)` : c.pattern === 'tuxedo' ? `linear-gradient(90deg,${c.base} 55%,#fff 55%)` : c.base}"></span>${c.name}</button>`).join('')}</div>
      <div class="chips" id="eyeChips">${Object.entries(EYES).map(([k, e]) => `<button class="chip" data-e="${k}"><span class="dot" style="background:${e.c}"></span>${e.name} 눈</button>`).join('')}</div>
      <div class="namebox"><input id="nameIn" maxlength="8" placeholder="이름" value="${esc(opts.name || pick(NAME_IDEAS))}"><button id="dice">🎲</button></div>
      <button class="btn" id="ok">${opts.ok}</button></div>`;
    document.body.appendChild(scr);
    const cv = scr.querySelector('#preview');
    const sync = () => {
      scr.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === coat));
      scr.querySelectorAll('[data-e]').forEach(b => b.classList.toggle('on', b.dataset.e === eye));
    };
    scr.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { coat = b.dataset.c; sync(); Sound.play('meow', { pitch: rand(0.95, 1.2) }); });
    scr.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { eye = b.dataset.e; sync(); Sound.play('pop'); });
    scr.querySelector('#dice').onclick = () => { scr.querySelector('#nameIn').value = pick(NAME_IDEAS); Sound.play('pop'); };
    let alive = true, t0 = performance.now();
    const loop = now => { if (!alive) return; drawCatPreview(cv, coat, eye, 'front', (now - t0) / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    sync();
    scr.querySelector('#ok').onclick = () => {
      const name = scr.querySelector('#nameIn').value.trim() || pick(NAME_IDEAS);
      alive = false; scr.remove();
      Sound.play('trill');
      done({ name, coat, eye });
    };
  },

  strayEncounter() {
    const st = World.stray; if (!st) return;
    this.modal(`<h2>🐾 길고양이가 찾아왔어요</h2><canvas id="strayCv" style="width:100%;height:160px"></canvas>
      <p>창밖에서 조그맣게 울고 있어요. 우리 집 가족으로 맞이할까요?</p>
      <button class="btn" id="adopt">💗 입양할게요</button><button class="btn sub" id="later">다음에요</button>`, el => {
      const cv = el.querySelector('#strayCv'); let alive = true; const t0 = performance.now();
      const loop = now => { if (!alive || !cv.isConnected) return; drawCatPreview(cv, st.coat, st.eye, 'front', (now - t0) / 1000); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      el.querySelector('#later').onclick = () => {
        alive = false; World.stray = null; World.state.strayNextDay = World.state.day + 1;
        $('#strayBanner').hidden = true; this.closeLayer(); this.toast('길고양이가 돌아갔어요. 내일 또 올지도 몰라요');
      };
      el.querySelector('#adopt').onclick = () => {
        alive = false; this.closeLayer();
        this.createCat({ title: '새 가족 맞이하기', sub: '털 색과 눈 색은 바꿀 수 있어요', ok: '우리 집에 온 걸 환영해! 🏠', coat: st.coat, eye: st.eye }, r => {
          const S = World.state, c = World.makeCat(r.name, r.coat, r.eye, S.day);
          c.newUntil = World.absMin() + 1440; c.acc = { neck: null, head: null }; c.x = CFG.WINDOW_X; c.z = 0.1; c._anim = 0;
          S.cats.push(c); S.strayIdx++; S.strayNextDay = S.day + (S.strayIdx > CFG.STRAY_DAYS.length ? 4 : 1); World.stray = null;
          $('#strayBanner').hidden = true;
          World.resize(); World.save();
          this.announceCat(c, true);
        });
      };
    });
  },
  announceCat(c, isNew) {
    const P = PERS[c.pers];
    this.modal(`<h2>${esc(c.name)}${josa(c.name, '은', '는')} ${P.name}예요!</h2><p>${P.desc}</p>
      ${isNew ? '<p style="font-size:13px;color:var(--ink2)">처음 하루는 다른 고양이들과 서먹해서 하악질을 할 수 있어요. 금방 친해질 거예요.</p>' : ''}
      <button class="btn" id="ok">좋아요!</button>`, el => { el.querySelector('#ok').onclick = () => { this.closeLayer(); if (!isNew) Tutorial.start(); }; }, false);
  },

  // ---------- 터치 입력 ----------
  bindInput() {
    const cv = World.canvas;
    let P = null, lpTimer = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => {
      if (P) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      const p = pos(e), w = World.toWorld(p.x, p.y);
      P = { id: e.pointerId, sx: p.x, sy: p.y, moved: 0, w, cat: World.hitCat(w.x, w.y), furn: World.hitFurn(w.x, w.y), camStart: World.cam, kind: null };
      const m = this.mode;
      if (m && m.type === 'ball' && World.toolHand) {
        P.kind = 'ballHand'; P.vx = 0; P.vy = 0; P.lt = performance.now(); P.lw = w;
        if (!World.ballHeld) World.pickBall();
        World.moveToolHand(w.x, w.y); return;
      }
      if (m && m.type === 'brush' && World.toolHand) World.moveToolHand(w.x, w.y);
      if (m && m.type === 'snack' && World.snackHand) { P.kind = 'snackHand'; World.moveSnackHand(w.x, w.y - 14); return; }
      if (m && (m.type === 'rod' || m.type === 'laser')) {
        P.kind = 'lure'; World.lure = { type: m.type, x: w.x, y: w.y, movedAt: World.t }; return;
      }
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (!P || P.kind || P.moved > 8) return;
        if (!m && !P.cat && !P.furn) {
          P.kind = 'call';
          World.callCats(w.x); World.call.y = w.y;
          World.hand = { kind: 'call', x: w.x, y: w.y, movedAt: World.t };
        }
      }, 450);
    });
    cv.addEventListener('pointermove', e => {
      if (!P || e.pointerId !== P.id) return;
      const p = pos(e), w = World.toWorld(p.x, p.y);
      const d = Math.hypot(p.x - P.sx, p.y - P.sy); P.moved = Math.max(P.moved, d);
      if (P.kind === 'ballHand') {
        const now = performance.now(), dtm = Math.max(1, now - P.lt) / 1000;
        P.vx = P.vx * 0.5 + (w.x - P.lw.x) / dtm * 0.5; P.vy = P.vy * 0.5 + (w.y - P.lw.y) / dtm * 0.5;
        P.lt = now; P.lw = w;
        World.moveToolHand(w.x, w.y); this.edgeScroll(p.x); return;
      }
      if (P.kind === 'brushHand') {
        World.moveToolHand(w.x, w.y);
        const c = World.hitCat(w.x, w.y);
        if (c && World.petStart(c, true)) { P.kind = 'pet'; World.petMove(); World.hand = { kind: 'brush', x: w.x, y: w.y, movedAt: World.t }; }
        else this.edgeScroll(p.x);
        return;
      }
      if (P.kind === 'snackHand') { World.moveSnackHand(w.x, w.y - 14); this.edgeScroll(p.x); return; }
      if (P.kind === 'lure') { const L = World.lure; if (L) { L.x = w.x; L.y = clamp(w.y, 10, CFG.ROOM_H - 6); L.movedAt = World.t; } this.edgeScroll(p.x); return; }
      if (P.kind === 'call') { World.call.x = w.x; World.call.y = w.y; World.hand = { kind: 'call', x: w.x, y: w.y, movedAt: World.t }; return; }
      if (P.kind === 'pet') {
        const c = World.pet && World.pet.cat;
        World.hand = { kind: World.pet && World.pet.brush ? 'brush' : 'pet', x: w.x, y: w.y, movedAt: World.t };
        if (World.toolHand) World.moveToolHand(w.x, w.y);
        if (c && World.hitCat(w.x, w.y) === c) World.petMove();
        return;
      }
      if (P.kind === 'drag') {
        World.dragMove(P.furn, w.x + P.offX, w.y + P.offY);
        World.hand = { kind: 'grab', x: w.x, y: w.y, movedAt: World.t };
        this.edgeScroll(p.x);
        return;
      }
      if (P.kind === 'pan') { World._camTarget = null; World.cam = P.camStart - (p.x - P.sx) / World.scale; World.clampCam(); return; }
      if (P.kind) return;
      const brushing = this.mode && this.mode.type === 'brush';
      if (brushing && !P.cat && d > 4) { P.kind = 'brushHand'; clearTimeout(lpTimer); World.moveToolHand(w.x, w.y); return; }
      if (P.cat && (!this.mode || brushing) && d > 6) {
        if (World.petStart(P.cat, brushing)) { P.kind = 'pet'; World.petMove(); World.hand = { kind: brushing ? 'brush' : 'pet', x: w.x, y: w.y, movedAt: World.t }; clearTimeout(lpTimer); return; }
      }
      if (P.furn && !P.cat && !this.mode && d > 8) {
        P.kind = 'drag'; clearTimeout(lpTimer);
        P.offX = P.furn.x - P.w.x; P.offY = floorY(P.furn.z) - P.w.y;   // 잡은 지점 유지
        World.dragStart(P.furn); World.dragMove(P.furn, w.x + P.offX, w.y + P.offY);
        World.hand = { kind: 'grab', x: w.x, y: w.y, movedAt: World.t };
        return;
      }
      if (d > 9) { P.kind = 'pan'; clearTimeout(lpTimer); }
    });
    const up = e => {
      if (!P || e.pointerId !== P.id) return;
      clearTimeout(lpTimer);
      const kind = P.kind, pp = P; P = null;
      if (kind === 'pet') World.petEnd();
      if (kind === 'call') World.call = null;
      if (kind === 'drag') World.dragEnd(pp.furn);
      if (kind === 'ballHand') World.dropBall(performance.now() - pp.lt > 120 ? 0 : pp.vx, performance.now() - pp.lt > 120 ? 0 : pp.vy);
      World.hand = null;
      if (kind === 'lure' && World.lure) World.lure.movedAt = -9;
      if (!kind && e.type === 'pointerup') this.tap(pp.w, pp.cat, pp.furn);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    $('#modeClose').onclick = () => this.setMode(null);
  },
  edgeScroll(px) {
    const edge = 40;
    if (px < edge) World.cam -= 6; else if (px > World.cssW - edge) World.cam += 6;
    World.clampCam();
  },

  tap(w, cat, furn) {
    const m = this.mode, S = World.state;
    const ec = World.hitEdgeArrow(w.x, w.y);
    if (ec) { World.focusCat(ec); return; }
    if (m) {
      if (m.type === 'snack') {
        if (m.kind === 'catnip') {
          if (w.y < CFG.WALL_H) { this.toast('바닥을 탭해주세요'); return; }
          if (World.scatterCatnip(w.x, World.zFromY(w.y))) this.setMode(null);
          return;
        }
        return;
      }
      if (m.type === 'camera') { if (cat) this.snap(cat); else this.toast('📷 고양이를 탭해서 찍어 주세요'); return; }
      if (m.type === 'brush') { this.toast(cat ? '고양이 위를 문질러야 빗질이 돼요' : '고양이를 문질러 빗질해 주세요'); return; }
      if (m.type === 'clean') {
        const pi = World.hitPoop(w.x, w.y);
        if (pi >= 0) {
          const p = S.poops.splice(pi, 1)[0];
          World.scoopFx(p.x, p.z);
          Sound.play('scoop'); World.addCoins(1, p.x, floorY(p.z) - 20); World.track('clean');
          if (!S.poops.length && !World.furn('litter').some(f => f.clumps.length)) { this.setMode(null); this.toast('✨ 깨끗해졌어요!'); }
          return;
        }
        if (World.hitFurn(w.x, w.y, ['water'])) { World.refreshWater(); return; }
        const lit = World.hitFurn(w.x, w.y, ['litter']);
        if (lit) { this.setMode(null); this.openLitter(lit); return; }
        this.toast('화장실이나 바닥의 실수를 탭해주세요');
        return;
      }
      if (m.type === 'place') {
        const it = ITEMS[m.item];
        if (it.kind !== 'wall' && w.y < CFG.WALL_H - 10) { this.toast('바닥을 탭해주세요'); return; }
        World.placeFurniture(m.item, w.x, w.y);
        this.setMode(null); this.toast(`${it.icon} ${it.name}${josa(it.name, '을', '를')} 놓았어요!`);
        return;
      }
      if (m.type === 'move') {
        if (m.furn.type !== 'hammock' && w.y < CFG.WALL_H - 10) { this.toast('바닥을 탭해주세요'); return; }
        World.moveFurniture(m.furn, w.x, w.y);
        this.setMode(null);
        return;
      }
      return;
    }
    if (cat && World.praiseCatch(cat)) return;
    if (cat && cat.req && cat.req.type === 'gift') { World.fulfill(cat, 'gift'); return; }
    if (cat) { this.openCatInfo(cat); Sound.play('meow', { pitch: cat.pitch, vol: 0.6 }); return; }
    const pot = World.hitPot(w.x, w.y);
    if (pot >= 0) { this.potAction(pot); return; }
    if (World.stray && World.hitWindow(w.x, w.y)) { this.strayEncounter(); return; }
    if (furn && furn.type === 'litter' && furn.clumps.length) { this.openLitter(furn); return; }
    if (furn && furn.type === 'bowl') { World.fillBowl(); return; }
    if (furn && furn.type === 'water') { World.refreshWater(); return; }
    const pi = World.hitPoop(w.x, w.y);
    if (pi >= 0) { this.setMode({ type: 'clean' }, '🧹 화장실이나 바닥의 실수를 탭하세요'); this.tap(w, null, null); }
  },
};

// ---------- 튜토리얼 ----------
const Tutorial = {
  steps: [
    null,
    { ic: '🥫', text: '<b>밥</b> 버튼을 눌러 밥그릇을 채워주세요', target: '#btnFood', ev: 'fed' },
    { ic: '💗', text: '고양이 위에서 손가락을 <b>문질러</b> 쓰다듬어 보세요. 골골송을 불러요!', ev: 'petDone' },
    { ic: '🧹', text: '고양이가 화장실을 썼어요! <b>청소</b> 버튼을 눌러 감자를 치워주세요', target: '#btnClean', ev: 'cleaned' },
  ],
  start() {
    const S = World.state;
    if (!S.tut || S.tut > 3) return;
    this.show();
  },
  show() {
    const S = World.state, st = this.steps[S.tut], el = $('#tut');
    document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
    if (!st) { el.hidden = true; return; }
    if (S.tut === 3) { const lit = World.furn('litter')[0]; if (lit && !lit.clumps.length) lit.clumps.push({ kind: 'pee' }, { kind: 'poo' }); }
    el.innerHTML = `<span class="ic">${st.ic}</span><div>${st.text}<div style="font-size:12px;color:var(--ink2);margin-top:3px">튜토리얼 ${S.tut}/3</div></div><button id="tutSkip">건너뛰기</button>`;
    el.hidden = false;
    const tb = $('#topbar').getBoundingClientRect();
    el.style.top = (tb.bottom + 8) + 'px'; el.style.bottom = 'auto';
    if (st.target) $(st.target).classList.add('pulse');
    $('#tutSkip').onclick = () => this.finish();
  },
  on(ev) {
    const S = World.state;
    if (!S.tut || S.tut > 3) return;
    if (this.steps[S.tut].ev !== ev) return;
    S.tut++;
    Sound.play('coin');
    if (S.tut > 3) this.finish(); else setTimeout(() => this.show(), 600);
  },
  finish() {
    World.state.tut = 99;
    $('#tut').hidden = true;
    document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
    UI.toast('🐾 이제 자유롭게 키워보세요! 빈 바닥을 꾹 누르면 고양이를 부를 수 있어요', 4500);
    World.save();
  },
};

// ---------- 팁: 낮은 수치를 올리는 방법을 가끔 제안 ----------
const Tips = {
  cool: 20, left: 0, showing: null, keyUntil: {},
  now() { return performance.now() / 1000; },
  tick(dt) {
    const S = World.state;
    if (!S || (S.tut && S.tut <= 3)) return;
    if (this.showing) { if ((this.left -= dt) <= 0) this.hide(); return; }
    if ((this.cool -= dt) > 0) return;
    if ($('#layer').innerHTML || UI.mode) { this.cool = 3; return; }
    const tip = this.pick();
    if (tip) this.show(tip); else this.cool = 10;
  },
  // 부탁이 생기면 조금 기다렸다가 바로 알려줌
  nudge(c) { if (!this.showing && this.cool > 4) this.cool = 4; },
  pick() {
    const S = World.state, out = [], add = t => { if (!(this.keyUntil[t.key] > this.now())) out.push(t); };
    const ga = n => josa(n, '이가', '가'), wa = n => josa(n, '과', '와');
    for (const c of S.cats) {
      const st = c.stats, nm = esc(c.name);
      if (c.req) {
        const rq = REQUESTS[c.req.type];
        const act = { play: ['🎣 낚싯대 꺼내기', () => UI.setMode({ type: 'rod' }, '🎣 손가락으로 끌어서 흔들어 주세요')],
          snack: ['🍬 간식 고르기', () => UI.openSnacks()],
          brush: ['🪮 빗 꺼내기', () => UI.setMode({ type: 'brush' }, '🪮 고양이를 문질러 빗질해 주세요')],
          pet: ['👀 보러 가기', () => World.focusCat(c)], gift: ['👀 보러 가기', () => World.focusCat(c)] }[c.req.type];
        add({ key: 'req' + c.id + c.req.type, pri: 90, text: `${rq.icon} <b>${nm}</b>의 부탁: "${rq.text}" ${rq.hint}`, btn: act[0], act: act[1] });
      }
      if (st.hunger < 35 && S.bowl < 1) add({ key: 'hunger', pri: 80, text: `🐟 <b>${nm}</b>${ga(c.name)} 배고파해요. 밥그릇을 채워주세요`, btn: '🥫 밥 주기', act: () => World.fillBowl() });
      if (st.happy < 40) add({ key: 'happy' + c.id, pri: 60, text: `💢 <b>${nm}</b>${ga(c.name)} 심심해 보여요. 놀아주거나 쓰다듬어 주면 행복도가 올라요`, btn: '🎣 놀아주기', act: () => { World.focusCat(c); UI.setMode({ type: 'rod' }, '🎣 손가락으로 끌어서 흔들어 주세요'); } });
      if (st.energy < 20 && !c._sleeping) add({ key: 'energy' + c.id, pri: 30, text: `💤 <b>${nm}</b>${ga(c.name)} 피곤해 보여요. 조용히 재워주세요${S.owned.hideout ? '' : '. 숨숨집이 있으면 더 푹 자요'}`, btn: S.owned.hideout ? null : '🏪 상점', act: () => UI.openShop() });
      if (st.bond < 30) {
        const churuLeft = (S.inv.churu || 0) > 0 && (c.daily.churu || 0) < SNACKS.churu.limit;
        add({ key: 'bond' + c.id, pri: 40,
          text: `🤝 <b>${nm}</b>${wa(c.name)} 더 친해지려면 하루에 여러 번 쓰다듬고, 츄르를 주고, 부탁을 들어주세요${c.pers === 'tsun' ? '. 새침이는 쓰다듬으면 친밀도가 더 많이 올라요' : ''}`,
          btn: churuLeft ? '🍬 츄르 주기' : '👀 보러 가기',
          act: churuLeft ? () => UI.startSnack('churu', c) : () => World.focusCat(c) });
      }
    }
    for (const c of S.cats) if (c._task && c._task.type === 'showOff') add({ key: 'liz' + c.id, pri: 95, text: `🦎 <b>${esc(c.name)}</b>${josa(c.name, '이가', '가')} 도마뱀을 잡아 와서 자랑하고 있어요! 고양이를 탭해서 칭찬해 주세요`, btn: '👀 보러 가기', act: () => World.focusCat(c) });
    S.garden.forEach((p, i) => {
      if (!p) return;
      const sd = GARDEN.seeds[p.seed];
      if (p.stage >= sd.days) add({ key: 'harvest' + i, pri: 45, text: `${sd.icon} 창가 화분의 ${p.seed === 'nip' ? '캣잎' : '꽃'}${josa(p.seed === 'nip' ? '캣잎' : '꽃', '이', '이')} 다 자랐어요! 화분을 탭해서 수확하세요`, btn: null });
      else if (p.watered !== S.day) add({ key: 'potwater' + i, pri: 32, text: '🪴 창가 화분이 목말라요. 화분을 탭하면 물을 줄 수 있어요', btn: null });
    });
    const dirty = World.furn('litter').reduce((a, f) => a + f.clumps.length, 0);
    if (dirty >= 2 || S.poops.length) add({ key: 'litter', pri: 75, text: `💩 화장실에 치울 게 ${dirty + S.poops.length}개 있어요. 더러우면 고양이가 화장실 밖에 실수할 수 있어요`, btn: '🧹 청소하기', act: () => UI.onTool('clean') });
    if (S.water < 35) add({ key: 'water', pri: 70, text: '💧 물그릇 물이 더러워졌어요. 물그릇을 탭하면 갈아줄 수 있어요', btn: '💧 물 갈아주기', act: () => World.refreshWater() });
    // 다음 해금까지 남은 조건
    const next = Object.entries(ITEMS).filter(([k]) => !S.seenUnlock[k]).sort((a, b) => a[1].day - b[1].day)[0];
    if (next) {
      const [, it] = next, mb = Math.round(World.maxBond());
      const need = [S.day < it.day ? `${it.day}일차` : null, mb < it.bond ? `친밀도 ${it.bond} (지금 ${mb})` : null].filter(Boolean).join(', ');
      if (need) add({ key: 'unlock' + it.name, pri: 15, text: `🎁 다음 아이템 <b>${it.icon} ${it.name}</b>까지: ${need}`, btn: null });
    }
    out.sort((a, b) => b.pri - a.pri);
    return out[0];
  },
  show(t) {
    const el = $('#tip');
    el.innerHTML = `<div class="tx">${t.text}</div>${t.btn ? `<button class="go">${t.btn}</button>` : ''}<button class="x" aria-label="닫기">✕</button>`;
    el.hidden = false;
    this.showing = t; this.left = 10;
    this.keyUntil[t.key] = this.now() + (t.pri >= 90 ? 25 : 120);
    if (t.btn) el.querySelector('.go').onclick = () => { this.hide(); Sound.play('pop', { vol: 0.4 }); t.act(); };
    el.querySelector('.x').onclick = () => this.hide();
  },
  hide() { $('#tip').hidden = true; this.showing = null; this.cool = 22; },
};

// ---------- 시작 ----------
const Game = {
  last: 0, hudT: 0,
  boot() {
    const saved = World.load();
    const sc = $('#startCat'); let alive = true; const t0 = performance.now();
    const demo = saved && saved.cats && saved.cats[0] ? saved.cats[0] : { coat: 'cheese', eye: 'yellow' };
    const loop = now => { if (!alive) return; drawCatPreview(sc, demo.coat, demo.eye, 'front', (now - t0) / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    $('#start').addEventListener('click', () => {
      alive = false;
      const settings = saved ? saved.settings : { sfx: 0.8, bgm: 0.35, mute: false, meow: 'normal', vibrate: true };
      Sound.init(settings);
      if (Sound.ctx) Sound.ctx.resume();
      $('#start').remove();
      if (saved) this.run(saved, false);
      else UI.createCat({ title: '첫 고양이 만들기', sub: '털 색, 눈 색, 이름을 골라주세요', ok: '이 아이로 할게요 🐾' }, r => {
        const c = World.makeCat(r.name, r.coat, r.eye, 1);
        const box = { x: 150, z: 0.58 };
        c.x = box.x; c.z = box.z;
        const st = World.newState(c);
        st.settings = settings;
        this.run(st, true);
      });
    }, { once: true });
  },
  run(state, fresh) {
    World.init($('#room'), state);
    Sound.settings = state.settings; Sound.apply(state.settings);
    if (fresh) {
      // 박스에서 빼꼼 등장
      const c = state.cats[0], box = World.furn('box')[0];
      World.setTask(c, 'box', { furn: box });
      c._task.sp = 2; box._occupant = c.id; c._spotFurn = box; c._inside = box; c.alt = 3; c._task.dur = 3; c._task.pose = 'sit';
      setTimeout(() => { World.meow(c, 'trill'); }, 900);
    }
    World.on('hud', () => UI.hud());
    World.on('toast', m => UI.toast(m));
    World.on('deals', () => { $('#shopBadge').hidden = false; setTimeout(() => UI.toast('🏷️ 오늘의 특가가 바뀌었어요!'), 1500); });
    World.on('unlock', k => { const it = ITEMS[k]; UI.toast(`🎁 상점에 새 아이템: ${it.icon} ${it.name}`, 3500); $('#shopBadge').hidden = false; Sound.play('trill', { pitch: 1.2 }); });
    World.on('strayArrived', () => { $('#strayBanner').hidden = false; UI.toast('🐾 창밖에 길고양이가 찾아왔어요!'); });
    World.on('strayGone', () => { $('#strayBanner').hidden = true; UI.toast('길고양이가 돌아갔어요. 내일 또 올지도 몰라요'); });
    ['fed', 'petDone', 'cleaned'].forEach(ev => World.on(ev, () => Tutorial.on(ev)));
    $('#speedBtn').onclick = () => {
      const s = World.state.settings, i = SPEEDS.findIndex(x => x.k === (s.speed || 1)), nx = SPEEDS[(i + 1) % SPEEDS.length];
      s.speed = nx.k; World.save(); UI.hud();
      UI.toast(`⏱️ 시간 속도: ${nx.name} (${nx.desc})`);
    };
    World.on('request', c => Tips.nudge(c));
    World.on('caught', c => Tips.nudge(c));
    World.on('snackGiven', () => UI.setMode(null));
    $('#pauseBtn').onclick = () => this.setPaused(true);
    $('#resumeBtn').onclick = () => this.setPaused(false);
    $('#strayBanner').onclick = () => UI.strayEncounter();
    document.querySelectorAll('.tool').forEach(b => b.onclick = () => UI.onTool(b.dataset.tool));
    $('#btnSettings').onclick = () => UI.openSettings();
    $('#misBtn').onclick = () => UI.openMissions();
    World.on('missionProgress', () => UI.updateMisBtn());
    World.on('missions', () => { UI.updateMisBtn(); setTimeout(() => UI.toast('📋 오늘의 미션이 도착했어요! 오른쪽 위 📋를 눌러 보세요'), 3000); });
    UI.updateMisBtn();
    UI.bindInput();
    window.addEventListener('resize', () => { World.resize(); if (!$('#tut').hidden) Tutorial.show(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { World.paused = true; World.petEnd(); Sound.suspend(); World.save(); }
      else { World.paused = false; this.last = 0; if (!World.userPaused) Sound.resume(); }
    });
    window.addEventListener('pagehide', () => World.save());
    // 처음엔 방 왼쪽(박스 근처)부터 보여줌
    World.cam = 0; World.clampCam(); if (!fresh) { World.focusCat(state.cats[0]); World.cam = World._camTarget || 0; }
    UI.hud();
    if (fresh) setTimeout(() => UI.announceCat(state.cats[0], false), 1200);
    else if (state.tut && state.tut <= 3) Tutorial.start();
    requestAnimationFrame(t => this.frame(t));
  },
  setPaused(on) {
    World.userPaused = on;
    $('#pauseScreen').hidden = !on;
    $('#pauseBtn').textContent = on ? '▶' : '⏸';
    if (on) { World.petEnd(); World.hand = null; World.save(); Sound.suspend(); }
    else { this.last = 0; Sound.resume(); }
  },
  frame(ts) {
    requestAnimationFrame(t => this.frame(t));
    if (World.paused || World.userPaused) return;
    const allAsleep = World.state.cats.every(c => c._sleeping);
    const minDt = 1000 / (allAsleep ? 15 : CFG.FPS);
    if (this.last && ts - this.last < minDt - 2) return;
    const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 1 / 30;
    this.last = ts;
    World.update(dt);
    Tips.tick(dt);
    World.petTick(dt);
    World.render();
    if ((this.hudT += dt) > 0.5) { this.hudT = 0; UI.hud(); UI.updateInfo(); }
  },
};

Game.boot();
