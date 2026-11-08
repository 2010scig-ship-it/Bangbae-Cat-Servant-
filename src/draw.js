'use strict';
// ===== 그리기: 고양이와 가구 (모두 코드로 그린 벡터) =====

function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- 고양이 도형 도우미 ----------
// 도형 데이터: 타원(e), 둥근 사각형(r), 다각형(p). 여러 개를 한 경로에 겹쳐 하나의 몸처럼 그림
const E = (x, y, rx, ry, rot = 0) => ({ t: 'e', x, y, rx, ry, rot });
const RR = (x, y, w, h, r) => ({ t: 'r', x, y, w, h, r });
const PG = pts => ({ t: 'p', pts });
function addShape(g, s) {
  if (s.t === 'e') { g.moveTo(s.x + s.rx * Math.cos(s.rot), s.y + s.rx * Math.sin(s.rot)); g.ellipse(s.x, s.y, s.rx, s.ry, s.rot, 0, Math.PI * 2); }
  else if (s.t === 'r') {
    const { x, y, w, h } = s, r = Math.min(s.r, w / 2, Math.abs(h) / 2);
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  } else { s.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
}
function pathOf(g, shapes) { g.beginPath(); shapes.forEach(s => addShape(g, s)); }
// 외곽선을 먼저 굵게 그린 뒤 채우면, 겹친 도형들이 이음매 없이 하나로 보임
function blob(g, shapes, fill, line, lw = 3.2) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = line; g.lineWidth = lw;
  shapes.forEach(s => { g.beginPath(); addShape(g, s); g.stroke(); });
  pathOf(g, shapes); g.fillStyle = fill; g.fill();
}
function furGrad(g, base, y0, y1) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, shade(base, 0.16)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.1));
  return gr;
}
const leg = (x, top, w = 9.6) => [RR(x - w / 2, top, w, -top - 1.5, w / 2), E(x + 1.2, -2.8, w * 0.64, 3.7)];

// 포즈별 뼈대(오른쪽을 보는 기준, 발 위치가 0,0)
function catLayout(pose, t) {
  const L = { body: [], back: [], extra: [], main: null, head: null, tail: null, view: 'side', headTilt: 0, legs: [] };
  const P = Math.PI;
  switch (pose) {
    case 'walk': case 'run': case 'eat': case 'stand': {
      const run = pose === 'run', moving = pose === 'walk' || run;
      const sp = run ? 17 : 8.5, amp = moving ? (run ? 7 : 4) : 0, ph = t * sp;
      const bob = moving ? Math.abs(Math.sin(ph)) * (run ? 2.6 : 1.1) : 0;
      const lx = (x, o) => x + Math.sin(ph + o) * amp;
      L.main = { x: -2, y: -21 - bob, rx: 22, ry: 13 };
      L.body = [E(-3, -21 - bob, 22, 13, run ? -0.05 : 0), E(12, -23 - bob, 11.5, 12.5), E(-14, -19 - bob, 11.5, 12)];
      L.back = [...leg(lx(-10, P), -17 - bob), ...leg(lx(16, 0), -17 - bob)];
      L.legs = [[lx(-16, 0), -17 - bob], [lx(10, P), -17 - bob]];
      L.head = pose === 'eat' ? { x: 27, y: -21, r: 17.5 } : { x: 22, y: -41 - bob, r: 19 };
      L.tail = { x0: -24, y0: -25 - bob, cx: -44, cy: -32, x1: -41, y1: -56 + Math.sin(t * 3) * 4 };
      if (run) L.tail = { x0: -24, y0: -25 - bob, cx: -44, cy: -28, x1: -52, y1: -38 + Math.sin(t * 6) * 3 };
      break;
    }
    case 'sit': case 'groom': case 'bat': case 'beg': case 'look': {
      L.main = { x: -1, y: -23, rx: 14, ry: 18 };
      L.body = [E(-5, -11, 15, 11), E(-1, -23, 14, 18, -0.2), E(6, -28, 9.5, 12)];
      L.extra = [E(-13, -3, 7.5, 3.6)];
      L.legs = [[5, -24], [11, -24]];
      L.head = { x: 6, y: -50, r: 19 };
      L.tail = { x0: -17, y0: -6, cx: -5, cy: 5, x1: 18, y1: 0 };
      if (pose === 'look') { L.head = { x: 5, y: -51, r: 19 }; L.headTilt = -0.35; }
      if (pose === 'beg') L.headTilt = -0.22;
      if (pose === 'groom') {
        L.head = { x: 9, y: -48, r: 19 }; L.legs = [[5, -24]];
        L.extra.push(E(15, -33, 4.6, 9.5, -0.6), E(19, -41, 5.4, 4.6));
      }
      if (pose === 'bat') {
        const s = Math.sin(t * 12) * 5; L.legs = [[5, -24]];
        L.extra.push(E(18, -31 + s * 0.4, 10, 4.6, -0.35 + s * 0.03), E(27, -34 + s, 5.4, 4.6));
      }
      break;
    }
    case 'squat': {
      L.main = { x: -2, y: -17, rx: 17, ry: 14 };
      L.body = [E(-2, -17, 17, 14, -0.2), E(-7, -9, 14, 9)];
      L.legs = [[8, -14], [13, -14]];
      L.head = { x: 9, y: -38, r: 18 };
      L.tail = { x0: -16, y0: -22, cx: -25, cy: -40, x1: -20, y1: -55 };
      break;
    }
    case 'loaf': {
      L.main = { x: 0, y: -14, rx: 26, ry: 14 };
      L.body = [E(0, -14, 26, 14), E(-12, -12, 13, 11.5)];
      L.extra = [E(22, -3.2, 6.2, 3.3)];
      L.head = { x: 20, y: -30, r: 18 };
      L.tail = { x0: -22, y0: -5, cx: -6, cy: 5, x1: 18, y1: 0 };
      L.socks = [[22, -3.2]];
      break;
    }
    case 'sleep': {
      const br = Math.sin(t * 1.6) * 0.8;
      L.main = { x: 0, y: -12, rx: 25, ry: 12 + br };
      L.body = [E(0, -12 + br * 0.5, 25, 12 + br), E(-11, -11, 13, 11)];
      L.head = { x: 18, y: -14, r: 16.5 };
      L.tail = { x0: -24, y0: -6, cx: -3, cy: 6, x1: 26, y1: -1 };
      L.sleep = true;
      break;
    }
    case 'front': {
      L.view = 'front';
      L.main = { x: 0, y: -22, rx: 16, ry: 19 };
      L.body = [E(0, -22, 16, 19), E(-12, -7, 8.5, 7), E(12, -7, 8.5, 7)];
      L.extra = [E(-13, -2.5, 6.5, 3.3), E(13, -2.5, 6.5, 3.3)];
      L.legs = [[-5.5, -21], [5.5, -21]];
      L.head = { x: 0, y: -52, r: 21 };
      L.tail = { x0: 13, y0: -7, cx: 36, cy: -6, x1: 30, y1: -34 + Math.sin(t * 3) * 3 };
      break;
    }
    case 'stretch': {
      L.main = { x: 0, y: -21, rx: 24, ry: 11 };
      L.body = [E(0, -21, 24, 11, 0.36), E(-14, -28, 11, 11)];
      L.back = [...leg(-11, -27)];
      L.legs = [[-17, -27]];
      L.extra = [E(21, -5, 13, 4.4), E(33, -4, 5.6, 3.5)];
      L.head = { x: 27, y: -15, r: 17 };
      L.tail = { x0: -22, y0: -33, cx: -30, cy: -52, x1: -20, y1: -68 };
      break;
    }
    case 'jump': {
      L.main = { x: 0, y: -24, rx: 26, ry: 11.5 };
      L.body = [E(0, -24, 26, 11.5, -0.15), E(14, -28, 10, 10)];
      L.extra = [E(-25, -15, 11, 4.2, 0.5), E(27, -31, 11, 4.2, -0.6), E(36, -36, 5, 4)];
      L.head = { x: 28, y: -41, r: 17.5 };
      L.tail = { x0: -24, y0: -24, cx: -42, cy: -22, x1: -54, y1: -32 };
      break;
    }
    case 'scratch': {
      const s = Math.sin(t * 14) * 5;
      L.main = { x: 2, y: -32, rx: 12, ry: 22 };
      L.body = [E(2, -32, 12, 22, 0.32), E(-4, -12, 12, 10)];
      L.extra = [E(17, -54 + s * 0.4, 4.6, 10, -0.6), E(23, -60 + s, 5.2, 4.6)];
      L.legs = [[-6, -12], [1, -12]];
      L.head = { x: 10, y: -61, r: 17.5 };
      L.tail = { x0: -8, y0: -12, cx: -28, cy: -6, x1: -34, y1: -22 };
      break;
    }
    case 'reach': {
      // 뒷발로 서서 앞발을 위로 뻗기
      const s = Math.sin(t * 7) * 3;
      L.main = { x: 0, y: -34, rx: 12, ry: 21 };
      L.body = [E(0, -34, 12, 21, 0.12), E(-3, -14, 12.5, 10)];
      L.back = [E(2, -66, 4, 10, -0.2), E(0, -77 - s, 4.6, 4.2)];
      L.extra = [E(9, -65, 4.6, 11, 0.35), E(13, -77 + s, 5.2, 4.6)];
      L.legs = [[-6, -10], [2, -10]];
      L.head = { x: 4, y: -58, r: 18 }; L.headTilt = -0.4;
      L.tail = { x0: -8, y0: -14, cx: -30, cy: -4, x1: -34, y1: -24 + s };
      break;
    }
    case 'hiss': {
      L.main = { x: 0, y: -32, rx: 25, ry: 16 };
      L.body = [E(0, -32, 25, 16), E(14, -28, 10.5, 11.5)];
      L.back = [...leg(-10, -24), ...leg(18, -24)];
      L.legs = [[-16, -24], [12, -24]];
      L.head = { x: 25, y: -34, r: 17 };
      L.tail = { x0: -20, y0: -38, cx: -36, cy: -48, x1: -30, y1: -72 };
      L.puff = true; L.earsBack = true; L.mouthOpen = true;
      break;
    }
    case 'roll': {
      const w = Math.sin(t * 8) * 0.2;
      L.main = { x: 0, y: -13, rx: 25, ry: 12 };
      L.body = [E(0, -13, 25, 12, w)];
      L.extra = [-12, -4, 8, 16].map((x, i) => E(x, -27 + Math.sin(t * 9 + i) * 3, 4, 8, 0.2 * (i - 1.5)));
      L.head = { x: 23, y: -14, r: 17 };
      L.tail = { x0: -24, y0: -10, cx: -36, cy: -2, x1: -44, y1: -10 };
      L.happyEyes = true;
      break;
    }
  }
  return L;
}

// o: {pose, t, mood:'happy'|'sad'|'normal', blink, mouth}
function drawCatShape(g, coatKey, eyeKey, o) {
  const coat = COATS[coatKey], eyeC = EYES[eyeKey].c;
  const L = catLayout(o.pose, o.t);
  const ol = coat.line;
  const socks = coat.pattern === 'tuxedo' || coat.pattern === 'calico' || coat.socks;
  g.lineJoin = 'round'; g.lineCap = 'round';

  // 꼬리
  const drawTail = () => {
    const tl = L.tail; if (!tl) return;
    const w = L.puff ? 12 : 7.5;
    g.beginPath(); g.moveTo(tl.x0, tl.y0); g.quadraticCurveTo(tl.cx, tl.cy, tl.x1, tl.y1);
    g.strokeStyle = ol; g.lineWidth = w + 3.2; g.stroke();
    g.strokeStyle = coat.base; g.lineWidth = w; g.stroke();
    if (coat.pattern === 'tabby') { g.setLineDash([3.5, 5]); g.strokeStyle = coat.dark; g.lineWidth = w - 0.5; g.stroke(); g.setLineDash([]); }
    if (coat.pattern === 'calico') { g.setLineDash([12, 40]); g.strokeStyle = coat.dark; g.lineWidth = w - 0.5; g.stroke(); g.setLineDash([]); }
    // 꼬리 끝
    if (coat.tailTip) { circ(g, tl.x1, tl.y1, w / 2); g.fillStyle = coat.tailTip; g.fill(); }
  };

  const legShapes = L.legs.flatMap(([x, top]) => leg(x, top));
  const bodyShapes = [...L.body, ...legShapes, ...L.extra];
  const y0 = Math.min(...L.body.map(s => s.y - s.ry)), y1 = 0;

  if (L.view !== 'front') drawTail();
  if (L.back.length) blob(g, L.back, shade(coat.base, -0.12), ol);
  if (L.puff) bodyShapes.push(E(L.main.x, L.main.y - 2, L.main.rx + 3, L.main.ry + 3));
  blob(g, bodyShapes, furGrad(g, coat.base, y0, y1), ol);

  // 무늬
  g.save(); pathOf(g, bodyShapes); g.clip();
  const m = L.main, front = L.view === 'front';
  if (coat.belly !== coat.base && coat.pattern !== 'tuxedo') {
    pathOf(g, [front ? E(m.x, m.y + m.ry * 0.25, m.rx * 0.62, m.ry * 0.75) : E(m.x + m.rx * 0.25, m.y + m.ry * 0.7, m.rx * 0.75, m.ry * 0.5)]);
    g.fillStyle = coat.belly; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
  }
  if (coat.pattern === 'tabby') {
    g.strokeStyle = coat.dark; g.globalAlpha = 0.72; g.lineCap = 'round';
    if (front) {
      for (let j = 0; j < 3; j++) [-1, 1].forEach(sd => {
        const y = m.y - m.ry * 0.5 + j * m.ry * 0.45;
        g.lineWidth = 2.6; g.beginPath(); g.moveTo(m.x + sd * m.rx * 1.05, y); g.quadraticCurveTo(m.x + sd * m.rx * 0.7, y + 1, m.x + sd * m.rx * 0.45, y + 3); g.stroke();
      });
    } else {
      for (let i = -2; i <= 2; i++) {
        const x = m.x + i * m.rx * 0.34;
        g.lineWidth = 3.2; g.beginPath(); g.moveTo(x - 2, m.y - m.ry * 1.1); g.quadraticCurveTo(x + 4, m.y - m.ry * 0.35, x + 1, m.y + m.ry * 0.25); g.stroke();
      }
    }
    L.legs.forEach(([x, top]) => { [0.35, 0.62].forEach(k => { const y = top * k; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4.5, y); g.lineTo(x + 4.5, y + 1); g.stroke(); }); });
    g.globalAlpha = 1;
  } else if (coat.pattern === 'calico') {
    pathOf(g, [E(m.x - m.rx * 0.45, m.y - m.ry * 0.45, m.rx * 0.6, m.ry * 0.7)]); g.fillStyle = coat.patch; g.fill();
    pathOf(g, [E(m.x + m.rx * 0.4, m.y - m.ry * 0.75, m.rx * 0.45, m.ry * 0.5)]); g.fillStyle = coat.dark; g.fill();
  } else if (coat.pattern === 'tuxedo') {
    pathOf(g, [E(front ? m.x : m.x + m.rx * 0.5, m.y + m.ry * 0.25, m.rx * (front ? 0.6 : 0.55), m.ry * 0.85)]);
    g.fillStyle = coat.belly; g.fill();
  }
  if (socks) {
    const pads = [...L.legs.map(([x]) => [x + 1.2, -2.8]), ...(L.socks || [])];
    if (L.view === 'front' || ['sit', 'groom', 'bat', 'beg', 'look'].includes(o.pose)) pads.push([-13, -3]);
    pads.forEach(([x, y]) => { pathOf(g, [E(x, y - 1, 6.6, 5)]); g.fillStyle = '#fffdf9'; g.fill(); });
  }
  g.restore();
  if (L.view === 'front') drawTail();

  // 머리
  const h = L.head;
  g.save();
  g.translate(h.x, h.y); g.rotate(L.headTilt || 0); g.translate(-h.x, -h.y);
  drawCatHead(g, L, coat, eyeC, o);
  if (o.acc && o.acc.head) drawAccessory(g, L, o.acc.head, accHex(o.acc.headC));
  g.restore();
  if (o.acc && o.acc.neck) drawAccessory(g, L, o.acc.neck, accHex(o.acc.neckC));
}

// 고양이 소품 (목: 목 아래, 머리: 머리 위). col이 있으면 그 색으로 칠함
function drawAccessory(g, L, id, col) {
  const h = L.head, r = h.r, front = L.view === 'front', P = Math.PI;
  const nx = front ? h.x : h.x - r * 0.12, ny = h.y + r * 0.86;
  const hx = front ? h.x : h.x + r * 0.12, top = h.y - r * 0.9;
  const C = d => col || d, line = d => shade(col || d, -0.25);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  switch (id) {
    case 'bell':
      g.beginPath(); g.ellipse(nx, ny, r * 0.62, r * 0.2, 0, 0.05 * P, 0.95 * P); g.strokeStyle = C('#e5484d'); g.lineWidth = r * 0.17; g.stroke();
      circ(g, nx, ny + r * 0.24, r * 0.16); g.fillStyle = '#f7c948'; g.fill(); g.strokeStyle = '#c99a1e'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(nx, ny + r * 0.26); g.lineTo(nx, ny + r * 0.38); g.stroke();
      break;
    case 'ribbon':
      [-1, 1].forEach(sd => { ell(g, nx + sd * r * 0.24, ny + r * 0.1, r * 0.24, r * 0.15, sd * 0.45); g.fillStyle = C('#ff8fb1'); g.fill(); g.strokeStyle = line('#ff8fb1'); g.lineWidth = 1; g.stroke(); });
      circ(g, nx, ny + r * 0.1, r * 0.1); g.fillStyle = shade(C('#ff8fb1'), -0.12); g.fill();
      break;
    case 'bowtie':
      [-1, 1].forEach(sd => { g.beginPath(); g.moveTo(nx, ny + r * 0.1); g.lineTo(nx + sd * r * 0.34, ny - r * 0.06); g.lineTo(nx + sd * r * 0.34, ny + r * 0.28); g.closePath(); g.fillStyle = C('#3b4a7a'); g.fill(); });
      circ(g, nx, ny + r * 0.1, r * 0.09); g.fillStyle = shade(C('#3b4a7a'), 0.2); g.fill();
      break;
    case 'scarf': case 'rainbow': {
      let cc = C('#e05a5a');
      if (id === 'rainbow') { cc = g.createLinearGradient(nx - r * 0.6, 0, nx + r * 0.6, 0); ['#ff6b6b', '#ffb347', '#ffe066', '#7bd88f', '#6ab7ff', '#b28dff'].forEach((c, i) => cc.addColorStop(i / 5, c)); }
      g.beginPath(); g.ellipse(nx, ny, r * 0.64, r * 0.22, 0, 0.02 * P, 0.98 * P); g.strokeStyle = cc; g.lineWidth = r * 0.26; g.stroke();
      g.save(); g.translate(nx + r * 0.25, ny + r * 0.12); g.rotate(0.25); rrect(g, -r * 0.1, 0, r * 0.22, r * 0.5, r * 0.06); g.fillStyle = cc; g.fill(); g.restore();
      if (id === 'scarf') { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; [-0.3, 0, 0.3].forEach(k => { g.beginPath(); g.moveTo(nx + k * r, ny + r * 0.05); g.lineTo(nx + k * r, ny + r * 0.3); g.stroke(); }); }
      break;
    }
    case 'flower': {
      const fx = h.x + (front ? r * 0.55 : r * 0.66), fy = h.y - r * 0.72;
      for (let i = 0; i < 5; i++) { const a = i / 5 * 2 * P; circ(g, fx + Math.cos(a) * r * 0.14, fy + Math.sin(a) * r * 0.14, r * 0.12); g.fillStyle = C('#ffb3c7'); g.fill(); }
      circ(g, fx, fy, r * 0.08); g.fillStyle = col === '#ffd23f' ? '#ff8fb1' : '#ffd36b'; g.fill();
      break;
    }
    case 'star': {
      g.beginPath(); g.ellipse(hx, h.y - r * 0.1, r * 0.98, r * 0.86, 0, 1.12 * P, 1.88 * P); g.strokeStyle = C('#ffd36b'); g.lineWidth = r * 0.12; g.stroke();
      const sx = hx, sy = top - r * 0.12, R = r * 0.24;
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -P / 2 + i * P / 5, rr = i % 2 ? R * 0.45 : R; i ? g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr) : g.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } g.closePath();
      g.fillStyle = C('#ffd36b'); g.fill(); g.strokeStyle = line('#ffd36b'); g.lineWidth = 1; g.stroke();
      break;
    }
    case 'beanie':
      g.beginPath(); g.moveTo(hx - r * 0.86, h.y - r * 0.42); g.quadraticCurveTo(hx - r * 0.8, top - r * 0.42, hx, top - r * 0.4); g.quadraticCurveTo(hx + r * 0.8, top - r * 0.42, hx + r * 0.86, h.y - r * 0.42); g.closePath();
      g.fillStyle = C('#8fc7ff'); g.fill(); g.strokeStyle = line('#8fc7ff'); g.lineWidth = 1; g.stroke();
      rrect(g, hx - r * 0.92, h.y - r * 0.52, r * 1.84, r * 0.22, r * 0.1); g.fillStyle = shade(C('#8fc7ff'), -0.15); g.fill();
      circ(g, hx, top - r * 0.48, r * 0.16); g.fillStyle = '#fff'; g.fill();
      break;
    case 'crown': {
      const by = top + r * 0.06, gr = g.createLinearGradient(0, by - r * 0.42, 0, by), base = C('#f2b632');
      gr.addColorStop(0, shade(base, 0.45)); gr.addColorStop(1, base);
      g.beginPath(); g.moveTo(hx - r * 0.38, by); g.lineTo(hx - r * 0.42, by - r * 0.34); g.lineTo(hx - r * 0.19, by - r * 0.16); g.lineTo(hx, by - r * 0.44); g.lineTo(hx + r * 0.19, by - r * 0.16); g.lineTo(hx + r * 0.42, by - r * 0.34); g.lineTo(hx + r * 0.38, by); g.closePath();
      g.fillStyle = gr; g.fill(); g.strokeStyle = shade(base, -0.3); g.lineWidth = 1; g.stroke();
      [[-0.22, '#ff6b8a'], [0, '#6ab7ff'], [0.22, '#ff6b8a']].forEach(([k, c]) => { circ(g, hx + k * r, by - r * 0.08, r * 0.06); g.fillStyle = c; g.fill(); });
      break;
    }
    case 'fishhat':
      ell(g, hx, top - r * 0.02, r * 0.55, r * 0.22); g.fillStyle = C('#9fd3ff'); g.fill(); g.strokeStyle = line('#9fd3ff'); g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(hx - r * 0.5, top); g.lineTo(hx - r * 0.82, top - r * 0.22); g.lineTo(hx - r * 0.82, top + r * 0.2); g.closePath(); g.fillStyle = shade(C('#9fd3ff'), -0.1); g.fill();
      circ(g, hx + r * 0.32, top - r * 0.06, r * 0.06); g.fillStyle = '#1d1a18'; g.fill();
      break;
  }
  g.restore();
}
const accHex = key => (key && ACC_COLORS[key] ? ACC_COLORS[key].c : null);

// 창가 화분 (원점 = 화분 바닥 가운데)
function drawPot(g, pot, t, i) {
  rrect(g, -9, -14, 18, 14, 3); g.fillStyle = '#d9845a'; g.fill();
  rrect(g, -11, -16, 22, 5, 2); g.fillStyle = '#e8996f'; g.fill();
  ell(g, 0, -15, 8, 1.8); g.fillStyle = '#6b4a35'; g.fill();
  if (!pot) return;
  const sd = GARDEN.seeds[pot.seed], ready = pot.stage >= sd.days, dry = pot.dry > 0;
  const leaf = dry ? '#b9b46a' : '#69b85c', sway = Math.sin(t * 1.5 + i) * 0.06;
  g.save(); g.translate(0, -15); g.rotate(sway);
  if (pot.stage === 0) { circ(g, 0, -1, 1.6); g.fillStyle = '#8a6a4a'; g.fill(); }
  else if (pot.seed === 'nip' || !ready) {
    const n = ready ? 7 : pot.stage + 1, h = ready ? 16 : 4 + pot.stage * 4;
    for (let k = 0; k < n; k++) {
      const a = -1.2 + (k / Math.max(1, n - 1)) * 2.4;
      g.save(); g.rotate(a * (dry ? 1.3 : 0.7)); ell(g, 0, -h * 0.6, 2.6 + (ready ? 1 : 0), h * 0.45); g.fillStyle = leaf; g.fill(); g.restore();
    }
  } else {
    g.strokeStyle = leaf; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -18); g.stroke();
    ell(g, -4, -8, 4, 2, -0.5); g.fillStyle = leaf; g.fill();
    const pc = ['#ff8fb1', '#ffd36b', '#b79cf0'][i % 3];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; circ(g, Math.cos(a) * 4, -21 + Math.sin(a) * 4, 3.2); g.fillStyle = pc; g.fill(); }
    circ(g, 0, -21, 2.4); g.fillStyle = '#fff3a8'; g.fill();
  }
  g.restore();
}

function earShapes(L) {
  const h = L.head, r = h.r, front = L.view === 'front', b = L.earsBack ? 1 : 0;
  const pts = front
    ? [[[-0.98, -0.22], [-0.78 - b * 0.3, -1.2 + b * 0.45], [-0.22, -0.84]], [[0.98, -0.22], [0.78 + b * 0.3, -1.2 + b * 0.45], [0.22, -0.84]]]
    : [[[-0.86, -0.26], [-0.58 - b * 0.35, -1.18 + b * 0.45], [-0.06, -0.86]], [[0.26, -0.9], [0.74 + b * 0.35, -1.16 + b * 0.45], [1.0, -0.26]]];
  return pts.map(tri => tri.map(([x, y]) => [h.x + x * r, h.y + y * r]));
}

function drawCatHead(g, L, coat, eyeC, o) {
  const h = L.head, r = h.r, front = L.view === 'front', ol = coat.line;
  const ears = earShapes(L);
  const cheek = sd => PG([[h.x + sd * r * 0.98, h.y + r * 0.02], [h.x + sd * r * 1.2, h.y + r * 0.3], [h.x + sd * r * 0.98, h.y + r * 0.34], [h.x + sd * r * 1.1, h.y + r * 0.52], [h.x + sd * r * 0.8, h.y + r * 0.62]]);
  const headShapes = [...ears.map(PG), E(h.x, h.y, r * 1.07, r * 0.93), cheek(-1), cheek(1)];
  blob(g, headShapes, furGrad(g, coat.base, h.y - r * 1.2, h.y + r), ol);

  // 무늬 (머리 전체에 맞춰 잘라 그림)
  g.save(); pathOf(g, headShapes); g.clip();
  const fx = front ? h.x : h.x + r * 0.2;
  if (coat.pattern === 'tabby') {
    g.strokeStyle = coat.dark; g.globalAlpha = 0.72; g.lineCap = 'round';
    [-0.2, 0, 0.2].forEach((k, i) => { g.lineWidth = i === 1 ? 2.8 : 2.3; g.beginPath(); g.moveTo(fx + k * r, h.y - r * 0.95); g.lineTo(fx + k * r * 0.8, h.y - r * (i === 1 ? 0.5 : 0.6)); g.stroke(); });
    [-1, 1].forEach(sd => [0.12, 0.3].forEach(k => { g.lineWidth = 1.8; g.beginPath(); g.moveTo(h.x + sd * r * 1.08, h.y + r * k); g.lineTo(h.x + sd * r * 0.78, h.y + r * (k + 0.04)); g.stroke(); }));
    g.globalAlpha = 1;
  } else if (coat.pattern === 'calico') {
    pathOf(g, [E(h.x - r * 0.62, h.y - r * 0.72, r * 0.7, r * 0.58)]); g.fillStyle = coat.patch; g.fill();
    pathOf(g, [E(h.x + r * 0.66, h.y - r * 0.8, r * 0.5, r * 0.48)]); g.fillStyle = coat.dark; g.fill();
  } else if (coat.pattern === 'tuxedo') {
    pathOf(g, [E(fx, h.y + r * 0.42, r * 0.5, r * 0.38), PG([[fx - r * 0.12, h.y + r * 0.1], [fx, h.y - r * 0.55], [fx + r * 0.12, h.y + r * 0.1]])]);
    g.fillStyle = coat.belly; g.fill();
  }
  // 주둥이 털
  if (coat.muzzle) { pathOf(g, [E(fx - r * 0.16, h.y + r * 0.4, r * 0.2, r * 0.15), E(fx + r * 0.16, h.y + r * 0.4, r * 0.2, r * 0.15)]); g.fillStyle = coat.muzzle; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1; }
  g.restore();

  // 귀 안쪽
  ears.forEach(tri => {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const inner = tri.map(([x, y]) => [cx + (x - cx) * 0.56, cy + (y - cy) * 0.56 + 1.5]);
    const gr = g.createLinearGradient(0, cy - r * 0.3, 0, cy + r * 0.2);
    gr.addColorStop(0, coat.earIn || '#f6a6b8'); gr.addColorStop(1, shade(coat.earIn || '#f6a6b8', 0.35));
    pathOf(g, [PG(inner)]); g.fillStyle = gr; g.fill();
  });

  drawCatFace(g, L, coat, eyeC, o, fx);
}

function drawCatFace(g, L, coat, eyeC, o, fx) {
  const h = L.head, r = h.r, front = L.view === 'front';
  const lineC = coat.face || '#4a2f25', eyeLine = coat.eyeLine || lineC;
  const closed = L.sleep || o.blink;
  const happy = L.happyEyes || o.mood === 'happy';
  const eyes = front ? [[-0.4, 0.02], [0.4, 0.02]] : [[-0.12, 0.02], [0.5, 0.02]];
  eyes.forEach(([ex, ey], i) => {
    const s = (!front && i === 1) ? 0.88 : 1;
    const x = h.x + ex * r, y = h.y + ey * r, rx = r * 0.2 * s, ry = r * 0.25 * s;
    if (closed) {
      g.beginPath(); g.arc(x, y - ry * 0.2, rx * 0.95, 0.12 * Math.PI, 0.88 * Math.PI); g.strokeStyle = eyeLine; g.lineWidth = 1.9; g.stroke();
    } else if (happy) {
      g.beginPath(); g.arc(x, y + ry * 0.45, rx * 0.95, 1.12 * Math.PI, 1.88 * Math.PI); g.strokeStyle = eyeLine; g.lineWidth = 2.1; g.stroke();
    } else {
      ell(g, x, y, rx, ry); g.fillStyle = '#2a1c18'; g.fill();
      const gr = g.createRadialGradient(x, y + ry * 0.5, ry * 0.05, x, y, ry);
      gr.addColorStop(0, shade(eyeC, 0.5)); gr.addColorStop(1, shade(eyeC, -0.12));
      ell(g, x, y + ry * 0.07, rx * 0.84, ry * 0.85); g.fillStyle = gr; g.fill();
      ell(g, x + (front ? 0 : rx * 0.08), y + ry * 0.1, rx * 0.48, ry * 0.66); g.fillStyle = '#1b1214'; g.fill();
      circ(g, x - rx * 0.3, y - ry * 0.36, rx * 0.4); g.fillStyle = '#fff'; g.fill();
      circ(g, x + rx * 0.32, y + ry * 0.38, rx * 0.17); g.fill();
      if (o.mood === 'sad') {
        g.beginPath(); g.moveTo(x - rx, y - ry * 1.25 + (i ? 0 : 2)); g.lineTo(x + rx, y - ry * 1.25 + (i ? 2 : 0));
        g.strokeStyle = eyeLine; g.lineWidth = 1.5; g.stroke();
      }
    }
  });
  // 볼터치
  const bl = front ? [[-0.64, 0.36], [0.64, 0.36]] : [[-0.42, 0.36], [0.86, 0.34]];
  bl.forEach(([bx, by]) => {
    const x = h.x + bx * r, y = h.y + by * r, gr = g.createRadialGradient(x, y, 0, x, y, r * 0.22);
    gr.addColorStop(0, 'rgba(255,128,150,0.55)'); gr.addColorStop(1, 'rgba(255,128,150,0)');
    ell(g, x, y, r * 0.24, r * 0.15); g.fillStyle = gr; g.fill();
  });
  // 코와 입
  const nx = fx, ny = h.y + r * 0.27;
  g.beginPath(); g.moveTo(nx - 2.6, ny - 1.3); g.quadraticCurveTo(nx, ny - 2.4, nx + 2.6, ny - 1.3); g.quadraticCurveTo(nx + 1, ny + 1.6, nx, ny + 1.7); g.quadraticCurveTo(nx - 1, ny + 1.6, nx - 2.6, ny - 1.3);
  g.fillStyle = '#f08aa2'; g.fill();
  if (L.mouthOpen || o.mouth) {
    ell(g, nx, ny + 5, 3, 3.6); g.fillStyle = '#b4485e'; g.fill();
    ell(g, nx, ny + 6.6, 1.8, 1.4); g.fillStyle = '#f59bb0'; g.fill();
  } else {
    g.beginPath(); g.moveTo(nx, ny + 1.4); g.lineTo(nx, ny + 2.6);
    g.arc(nx - 2.1, ny + 2.6, 2.1, 0, Math.PI * 0.95); g.moveTo(nx, ny + 2.6); g.arc(nx + 2.1, ny + 2.6, 2.1, Math.PI * 0.05, Math.PI);
    g.strokeStyle = lineC; g.lineWidth = 1.1; g.stroke();
  }
  // 수염
  g.strokeStyle = coat.whisker || 'rgba(110,80,65,0.5)'; g.lineWidth = 0.8;
  (front ? [-1, 1] : [1]).forEach(sd => {
    [-1, 1].forEach(k => { g.beginPath(); g.moveTo(nx + sd * r * 0.32, ny + 2 + k * 1.5); g.quadraticCurveTo(nx + sd * r * 0.75, ny + k * 3, nx + sd * r * 1.15, ny - 1 + k * 4.5); g.stroke(); });
  });
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + ((1 << 24) + (f(r) << 16) + (f(gg) << 8) + f(b)).toString(16).slice(1);
}

// 고양이 미리보기(생성 화면용)
function drawCatPreview(canvas, coat, eye, pose = 'front', t = 0) {
  const g = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,80,60,0.12)'; ell(g, w / 2, h * 0.86, 46, 9); g.fill();
  g.save(); g.translate(w / 2, h * 0.86); const s = h / 110; g.scale(s, s);
  drawCatShape(g, coat, eye, { pose, t, mood: 'normal', blink: (t % 4) < 0.12 });
  g.restore();
}

// ===== 가구 =====
const FURN_DRAW = {
  bowl(g, f) {
    ell(g, 0, -2, 22, 5); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    g.beginPath(); g.moveTo(-20, -12); g.lineTo(20, -12); g.lineTo(15, -1); g.lineTo(-15, -1); g.closePath();
    g.fillStyle = '#7ec4e8'; g.fill(); g.strokeStyle = '#4a8fb5'; g.lineWidth = 1.5; g.stroke();
    ell(g, 0, -12, 20, 4.5); g.fillStyle = '#d7eef8'; g.fill(); g.stroke();
    const p = (World.state.bowl || 0) / Math.max(1, World.bowlCap());
    if (p > 0) { ell(g, 0, -13 - p * 3, 16 * Math.min(1, p + 0.3), 3 + p * 3); g.fillStyle = '#b5743c'; g.fill(); }
    g.font = 'bold 7px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('🐾', 0, -4);
  },
  water(g, f) {
    const w = World.state.water == null ? 100 : World.state.water;
    ell(g, 0, -2, 20, 5); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    g.beginPath(); g.moveTo(-18, -11); g.lineTo(18, -11); g.lineTo(14, -1); g.lineTo(-14, -1); g.closePath();
    g.fillStyle = '#f7b5c6'; g.fill(); g.strokeStyle = '#d98aa0'; g.lineWidth = 1.5; g.stroke();
    ell(g, 0, -11, 18, 4.2); g.fillStyle = '#fde3ea'; g.fill(); g.stroke();
    if (w > 3) {
      ell(g, 0, -11, 15, 3 * Math.min(1, w / 60 + 0.3));
      g.fillStyle = w < 30 ? '#a9b79a' : w < 60 ? '#a7d3e6' : '#7cc6f0'; g.fill();
      if (w >= 60) { ell(g, -5, -12, 4, 1); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
    }
    g.font = '7px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('💧', 0, -4);
  },
  litter(g, f) {
    ell(g, 0, -2, 40, 7); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    rrect(g, -38, -26, 76, 26, 6); g.fillStyle = f.v === 2 ? '#c5a3e8' : '#f6a7c1'; g.fill();
    g.strokeStyle = 'rgba(90,50,60,0.4)'; g.lineWidth = 1.5; g.stroke();
    ell(g, 0, -25, 34, 5); g.fillStyle = '#efe3c8'; g.fill();
    (f.clumps || []).forEach((c, i) => {
      g.fillStyle = c.kind === 'poo' ? '#8a5a35' : '#d8c4a0';
      ell(g, -24 + (i * 13) % 50, -26 + (i % 2) * 2, c.kind === 'poo' ? 6 : 5, 3.2); g.fill();
    });
  },
  litterFront(g, f) { rrect(g, -38, -18, 76, 18, 6); g.fillStyle = f.v === 2 ? '#c5a3e8' : '#f6a7c1'; g.fill(); g.strokeStyle = 'rgba(90,50,60,0.4)'; g.stroke(); },
  wheel(g, f, t) {
    const led = World.state.owned.ledwheel, R = 58;
    ell(g, 0, -2, 46, 8); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    g.fillStyle = '#c9a477'; rrect(g, -40, -12, 80, 12, 4); g.fill();
    g.save(); g.translate(0, -R - 10);
    g.lineWidth = 9; g.strokeStyle = led ? `hsl(${(t * 80) % 360},90%,65%)` : '#f0e2cf'; circ(g, 0, 0, R); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(120,90,60,0.5)'; circ(g, 0, 0, R + 4.5); g.stroke(); circ(g, 0, 0, R - 4.5); g.stroke();
    g.rotate(f._angle || 0);
    for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(R - 4, 0); g.strokeStyle = 'rgba(160,120,80,0.45)'; g.lineWidth = 3; g.stroke(); }
    if (led) for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); circ(g, R, 0, 2.5); g.fillStyle = `hsl(${(i * 30 + t * 120) % 360},95%,70%)`; g.fill(); }
    g.restore();
    g.fillStyle = '#b08a5e'; g.beginPath(); g.moveTo(-6, -12); g.lineTo(0, -R - 10); g.lineTo(6, -12); g.fill();
  },
  scratcher(g) {
    ell(g, 0, -2, 22, 5); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    rrect(g, -20, -10, 40, 10, 3); g.fillStyle = '#a7865e'; g.fill();
    rrect(g, -7, -78, 14, 70, 3); g.fillStyle = '#d8be8f'; g.fill();
    g.strokeStyle = '#b89a6a'; g.lineWidth = 1.5;
    for (let y = -74; y < -10; y += 5) { g.beginPath(); g.moveTo(-7, y); g.lineTo(7, y + 2); g.stroke(); }
    rrect(g, -16, -86, 32, 9, 3); g.fillStyle = '#a7865e'; g.fill();
    circ(g, 10, -70, 4); g.fillStyle = '#ff9fb8'; g.fill();
  },
  box(g) {
    ell(g, 0, -2, 34, 6); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    g.fillStyle = '#c58f55'; g.beginPath(); g.moveTo(-30, -34); g.lineTo(30, -34); g.lineTo(26, -30); g.lineTo(-26, -30); g.fill();
    g.fillStyle = '#b07a43'; rrect(g, -30, -34, 60, 6, 2); g.fill();
  },
  boxFront(g) {
    rrect(g, -30, -28, 60, 28, 3); g.fillStyle = '#d9a66a'; g.fill(); g.strokeStyle = '#a77440'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#e5b97f'; g.beginPath(); g.moveTo(-30, -28); g.lineTo(-40, -40); g.lineTo(-24, -38); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(30, -28); g.lineTo(40, -40); g.lineTo(24, -38); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(120,70,30,0.35)'; g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText('냥냥택배', 0, -10);
  },
  hideout(g, f, t) {
    ell(g, 0, -2, 36, 7); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-34, -56, 0, -58); g.quadraticCurveTo(34, -56, 34, 0); g.closePath();
    g.fillStyle = '#9ed3b0'; g.fill(); g.strokeStyle = '#6aa883'; g.lineWidth = 2; g.stroke();
    ell(g, 0, -18, 15, 17); g.fillStyle = '#2b3a33'; g.fill();
    if (f._occupant) {
      const c = World.catById(f._occupant);
      const blink = (t % 3.5) < 0.15 || (c && c._sleeping);
      if (!blink) [-5, 5].forEach(x => { ell(g, x, -19, 2.6, 3.2); g.fillStyle = c ? EYES[c.eye].c : '#ff0'; g.fill(); });
      else [-5, 5].forEach(x => { g.beginPath(); g.moveTo(x - 3, -19); g.lineTo(x + 3, -19); g.strokeStyle = '#9ed3b0'; g.lineWidth = 1.5; g.stroke(); });
    }
    [-14, 0, 14].forEach((x, i) => { circ(g, x, -44 + Math.abs(x) * 0.6, 3); g.fillStyle = ['#fff3a8', '#ffc2d4', '#c7e8ff'][i]; g.fill(); });
  },
  tunnel(g, f) {
    ell(g, 0, -2, 60, 8); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    rrect(g, -56, -32, 112, 30, 15); g.fillStyle = '#8fb8f0'; g.fill();
    g.strokeStyle = '#6b97d6'; g.lineWidth = 1.5;
    for (let x = -46; x < 50; x += 9) { g.beginPath(); g.moveTo(x, -31); g.lineTo(x, -3); g.stroke(); }
    [-56, 56].forEach(x => { ell(g, x, -17, 8, 15); g.fillStyle = '#3a4a68'; g.fill(); g.strokeStyle = '#6b97d6'; g.stroke(); });
  },
  mouse(g, f, t) {
    // 쥐 인형은 f._mx 위치로 따로 그려짐
  },
  feather(g, f, t) {
    ell(g, 0, -2, 18, 5); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    rrect(g, -14, -10, 28, 10, 4); g.fillStyle = '#7d8fd6'; g.fill();
    const a = f._active ? Math.sin(t * 9) * 0.7 : Math.sin(t * 1.5) * 0.08;
    g.save(); g.translate(0, -10); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -40, 0, -70); g.strokeStyle = '#555'; g.lineWidth = 1.5; g.stroke();
    g.translate(0, -70);
    ['#ff8fb1', '#ffd36b', '#8fd3ff'].forEach((c, i) => { g.save(); g.rotate(-0.5 + i * 0.5); ell(g, 0, -10, 4, 12); g.fillStyle = c; g.fill(); g.restore(); });
    g.restore();
  },
};

// ===== 입체 가구: 캣타워, 소파, 식탁 세트, 스탠드 램프 =====
// 캣타워 설계도: 기둥(post), 쿠션 발판(pad), 집(house), 침대(bed). alt는 바닥에서의 높이
const TREE_SPECS = {
  cattree: {
    base: 96, plush: ['#f3e3d3', '#e3cbb5', '#c9ae96'], accent: '#ff9fb8',
    posts: [[22, 10, 130], [-20, 64, 195], [8, 130, 258]],
    parts: [
      { k: 'house', dx: -24, alt: 10, w: 56, h: 52, color: '#f2c9b3' },
      { k: 'pad', dx: 22, alt: 130, w: 58 },
      { k: 'pad', dx: -16, alt: 195, w: 54 },
      { k: 'bed', dx: 8, alt: 258, w: 66 },
    ],
    pompom: [46, 126, 40],
  },
  tower: {
    base: 76, plush: ['#f7d6e0', '#e9b9c8', '#cf98aa'], accent: '#ffd36b',
    posts: [[-20, 10, 70], [18, 10, 130], [-10, 70, 190]],
    parts: [{ k: 'pad', dx: -20, alt: 70, w: 52 }, { k: 'pad', dx: 18, alt: 130, w: 52 }, { k: 'bed', dx: -10, alt: 190, w: 58 }],
    pompom: [42, 126, 30],
  },
  bigtower: {
    base: 110, plush: ['#ddd2f4', '#c6b6ea', '#a593d3'], accent: '#ffb3c7',
    posts: [[30, 10, 90], [-30, 64, 230], [30, 90, 300], [0, 230, 330]],
    parts: [
      { k: 'house', dx: -28, alt: 10, w: 58, h: 54, color: '#d9cdf2' },
      { k: 'pad', dx: 30, alt: 90, w: 60 }, { k: 'house', dx: -30, alt: 160, w: 54, h: 46, color: '#f2c9d8' },
      { k: 'pad', dx: 30, alt: 300, w: 58 }, { k: 'bed', dx: -4, alt: 330, w: 70 },
    ],
    pompom: [56, 86, 36],
  },
};
// 고양이가 올라가는 자리 (객체를 한 번만 만들어 자리 점유 비교가 되게 함)
const PERCH_SPOTS = {};
for (const [k, sp] of Object.entries(TREE_SPECS)) {
  PERCH_SPOTS[k] = sp.parts.map(p => ({ dx: p.dx, alt: p.k === 'house' ? p.alt + p.h : p.k === 'bed' ? p.alt + 4 : p.alt, bed: p.k === 'bed' }));
}
PERCH_SPOTS.sofa = [{ dx: -32, alt: 44, bed: true }, { dx: 30, alt: 44, bed: true }, { dx: 8, alt: 80 }];
PERCH_SPOTS.table = [{ dx: 4, alt: 80 }, { dx: -80, alt: 42, bed: true }, { dx: 80, alt: 42, bed: true }];
function towerLevels(f) { return PERCH_SPOTS[f.type] || []; }

function drawPuck(g, dx, alt, w, cols, th = 10) {
  const r = w / 2, ry = Math.max(5, w * 0.12);
  ell(g, dx, -alt + th, r, ry); g.fillStyle = cols[2]; g.fill();
  g.fillStyle = cols[1]; g.fillRect(dx - r, -alt, w, th);
  ell(g, dx, -alt, r, ry); g.fillStyle = cols[0]; g.fill();
  g.strokeStyle = 'rgba(120,80,60,0.18)'; g.lineWidth = 1; g.stroke();
}
function drawPost(g, dx, a0, a1) {
  const gr = g.createLinearGradient(dx - 7, 0, dx + 7, 0);
  gr.addColorStop(0, '#b99868'); gr.addColorStop(0.45, '#ead3a6'); gr.addColorStop(1, '#a8875a');
  g.fillStyle = gr; g.fillRect(dx - 7, -a1, 14, a1 - a0);
  g.strokeStyle = 'rgba(140,105,60,0.35)'; g.lineWidth = 1;
  for (let y = -a1 + 3; y < -a0; y += 4.5) { g.beginPath(); g.moveTo(dx - 7, y); g.lineTo(dx + 7, y + 2.5); g.stroke(); }
}
function drawHouse(g, p) {
  const { dx, alt, w, h, color } = p, x0 = dx - w / 2, top = -alt - h, d = 9;
  g.fillStyle = shade(color, -0.18); g.beginPath(); g.moveTo(x0 + w, top); g.lineTo(x0 + w + d, top - d * 0.8); g.lineTo(x0 + w + d, -alt - d * 0.8); g.lineTo(x0 + w, -alt); g.closePath(); g.fill();
  g.fillStyle = shade(color, 0.18); g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + d, top - d * 0.8); g.lineTo(x0 + w + d, top - d * 0.8); g.lineTo(x0 + w, top); g.closePath(); g.fill();
  rrect(g, x0, top, w, h, 4); g.fillStyle = color; g.fill();
  g.strokeStyle = 'rgba(120,80,70,0.25)'; g.lineWidth = 1; g.stroke();
  const hr = Math.min(w, h) * 0.3, gr = g.createRadialGradient(dx, -alt - h * 0.45, 1, dx, -alt - h * 0.45, hr);
  gr.addColorStop(0, '#3a2c2a'); gr.addColorStop(1, '#5a4440');
  ell(g, dx, -alt - h * 0.45, hr, hr * 1.05); g.fillStyle = gr; g.fill();
  g.strokeStyle = shade(color, 0.3); g.lineWidth = 3; g.stroke();
}
function drawTree(g, spec0, plush) {
  const spec = plush ? Object.assign({}, spec0, { plush }) : spec0;
  const b = spec.base;
  ell(g, 0, -1, b * 0.6, 9); g.fillStyle = 'rgba(70,40,30,0.16)'; g.fill();
  drawPuck(g, 0, 10, b, spec.plush, 10);
  spec.posts.forEach(([dx, a0, a1]) => drawPost(g, dx, a0, a1));
  spec.parts.forEach(p => {
    if (p.k === 'house') drawHouse(g, p);
    else if (p.k === 'pad') drawPuck(g, p.dx, p.alt, p.w, spec.plush);
    else {
      drawPuck(g, p.dx, p.alt, p.w, spec.plush, 9);
      g.save(); ell(g, p.dx, -p.alt - 2, p.w / 2 + 1, p.w * 0.16); g.strokeStyle = spec.accent; g.lineWidth = 7; g.stroke();
      ell(g, p.dx, -p.alt + 1, p.w / 2 - 8, p.w * 0.1); g.fillStyle = shade(spec.plush[0], -0.06); g.fill(); g.restore();
    }
  });
  if (spec.pompom) {
    const [px, alt, len] = spec.pompom, sw = Math.sin(World.t * 2.2) * 4;
    g.beginPath(); g.moveTo(px - 6, -alt); g.quadraticCurveTo(px + sw / 2, -alt + len / 2, px + sw, -alt + len); g.strokeStyle = '#9a8a80'; g.lineWidth = 1; g.stroke();
    circ(g, px + sw, -alt + len + 4, 5); g.fillStyle = spec.accent; g.fill();
  }
}

Object.assign(FURN_DRAW, {
  cattree(g) { drawTree(g, TREE_SPECS.cattree, (ROOM_STYLES.tree[(World.state.decor || {}).tree] || {}).c); },
  tower(g) { drawTree(g, TREE_SPECS.tower); },
  bigtower(g) { drawTree(g, TREE_SPECS.bigtower); },

  sofa(g) {
    const c = (ROOM_STYLES.sofa[(World.state.decor || {}).sofa] || ROOM_STYLES.sofa.mint).c;
    ell(g, 0, -1, 90, 9); g.fillStyle = 'rgba(70,40,30,0.16)'; g.fill();
    g.fillStyle = '#8a6243'; [-66, 66].forEach(x => g.fillRect(x - 3, -8, 6, 8));
    // 등받이
    rrect(g, -76, -82, 152, 50, 16); g.fillStyle = c[1]; g.fill();
    rrect(g, -70, -82, 140, 14, 10); g.fillStyle = c[0]; g.fill();
    g.strokeStyle = 'rgba(60,100,90,0.25)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -78); g.lineTo(0, -44); g.stroke();
    // 앉는 부분
    rrect(g, -76, -38, 152, 32, 9); g.fillStyle = c[2]; g.fill();
    [[-66, 1], [1, 1]].forEach(([x]) => {
      rrect(g, x, -48, 65, 14, 7); g.fillStyle = c[0]; g.fill();
      rrect(g, x, -38, 65, 11, 5); g.fillStyle = c[1]; g.fill();
    });
    // 팔걸이
    [-1, 1].forEach(sd => {
      const x = sd < 0 ? -88 : 66;
      rrect(g, x, -62, 22, 58, 11); g.fillStyle = c[1]; g.fill();
      ell(g, x + 11, -60, 11, 6); g.fillStyle = c[0]; g.fill();
    });
    // 쿠션
    g.save(); g.translate(-46, -60); g.rotate(-0.18);
    rrect(g, -15, -14, 30, 28, 9); g.fillStyle = '#ffc3d2'; g.fill();
    g.fillStyle = '#fff'; [[-6, -5], [5, 2], [-4, 7], [7, -7]].forEach(([x, y]) => { circ(g, x, y, 1.6); g.fill(); });
    g.restore();
    g.save(); g.translate(50, -58); g.rotate(0.15);
    rrect(g, -13, -12, 26, 24, 8); g.fillStyle = '#ffe08a'; g.fill();
    g.strokeStyle = '#f2c04e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.moveTo(0, -7); g.lineTo(0, 7); g.stroke();
    g.restore();
  },

  table(g) {
    const wood = ['#ecc28e', '#d29d63', '#ad7a45'];
    ell(g, 0, -1, 110, 9); g.fillStyle = 'rgba(70,40,30,0.14)'; g.fill();
    const chair = sd => {
      const x = sd * 80;
      g.fillStyle = wood[2]; [x - 14, x + 14].forEach(lx => g.fillRect(lx - 2.5, -40, 5, 40));
      // 등받이 (바깥쪽)
      const bx = x + sd * 18;
      g.fillStyle = wood[1]; g.fillRect(bx - 3, -96, 6, 96);
      rrect(g, bx - (sd < 0 ? 3 : 18), -98, 21, 9, 4); g.fillStyle = wood[0]; g.fill();
      g.fillStyle = wood[1]; [-82, -68].forEach(y => g.fillRect(Math.min(bx, bx - sd * 16), y, 16, 4));
      // 앉는 판 + 방석
      rrect(g, x - 20, -44, 40, 8, 3); g.fillStyle = wood[0]; g.fill();
      rrect(g, x - 18, -50, 36, 8, 4); g.fillStyle = '#ffb8c9'; g.fill();
    };
    chair(-1); chair(1);
    // 식탁 다리 (뒤쪽은 짧게)
    g.fillStyle = shade(wood[2], -0.1); [-40, 40].forEach(x => g.fillRect(x - 3, -66, 6, 58));
    g.fillStyle = wood[2]; [-50, 50].forEach(x => g.fillRect(x - 3.5, -66, 7, 66));
    // 상판
    g.fillStyle = wood[0]; g.beginPath(); g.moveTo(-58, -72); g.lineTo(-48, -82); g.lineTo(62, -82); g.lineTo(58, -72); g.closePath(); g.fill();
    rrect(g, -60, -73, 120, 9, 3); g.fillStyle = wood[1]; g.fill();
    // 식탁 위 소품: 꽃병과 머그
    rrect(g, 14, -100, 14, 20, 5); g.fillStyle = '#a9d4ff'; g.fill();
    [[-6, -112, '#ff8fab'], [2, -118, '#ffd36b'], [9, -110, '#ff8fab']].forEach(([dx, y, col]) => {
      g.strokeStyle = '#6aa883'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(21, -98); g.lineTo(21 + dx, y + 4); g.stroke();
      circ(g, 21 + dx, y, 4.2); g.fillStyle = col; g.fill(); circ(g, 21 + dx, y, 1.5); g.fillStyle = '#fff6c9'; g.fill();
    });
    rrect(g, -32, -90, 12, 11, 3); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#e0a3b4'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(-19, -85, 3, -1.4, 1.4); g.stroke();
  },

  lamp(g, f) {
    const on = World.nightAmt() > 0.2;
    ell(g, 0, -1, 18, 5); g.fillStyle = 'rgba(70,40,30,0.16)'; g.fill();
    ell(g, 0, -4, 15, 4.5); g.fillStyle = '#7d6a60'; g.fill();
    g.fillStyle = '#9b877c'; g.fillRect(-2, -172, 4, 168);
    const gr = g.createLinearGradient(-22, 0, 22, 0);
    gr.addColorStop(0, on ? '#ffd27a' : '#f7e3c4'); gr.addColorStop(0.5, on ? '#fff1c4' : '#fff6e6'); gr.addColorStop(1, on ? '#f2b85a' : '#ead2ae');
    g.beginPath(); g.moveTo(-14, -208); g.lineTo(14, -208); g.lineTo(24, -170); g.lineTo(-24, -170); g.closePath(); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#d9b48f'; g.lineWidth = 1.2; g.stroke();
    ell(g, 0, -170, 24, 4); g.fillStyle = on ? '#fff3c9' : '#e9d3b5'; g.fill();
  },
});

// 벽 장식(창문, 해먹 등)
function drawWindow(g, x, night, t, stray, hasBirds) {
  const w = 120, h = 110, y = 60;
  g.save(); g.translate(x, 0);
  rrect(g, -w / 2 - 8, y - 8, w + 16, h + 16, 8); g.fillStyle = '#fffaf2'; g.fill();
  rrect(g, -w / 2, y, w, h, 4);
  const sky = g.createLinearGradient(0, y, 0, y + h);
  if (night) { sky.addColorStop(0, '#1d2552'); sky.addColorStop(1, '#3b3f7a'); }
  else { sky.addColorStop(0, '#9fd8ff'); sky.addColorStop(1, '#d9f1ff'); }
  g.fillStyle = sky; g.fill();
  g.save(); rrect(g, -w / 2, y, w, h, 4); g.clip();
  if (night) {
    circ(g, 30, y + 26, 11); g.fillStyle = '#fff4c2'; g.fill();
    for (let i = 0; i < 7; i++) { circ(g, -50 + i * 15, y + 12 + (i * 37) % 50, 1.2); g.fillStyle = '#fff'; g.fill(); }
  } else {
    const cx = ((t * 6) % 200) - 100;
    [[cx, y + 30], [cx + 70, y + 50]].forEach(([px, py]) => { ell(g, px, py, 18, 7); ell(g, px + 10, py - 4, 12, 7); g.fillStyle = '#fff'; g.fill(); });
    if (hasBirds) {
      const bx = Math.sin(t * 0.7) * 40, by = y + 40 + Math.sin(t * 2.3) * 10;
      g.strokeStyle = '#555'; g.lineWidth = 1.5;
      [[bx, by], [bx + 20, by + 12]].forEach(([px, py]) => { const f = Math.sin(t * 12) * 3; g.beginPath(); g.moveTo(px - 5, py - f); g.quadraticCurveTo(px, py + 2, px + 5, py - f); g.stroke(); });
    }
  }
  // 창밖 풍경
  g.fillStyle = night ? '#2d4a3e' : '#9fd49a'; ell(g, -20, y + h + 10, 60, 30); g.fill(); ell(g, 50, y + h + 14, 50, 26); g.fill();
  if (stray) {
    g.save(); g.translate(stray.peek ? 0 : 0, y + h - 2); g.scale(0.75, 0.75);
    drawCatShape(g, stray.coat, stray.eye, { pose: 'front', t, mood: 'normal', blink: (t % 3) < 0.12 });
    g.restore();
  }
  g.restore();
  g.strokeStyle = '#e8dccb'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, y); g.lineTo(0, y + h); g.moveTo(-w / 2, y + h / 2); g.lineTo(w / 2, y + h / 2); g.stroke();
  // 커튼
  g.fillStyle = '#ffc7d6';
  g.beginPath(); g.moveTo(-w / 2 - 14, y - 12); g.quadraticCurveTo(-w / 2 + 4, y + h / 2, -w / 2 - 10, y + h + 12); g.lineTo(-w / 2 - 24, y + h + 12); g.lineTo(-w / 2 - 24, y - 12); g.fill();
  g.beginPath(); g.moveTo(w / 2 + 14, y - 12); g.quadraticCurveTo(w / 2 - 4, y + h / 2, w / 2 + 10, y + h + 12); g.lineTo(w / 2 + 24, y + h + 12); g.lineTo(w / 2 + 24, y - 12); g.fill();
  rrect(g, -w / 2 - 14, y + h + 6, w + 28, 8, 3); g.fillStyle = '#f2e3cd'; g.fill();
  g.restore();
}

// 플레이어 손 (원점 = 손끝이 닿는 곳, 손목은 오른쪽 아래)
// kind: 'pet' 쓰다듬기, 'grab' 가구 잡기, 'call' 고양이 부르기
function drawHand(g, kind, wob) {
  const skin = '#ffdcc8', line = '#d4977f';
  g.save(); g.rotate(-0.45 + wob);
  const curl = kind === 'grab' ? 0.55 : 1;
  const part = fn => { fn(); g.fillStyle = skin; g.fill(); g.strokeStyle = line; g.lineWidth = 1.4; g.stroke(); };
  // 엄지
  g.save(); g.translate(-13, 12); g.rotate(kind === 'grab' ? -0.3 : -0.85); part(() => rrect(g, -3.5, -14, 7, 16, 3.5)); g.restore();
  // 손가락 4개
  [[-9, 3], [-2.5, 0], [4, 1], [10, 5]].forEach(([x, top]) => {
    const len = (20 - top) * curl;
    part(() => rrect(g, x - 3.2, 12 - len, 6.4, len + 4, 3.2));
  });
  // 손바닥
  part(() => ell(g, 0.5, 15, 14.5, 12));
  if (kind === 'grab') { g.strokeStyle = line; g.lineWidth = 1; [-6, 0, 6].forEach(x => { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 1, 9); g.stroke(); }); }
  // 소매
  rrect(g, -12, 24, 26, 22, 7); g.fillStyle = '#ffb3c7'; g.fill(); g.strokeStyle = '#e88aa5'; g.lineWidth = 1.4; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, 29); g.lineTo(12, 29); g.stroke();
  g.restore();
}

// 빗 (원점 = 빗살 끝)
function drawBrush(g, wob) {
  g.save(); g.rotate(-0.35 + wob);
  rrect(g, -4.5, 8, 9, 40, 4.5); g.fillStyle = '#d6a06b'; g.fill(); g.strokeStyle = '#a8743f'; g.lineWidth = 1.3; g.stroke();
  circ(g, 0, 42, 2); g.fillStyle = '#a8743f'; g.fill();
  g.strokeStyle = '#9a8f99'; g.lineWidth = 1.3;
  for (let x = -14; x <= 14; x += 3) { g.beginPath(); g.moveTo(x, -6); g.lineTo(x, 1); g.stroke(); }
  rrect(g, -17, 0, 34, 12, 6); g.fillStyle = '#ff9fb8'; g.fill(); g.strokeStyle = '#e07a98'; g.stroke();
  circ(g, -9, 6, 1.6); circ(g, 9, 6, 1.6); g.fillStyle = '#fff'; g.fill();
  g.restore();
}

// ----- 손에 드는 도구들 (모두 원점 기준, 손잡이는 오른쪽) -----
function drawCan(g) {
  rrect(g, -9, -12, 18, 22, 3); g.fillStyle = '#ff9fb0'; g.fill(); g.strokeStyle = '#d97a8e'; g.lineWidth = 1.2; g.stroke();
  rrect(g, -9, -5, 18, 8, 1); g.fillStyle = '#fff'; g.fill();
  ell(g, 0, -1, 4.5, 2.2); g.fillStyle = '#7cc6f0'; g.fill();
  ell(g, -12, -12, 3.5, 2); ell(g, 0, -12, 9, 2.6); g.fillStyle = '#e6e3ec'; g.fill();
  ell(g, 0, 10, 9, 2.4); g.fillStyle = '#d5d1dc'; g.fill();
}
function drawPitcher(g) {
  g.beginPath(); g.moveTo(-9, -12); g.lineTo(-15, -15); g.lineTo(-9, -6); g.closePath(); g.fillStyle = '#bfe3fb'; g.fill();
  rrect(g, -9, -13, 18, 23, 4); g.fillStyle = 'rgba(191,227,251,0.95)'; g.fill(); g.strokeStyle = '#7fb8de'; g.lineWidth = 1.2; g.stroke();
  rrect(g, -7, -4, 14, 12, 3); g.fillStyle = '#7cc6f0'; g.fill();
  g.beginPath(); g.arc(11, -2, 5, -1.3, 1.3); g.strokeStyle = '#7fb8de'; g.lineWidth = 2.2; g.stroke();
}
function drawScoop(g) {
  rrect(g, -2.2, -2, 4.4, 26, 2.2); g.fillStyle = '#ff9fb8'; g.fill();
  g.beginPath(); g.moveTo(-13, -16); g.lineTo(13, -16); g.quadraticCurveTo(13, 0, 0, 0); g.quadraticCurveTo(-13, 0, -13, -16); g.closePath();
  g.fillStyle = '#ffb8ca'; g.fill(); g.strokeStyle = '#e07a98'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  [[-6, -11], [0, -11], [6, -11], [-3, -6], [3, -6]].forEach(([x, y]) => { circ(g, x, y, 1.4); g.fill(); });
}
// 간식 (왼쪽 끝이 고양이 입 쪽)
function drawSnackItem(g, kind, t) {
  if (kind === 'churu' || kind === 'tuna') {
    const sq = 1 - Math.abs(Math.sin(t * 5)) * 0.15, tuna = kind === 'tuna';
    rrect(g, -1, -3 * sq, 28, 6 * sq, 3); g.fillStyle = tuna ? '#fff4e6' : '#fff1f4'; g.fill(); g.strokeStyle = tuna ? '#f2a35e' : '#ef9ab0'; g.lineWidth = 1; g.stroke();
    g.fillStyle = tuna ? '#ff9a4a' : '#ff8fab'; g.fillRect(8, -3 * sq, 4, 6 * sq); g.fillRect(16, -3 * sq, 4, 6 * sq);
    ell(g, -2, 0, 2.6, 2.2); g.fillStyle = '#f2c38b'; g.fill();
  } else if (kind === 'salmon') {
    [[2, -3], [9, -1], [5, 3]].forEach(([x, y]) => { rrect(g, x - 3, y - 3, 6.5, 6.5, 1.5); g.fillStyle = '#ff9f80'; g.fill(); g.strokeStyle = '#e07a5c'; g.lineWidth = 0.8; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 2, y - 1, 4, 1); });
  } else if (kind === 'bugeo') {
    ell(g, 6, 0, 10, 3.6); g.fillStyle = '#ecd29a'; g.fill(); g.strokeStyle = '#c9a463'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(15, 0); g.lineTo(21, -4); g.lineTo(21, 4); g.closePath(); g.fillStyle = '#e0c182'; g.fill();
  } else {
    ell(g, 6, 0, 9, 5.5); g.fillStyle = '#f7dcc0'; g.fill(); g.strokeStyle = '#d9a77c'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(200,150,110,0.6)'; g.beginPath(); g.moveTo(0, -1); g.lineTo(11, -2); g.moveTo(1, 2); g.lineTo(12, 1); g.stroke();
  }
}
function drawLaserPen(g) {
  rrect(g, -2.8, -26, 5.6, 32, 2.8); g.fillStyle = '#5b5a6e'; g.fill();
  g.fillStyle = '#9a98b0'; g.fillRect(-2.8, -8, 5.6, 3);
  circ(g, 0, -26, 2.2); g.fillStyle = '#ff4a4a'; g.fill();
}
// 도마뱀 (오른쪽을 보는 기준, 원점 = 배 밑)
function drawLizard(g, t, moving, dangle) {
  const w = moving ? Math.sin(t * 22) : 0;
  g.save();
  if (dangle) { g.translate(-4, 6); g.rotate(0.18 + Math.sin(t * 6) * 0.12); }
  g.strokeStyle = '#4f9a49'; g.lineWidth = 3.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-8, -3); g.quadraticCurveTo(-17, -2 + w * 3, -25, -1 - w * 4); g.stroke();
  g.lineWidth = 2.2;
  [[-4, 1], [5, -1]].forEach(([x, ph], i) => [1, -1].forEach(sd => {
    const k = Math.sin(t * 22 + ph * 3 + (sd > 0 ? 0 : Math.PI)) * (moving ? 3 : 0);
    g.beginPath(); g.moveTo(x, -2); g.lineTo(x + 2 + k, sd > 0 ? 2.5 : -6); g.stroke();
  }));
  ell(g, 0, -3, 10, 3.6); g.fillStyle = '#7cc46a'; g.fill();
  ell(g, 0, -1.8, 7, 1.6); g.fillStyle = '#b9e3a8'; g.fill();
  ell(g, 10.5, -3.8, 5, 3.4); g.fillStyle = '#7cc46a'; g.fill();
  [[-4, -4.5], [1, -5], [5, -4.4]].forEach(([x, y]) => { circ(g, x, y, 1); g.fillStyle = '#5aa64f'; g.fill(); });
  circ(g, 12.6, -4.8, 1.3); g.fillStyle = '#1d1a18'; g.fill();
  circ(g, 12.9, -5.2, 0.45); g.fillStyle = '#fff'; g.fill();
  g.restore();
}

// 빗을 쥔 손
function drawBrushHand(g, wob) {
  drawBrush(g, wob);
  g.save(); g.rotate(-0.35 + wob); g.translate(3, 30); g.scale(0.8, 0.8); drawHand(g, 'grab', 0); g.restore();
}
// 털실공을 쥔 손 (holding=false면 빈 손)
function drawBallHand(g, holding, t) {
  if (!holding) { g.save(); g.scale(0.85, 0.85); drawHand(g, 'pet', Math.sin(t * 2) * 0.05); g.restore(); return; }
  g.save(); g.rotate(t * 0.8);
  circ(g, 0, 0, 8); g.fillStyle = '#ff8fb1'; g.fill();
  g.strokeStyle = '#e06590'; g.lineWidth = 1.1;
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * 3, 0, 7, -1.2, 1.2); g.stroke(); }
  g.restore();
  g.save(); g.translate(7, 6); g.scale(0.8, 0.8); drawHand(g, 'grab', 0); g.restore();
}

// 화장실 청소 화면용: 삽 든 손 (p: 0→1 진행도)
function drawScoopHand(g, p) {
  const lift = Math.sin(p * Math.PI);
  g.save(); g.translate(0, -lift * 22); g.rotate(-0.25 + p * 0.5);
  drawScoop(g);
  g.translate(2, 20); g.scale(0.75, 0.75); drawHand(g, 'grab', 0);
  g.restore();
}

function drawHammock(g, f, front) {
  // 벽에 매단 해먹: 바닥 기준 alt 140 높이
  const y = -140;
  if (!front) {
    g.strokeStyle = '#b08a5e'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-34, y - 34); g.lineTo(-30, y); g.moveTo(34, y - 34); g.lineTo(30, y); g.stroke();
    rrect(g, -40, y - 38, 80, 6, 3); g.fillStyle = '#c9a477'; g.fill();
  } else {
    g.beginPath(); g.moveTo(-32, y - 8); g.quadraticCurveTo(0, y + 22, 32, y - 8); g.lineTo(28, y - 2); g.quadraticCurveTo(0, y + 12, -28, y - 2);
    g.closePath(); g.fillStyle = '#9ad1f5'; g.fill(); g.strokeStyle = '#6aaedb'; g.lineWidth = 1.5; g.stroke();
  }
}
