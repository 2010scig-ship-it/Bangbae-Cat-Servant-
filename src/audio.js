'use strict';
// ===== 소리: 실제 녹음(window.SOUND_DATA)이 있으면 그것을, 없으면 합성음으로 대체 =====
// 녹음 파일 안에서 잘라 쓰는 구간: [파일, 시작(초), 길이(초)]
const CLIPS = {
  meow: [['meow', 0, 0.5], ['meow', 0, 0.5], ['beg', 0.25, 0.3], ['beg', 4.98, 0.25], ['beg', 6.2, 0.25], ['beg', 8.6, 0.32]],
  beg: [['beg', 1.35, 0.55], ['beg', 2.55, 0.95], ['beg', 7.55, 0.4], ['beg', 8.55, 0.4]],
};
const PURR_LOOP = [0.1, 9.9];
const Sound = {
  ctx: null, out: null, sfx: null, bgm: null,
  buffers: {}, noise: null, purr: null,
  bgmEls: {}, bgmGains: {}, synthBgm: null, night: false,
  settings: { sfx: 0.8, bgm: 0.35, mute: false },

  init(settings) {
    if (this.ctx) return;
    this.settings = settings;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain(); this.out.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.out);
    this.bgm = ctx.createGain(); this.bgm.connect(this.out);
    this.apply(settings);
    // 2초 분량 화이트노이즈
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const data = window.SOUND_DATA || {};
    for (const [name, url] of Object.entries(data)) {
      if (name.startsWith('bgm_')) continue;
      fetch(url).then(r => r.arrayBuffer()).then(ab => ctx.decodeAudioData(ab))
        .then(buf => { this.buffers[name] = buf; }).catch(() => {});
    }
    this.setupBgm(data);
  },

  apply(s) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(s.mute ? 0 : 1, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.bgm.gain.setTargetAtTime(s.bgm, t, 0.05);
  },

  suspend() {
    if (!this.ctx) return;
    this.ctx.suspend();
    Object.values(this.bgmEls).forEach(a => a.pause());
  },
  resume() {
    if (!this.ctx) return;
    this.ctx.resume();
    Object.values(this.bgmEls).forEach(a => a.play().catch(() => {}));
  },

  // ---------- 효과음 ----------
  play(name, opt = {}) {
    if (!this.ctx || this.settings.mute) return;
    const pitch = opt.pitch || 1;
    const vol = opt.vol == null ? 1 : opt.vol;
    const clips = (CLIPS[name] || [[name, 0, null]]).filter(c => this.buffers[c[0]]);
    if (clips.length) {
      const [file, off, len] = clips[Math.floor(Math.random() * clips.length)];
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[file]; src.playbackRate.value = pitch;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t);
      src.connect(g); g.connect(this.sfx);
      if (len) {
        const real = len / pitch;
        g.gain.setValueAtTime(vol, t + Math.max(0, real - 0.05));
        g.gain.linearRampToValueAtTime(0.0001, t + real);
        src.start(t, off, len + 0.02);
      } else src.start(t);
      return;
    }
    const fn = this.synth[name];
    if (fn) fn.call(this, pitch, vol);
  },

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  },
  noiseSrc() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); return s;
  },

  synth: {
    meow(p, vol, long) {
      const ctx = this.ctx, t = ctx.currentTime, d = long ? 0.95 : 0.4;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = 640 * p;
      o.frequency.setValueAtTime(f * 0.8, t);
      o.frequency.linearRampToValueAtTime(f * 1.3, t + d * 0.35);
      o.frequency.linearRampToValueAtTime(f * 0.75, t + d);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
      const lg = ctx.createGain(); lg.gain.value = f * 0.02; lfo.connect(lg); lg.connect(o.frequency);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 4;
      f1.frequency.setValueAtTime(900, t);
      f1.frequency.linearRampToValueAtTime(1700, t + d * 0.4);
      f1.frequency.linearRampToValueAtTime(800, t + d);
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7; f2.frequency.value = 2700;
      const g = ctx.createGain(); this.env(g, t, 0.05, 0.35 * vol, d);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.sfx);
      o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
    },
    beg(p, vol) { Sound.synth.meow.call(this, p * 0.95, vol, true); },
    trill(p, vol) {
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(700 * p, t); o.frequency.linearRampToValueAtTime(1100 * p, t + 0.3);
      const am = ctx.createOscillator(); am.frequency.value = 32;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      am.connect(amg); amg.connect(g.gain);
      const env = ctx.createGain(); this.env(env, t, 0.03, 0.3 * vol, 0.35);
      o.connect(g); g.connect(env); env.connect(this.sfx);
      o.start(t); am.start(t); o.stop(t + 0.4); am.stop(t + 0.4);
    },
    hiss(p, vol) {
      const ctx = this.ctx, t = ctx.currentTime;
      const s = this.noiseSrc();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = ctx.createGain(); this.env(g, t, 0.02, 0.4 * vol, 0.6);
      s.connect(hp); hp.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 0.65);
    },
    eat(p, vol) {
      const ctx = this.ctx, t0 = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const t = t0 + i * 0.16 + Math.random() * 0.04;
        const s = this.noiseSrc();
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 800; bp.Q.value = 2;
        const g = ctx.createGain(); this.env(g, t, 0.005, 0.25 * vol, 0.07);
        s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 0.1);
      }
    },
    bowl(p, vol) {
      const ctx = this.ctx, t0 = ctx.currentTime;
      for (let i = 0; i < 9; i++) {
        const t = t0 + i * 0.05 + Math.random() * 0.03;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = 2200 + Math.random() * 1800;
        const g = ctx.createGain(); this.env(g, t, 0.003, 0.08 * vol, 0.12);
        o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.15);
      }
    },
    scoop(p, vol) {
      const ctx = this.ctx, t = ctx.currentTime;
      const s = this.noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(600, t); bp.frequency.linearRampToValueAtTime(2400, t + 0.25);
      const g = ctx.createGain(); this.env(g, t, 0.03, 0.3 * vol, 0.3);
      s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 0.32);
    },
    pop(p, vol) {
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(500 * p, t); o.frequency.exponentialRampToValueAtTime(1200 * p, t + 0.08);
      const g = ctx.createGain(); this.env(g, t, 0.005, 0.25 * vol, 0.14);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.16);
    },
    coin(p, vol) {
      const ctx = this.ctx, t = ctx.currentTime;
      [1318, 1760].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.value = f;
        const g = ctx.createGain(); this.env(g, t + i * 0.07, 0.005, 0.06 * vol, 0.25);
        o.connect(g); g.connect(this.sfx); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
      });
    },
    rustle(p, vol) { Sound.synth.scoop.call(this, p, vol * 0.7); },
  },

  // ---------- 골골송 ----------
  startPurr() {
    if (!this.ctx || this.purr) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.4);
    g.connect(this.sfx);
    let src;
    if (this.buffers.purr) {
      src = ctx.createBufferSource(); src.buffer = this.buffers.purr; src.loop = true;
      src.loopStart = PURR_LOOP[0]; src.loopEnd = PURR_LOOP[1];
      src.connect(g);
    } else {
      src = this.noiseSrc();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const am = ctx.createGain(); am.gain.value = 0.3;
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 26;
      const lg = ctx.createGain(); lg.gain.value = 0.7;
      lfo.connect(lg); lg.connect(am.gain); lfo.start(t);
      src.connect(lp); lp.connect(am); am.connect(g);
      src._lfo = lfo;
    }
    if (this.buffers.purr) src.start(t, PURR_LOOP[0]); else src.start(t);
    this.purr = { src, g };
  },
  stopPurr() {
    if (!this.purr) return;
    const { src, g } = this.purr, t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.15);
    src.stop(t + 0.6); if (src._lfo) src._lfo.stop(t + 0.6);
    this.purr = null;
  },

  // ---------- 배경음악 (낮/밤 교차) ----------
  setupBgm(data) {
    const ctx = this.ctx;
    if (data.bgm_day && data.bgm_night) {
      for (const k of ['day', 'night']) {
        const a = new window.Audio(); a.src = data['bgm_' + k]; a.loop = true;
        const node = ctx.createMediaElementSource(a);
        const g = ctx.createGain(); g.gain.value = k === 'day' ? 1 : 0;
        node.connect(g); g.connect(this.bgm);
        this.bgmEls[k] = a; this.bgmGains[k] = g;
        a.play().catch(() => {});
      }
    } else {
      this.synthBgm = new SynthBgm(ctx, this.bgm);
      this.synthBgm.start();
    }
  },
  setNight(night) {
    if (!this.ctx || night === this.night) return;
    this.night = night;
    const t = this.ctx.currentTime;
    if (this.bgmGains.day) {
      this.bgmGains.day.gain.setTargetAtTime(night ? 0 : 1, t, 1.2);
      this.bgmGains.night.gain.setTargetAtTime(night ? 1 : 0, t, 1.2);
    } else if (this.synthBgm) this.synthBgm.setNight(night);
  },
};

// 합성 배경음악: 낮은 통통 튀는 실로폰, 밤은 느린 오르골
class SynthBgm {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.day = ctx.createGain(); this.day.connect(out);
    this.nightG = ctx.createGain(); this.nightG.gain.value = 0; this.nightG.connect(out);
    this.next = { day: 0, night: 0 }; this.idx = { day: 0, night: 0 };
    // [음(반음, C5=0, null=쉼), 박]
    this.songs = {
      day: { bpm: 112, notes: [[0,1],[4,1],[7,1],[9,1],[7,2],[4,1],[2,1],[0,1],[2,1],[4,2],[null,1],[7,1],[9,1],[12,1],[9,1],[7,2],[4,1],[7,1],[2,1],[4,1],[0,2],[null,2]],
             bass: [-12, -5, -8, -10] },
      night: { bpm: 66, notes: [[7,1],[4,1],[7,1],[12,2],[11,1],[9,1],[7,2],[null,1],[5,1],[4,1],[2,1],[4,2],[0,1],[2,1],[4,3],[null,1],[7,1],[9,1],[7,1],[4,2],[2,1],[0,3],[null,2]],
               bass: [-12, -7, -15, -10] },
    };
  }
  start() { const t = this.ctx.currentTime + 0.1; this.next = { day: t, night: t }; this.timer = setInterval(() => this.tick(), 120); }
  setNight(n) {
    const t = this.ctx.currentTime;
    this.day.gain.setTargetAtTime(n ? 0 : 1, t, 1.2);
    this.nightG.gain.setTargetAtTime(n ? 1 : 0, t, 1.2);
  }
  tick() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    for (const k of ['day', 'night']) {
      const song = this.songs[k], beat = 60 / song.bpm;
      if (this.next[k] < ctx.currentTime - 1) this.next[k] = ctx.currentTime + 0.05;
      while (this.next[k] < ctx.currentTime + 0.4) {
        const [n, len] = song.notes[this.idx[k] % song.notes.length];
        const t = this.next[k];
        if (n !== null) this.note(k, 523.25 * Math.pow(2, n / 12), t, beat * len);
        if (this.idx[k] % 4 === 0) {
          const b = song.bass[Math.floor(this.idx[k] / 4) % song.bass.length];
          this.note(k, 523.25 * Math.pow(2, b / 12) / 2, t, beat * 2, true);
        }
        this.next[k] += beat * len;
        this.idx[k]++;
      }
    }
  }
  note(k, f, t, d, bass) {
    const ctx = this.ctx, dest = k === 'day' ? this.day : this.nightG;
    const o = ctx.createOscillator(); o.type = bass ? 'sine' : (k === 'day' ? 'triangle' : 'sine');
    o.frequency.value = f;
    const g = ctx.createGain();
    const peak = bass ? 0.07 : (k === 'day' ? 0.09 : 0.08);
    const dec = k === 'day' ? Math.min(d, 0.35) : Math.min(d * 1.5, 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dec + 0.05);
    if (k === 'night' && !bass) { // 오르골 배음
      const o2 = ctx.createOscillator(); o2.frequency.value = f * 4;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.02, t + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o2.connect(g2); g2.connect(dest); o2.start(t); o2.stop(t + 0.35);
    }
  }
}
