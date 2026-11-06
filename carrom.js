// Carrom — 2 players, or 4 players as two partnerships (partners sit opposite each other).
//  Flick the striker from your baseline: pocket your own colour (white for seats 1 & 3, black for 2 & 4) to keep your turn.
//  The queen scores 3 and must be "covered" by pocketing one of your coins on the same or the next shot, otherwise it
//  returns to the centre. A pocketed striker is a foul (a coin you have pocketed goes back). Pocketing an opponent's
//  coin gives it to them and ends your turn. Clear all 9 of your coins first to win — but not before the queen is covered.
//   CAR          : board geometry and the physics simulation (no DOM)
//   CarromGame   : rules engine — runs on this phone, or on the room host for online play
//   CarromView   : canvas board (aim by dragging back like a slingshot), animates a recorded shot
//   Carrom       : the single-phone screen
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {   // older Safari
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
}
const CAR = (() => {
  const S = 1000, RC = 22, RS = 28, MC = 1, MS = 2.6, PK = 34, PR = 37, E_C = 0.93, E_W = 0.72, FR = 0.985, VMAX = 38, STOP = 0.07, SUB = 3;
  const BASE_Y = 830, BASE_MIN = 175, BASE_MAX = 825;
  const POCKETS = [[PK, PK], [S - PK, PK], [S - PK, S - PK], [PK, S - PK]];
  const rot1 = (x, y) => [S - y, x];                                   // 90° clockwise about the centre
  const toGlobal = (x, y, s) => { for (let i = 0; i < s; i++) [x, y] = rot1(x, y); return [x, y]; };
  const toLocal = (x, y, s) => toGlobal(x, y, (4 - s) % 4);
  // the standard layout: queen in the middle, a ring of 6, then a ring of 12 — colours alternate
  function layout() {
    const a = 2 * RC + 0.6, C = S / 2, coins = [{ id: 0, k: 'q', x: C, y: C, in: false }];
    let id = 1;
    for (let j = 0; j < 6; j++) { const t = j * Math.PI / 3; coins.push({ id: id++, k: j % 2 ? 'b' : 'w', x: C + a * Math.cos(t), y: C + a * Math.sin(t), in: false }); }
    for (let j = 0; j < 6; j++) {
      const t = j * Math.PI / 3, tip = j % 2 ? 'b' : 'w';
      coins.push({ id: id++, k: tip, x: C + 2 * a * Math.cos(t), y: C + 2 * a * Math.sin(t), in: false });
      coins.push({ id: id++, k: tip === 'w' ? 'b' : 'w', x: C + a * Math.sqrt(3) * Math.cos(t + Math.PI / 6), y: C + a * Math.sqrt(3) * Math.sin(t + Math.PI / 6), in: false });
    }
    return coins;
  }
  const body = (c, r = RC, m = MC) => ({ id: c.id, k: c.k, x: c.x, y: c.y, vx: 0, vy: 0, r, m, in: false });

  // Runs the physics until everything stops. Bodies are changed in place. With record, returns the animation:
  // frames[i] = flat [x0, y0, x1, y1, …] for `ids`, one frame per 2 ticks; events mark pockets / hits by frame index.
  function simulate(bodies, record = false, maxTicks = 900) {
    const frames = [], events = [], snap = () => { const f = []; for (const b of bodies) f.push(Math.round(b.x), Math.round(b.y)); return f; };
    if (record) frames.push(snap());
    const dt = 1 / SUB; let lastHit = -9;
    for (let tick = 1; tick <= maxTicks; tick++) {
      for (let s = 0; s < SUB; s++) {
        for (const b of bodies) if (!b.in) { b.x += b.vx * dt; b.y += b.vy * dt; }
        for (let i = 0; i < bodies.length; i++) {
          const a = bodies[i]; if (a.in) continue;
          for (let j = i + 1; j < bodies.length; j++) {
            const b = bodies[j]; if (b.in) continue;
            const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 < 1e-9) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, im1 = 1 / a.m, im2 = 1 / b.m, ov = rr - d;
            a.x -= nx * ov * im1 / (im1 + im2); a.y -= ny * ov * im1 / (im1 + im2); b.x += nx * ov * im2 / (im1 + im2); b.y += ny * ov * im2 / (im1 + im2);
            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vn < 0) {
              const J = -(1 + E_C) * vn / (im1 + im2);
              a.vx -= J * nx * im1; a.vy -= J * ny * im1; b.vx += J * nx * im2; b.vy += J * ny * im2;
              if (record && -vn > 1.5 && tick - lastHit >= 2) { events.push({ f: frames.length, t: 'hit', v: Math.min(1, -vn / 20) }); lastHit = tick; }
            }
          }
        }
        for (const b of bodies) {
          if (b.in) continue;
          for (let p = 0; p < 4; p++) {
            const dx = b.x - POCKETS[p][0], dy = b.y - POCKETS[p][1];
            if (dx * dx + dy * dy < PR * PR) { b.in = true; b.vx = b.vy = 0; b.pk = p; events.push({ f: frames.length, t: 'in', id: b.id, p }); break; }
          }
          if (b.in) continue;
          if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * E_W; } else if (b.x > S - b.r) { b.x = S - b.r; b.vx = -b.vx * E_W; }
          if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * E_W; } else if (b.y > S - b.r) { b.y = S - b.r; b.vy = -b.vy * E_W; }
        }
      }
      let moving = false;
      for (const b of bodies) {
        if (b.in) continue;
        b.vx *= FR; b.vy *= FR;
        if (b.vx * b.vx + b.vy * b.vy < STOP * STOP) b.vx = b.vy = 0; else moving = true;
      }
      if (record && tick % 2 === 0) frames.push(snap());
      if (!moving) break;
    }
    if (record) frames.push(snap());
    return { frames, events, ids: bodies.map(b => b.id) };
  }
  return { S, RC, RS, PK, PR, BASE_Y, BASE_MIN, BASE_MAX, VMAX, POCKETS, toGlobal, toLocal, layout, body, simulate, MS };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), decide(pi, 'shoot', {}) → Promise<{x, a, p}>, shot(info), fx(name, pi) }
//   a shot is in the shooter's own view: x = striker position on the baseline, a = direction (radians), p = power 0–1
class CarromGame {
  constructor({ players, level = 1 }, io) {
    this.io = io; this.gen = 0;
    const n = players.length;
    this.st = {
      players: players.map((p, i) => ({ id: p.id || 'p' + i, name: p.name, kind: p.kind, seat: n === 2 ? i * 2 : i, team: n === 2 ? i : i % 2 })),
      coins: CAR.layout(), turn: 0, taken: { w: 0, b: 0 }, queen: { s: 'board', by: -1 }, level,
      msg: 'Break! Pocket your coins to keep your turn.', over: false, winner: -1, points: 0, seq: 0, shots: 0, last: null,
    };
  }
  static restore(st, io) { const g = Object.create(CarromGame.prototype); g.io = io; g.gen = 0; g.st = st; return g; }
  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(CarromGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  stop() { this.gen++; }
  P(pi) { return this.st.players[pi]; }
  colour(pi) { return this.P(pi).team === 0 ? 'w' : 'b'; }

  async run() { try { await this.loop(); } catch (e) { if (e !== CarromGame.ABORT) console.error(e); } }
  async loop() {
    const st = this.st;
    this.up();
    while (!st.over) {
      const pi = st.turn, p = this.P(pi);
      let shot;
      if (p.kind === 'cpu') { await this.sleep(900); shot = this.aiShot(pi); }
      else { const g = this.gen; shot = await this.io.decide(pi, 'shoot', {}); if (g !== this.gen) throw CarromGame.ABORT; }
      const info = this.shoot(pi, shot) || this.shoot(pi, this.aiShot(pi));
      this.io.shot(info);
      this.up();
      await this.sleep(Math.max(600, info.frames.length * 34 + 450));
    }
  }

  /* geometry */
  strikerAt(pi, x) { return CAR.toGlobal(Math.max(CAR.BASE_MIN, Math.min(CAR.BASE_MAX, x)), CAR.BASE_Y, this.P(pi).seat); }
  blocked(pi, x) { const [gx, gy] = this.strikerAt(pi, x); return this.st.coins.some(c => !c.in && Math.hypot(c.x - gx, c.y - gy) < CAR.RC + CAR.RS + 1); }
  freeSpot(x, y) {   // nearest free place to (x, y) for a coin being put back on the board
    const free = (a, b) => this.st.coins.every(c => c.in || Math.hypot(c.x - a, c.y - b) > 2 * CAR.RC + 1);
    if (free(x, y)) return [x, y];
    for (let r = 46; r < 400; r += 24) for (let k = 0; k < 16; k++) { const t = k * Math.PI / 8, a = x + r * Math.cos(t), b = y + r * Math.sin(t); if (free(a, b)) return [a, b]; }
    return [x, y];
  }
  putBack(c) { const [x, y] = this.freeSpot(CAR.S / 2, CAR.S / 2); c.x = x; c.y = y; c.in = false; }

  // simulate a shot on a copy of the board; returns the raw outcome (does not change the game)
  trial(pi, shot, record = false) {
    const bodies = this.st.coins.filter(c => !c.in).map(c => CAR.body(c));
    const [gx, gy] = this.strikerAt(pi, shot.x), seat = this.P(pi).seat, ang = shot.a + seat * Math.PI / 2, v = Math.max(0.05, Math.min(1, shot.p)) * CAR.VMAX;
    const sb = { id: 99, k: 's', x: gx, y: gy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: CAR.RS, m: CAR.MS, in: false };
    bodies.unshift(sb);
    const sim = CAR.simulate(bodies, record);
    return { bodies, sim, striker: sb };
  }

  shoot(pi, shot) {
    const st = this.st, p = this.P(pi);
    if (!shot || !isFinite(shot.x) || !isFinite(shot.a) || !isFinite(shot.p) || pi !== st.turn || st.over) return null;
    if (this.blocked(pi, shot.x)) return null;
    const own = this.colour(pi), { bodies, sim, striker } = this.trial(pi, shot, true);
    const prevPending = st.queen.s === 'pending' && st.queen.by === pi;
    // apply the physics outcome to the board
    const byId = new Map(st.coins.map(c => [c.id, c]));
    const sunk = [];
    for (const b of bodies) { if (b.id === 99) continue; const c = byId.get(b.id); c.x = Math.round(b.x * 10) / 10; c.y = Math.round(b.y * 10) / 10; if (b.in) { c.in = true; sunk.push(c); } }
    const foul = striker.in;
    let ownN = 0, oppN = 0, queenIn = false;
    for (const c of sunk) { if (c.k === own) ownN++; else if (c.k === 'q') queenIn = true; else oppN++; if (c.k === 'w' || c.k === 'b') st.taken[c.k]++; }
    const notes = [];
    let keep = !foul && (ownN > 0 || queenIn);
    // the queen
    const queen = byId.get(0);
    if (prevPending) {
      if (!foul && ownN > 0) { st.queen = { s: own, by: pi }; notes.push('queen covered (+3)'); }
      else { this.putBack(queen); st.queen = { s: 'board', by: -1 }; notes.push('queen not covered — back to the centre'); keep = false; }
    }
    if (queenIn) {
      if (foul) { this.putBack(queen); st.queen = { s: 'board', by: -1 }; notes.push('queen returned'); }
      else if (ownN > 0) { st.queen = { s: own, by: pi }; notes.push('queen pocketed and covered (+3)'); }
      else { st.queen = { s: 'pending', by: pi }; notes.push('queen pocketed — cover it now!'); }
    }
    // foul: a coin you have already pocketed goes back
    if (foul) {
      const mine = st.coins.filter(c => c.in && c.k === own);
      if (mine.length) { const c = mine[mine.length - 1]; this.putBack(c); st.taken[own]--; notes.push('foul — a coin returns to the board'); } else notes.push('foul — striker pocketed');
      keep = false;
    }
    // you can't pocket your last coin before the queen is settled: it goes back
    const left = k => st.coins.filter(c => !c.in && c.k === k).length;
    if (left(own) === 0 && (st.queen.s === 'board' || st.queen.s === 'pending')) {
      const mine = st.coins.filter(c => c.in && c.k === own);
      if (mine.length) { const c = mine[mine.length - 1]; this.putBack(c); st.taken[own]--; notes.push('queen first — last coin returns'); keep = false; }
    }
    if (oppN) notes.push(`${oppN} opponent coin${oppN > 1 ? 's' : ''} pocketed`);
    if (ownN && !foul) notes.unshift(`${ownN} coin${ownN > 1 ? 's' : ''}`);
    st.msg = `${p.name}: ${notes.length ? notes.join(', ') : 'no pocket'}`;
    st.shots++;
    // winner?
    for (const t of [p.team, 1 - p.team]) {
      const k = t === 0 ? 'w' : 'b';
      if (left(k) === 0 && !(k === own && st.queen.s !== own && (st.queen.s === 'board' || st.queen.s === 'pending'))) {
        st.over = true; st.winner = t;
        const other = left(k === 'w' ? 'b' : 'w');
        st.points = other + (st.queen.s === k ? 3 : 0);
        const first = st.players.findIndex(q => q.team === t);
        st.msg = `${st.players.filter(q => q.team === t).map(q => q.name).join(' & ')} win${st.players.filter(q => q.team === t).length > 1 ? '' : 's'} the board — ${st.points} point${st.points === 1 ? '' : 's'}!`;
        this.io.fx('winner', first);
        break;
      }
    }
    if (!st.over && !keep) st.turn = (st.turn + 1) % st.players.length;
    const events = sim.events;
    st.last = { who: pi, foul, own: ownN, opp: oppN };
    if (foul) this.io.fx('lose', pi); else if (ownN || queenIn) this.io.fx('pocket', pi);
    return { frames: sim.frames, ids: sim.ids, events, who: pi, seq: st.shots, start: st.shots };
  }

  /* computer player: tries many shots on a simulated copy of the board and plays the best one */
  aiShot(pi) {
    const st = this.st, seat = this.P(pi).seat, own = this.colour(pi), level = st.level ?? 1;
    const alive = st.coins.filter(c => !c.in);
    let targets = alive.filter(c => c.k === own || (c.k === 'q' && st.queen.s === 'board'));
    if (st.queen.s === 'pending' && st.queen.by === pi) targets = alive.filter(c => c.k === own);
    if (!targets.length) targets = alive;
    const xs = []; for (let x = 200; x <= 800; x += 40) if (!this.blocked(pi, x)) xs.push(x);
    if (!xs.length) for (let x = CAR.BASE_MIN; x <= CAR.BASE_MAX; x += 10) if (!this.blocked(pi, x)) xs.push(x);
    if (!xs.length) return { x: 500, a: -Math.PI / 2, p: 0.5 };
    const cands = [];
    for (const x of xs) {
      const [sx, sy] = this.strikerAt(pi, x);
      for (const c of targets) for (const [px, py] of CAR.POCKETS) {
        const dx = px - c.x, dy = py - c.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
        const gx = c.x - ux * (CAR.RC + CAR.RS), gy = c.y - uy * (CAR.RC + CAR.RS);
        const vx = gx - sx, vy = gy - sy, vl = Math.hypot(vx, vy) || 1;
        const cut = (vx / vl) * ux + (vy / vl) * uy;
        if (cut < 0.3) continue;
        cands.push({ x, a: Math.atan2(vy, vx) - seat * Math.PI / 2, score: cut - vl / 2500 + Math.random() * 0.15 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const tries = cands.slice(0, [10, 24, 40][Math.max(0, Math.min(2, level))]);
    for (let i = 0; i < 18; i++) {   // some random shots at coins, in case nothing lines up
      const x = xs[Math.floor(Math.random() * xs.length)], c = targets[Math.floor(Math.random() * targets.length)], [sx, sy] = this.strikerAt(pi, x);
      tries.push({ x, a: Math.atan2(c.y - sy, c.x - sx) + (Math.random() - 0.5) * 0.3 - seat * Math.PI / 2 });
    }
    let best = null, bestV = -Infinity;
    for (const t of tries) for (const p of [0.5, 0.75, 0.95]) {
      const shot = { x: t.x, a: t.a, p }, { bodies, striker } = this.trial(pi, shot);
      let ownN = 0, oppN = 0, q = false;
      for (const b of bodies) if (b.in && b.id !== 99) { if (b.k === own) ownN++; else if (b.k === 'q') q = true; else oppN++; }
      const v = ownN * 10 + (q ? (ownN ? 14 : st.queen.s === 'board' ? 4 : 0) : 0) - oppN * 7 - (striker.in ? 30 : 0) + (ownN ? 3 : 0) - p * 0.5 + Math.random() * 0.4;
      if (v > bestV) { bestV = v; best = shot; }
    }
    const noise = [0.075, 0.032, 0.014][Math.max(0, Math.min(2, level))];
    return { x: best.x, a: best.a + (Math.random() - 0.5) * 2 * noise, p: Math.max(0.1, Math.min(1, best.p * (1 + (Math.random() - 0.5) * 0.06))) };
  }
  // a person whose time ran out
  auto(pi) { return this.aiShot(pi); }
  forfeit(pi) { const p = this.P(pi); if (p && p.kind === 'human') p.kind = 'cpu'; }
  static viewFor(st) { return st; }
}
CarromGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View                                                                                   */
/* ======================================================================================= */
const CarromView = (() => {
  const esc = s => UI.esc(s), { S, RC, RS, POCKETS } = CAR, M = 55, W = S + 2 * M;   // logical canvas: board plus its frame
  const COL = { w: ['#fffdf5', '#e6dcc0', '#b9ac88'], b: ['#5a5560', '#1c1a20', '#050507'], q: ['#ff9aa8', '#d6263f', '#7c0f20'] };

  function infoHTML(st, me) {
    const mine = st.players[me], myTeam = mine ? mine.team : -1;
    const row = (k, name) => {
      const n = 9 - st.coins.filter(c => !c.in && c.k === k).length;
      return `<div class="car-team ${k === 'w' ? 'tw' : 'tb'}${myTeam === (k === 'w' ? 0 : 1) ? ' me' : ''}"><i></i><strong>${name}</strong><span>${'●'.repeat(n)}<em>${'●'.repeat(9 - n)}</em></span></div>`;
    };
    const q = st.queen.s, qtxt = q === 'board' ? 'Queen on the board' : q === 'pending' ? `Queen: ${esc(st.players[st.queen.by].name)} must cover!` : `Queen won by ${q === 'w' ? 'White' : 'Black'}`;
    const turnP = st.players[st.turn];
    return `<div class="car-top">${row('w', 'White')}${row('b', 'Black')}</div>
      <div class="car-msg">${st.over ? '🏆 ' : ''}${esc(st.msg)}</div>
      <div class="car-sub"><span class="${q === 'board' ? '' : 'q'}">♛ ${qtxt}</span>${st.over ? '' : `<span>${st.turn === me ? '<b>Your turn</b>' : esc(turnP.name) + '’s turn'}</span>`}</div>`;
  }

  // o: { onShoot(shot), canShoot() }
  function mount(root, o) {
    root.innerHTML = '<div class="car-info"></div><div class="car-board"><canvas></canvas></div><div class="car-ctl"><label>Striker position<input type="range" min="175" max="825" step="1" value="500"></label><small class="car-hint"></small></div>';
    const cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), slider = root.querySelector('input'), hint = root.querySelector('.car-hint'), info = root.querySelector('.car-info');
    let st = null, me = -1, anim = null, aim = null, x = 500, raf = 0, size = 0, bg = null, dpr = 1, destroyed = false, infoHtml = '';
    const seat = () => (st && st.players[me] ? st.players[me].seat : 0);
    const myTurn = () => !!(st && !st.over && !anim && st.turn === me && o.canShoot());
    const isBlocked = () => { if (!st) return false; const [gx, gy] = CAR.toGlobal(x, CAR.BASE_Y, seat()); return st.coins.some(c => !c.in && Math.hypot(c.x - gx, c.y - gy) < RC + RS + 1); };

    /* ---- the static board ---- */
    function paintBoard() {
      bg = document.createElement('canvas'); bg.width = bg.height = Math.round(size * dpr);
      const g = bg.getContext('2d'), k = bg.width / W; g.scale(k, k);
      const fr = g.createLinearGradient(0, 0, W, W); fr.addColorStop(0, '#4a2c17'); fr.addColorStop(.5, '#2b190d'); fr.addColorStop(1, '#4a2c17');
      g.fillStyle = fr; g.beginPath(); g.roundRect(0, 0, W, W, 34); g.fill();
      g.strokeStyle = 'rgba(227,194,122,.55)'; g.lineWidth = 3; g.beginPath(); g.roundRect(9, 9, W - 18, W - 18, 26); g.stroke();
      g.translate(M, M);
      const sf = g.createRadialGradient(S / 2, S / 2, 60, S / 2, S / 2, S * .75); sf.addColorStop(0, '#f1d6a1'); sf.addColorStop(1, '#d9b078');
      g.fillStyle = sf; g.fillRect(0, 0, S, S);
      g.save(); g.globalAlpha = .06; g.strokeStyle = '#7a4a1d'; g.lineWidth = 1;   // wood grain
      for (let y = 8; y < S; y += 14) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * .3, y + 6, S * .6, y - 6, S, y + 3); g.stroke(); }
      g.restore();
      g.strokeStyle = '#2a1a10'; g.lineWidth = 2.5;
      // baselines (all four sides) with a red circle at each end
      for (let s = 0; s < 4; s++) {
        const p = (px, py) => CAR.toGlobal(px, py, s), a = p(CAR.BASE_MIN - 28, CAR.BASE_Y - 28), b = p(CAR.BASE_MAX + 28, CAR.BASE_Y + 28);
        const l = p(CAR.BASE_MIN - 28, CAR.BASE_Y - 28), l2 = p(CAR.BASE_MAX + 28, CAR.BASE_Y - 28), l3 = p(CAR.BASE_MIN - 28, CAR.BASE_Y + 28), l4 = p(CAR.BASE_MAX + 28, CAR.BASE_Y + 28);
        g.beginPath(); g.moveTo(...l); g.lineTo(...l2); g.moveTo(...l3); g.lineTo(...l4); g.stroke();
        for (const x0 of [CAR.BASE_MIN - 28, CAR.BASE_MAX + 28]) { const c = p(x0, CAR.BASE_Y); g.beginPath(); g.arc(c[0], c[1], 28, 0, 7); g.fillStyle = '#c0392b'; g.fill(); g.lineWidth = 2; g.stroke(); g.beginPath(); g.arc(c[0], c[1], 20, 0, 7); g.stroke(); }
      }
      g.lineWidth = 2.5; g.strokeStyle = '#2a1a10';
      g.beginPath(); g.arc(S / 2, S / 2, 150, 0, 7); g.stroke();
      g.beginPath(); g.arc(S / 2, S / 2, 46, 0, 7); g.fillStyle = '#c0392b'; g.fill(); g.stroke();
      g.beginPath(); g.arc(S / 2, S / 2, 30, 0, 7); g.fillStyle = '#f1d6a1'; g.fill();
      for (let i = 0; i < 8; i++) { const t = i * Math.PI / 4; g.beginPath(); g.moveTo(S / 2 + 56 * Math.cos(t), S / 2 + 56 * Math.sin(t)); g.lineTo(S / 2 + 138 * Math.cos(t), S / 2 + 138 * Math.sin(t)); g.lineWidth = 1.6; g.stroke(); }
      // corner arrows
      g.lineWidth = 2.5;
      for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [S, 0, -1, 1], [S, S, -1, -1], [0, S, 1, -1]]) {
        g.beginPath(); g.moveTo(cx + sx * 96, cy + sy * 96); g.lineTo(cx + sx * 150, cy + sy * 150); g.stroke();
        g.beginPath(); g.arc(cx + sx * 172, cy + sy * 172, 22, 0, 7); g.stroke();
      }
      for (const [px, py] of POCKETS) {
        const pg = g.createRadialGradient(px, py, 4, px, py, 52); pg.addColorStop(0, '#000'); pg.addColorStop(.7, '#0b0705'); pg.addColorStop(1, '#2a1a10');
        g.beginPath(); g.arc(px, py, 50, 0, 7); g.fillStyle = pg; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(227,194,122,.6)'; g.stroke();
      }
    }
    function coin(g, px, py, k, r, scale = 1) {
      r *= scale; const c = COL[k];
      g.beginPath(); g.arc(px + 3, py + 5, r, 0, 7); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
      const rg = g.createRadialGradient(px - r * .35, py - r * .4, r * .1, px, py, r); rg.addColorStop(0, c[0]); rg.addColorStop(.65, c[1]); rg.addColorStop(1, c[2]);
      g.beginPath(); g.arc(px, py, r, 0, 7); g.fillStyle = rg; g.fill();
      g.lineWidth = Math.max(1, r * .08); g.strokeStyle = k === 'w' ? 'rgba(120,100,60,.55)' : 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(px, py, r * .72, 0, 7); g.stroke();
      g.beginPath(); g.arc(px, py, r * .38, 0, 7); g.stroke();
      g.beginPath(); g.arc(px, py, r, 0, 7); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
    }
    function striker(g, px, py, team, alpha = 1, scale = 1) {
      const r = RS * scale; g.save(); g.globalAlpha = alpha;
      g.beginPath(); g.arc(px + 3, py + 6, r, 0, 7); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
      const rg = g.createRadialGradient(px - r * .35, py - r * .4, r * .1, px, py, r); rg.addColorStop(0, '#fff6d8'); rg.addColorStop(.6, team === 1 ? '#6f6a78' : '#e3c27a'); rg.addColorStop(1, team === 1 ? '#2b2833' : '#a87b31');
      g.beginPath(); g.arc(px, py, r, 0, 7); g.fillStyle = rg; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(px, py, r * .62, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(px, py, r, 0, 7); g.stroke(); g.restore();
    }

    /* ---- one frame ---- */
    const L = (px, py) => CAR.toLocal(px, py, seat());
    function draw(frameIdx) {
      if (!st || !size) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if (!bg || bg.width !== cv.width) paintBoard();
      ctx.drawImage(bg, 0, 0);
      const k = cv.width / W; ctx.setTransform(k, 0, 0, k, M * k, M * k);
      const items = [];
      if (anim) {
        const fr = anim.frames[Math.min(frameIdx, anim.frames.length - 1)], hidden = new Map();
        for (const e of anim.events) if (e.t === 'in' && e.f <= frameIdx) hidden.set(e.id, frameIdx - e.f);
        anim.ids.forEach((id, i) => {
          const c = id === 99 ? { k: 's' } : st.coins.find(q => q.id === id), sink = hidden.get(id);
          let px = fr[i * 2], py = fr[i * 2 + 1], sc = 1;
          if (sink !== undefined) { if (sink > 6) return; sc = 1 - sink / 7; const ev = anim.events.find(e => e.t === 'in' && e.id === id), pk = POCKETS[ev.p]; px += (pk[0] - px) * sink / 7; py += (pk[1] - py) * sink / 7; }
          const [lx, ly] = L(px, py); items.push({ k: c.k, x: lx, y: ly, sc });
        });
      } else {
        for (const c of st.coins) if (!c.in) { const [lx, ly] = L(c.x, c.y); items.push({ k: c.k, x: lx, y: ly, sc: 1 }); }
      }
      for (const it of items) it.k === 's' ? striker(ctx, it.x, it.y, st.players[anim ? anim.who : st.turn]?.team, 1, it.sc) : coin(ctx, it.x, it.y, it.k, RC, it.sc);
      // aiming
      if (myTurn()) {
        const bad = isBlocked(), sy = CAR.BASE_Y;
        striker(ctx, x, sy, st.players[me].team, bad ? .45 : 1);
        if (bad) { ctx.strokeStyle = '#ff5a4d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, sy, RS + 6, 0, 7); ctx.stroke(); }
        if (aim) {
          const dx = x - aim.x, dy = sy - aim.y, len = Math.hypot(dx, dy), p = Math.min(1, len / 300);
          if (len > 6) {
            const ux = dx / len, uy = dy / len;
            // ray to the first coin (or wall)
            let best = 1400, hit = null;
            for (const c of st.coins) if (!c.in) {
              const [cx, cy] = L(c.x, c.y), fx = cx - x, fy = cy - sy, t = fx * ux + fy * uy; if (t < 0) continue;
              const d2 = fx * fx + fy * fy - t * t, rr = RC + RS; if (d2 > rr * rr) continue;
              const tt = t - Math.sqrt(rr * rr - d2); if (tt > 0 && tt < best) { best = tt; hit = { cx, cy }; }
            }
            for (const wt of [ux > 0 ? (S - RS - x) / ux : ux < 0 ? (RS - x) / ux : 1e9, uy > 0 ? (S - RS - sy) / uy : uy < 0 ? (RS - sy) / uy : 1e9]) if (wt > 0 && wt < best) { best = wt; hit = null; }
            ctx.save(); ctx.setLineDash([14, 12]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,20,5,.75)'; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + ux * best, sy + uy * best); ctx.stroke();
            if (hit) {
              const gx = x + ux * best, gy = sy + uy * best; ctx.setLineDash([]); ctx.strokeStyle = 'rgba(40,20,5,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy, RS, 0, 7); ctx.stroke();
              const nx = hit.cx - gx, ny = hit.cy - gy, nl = Math.hypot(nx, ny) || 1; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(hit.cx, hit.cy); ctx.lineTo(hit.cx + nx / nl * 150, hit.cy + ny / nl * 150); ctx.stroke();
            }
            ctx.restore();
            // pull-back band + power
            ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.strokeStyle = `hsl(${120 - 120 * p} 80% 45%)`; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x - ux * len * .9, sy - uy * len * .9); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '700 34px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6;
            ctx.strokeText(Math.round(p * 100) + '%', x, sy + 80); ctx.fillText(Math.round(p * 100) + '%', x, sy + 80);
          }
        }
      }
    }
    const redraw = () => draw(anim ? anim.idx : 0);

    function resize() {
      if (destroyed) return;
      const box = root.querySelector('.car-board'), w = Math.floor(box.clientWidth); if (!w) return;
      dpr = Math.min(2.5, window.devicePixelRatio || 1); size = w;
      cv.style.width = cv.style.height = w + 'px'; cv.width = cv.height = Math.round(w * dpr); bg = null; redraw();
    }
    const ro = new ResizeObserver(resize); ro.observe(root.querySelector('.car-board'));

    /* ---- animating a recorded shot ---- */
    function play(info, done) {
      cancelAnimationFrame(raf);
      anim = { ...info, idx: 0, t0: performance.now(), heard: 0 }; aim = null;
      const tick = now => {
        if (destroyed || !anim) return;
        const idx = Math.max(0, Math.floor((now - anim.t0) / 33.3));
        if (idx !== anim.idx) {
          for (const e of anim.events) if (e.f > anim.idx && e.f <= idx) { if (e.t === 'in') Sfx.chip(); else Sfx.tock(e.v); }
          anim.idx = idx;
        }
        draw(idx);
        if (idx >= anim.frames.length - 1) { anim = null; draw(0); done?.(); render(); return; }
        raf = requestAnimationFrame(tick);
      };
      if (anim.frames.length < 2) { anim = null; done?.(); render(); return; }
      raf = requestAnimationFrame(tick);
    }

    /* ---- input ---- */
    const pt = e => { const r = cv.getBoundingClientRect(), k = W / r.width; return { x: (e.clientX - r.left) * k - M, y: (e.clientY - r.top) * k - M }; };
    cv.addEventListener('pointerdown', e => { if (!myTurn()) return; cv.setPointerCapture(e.pointerId); aim = pt(e); redraw(); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (aim) { aim = pt(e); redraw(); } });
    const end = e => {
      if (!aim) return;
      const dx = x - aim.x, dy = CAR.BASE_Y - aim.y, len = Math.hypot(dx, dy); aim = null;
      if (len > 24 && myTurn() && !isBlocked()) { o.onShoot({ x, a: Math.atan2(dy, dx), p: Math.min(1, len / 300) }); }
      redraw();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', () => { aim = null; redraw(); });
    cv.style.touchAction = 'none';
    slider.addEventListener('input', () => { x = +slider.value; redraw(); renderHint(); });

    function renderHint() {
      hint.textContent = !st || st.over ? '' : anim ? '' : myTurn() ? (isBlocked() ? 'A coin is in the way — slide the striker.' : 'Drag back from anywhere on the board and let go to shoot.') : '';
      hint.classList.toggle('bad', myTurn() && isBlocked());
      slider.disabled = !myTurn(); root.querySelector('.car-ctl').classList.toggle('off', !myTurn());
    }
    function render() { if (!st) return; const h = infoHTML(st, me); if (h !== infoHtml) { info.innerHTML = h; infoHtml = h; } renderHint(); redraw(); }
    return {
      set(newSt, newMe) { st = newSt; me = newMe; if (!anim) render(); },
      play, resize, get animating() { return !!anim; },
      refresh: render,
      destroy() { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); },
    };
  }
  return { mount, infoHTML };
})();

/* ======================================================================================= */
/*  Single-phone screen                                                                    */
/* ======================================================================================= */
const Carrom = (() => {
  const KEY = 'cardroom.carrom';
  const CPU = ['Raju', 'Meena', 'Arjun'];
  let el = null, game = null, waiter = null, view = null;
  let setup = load('setup') || { mode: 2, level: 1 };
  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }
  const io = {
    update() { save(); view?.set(game.st, 0); if (el && el.querySelector('.car-foot')) foot(); },
    decide(pi, phase) { return new Promise(r => { waiter = { r }; view?.set(game.st, 0); navigator.vibrate?.(60); Sfx.turn(); }); },
    shot(info) { view?.play(info); },
    fx(name, pi) { if (name === 'winner') { if (game.st.players[pi].team === game.st.players[0].team) UI.burst('You win!', 'big'); else Sfx.lose(); } else if (name === 'lose' && pi === 0) Sfx.lose(); },
  };
  function renderSetup() {
    const sel = (k, vals, f) => `<select data-o="${k}">${vals.map(v => `<option value="${v}" ${setup[k] == v ? 'selected' : ''}>${f(v)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🎯</div>
      <h2 class="wordmark small">Carrom</h2>
      <p class="tagline">Flick, pocket, win</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Carrom</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts">
        <label>Game ${sel('mode', [2, 4], v => v === 2 ? 'You vs computer' : '2 v 2 — you + computer partner')}</label>
        <label>Computer skill ${sel('level', [0, 1, 2], v => ['Easy', 'Medium', 'Hard'][v])}</label>
      </div>
      <p class="hint small">You play <b>White</b> from the bottom. Drag back from anywhere on the board like a slingshot and let go to flick the striker — slide it along the baseline first with the slider. Pocket your coins to keep your turn; the queen (3 points) must be covered by another of your coins; a pocketed striker is a foul. Clear your 9 coins first to win.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-k="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-k="start">Start game</button>
    </div>`;
  }
  function board() {
    el.innerHTML = '<div class="car-root"></div><div class="car-foot"></div>';
    view?.destroy();
    view = CarromView.mount(el.querySelector('.car-root'), {
      canShoot: () => !!waiter,
      onShoot: shot => { const w = waiter; if (w) { waiter = null; w.r(shot); view.set(game.st, 0); } },
    });
    foot();
  }
  function foot() { el.querySelector('.car-foot').innerHTML = game.st.over ? '<button class="b b-raise big" data-k="again">Play again</button>' : '<button class="b b-ghost wide small-b2" data-k="menu">Setup / quit</button>'; }
  function start(st) {
    game?.stop(); waiter = null;
    const names = setup.mode === 2 ? [{ name: 'You', kind: 'human' }, { name: CPU[0] + ' 🤖', kind: 'cpu' }]
      : [{ name: 'You', kind: 'human' }, { name: CPU[0] + ' 🤖', kind: 'cpu' }, { name: CPU[1] + ' 🤖 (partner)', kind: 'cpu' }, { name: CPU[2] + ' 🤖', kind: 'cpu' }];
    if (setup.mode === 4) { names[1] = { name: CPU[0] + ' 🤖', kind: 'cpu' }; names[2] = { name: CPU[1] + ' 🤖', kind: 'cpu' }; names[3] = { name: CPU[2] + ' 🤖', kind: 'cpu' }; }
    game = st ? CarromGame.restore(st, io) : new CarromGame({ players: names, level: +setup.level }, io);
    save(); board(); view.set(game.st, 0); game.run();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const k = b.dataset.k;
    if (!game) { if (k === 'start') return start(); if (k === 'resume') return start(load('game')); return; }
    if (k === 'again') return start();
    if (k === 'menu') { const go = () => { game.stop(); save(); view?.destroy(); view = null; game = null; waiter = null; renderSetup(); }; if (!game.st.over) UI.ask('Leave this game? It is saved — you can resume it later.', 'Leave').then(ok => ok && go()); else go(); }
  }
  function onChange(e) { const o = e.target.dataset.o; if (o) { setup[o] = +e.target.value; save(); } }
  function mount(container) { el = container; el.onclick = onClick; el.onchange = onChange; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); view?.destroy(); view = null; game = null; waiter = null; if (el) el.onclick = el.onchange = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();
