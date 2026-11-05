// Ludo — 4 players, traditional Indian rules.
//  • a 6 brings a token out        • 6, a capture or reaching home earns another roll
//  • three 6s in a row lose the turn • start squares and stars are safe
//  • two tokens of one colour form a pair (joda) that can't be captured or jumped
//  • exact roll to reach home       • optional: capture at least once before entering the home column
const Ludo = (() => {
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
  const KEY = 'cardroom.ludo';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => UI.esc(s);

  let el = null, st = null, gen = 0, pendingRoll = null, pendingPick = null, rolling = false;
  let setup = load('setup') || { kinds: ['human', 'cpu', 'cpu', 'cpu'], killRule: true };

  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { localStorage.setItem(KEY + '.game', JSON.stringify(st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }

  /* ---------------- rules ---------------- */
  function newGame() {
    st = {
      players: COLORS.map((c, i) => ({
        color: i, kind: setup.kinds[i],
        name: setup.kinds[i] === 'cpu' ? ['Raju', 'Meena', 'Arjun', 'Priya'][i] + ' 🤖' : (setup.kinds.filter(k => k === 'human').length > 1 ? c.name : 'You'),
        tokens: [0, 1, 2, 3].map(() => ({ t: -1, h: -1 })), kills: 0, rank: 0,
      })),
      turn: 0, dice: 0, sixes: 0, killRule: setup.killRule, ranks: 0, over: false,
      msg: '', log: [],
    };
    save();
  }
  const canEnterHome = p => !st.killRule || p.kills > 0;
  const trackCell = (pi, t) => (COLORS[pi].start + t) % 52;

  // what occupies each track square: [{pi, ti}]
  function occupancy() {
    const m = new Map();
    st.players.forEach((p, pi) => p.tokens.forEach((tk, ti) => {
      if (tk.t >= 0 && tk.h < 0) { const c = trackCell(pi, tk.t); (m.get(c) || m.set(c, []).get(c)).push({ pi, ti }); }
    }));
    return m;
  }
  const isBlock = (list, pi) => { if (!list) return false; const by = {}; for (const o of list) if (o.pi !== pi) by[o.pi] = (by[o.pi] || 0) + 1; return Object.values(by).some(n => n >= 2); };

  // The squares a token passes through for a roll, or null if the move is illegal.
  function path(pi, ti, d, occ = occupancy()) {
    const p = st.players[pi], tk = p.tokens[ti];
    if (tk.h === 5) return null;
    if (tk.t < 0) return d === 6 ? [{ t: 0, h: -1 }] : null;
    const out = [];
    let t = tk.t, h = tk.h;
    for (let k = 1; k <= d; k++) {
      if (h >= 0) { h++; if (h > 5) return null; }
      else if (t % 52 === 50 && canEnterHome(p)) h = 0;
      else {
        t++;
        const list = occ.get(trackCell(pi, t));
        if (isBlock(list, pi)) return null;           // can't jump or land on a pair
      }
      out.push({ t, h });
    }
    return out;
  }
  function legalMoves(pi, d) {
    const occ = occupancy(), moves = [];
    st.players[pi].tokens.forEach((_, ti) => { const pth = path(pi, ti, d, occ); if (pth) moves.push({ ti, path: pth }); });
    return moves;
  }

  /* ---------------- computer player ---------------- */
  function danger(pi, cell) {   // is an opponent single token 1–6 squares behind this square?
    if (SAFE.has(cell)) return false;
    return st.players.some((q, qi) => qi !== pi && q.tokens.some(tk => tk.t >= 0 && tk.h < 0 && (() => { const back = (cell - trackCell(qi, tk.t) + 52) % 52; return back >= 1 && back <= 6; })()));
  }
  function aiPick(pi, moves, d) {
    const occ = occupancy();
    let best = null, bestScore = -1e9;
    for (const m of moves) {
      const p = st.players[pi], tk = p.tokens[m.ti], end = m.path[m.path.length - 1];
      let s = Math.random() * 3;
      if (end.h === 5) s += 100;
      else if (end.h >= 0 && tk.h < 0) s += 35;
      if (tk.t < 0) s += 55;
      if (end.h < 0) {
        const cell = trackCell(pi, end.t), here = occ.get(cell) || [];
        if (!SAFE.has(cell) && here.some(o => o.pi !== pi)) s += 90 + Math.max(...here.filter(o => o.pi !== pi).map(o => st.players[o.pi].tokens[o.ti].t)) * 0.5;
        if (SAFE.has(cell)) s += 18;
        if (danger(pi, cell)) s -= 45;
        if (here.some(o => o.pi === pi)) s += 12;          // form a pair
      }
      if (tk.t >= 0 && tk.h < 0 && danger(pi, trackCell(pi, tk.t))) s += 28;   // run from danger
      s += Math.max(0, tk.t) * 0.25;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  /* ---------------- turn loop ---------------- */
  async function play() {
    const g = gen;
    const alive = () => g === gen && el;
    while (alive() && !st.over) {
      const pi = st.turn, p = st.players[pi];
      if (p.rank) { nextTurn(); continue; }
      st.dice = st.dice || 0;
      st.phase = 'roll';
      st.msg = p.kind === 'human' ? (humans() > 1 ? `${p.name}'s turn — tap the dice` : 'Your turn — tap the dice') : `${p.name} is rolling…`;
      render();
      if (p.kind === 'human') await new Promise(r => { pendingRoll = r; });
      else await sleep(650);
      if (!alive()) return;
      const d = await rollDice();
      if (!alive()) return;
      if (d === 6) st.sixes++; else st.sixes = 0;
      if (st.sixes === 3) {
        st.msg = `Three 6s in a row — ${p.kind === 'human' && humans() === 1 ? 'you lose' : p.name + ' loses'} the turn!`;
        Sfx.lose(); st.sixes = 0; render(); await sleep(1300); nextTurn(); continue;
      }
      const moves = legalMoves(pi, d);
      if (!moves.length) {
        st.msg = d === 6 ? 'No move — but a 6 rolls again' : 'No moves possible';
        render(); await sleep(900);
        if (d !== 6) nextTurn();
        continue;
      }
      let mv;
      const allSame = moves.every(m => JSON.stringify(st.players[pi].tokens[m.ti]) === JSON.stringify(st.players[pi].tokens[moves[0].ti]));
      if (p.kind === 'cpu') { st.phase = 'move'; render(); await sleep(450); mv = aiPick(pi, moves, d); }
      else if (moves.length === 1 || allSame) { st.phase = 'move'; render(); await sleep(250); mv = moves[0]; }
      else {
        st.phase = 'pick'; st.movable = moves.map(m => m.ti);
        st.msg = humans() > 1 ? `${p.name}: tap a token to move` : 'Tap a token to move';
        render();
        const ti = await new Promise(r => { pendingPick = r; });
        if (!alive()) return;
        mv = moves.find(m => m.ti === ti);
      }
      st.movable = null;
      if (!alive()) return;
      const res = await moveToken(pi, mv, g);
      if (!alive()) return;
      const done = p.tokens.every(tk => tk.h === 5);
      if (done && !p.rank) {
        p.rank = ++st.ranks;
        st.msg = `${p.name} ${p.kind === 'human' && humans() === 1 ? 'finish' : 'finishes'} ${['', '1st', '2nd', '3rd'][p.rank]}!`;
        if (p.kind === 'human') UI.burst(p.rank === 1 ? 'You win!' : `${['', '1st', '2nd', '3rd'][p.rank]} place!`, p.rank === 1 ? 'big' : 'win');
        if (st.ranks === 3) {
          const last = st.players.find(q => !q.rank); last.rank = 4;
          st.over = true; st.phase = 'over'; save(); render(); return;
        }
      }
      const extra = !p.rank && (d === 6 || res.captured || res.home);
      if (res.captured) st.msg = `${p.name} captured ${res.captured}! Roll again`;
      else if (res.home && !done) st.msg = `${p.name} got a token home! Roll again`;
      else if (d === 6 && extra) st.msg = 'Six! Roll again';
      if (!extra) nextTurn();
      save(); render();
      if (extra) await sleep(500);
    }
  }
  const humans = () => st.players.filter(p => p.kind === 'human').length;
  function nextTurn() { st.sixes = 0; st.turn = (st.turn + 1) % 4; st.dice = 0; }

  async function rollDice() {
    rolling = true; render();
    Sfx.dice?.();
    const face = el?.querySelector('.ludo-die');
    const d = 1 + Math.floor(Math.random() * 6);
    for (let i = 0; i < 7 && face; i++) { setDie(face, 1 + Math.floor(Math.random() * 6)); await sleep(65); }
    rolling = false; st.dice = d; render();
    await sleep(250);
    return d;
  }

  async function moveToken(pi, mv, g) {
    const p = st.players[pi], tk = p.tokens[mv.ti];
    for (const step of mv.path) {
      if (g !== gen) return {};
      tk.t = step.t; tk.h = step.h;
      Sfx.hop?.();
      render();
      await sleep(tk.h === 5 ? 260 : 170);
    }
    const res = { captured: '', home: tk.h === 5 };
    if (tk.h < 0) {
      const cell = trackCell(pi, tk.t);
      if (!SAFE.has(cell)) {
        const victims = [];
        st.players.forEach((q, qi) => { if (qi !== pi) q.tokens.forEach(o => { if (o.t >= 0 && o.h < 0 && trackCell(qi, o.t) === cell) { o.t = -1; o.h = -1; victims.push(q.name); } }); });
        if (victims.length) { p.kills++; res.captured = [...new Set(victims)].join(' & ').replace(' 🤖', ''); Sfx.capture?.(); render(); await sleep(350); }
      }
    }
    if (res.home) Sfx.win();
    return res;
  }

  /* ---------------- rendering ---------------- */
  const pos = ([r, c]) => `left:${((c + 0.5) / 15 * 100).toFixed(3)}%;top:${((r + 0.5) / 15 * 100).toFixed(3)}%`;
  function tokenPlace(pi, ti) {
    const c = COLORS[pi], tk = st.players[pi].tokens[ti];
    if (tk.t < 0) return [c.yard[0] + SPOTS[ti][0] - 0.5, c.yard[1] + SPOTS[ti][1] - 0.5];
    if (tk.h === 5) return c.end;
    if (tk.h >= 0) return c.home(tk.h);
    return TRACK[trackCell(pi, tk.t)];
  }

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

  function setDie(node, n) {
    node.dataset.n = n;
    node.innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
  }

  function mountGame() {
    el.innerHTML = `<div class="ludo">
      <div class="ludo-players" id="lp-top"></div>
      <div class="ludo-board">${boardHTML()}<div class="ludo-tokens">${
        COLORS.map((c, pi) => [0, 1, 2, 3].map(ti => `<button class="token t-${c.id}" data-p="${pi}" data-t="${ti}" aria-label="${c.name} token ${ti + 1}"></button>`).join('')).join('')
      }</div></div>
      <div class="ludo-players" id="lp-bottom"></div>
      <div class="dock ludo-dock">
        <div class="ludo-msg"></div>
        <div class="ludo-row"><div class="turn-chip"></div><button class="ludo-die" aria-label="Roll the dice"></button><button class="b b-ghost small-b" data-l="menu">Menu</button></div>
      </div>
    </div>`;
  }

  function render() {
    if (!el || !st) return;
    if (st.phase === 'setup' || !el.querySelector('.ludo-board')) { if (st.phase === 'setup') return renderSetup(); mountGame(); }
    // tokens: group tokens sharing a square so they sit side by side
    const groups = new Map();
    st.players.forEach((p, pi) => p.tokens.forEach((tk, ti) => {
      const [r, c] = tokenPlace(pi, ti); const k = r + ',' + c;
      (groups.get(k) || groups.set(k, []).get(k)).push({ pi, ti, r, c });
    }));
    const movable = new Set(st.phase === 'pick' ? st.movable : []);
    groups.forEach(list => list.forEach((o, i) => {
      const node = el.querySelector(`.token[data-p="${o.pi}"][data-t="${o.ti}"]`);
      const n = list.length, inYard = st.players[o.pi].tokens[o.ti].t < 0;
      const off = n > 1 && !inYard ? [[-.22, -.22], [.22, .22], [.22, -.22], [-.22, .22]][i % 4] : [0, 0];
      node.style.left = ((o.c + 0.5 + off[1]) / 15 * 100) + '%';
      node.style.top = ((o.r + 0.5 + off[0]) / 15 * 100) + '%';
      node.classList.toggle('small', n > 1 && !inYard);
      node.classList.toggle('movable', o.pi === st.turn && movable.has(o.ti));
      node.classList.toggle('done', st.players[o.pi].tokens[o.ti].h === 5);
    }));
    // players around the board
    const badge = pi => {
      const p = st.players[pi], home = p.tokens.filter(t => t.h === 5).length;
      return `<div class="lp c-${COLORS[pi].id}${st.turn === pi && !st.over ? ' active' : ''}">
        <span class="sw"></span><b>${esc(p.name)}</b>
        <small>${p.rank ? ['', '🥇 1st', '🥈 2nd', '🥉 3rd', '4th'][p.rank] : `${home}/4 home${st.killRule && !p.kills ? ' · 🔒' : ''}`}</small></div>`;
    };
    el.querySelector('#lp-top').innerHTML = badge(1) + badge(2);
    el.querySelector('#lp-bottom').innerHTML = badge(0) + badge(3);
    const cur = st.players[st.turn];
    if (!el.querySelector('.ludo-msg')) return;   // results panel is showing
    el.querySelector('.ludo-msg').textContent = st.over ? 'Game over' : st.msg;
    el.querySelector('.turn-chip').innerHTML = st.over ? '' : `<span class="sw c-${COLORS[st.turn].id}"></span>${esc(cur.name)}`;
    const die = el.querySelector('.ludo-die');
    die.className = `ludo-die c-${COLORS[st.turn].id}${rolling ? ' rolling' : ''}${st.phase === 'roll' && cur.kind === 'human' && !rolling ? ' ready' : ''}`;
    if (!rolling) setDie(die, st.dice || (die.dataset.n ? +die.dataset.n : 6));
    if (st.over) renderResults();
  }

  function renderResults() {
    const dock = el.querySelector('.ludo-dock');
    const order = [...st.players].sort((a, b) => a.rank - b.rank);
    dock.innerHTML = `<div class="ludo-results"><h3>Results</h3>${order.map(p => `<div class="lp c-${COLORS[p.color].id}"><span class="sw"></span><b>${esc(p.name)}</b><small>${['', '🥇 1st', '🥈 2nd', '🥉 3rd', '4th'][p.rank]}</small></div>`).join('')}
      <div class="act-row"><button class="b b-ghost" data-l="menu">Change players</button><button class="b b-raise" data-l="again">Play again</button></div></div>`;
  }

  function renderSetup() {
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero">${['red', 'green', 'yellow', 'blue'].map(c => `<span class="token t-${c} static"></span>`).join('')}</div>
      <h2 class="wordmark small">Ludo</h2>
      <p class="tagline">Traditional Indian rules</p>
      <div class="opts">${COLORS.map((c, i) => `<label><span class="lp-name"><span class="sw c-${c.id}"></span>${c.name}</span>
        <span class="seg mini">${['human', 'cpu'].map(k => `<button data-kind="${i}:${k}" class="${setup.kinds[i] === k ? 'on' : ''}">${k === 'human' ? 'Player' : 'Computer'}</button>`).join('')}</span></label>`).join('')}
        <label class="check"><input type="checkbox" id="kill-rule" ${setup.killRule ? 'checked' : ''}> Must capture a token before entering home</label>
      </div>
      <p class="hint small">Several “Player” seats = pass the phone around. A 6 brings a token out; 6, a capture or reaching home rolls again; three 6s lose the turn; ★ and start squares are safe; two tokens together form a pair that can’t be captured or jumped.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-l="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-l="start">Start game</button>
    </div>`;
  }

  /* ---------------- input ---------------- */
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.kind) { const [i, k] = b.dataset.kind.split(':'); setup.kinds[+i] = k; if (!setup.kinds.includes('human')) setup.kinds[0] = 'human'; save(); return renderSetup(); }
    const l = b.dataset.l;
    if (l === 'start' || l === 'again') { setup.killRule = el.querySelector('#kill-rule')?.checked ?? setup.killRule; newGame(); return start(); }
    if (l === 'resume') { st = load('game'); return start(); }
    if (l === 'menu') { gen++; pendingRoll = pendingPick = null; st = { phase: 'setup' }; return renderSetup(); }
    if (b.classList.contains('ludo-die')) { if (pendingRoll && !rolling) { const r = pendingRoll; pendingRoll = null; r(); } return; }
    if (b.classList.contains('token') && pendingPick && st.phase === 'pick') {
      const pi = +b.dataset.p, ti = +b.dataset.t;
      if (pi === st.turn && st.movable.includes(ti)) { const r = pendingPick; pendingPick = null; st.phase = 'move'; r(ti); }
    }
  }
  function onChange(e) { if (e.target.id === 'kill-rule') { setup.killRule = e.target.checked; save(); } }

  function start() {
    gen++; pendingRoll = pendingPick = null; rolling = false;
    st.phase = 'roll';
    el.innerHTML = ''; mountGame(); render();
    play();
  }

  function mount(container) {
    el = container; el.onclick = onClick; el.onchange = onChange;
    const saved = load('game');
    st = saved && !saved.over ? Object.assign(saved, { phase: 'setup' }) : { phase: 'setup' };
    renderSetup();
  }
  function unmount() {
    gen++; pendingRoll = pendingPick = null;
    if (st && st.players && !st.over) save();
    if (el) { el.onclick = el.onchange = null; }
    el = null;
  }
  return { mount, unmount, _rules: { path: (...a) => path(...a), legalMoves: (...a) => legalMoves(...a), get st() { return st; }, set st(v) { st = v; }, TRACK, COLORS, SAFE } };
})();
