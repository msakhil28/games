// Ludo — 4 colours, traditional Indian rules.
//  • a 6 brings a token out        • 6, a capture or reaching home earns another roll
//  • three 6s in a row lose the turn • start squares and stars are safe
//  • two tokens of one colour form a pair (joda) that can't be captured or jumped
//  • exact roll to reach home       • optional: capture at least once before entering the home column
//   LudoGame : rules engine (no DOM) — runs on this phone, or on the room host for online play
//   LudoView : draws the board for any player
//   Ludo     : the single-phone screen (you against computer players)
const LUDO = (() => {
  // 52-square loop, clockwise, as [row, col] on a 15×15 board. Index 0 is green's start square.
  const TRACK = [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
  ];
  // play order is clockwise: red (bottom-left) → green → yellow → blue
  const COLORS = [
    { id: 'red', name: 'Red', start: 39, yard: [9, 0], home: i => [13 - i, 7], end: [8.15, 7] },
    { id: 'green', name: 'Green', start: 0, yard: [0, 0], home: i => [7, 1 + i], end: [7, 5.85] },
    { id: 'yellow', name: 'Yellow', start: 13, yard: [0, 9], home: i => [1 + i, 7], end: [5.85, 7] },
    { id: 'blue', name: 'Blue', start: 26, yard: [9, 9], home: i => [7, 13 - i], end: [7, 8.15] },
  ];
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const STARS = new Set([8, 21, 34, 47]);
  const SPOTS = [[1.75, 1.75], [1.75, 4.25], [4.25, 1.75], [4.25, 4.25]];
  const trackCell = (pi, t) => (COLORS[pi].start + t) % 52;
  return { TRACK, COLORS, SAFE, STARS, SPOTS, trackCell };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), decide(pi, 'roll' | 'pick', moves) → Promise<'roll' | tokenIndex>, fx(name, pi, extra) }
class LudoGame {
  constructor({ seats, killRule }, io) {
    this.io = io; this.gen = 0;
    this.st = {
      players: seats.map((s, i) => ({ id: s.id || 'p' + i, color: i, kind: s.kind, name: s.name, tokens: [0, 1, 2, 3].map(() => ({ t: -1, h: -1 })), kills: 0, rank: 0 })),
      turn: 0, dice: 6, sixes: 0, killRule, ranks: 0, over: false, msg: '', phase: 'roll', movable: [], rolling: false, seq: 0,
    };
    this.st.turn = Math.max(0, this.st.players.findIndex(p => p.kind !== 'none'));
  }
  static restore(st, io) { const g = Object.create(LudoGame.prototype); g.io = io; g.gen = 0; g.st = st; st.rolling = false; st.movable = []; return g; }
  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(LudoGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  stop() { this.gen++; }

  /* rules */
  canEnterHome(p) { return !this.st.killRule || p.kills > 0; }
  occupancy() {
    const m = new Map();
    this.st.players.forEach((p, pi) => p.kind !== 'none' && p.tokens.forEach((tk, ti) => {
      if (tk.t >= 0 && tk.h < 0) { const c = LUDO.trackCell(pi, tk.t); (m.get(c) || m.set(c, []).get(c)).push({ pi, ti }); }
    }));
    return m;
  }
  isBlock(list, pi) { if (!list) return false; const by = {}; for (const o of list) if (o.pi !== pi) by[o.pi] = (by[o.pi] || 0) + 1; return Object.values(by).some(n => n >= 2); }
  path(pi, ti, d, occ = this.occupancy()) {
    const p = this.st.players[pi], tk = p.tokens[ti];
    if (tk.h === 5) return null;
    if (tk.t < 0) return d === 6 ? [{ t: 0, h: -1 }] : null;
    const out = [];
    let t = tk.t, h = tk.h;
    for (let k = 1; k <= d; k++) {
      if (h >= 0) { h++; if (h > 5) return null; }
      else if (t % 52 === 50 && this.canEnterHome(p)) h = 0;
      else { t++; if (this.isBlock(occ.get(LUDO.trackCell(pi, t)), pi)) return null; }
      out.push({ t, h });
    }
    return out;
  }
  legalMoves(pi, d) {
    const occ = this.occupancy(), moves = [];
    this.st.players[pi].tokens.forEach((_, ti) => { const pth = this.path(pi, ti, d, occ); if (pth) moves.push({ ti, path: pth }); });
    return moves;
  }
  danger(pi, cell) {
    if (LUDO.SAFE.has(cell)) return false;
    return this.st.players.some((q, qi) => qi !== pi && q.kind !== 'none' && q.tokens.some(tk => {
      if (tk.t < 0 || tk.h >= 0) return false;
      const back = (cell - LUDO.trackCell(qi, tk.t) + 52) % 52; return back >= 1 && back <= 6;
    }));
  }
  aiPick(pi, moves) {
    const occ = this.occupancy(), st = this.st;
    let best = moves[0], bestScore = -1e9;
    for (const m of moves) {
      const tk = st.players[pi].tokens[m.ti], end = m.path[m.path.length - 1];
      let s = Math.random() * 3;
      if (end.h === 5) s += 100; else if (end.h >= 0 && tk.h < 0) s += 35;
      if (tk.t < 0) s += 55;
      if (end.h < 0) {
        const cell = LUDO.trackCell(pi, end.t), here = occ.get(cell) || [];
        const foes = here.filter(o => o.pi !== pi);
        if (!LUDO.SAFE.has(cell) && foes.length) s += 90 + Math.max(...foes.map(o => st.players[o.pi].tokens[o.ti].t)) * 0.5;
        if (LUDO.SAFE.has(cell)) s += 18;
        if (this.danger(pi, cell)) s -= 45;
        if (here.some(o => o.pi === pi)) s += 12;
      }
      if (tk.t >= 0 && tk.h < 0 && this.danger(pi, LUDO.trackCell(pi, tk.t))) s += 28;
      s += Math.max(0, tk.t) * 0.25;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  /* turn loop */
  live() { return this.st.players.filter(p => p.kind !== 'none' && !p.rank); }
  async run() { try { await this.loop(); } catch (e) { if (e !== LudoGame.ABORT) console.error(e); } }
  async loop() {
    const st = this.st;
    while (!st.over) {
      const pi = st.turn, p = st.players[pi];
      if (p.kind === 'none' || p.rank) { this.next(); continue; }
      st.phase = 'roll'; st.movable = [];
      st.msg = p.kind === 'cpu' ? `${p.name} is rolling…` : `${p.name}: tap the dice`;
      if (p.kind === 'cpu') { this.up(); await this.sleep(650); } else await this.ask(pi, 'roll');
      const d = await this.roll();
      if (d === 6) st.sixes++; else st.sixes = 0;
      if (st.sixes === 3) { st.msg = `Three 6s in a row — ${p.name} loses the turn!`; this.io.fx('lose', pi); st.sixes = 0; this.up(); await this.sleep(1300); this.next(); continue; }
      const moves = this.legalMoves(pi, d);
      if (!moves.length) {
        st.msg = d === 6 ? 'No move — but a 6 rolls again' : `${p.name} has no move`;
        this.up(); await this.sleep(950);
        if (d !== 6) this.next();
        continue;
      }
      let mv;
      const same = moves.every(m => JSON.stringify(p.tokens[m.ti]) === JSON.stringify(p.tokens[moves[0].ti]));
      if (p.kind === 'cpu') { await this.sleep(450); mv = this.aiPick(pi, moves); }
      else if (moves.length === 1 || same) { await this.sleep(250); mv = moves[0]; }
      else {
        st.movable = moves.map(m => m.ti); st.msg = `${p.name}: tap a token to move`;
        const ti = await this.ask(pi, 'pick', moves);
        mv = moves.find(m => m.ti === ti) || this.aiPick(pi, moves);
      }
      st.movable = []; st.phase = 'move';
      const res = await this.move(pi, mv);
      const done = p.tokens.every(tk => tk.h === 5);
      if (done && !p.rank) {
        p.rank = ++st.ranks;
        st.msg = `${p.name} finishes ${['', '1st', '2nd', '3rd'][p.rank]}!`;
        this.io.fx('finish', pi, p.rank);
        if (this.live().length <= 1) {
          const last = this.live()[0]; if (last) last.rank = ++st.ranks;
          st.over = true; st.phase = 'over'; this.up(); return;
        }
      }
      const extra = !p.rank && (d === 6 || res.captured || res.home);
      if (res.captured) st.msg = `${p.name} captured ${res.captured}! Roll again`;
      else if (res.home && !done) st.msg = `${p.name} got a token home! Roll again`;
      else if (d === 6 && extra) st.msg = `${p.name} rolled a six! Roll again`;
      if (!extra) this.next();
      this.up();
      if (extra) await this.sleep(500);
    }
  }
  async ask(pi, phase, moves) {
    this.st.phase = phase; this.up();
    const g = this.gen; const a = await this.io.decide(pi, phase, moves);
    if (g !== this.gen) throw LudoGame.ABORT;
    return a;
  }
  next() {
    const st = this.st;
    st.sixes = 0;
    for (let k = 1; k <= 4; k++) { const n = (st.turn + k) % 4; const q = st.players[n]; if (q.kind !== 'none' && !q.rank) { st.turn = n; break; } }
  }
  async roll() {
    const st = this.st;
    st.rolling = true; this.io.fx('dice'); this.up();
    await this.sleep(550);
    st.dice = 1 + Math.floor(Math.random() * 6);
    st.rolling = false; this.up();
    await this.sleep(250);
    return st.dice;
  }
  async move(pi, mv) {
    const st = this.st, p = st.players[pi], tk = p.tokens[mv.ti];
    for (const step of mv.path) { tk.t = step.t; tk.h = step.h; this.io.fx('hop'); this.up(); await this.sleep(tk.h === 5 ? 260 : 170); }
    const res = { captured: '', home: tk.h === 5 };
    if (tk.h < 0) {
      const cell = LUDO.trackCell(pi, tk.t);
      if (!LUDO.SAFE.has(cell)) {
        const victims = [];
        st.players.forEach((q, qi) => { if (qi !== pi && q.kind !== 'none') q.tokens.forEach(o => { if (o.t >= 0 && o.h < 0 && LUDO.trackCell(qi, o.t) === cell) { o.t = -1; o.h = -1; victims.push(q.name); } }); });
        if (victims.length) { p.kills++; res.captured = [...new Set(victims)].join(' & '); this.io.fx('capture', pi); this.up(); await this.sleep(350); }
      }
    }
    if (res.home) this.io.fx('home', pi);
    return res;
  }
  forfeit(pi) {   // a player left the room: a computer takes over their colour
    const p = this.st.players[pi];
    if (p && p.kind === 'human') { p.kind = 'cpu'; p.name = p.name + ' 🤖'; this.up(); }
  }
}
LudoGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View — builds the board once, then moves token elements so hops animate smoothly       */
/* ======================================================================================= */
const LudoView = (() => {
  const { TRACK, COLORS, STARS, SPOTS, trackCell } = LUDO;
  const esc = s => UI.esc(s);
  function boardHTML() {
    let cells = '';
    TRACK.forEach(([r, c], i) => {
      const owner = COLORS.findIndex(col => col.start === i);
      cells += `<div class="lc${owner >= 0 ? ' c-' + COLORS[owner].id : ''}${STARS.has(i) ? ' star' : ''}" style="grid-area:${r + 1}/${c + 1}">${owner >= 0 ? `<i class="arrow" style="rotate:${[-90, 0, 90, 180][owner]}deg">➜</i>` : STARS.has(i) ? '<i>★</i>' : ''}</div>`;
    });
    COLORS.forEach(col => {
      for (let i = 0; i < 5; i++) { const [r, c] = col.home(i); cells += `<div class="lc c-${col.id}" style="grid-area:${r + 1}/${c + 1}"></div>`; }
      const [yr, yc] = col.yard;
      cells += `<div class="yard c-${col.id}" style="grid-area:${yr + 1}/${yc + 1}/span 6/span 6"><div class="yard-in">${SPOTS.map(() => '<span></span>').join('')}</div></div>`;
    });
    cells += '<div class="ludo-center" style="grid-area:7/7/span 3/span 3"></div>';
    return `<div class="ludo-grid">${cells}</div>`;
  }
  function mount(container, footer = '') {
    container.innerHTML = `<div class="ludo">
      <div class="ludo-players" id="lp-top"></div>
      <div class="ludo-board">${boardHTML()}<div class="ludo-tokens">${
        COLORS.map((c, pi) => [0, 1, 2, 3].map(ti => `<button class="token t-${c.id}" data-p="${pi}" data-t="${ti}" aria-label="${c.name} token ${ti + 1}"></button>`).join('')).join('')
      }</div></div>
      <div class="ludo-players" id="lp-bottom"></div>
      <div class="dock ludo-dock">
        <div class="ludo-msg"></div>
        <div class="ludo-row"><div class="turn-chip"></div><button class="ludo-die" aria-label="Roll the dice"></button><div class="ludo-side">${footer}</div></div>
      </div>
    </div>`;
  }
  function place(st, pi, ti) {
    const c = COLORS[pi], tk = st.players[pi].tokens[ti];
    if (tk.t < 0) return [c.yard[0] + SPOTS[ti][0] - 0.5, c.yard[1] + SPOTS[ti][1] - 0.5];
    if (tk.h === 5) return c.end;
    if (tk.h >= 0) return c.home(tk.h);
    return TRACK[trackCell(pi, tk.t)];
  }
  function setDie(node, n) { if (node.dataset.n !== String(n)) { node.dataset.n = n; node.innerHTML = '<i></i>'.repeat(n); } }
  // opts: { me: colour this phone controls (-1 = watching), face: dice face while rolling, timer: html, results: html }
  function update(container, st, opts) {
    if (!container.querySelector('.ludo-board')) return;
    const groups = new Map();
    st.players.forEach((p, pi) => p.tokens.forEach((tk, ti) => {
      const [r, c] = place(st, pi, ti), k = r + ',' + c;
      (groups.get(k) || groups.set(k, []).get(k)).push({ pi, ti, r, c });
    }));
    const myTurn = opts.me === st.turn && !st.over;
    const movable = new Set(myTurn && st.phase === 'pick' ? st.movable : []);
    groups.forEach(list => list.forEach((o, i) => {
      const node = container.querySelector(`.token[data-p="${o.pi}"][data-t="${o.ti}"]`);
      const n = list.length, inYard = st.players[o.pi].tokens[o.ti].t < 0;
      const off = n > 1 && !inYard ? [[-.22, -.22], [.22, .22], [.22, -.22], [-.22, .22]][i % 4] : [0, 0];
      node.style.left = ((o.c + 0.5 + off[1]) / 15 * 100) + '%';
      node.style.top = ((o.r + 0.5 + off[0]) / 15 * 100) + '%';
      node.classList.toggle('small', n > 1 && !inYard);
      node.classList.toggle('movable', o.pi === st.turn && movable.has(o.ti));
      node.classList.toggle('done', st.players[o.pi].tokens[o.ti].h === 5);
      node.hidden = st.players[o.pi].kind === 'none';
    }));
    const badge = pi => {
      const p = st.players[pi];
      if (p.kind === 'none') return `<div class="lp c-${COLORS[pi].id} empty"><span class="sw"></span><b>Empty</b></div>`;
      const home = p.tokens.filter(t => t.h === 5).length;
      return `<div class="lp c-${COLORS[pi].id}${st.turn === pi && !st.over ? ' active' : ''}${pi === opts.me ? ' me' : ''}">
        <span class="sw"></span><b>${esc(p.name)}${pi === opts.me && p.name !== 'You' ? ' (you)' : ''}</b>
        <small>${p.rank ? ['', '🥇 1st', '🥈 2nd', '🥉 3rd', '4th'][p.rank] : `${home}/4${st.killRule && !p.kills ? ' 🔒' : ''}`}</small></div>`;
    };
    container.querySelector('#lp-top').innerHTML = badge(1) + badge(2);
    container.querySelector('#lp-bottom').innerHTML = badge(0) + badge(3);
    const dock = container.querySelector('.ludo-dock');
    if (st.over) { if (dock.dataset.over !== '1') { dock.dataset.over = '1'; dock.innerHTML = opts.results || ''; } return; }
    if (dock.dataset.over === '1') return;
    const cur = st.players[st.turn];
    container.querySelector('.ludo-msg').innerHTML = `${esc(myTurn && st.phase === 'roll' ? 'Your turn — tap the dice' : myTurn && st.phase === 'pick' ? 'Tap a glowing token to move' : st.msg)}${opts.timer || ''}`;
    container.querySelector('.turn-chip').innerHTML = `<span class="sw c-${COLORS[st.turn].id}"></span>${esc(cur.name)}`;
    const die = container.querySelector('.ludo-die');
    die.className = `ludo-die c-${COLORS[st.turn].id}${st.rolling ? ' rolling' : ''}${myTurn && st.phase === 'roll' && !st.rolling ? ' ready' : ''}`;
    setDie(die, st.rolling ? (opts.face || 1) : st.dice || 6);
  }
  function resultsHTML(st, buttons = '') {
    const order = st.players.filter(p => p.kind !== 'none').sort((a, b) => a.rank - b.rank);
    return `<div class="ludo-results"><h3>🏆 ${esc(order[0].name)} wins!</h3>${order.map(p => `<div class="lp c-${COLORS[p.color].id}"><span class="sw"></span><b>${esc(p.name)}</b><small>${['', '🥇 1st', '🥈 2nd', '🥉 3rd', '4th'][p.rank]}</small></div>`).join('')}${buttons}</div>`;
  }
  return { mount, update, resultsHTML };
})();

/* ======================================================================================= */
/*  Single-phone screen                                                                    */
/* ======================================================================================= */
const Ludo = (() => {
  const KEY = 'cardroom.ludo';
  const CPU = ['Raju', 'Meena', 'Arjun', 'Priya'];
  let el = null, game = null, waiter = null, face = 1, rollTimer = null;
  let setup = load('setup') || {};
  if (!Array.isArray(setup.seats)) setup = { seats: ['human', 'cpu', 'cpu', 'cpu'], killRule: setup.killRule ?? true };

  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game2', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }

  const io = {
    update() { save(); render(); },
    decide(pi, phase) { return new Promise(r => { waiter = { r, phase }; render(); }); },
    fx(name, pi, rank) {
      const mine = game && game.st.players[pi]?.kind === 'human';
      if (name === 'dice') Sfx.dice(); else if (name === 'hop') Sfx.hop(); else if (name === 'capture') Sfx.capture(); else if (name === 'home') Sfx.win();
      else if (name === 'lose' && mine) Sfx.lose();
      else if (name === 'finish' && mine) UI.burst(rank === 1 ? 'You win!' : ['', '', '2nd place!', '3rd place!'][rank] || 'Finished!', rank === 1 ? 'big' : 'win');
    },
  };
  function render() {
    if (!el || !game) return;
    clearInterval(rollTimer);
    if (game.st.rolling) rollTimer = setInterval(() => { face = 1 + Math.floor(Math.random() * 6); draw(); }, 70);
    draw();
  }
  function draw() {
    if (!el || !game) return;
    if (!el.querySelector('.ludo-board')) LudoView.mount(el, '<button class="b b-ghost small-b" data-l="menu">Menu</button>');
    LudoView.update(el, game.st, { me: 0, face, results: LudoView.resultsHTML(game.st, '<div class="act-row"><button class="b b-ghost" data-l="menu">Setup</button><button class="b b-raise" data-l="again">Play again</button></div>') });
  }
  function renderSetup() {
    const seatOpts = i => i === 0 ? '<span class="seg mini"><button class="on" disabled>You</button></span>'
      : `<span class="seg mini">${['cpu', 'none'].map(k => `<button data-seat="${i}:${k}" class="${setup.seats[i] === k ? 'on' : ''}">${k === 'cpu' ? 'Computer' : 'Empty'}</button>`).join('')}</span>`;
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero">${['red', 'green', 'yellow', 'blue'].map(c => `<span class="token t-${c} static"></span>`).join('')}</div>
      <h2 class="wordmark small">Ludo</h2>
      <p class="tagline">Traditional Indian rules</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Ludo</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts">${LUDO.COLORS.map((c, i) => `<label><span class="lp-name"><span class="sw c-${c.id}"></span>${c.name}</span>${seatOpts(i)}</label>`).join('')}
        <label class="check"><input type="checkbox" id="kill-rule" ${setup.killRule ? 'checked' : ''}> Must capture a token before entering home</label>
      </div>
      <p class="hint small">A 6 brings a token out; 6, a capture or reaching home rolls again; three 6s lose the turn; ★ and start squares are safe; two tokens together form a pair that can’t be captured or jumped.</p>
      ${resumable() ? '<button class="b b-ghost wide" data-l="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-l="start">Start game</button>
    </div>`;
  }
  const resumable = () => { const s = load('game2'); return s && s.players && !s.over; };
  function start(st) {
    game?.stop(); waiter = null;
    setup.seats[0] = 'human';
    game = st ? LudoGame.restore(st, io) : new LudoGame({
      seats: setup.seats.map((k, i) => ({ kind: k, name: k === 'human' ? 'You' : CPU[i] + ' 🤖' })), killRule: setup.killRule,
    }, io);
    el.innerHTML = '';
    save(); render(); game.run();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.seat) {
      const [i, k] = b.dataset.seat.split(':'); setup.seats[+i] = k;
      if (setup.seats.filter(s => s !== 'none').length < 2) setup.seats[+i] = 'cpu';
      save(); return renderSetup();
    }
    const l = b.dataset.l;
    if (l === 'start' || l === 'again') { setup.killRule = el.querySelector('#kill-rule')?.checked ?? setup.killRule; return start(); }
    if (l === 'resume' && resumable()) return start(load('game2'));
    if (l === 'menu') { game?.stop(); save(); game = null; waiter = null; clearInterval(rollTimer); return renderSetup(); }
    if (!game || !waiter) return;
    if (b.classList.contains('ludo-die') && waiter.phase === 'roll') { const w = waiter; waiter = null; w.r('roll'); return; }
    if (b.classList.contains('token') && waiter.phase === 'pick') {
      const pi = +b.dataset.p, ti = +b.dataset.t;
      if (pi === game.st.turn && game.st.movable.includes(ti)) { const w = waiter; waiter = null; w.r(ti); }
    }
  }
  function onChange(e) { if (e.target.id === 'kill-rule') { setup.killRule = e.target.checked; save(); } }
  function mount(container) { el = container; el.onclick = onClick; el.onchange = onChange; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); game = null; clearInterval(rollTimer); if (el) el.onclick = el.onchange = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();
