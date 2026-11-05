// Settlers — a Catan-style island trading game (base-game rules).
//   CAT        : board geometry + shared rule helpers
//   CatanGame  : rules engine (no DOM) — runs on this phone or on the room host
//   CatanView  : draws the island and the player's dock
//   Catan      : single-phone screen (you vs computer players)
const CAT = (() => {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const ICON = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️', desert: '🏜️' };
  const NAME = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore' };
  const COST = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, dev: { sheep: 1, wheat: 1, ore: 1 } };
  const LIMIT = { road: 15, settlement: 5, city: 4 };
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const DEV = { knight: 'Knight', vp: 'Victory Point', roads: 'Road Building', plenty: 'Year of Plenty', mono: 'Monopoly' };
  const COLORS = ['#e53935', '#1e88e5', '#f4f4f4', '#fb8c00'];
  // ---- geometry: 19 pointy-top hexes (radius 2), 54 corners, 72 sides ----
  const S = 10, R3 = Math.sqrt(3);
  const HEX = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) HEX.push({ q, r, x: S * R3 * (q + r / 2), y: S * 1.5 * r });
  const V = [], E = [], vKey = new Map(), eKey = new Map();
  const key = (x, y) => Math.round(x * 10) + ',' + Math.round(y * 10);
  HEX.forEach((h, hi) => {
    h.v = []; h.e = [];
    for (let i = 0; i < 6; i++) {
      const a = (60 * i - 30) * Math.PI / 180, x = h.x + S * Math.cos(a), y = h.y + S * Math.sin(a), k = key(x, y);
      if (!vKey.has(k)) { vKey.set(k, V.length); V.push({ x, y, hexes: [], adj: [], edges: [] }); }
      const vi = vKey.get(k); V[vi].hexes.push(hi); h.v.push(vi);
    }
    for (let i = 0; i < 6; i++) {
      const a = h.v[i], b = h.v[(i + 1) % 6], k = Math.min(a, b) + '-' + Math.max(a, b);
      if (!eKey.has(k)) { eKey.set(k, E.length); E.push({ a, b, hexes: [] }); V[a].adj.push(b); V[b].adj.push(a); V[a].edges.push(E.length - 1); V[b].edges.push(E.length - 1); }
      const ei = eKey.get(k); E[ei].hexes.push(hi); h.e.push(ei);
    }
  });
  // hexes that share a side (for keeping 6s and 8s apart)
  const NEAR = HEX.map((h, i) => HEX.map((g, j) => j).filter(j => j !== i && Math.hypot(HEX[j].x - h.x, HEX[j].y - h.y) < S * 2));
  // nine harbours spread evenly around the coast
  const COAST = E.map((e, i) => i).filter(i => E[i].hexes.length === 1)
    .sort((i, j) => { const a = E[i], b = E[j]; const ang = e => Math.atan2((V[e.a].y + V[e.b].y) / 2, (V[e.a].x + V[e.b].x) / 2); return ang(a) - ang(b); });
  const PORT_EDGES = [0, 3, 7, 10, 13, 17, 20, 23, 27].map(i => COAST[i % COAST.length]);

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function newBoard() {
    const terr = shuffle(['wood', 'wood', 'wood', 'wood', 'sheep', 'sheep', 'sheep', 'sheep', 'wheat', 'wheat', 'wheat', 'wheat', 'brick', 'brick', 'brick', 'ore', 'ore', 'ore', 'desert']);
    let nums;
    for (let tries = 0; tries < 500; tries++) {
      const pool = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      nums = terr.map(t => (t === 'desert' ? 0 : pool.pop()));
      const red = i => nums[i] === 6 || nums[i] === 8;
      if (!nums.some((n, i) => red(i) && NEAR[i].some(red))) break;
    }
    const portTypes = shuffle(['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore']);
    return { tiles: terr.map((t, i) => ({ t, n: nums[i] })), robber: terr.indexOf('desert'), ports: PORT_EDGES.map((e, i) => ({ e, type: portTypes[i] })) };
  }

  // ---- rules that only need the state ----
  const R = {
    hand: p => RES.reduce((t, r) => t + (p.res[r] || 0), 0),
    canPay: (p, cost) => Object.entries(cost).every(([r, n]) => (p.res[r] || 0) >= n),
    ownerAt: (st, v) => st.vert[v] ? st.vert[v].o : -1,
    distanceOk: (st, v) => !st.vert[v] && V[v].adj.every(a => !st.vert[a]),
    touchesOwnRoad: (st, pi, v) => V[v].edges.some(e => st.edge[e] === pi),
    settlementSpots(st, pi, setup) {
      const out = [];
      for (let v = 0; v < V.length; v++) if (R.distanceOk(st, v) && (setup || R.touchesOwnRoad(st, pi, v))) out.push(v);
      return out;
    },
    roadSpots(st, pi, fromV) {
      const out = [];
      E.forEach((e, ei) => {
        if (st.edge[ei] !== undefined) return;
        if (fromV !== undefined) { if (e.a === fromV || e.b === fromV) out.push(ei); return; }
        const ok = [e.a, e.b].some(v => {
          const o = R.ownerAt(st, v);
          if (o === pi) return true;
          if (o !== -1) return false;                       // an opponent's building blocks the road
          return V[v].edges.some(x => x !== ei && st.edge[x] === pi);
        });
        if (ok) out.push(ei);
      });
      return out;
    },
    citySpots: (st, pi) => Object.keys(st.vert).map(Number).filter(v => st.vert[v].o === pi && !st.vert[v].city),
    count(st, pi, kind) {
      if (kind === 'road') return Object.values(st.edge).filter(o => o === pi).length;
      return Object.values(st.vert).filter(b => b.o === pi && (kind === 'city' ? b.city : !b.city)).length;
    },
    ratios(st, pi) {
      const r = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
      st.ports.forEach(pt => {
        const e = E[pt.e];
        if (R.ownerAt(st, e.a) === pi || R.ownerAt(st, e.b) === pi) {
          if (pt.type === 'any') RES.forEach(x => { r[x] = Math.min(r[x], 3); }); else r[pt.type] = 2;
        }
      });
      return r;
    },
    longestRoad(st, pi) {
      const mine = Object.keys(st.edge).map(Number).filter(e => st.edge[e] === pi);
      if (!mine.length) return 0;
      let best = 0;
      const used = new Set();
      const dfs = (v, len) => {
        best = Math.max(best, len);
        const o = R.ownerAt(st, v);
        if (len > 0 && o !== -1 && o !== pi) return;      // an opponent's building breaks the road
        for (const e of V[v].edges) {
          if (st.edge[e] !== pi || used.has(e)) continue;
          used.add(e); dfs(E[e].a === v ? E[e].b : E[e].a, len + 1); used.delete(e);
        }
      };
      const ends = new Set(); mine.forEach(e => { ends.add(E[e].a); ends.add(E[e].b); });
      ends.forEach(v => dfs(v, 0));
      return best;
    },
    publicVP(st, pi) {
      let vp = 0;
      Object.values(st.vert).forEach(b => { if (b.o === pi) vp += b.city ? 2 : 1; });
      if (st.army === pi) vp += 2;
      if (st.road === pi) vp += 2;
      return vp;
    },
    vp: (st, pi) => R.publicVP(st, pi) + (st.players[pi].dev || []).filter(d => d.t === 'vp').length,
    victims(st, pi, hex) {
      const out = new Set();
      HEX[hex].v.forEach(v => { const o = R.ownerAt(st, v); if (o >= 0 && o !== pi && R.hand(st.players[o]) > 0) out.add(o); });
      return [...out];
    },
    pipsAt: (st, v) => V[v].hexes.reduce((t, h) => t + (PIPS[st.tiles[h].n] || 0), 0),
  };
  return { RES, ICON, NAME, COST, LIMIT, PIPS, DEV, COLORS, HEX, V, E, S, R, newBoard, shuffle };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), decide(pi, phase, data) → Promise<action>, fx(name, pi, extra) }
class CatanGame {
  constructor({ players }, io) {
    this.io = io; this.gen = 0;
    const b = CAT.newBoard();
    const deck = CAT.shuffle([...Array(14).fill('knight'), ...Array(5).fill('vp'), 'roads', 'roads', 'plenty', 'plenty', 'mono', 'mono']);
    this.st = {
      tiles: b.tiles, robber: b.robber, ports: b.ports, vert: {}, edge: {}, deck,
      players: players.map((p, i) => ({ id: p.id || 'p' + i, name: p.name, kind: p.kind, color: CAT.COLORS[i], res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, dev: [], knights: 0 })),
      turn: 0, phase: 'setup', dice: [3, 4], rolling: false, rolled: false, devPlayed: false, army: -1, road: -1,
      msg: 'Place your first settlement', log: [], offer: null, over: false, winner: -1, seq: 0, setupLeft: null, last: null,
    };
  }
  static restore(st, io) { const g = Object.create(CatanGame.prototype); g.io = io; g.gen = 0; g.st = st; st.rolling = false; st.offer = null; return g; }
  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(CatanGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  log(t) { this.st.msg = t; this.st.log.unshift(t); this.st.log.length = Math.min(this.st.log.length, 10); }
  stop() { this.gen++; }
  P(pi) { return this.st.players[pi]; }
  name(pi) { return this.P(pi).name; }

  async ask(pi, phase, data) {
    const p = this.P(pi);
    if (p.kind === 'cpu') { await this.sleep(phase === 'respond' ? 300 : 550); return this.auto(pi, phase, data); }
    const g = this.gen;
    const a = await this.io.decide(pi, phase, data);
    if (g !== this.gen) throw CatanGame.ABORT;
    return a || this.auto(pi, phase, data);
  }
  pay(pi, cost) { const p = this.P(pi); for (const [r, n] of Object.entries(cost)) p.res[r] -= n; }
  gain(pi, r, n = 1) { this.P(pi).res[r] += n; }

  async run() { try { await this.loop(); } catch (e) { if (e !== CatanGame.ABORT) console.error(e); } }
  async loop() {
    const st = this.st, n = st.players.length, R = CAT.R;
    // ---- setup: snake order ----
    if (!st.setupLeft) st.setupLeft = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
    while (st.setupLeft.length) {
      const pi = st.setupLeft[0], second = st.setupLeft.length <= n;
      st.turn = pi; st.phase = 'setup';
      st.msg = `${this.name(pi)}: place a ${second ? 'second ' : ''}settlement`; this.up();
      let v;
      for (;;) { const a = await this.ask(pi, 'setup-s', { second }); v = a && a.v; if (R.settlementSpots(st, pi, true).includes(v)) break; }
      st.vert[v] = { o: pi, city: false }; st.last = { v };
      if (second) CAT.V[v].hexes.forEach(h => { const t = st.tiles[h].t; if (t !== 'desert') this.gain(pi, t); });
      this.io.fx('build', pi); st.msg = `${this.name(pi)}: place a road`; this.up();
      let e;
      for (;;) { const a = await this.ask(pi, 'setup-r', { v }); e = a && a.e; if (R.roadSpots(st, pi, v).includes(e)) break; }
      st.edge[e] = pi; st.last = { e };
      this.log(`${this.name(pi)} placed a settlement and road`); this.io.fx('build', pi);
      st.setupLeft.shift(); this.up(); await this.sleep(200);
    }
    // ---- main game ----
    st.turn = 0;
    while (!st.over) {
      const pi = st.turn;
      st.rolled = false; st.devPlayed = false; st.offer = null;
      this.P(pi).dev.forEach(d => { d.new = false; });
      // before the roll: roll, or play a knight first
      for (;;) {
        const a = await this.ask(pi, 'pre');
        if (a && a.type === 'play' && a.card === 'knight' && this.canPlay(pi, 'knight')) { await this.playDev(pi, a); if (st.over) return; continue; }
        break;
      }
      await this.roll(pi);
      if (st.over) return;
      // free actions until the player ends the turn
      if (this.P(pi).kind === 'cpu') await this.cpuMain(pi);
      else {
        for (let guard = 0; guard < 200 && !st.over; guard++) {
          const a = await this.ask(pi, 'main');
          if (!a || a.type === 'end') break;
          await this.action(pi, a);
        }
      }
      if (st.over) return;
      st.turn = (pi + 1) % n; this.up();
    }
  }

  async roll(pi) {
    const st = this.st;
    st.phase = 'rolling'; st.rolling = true; st.prod = null; this.io.fx('dice'); this.up();
    await this.sleep(650);
    st.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    st.rolling = false; st.rolled = true;
    const sum = st.dice[0] + st.dice[1];
    if (sum === 7) {
      this.log(`${this.name(pi)} rolled 7 — the robber strikes!`); this.up(); await this.sleep(500);
      await this.discards();
      await this.moveRobber(pi);
    } else {
      const got = st.players.map(() => ({}));
      st.tiles.forEach((tile, h) => {
        if (tile.n !== sum || h === st.robber) return;
        CAT.HEX[h].v.forEach(v => { const b = st.vert[v]; if (b) { const k = b.city ? 2 : 1; this.gain(b.o, tile.t, k); got[b.o][tile.t] = (got[b.o][tile.t] || 0) + k; } });
      });
      const parts = got.map((g, i) => Object.keys(g).length ? `${this.name(i)} ${Object.entries(g).map(([r, k]) => k + CAT.ICON[r]).join(' ')}` : '').filter(Boolean);
      this.log(`${this.name(pi)} rolled ${sum}${parts.length ? ' — ' + parts.join(' · ') : ' — nothing produced'}`);
      st.prod = { n: sum, seq: st.seq };
      this.io.fx('produce');
    }
    st.phase = 'main'; this.up();
  }
  async discards() {
    const st = this.st;
    const need = st.players.map((p, i) => ({ i, n: Math.floor(CAT.R.hand(p) / 2) })).filter(x => CAT.R.hand(st.players[x.i]) > 7);
    if (!need.length) return;
    st.phase = 'discard'; st.discarding = need.map(x => x.i); this.up();
    await Promise.all(need.map(async ({ i, n }) => {
      let a = await this.ask(i, 'discard', { n });
      const p = this.P(i);
      const ok = a && a.cards && CAT.RES.reduce((t, r) => t + (a.cards[r] || 0), 0) === n && CAT.RES.every(r => (a.cards[r] || 0) >= 0 && (a.cards[r] || 0) <= p.res[r]);
      if (!ok) a = this.auto(i, 'discard', { n });
      CAT.RES.forEach(r => { p.res[r] -= a.cards[r] || 0; });
      st.discarding = st.discarding.filter(x => x !== i);
      this.log(`${this.name(i)} discarded ${n} card${n > 1 ? 's' : ''}`); this.up();
    }));
    st.discarding = null;
  }
  async moveRobber(pi) {
    const st = this.st;
    st.phase = 'robber'; st.msg = `${this.name(pi)} is moving the robber`; this.up();
    let h;
    for (;;) { const a = await this.ask(pi, 'robber'); h = a && a.h; if (Number.isInteger(h) && h >= 0 && h < 19 && h !== st.robber) break; }
    st.robber = h; this.io.fx('robber'); this.up();
    const vs = CAT.R.victims(st, pi, h);
    if (vs.length) {
      let v = vs[0];
      if (vs.length > 1) { st.phase = 'steal'; this.up(); const a = await this.ask(pi, 'steal', { victims: vs }); if (a && vs.includes(a.p)) v = a.p; }
      const pool = CAT.RES.flatMap(r => Array(this.P(v).res[r]).fill(r));
      const r = pool[Math.floor(Math.random() * pool.length)];
      this.P(v).res[r]--; this.gain(pi, r);
      this.log(`${this.name(pi)} stole a card from ${this.name(v)}`);
      this.io.fx('steal', pi);
    } else this.log(`${this.name(pi)} moved the robber`);
    st.phase = 'main'; this.up();
  }

  canPlay(pi, card) {
    const st = this.st;
    return !st.devPlayed && this.P(pi).dev.some(d => d.t === card && !d.new) && card !== 'vp';
  }
  async playDev(pi, a) {
    const st = this.st, p = this.P(pi), idx = p.dev.findIndex(d => d.t === a.card && !d.new);
    if (idx < 0 || st.devPlayed) return;
    p.dev.splice(idx, 1); st.devPlayed = true;
    this.log(`${this.name(pi)} played ${CAT.DEV[a.card]}`); this.io.fx('card'); this.up();
    if (a.card === 'knight') { p.knights++; this.updateArmy(); await this.moveRobber(pi); }
    else if (a.card === 'roads') {
      for (let k = 0; k < 2 && CAT.R.count(st, pi, 'road') < CAT.LIMIT.road; k++) {
        const spots = CAT.R.roadSpots(st, pi); if (!spots.length) break;
        st.phase = 'free-road'; this.up();
        const r = await this.ask(pi, 'free-road'); const e = r && spots.includes(r.e) ? r.e : this.auto(pi, 'free-road').e;
        st.edge[e] = pi; st.last = { e }; this.io.fx('build', pi); this.updateRoad();
      }
      st.phase = 'main';
    } else if (a.card === 'plenty') {
      const rs = (a.res || []).filter(r => CAT.RES.includes(r)).slice(0, 2);
      while (rs.length < 2) rs.push(this.neediest(pi));
      rs.forEach(r => this.gain(pi, r)); this.log(`${this.name(pi)} took ${rs.map(r => CAT.ICON[r]).join(' ')} from the bank`);
    } else if (a.card === 'mono') {
      const r = CAT.RES.includes(a.res) ? a.res : this.neediest(pi);
      let n = 0; st.players.forEach((q, qi) => { if (qi !== pi) { n += q.res[r]; q.res[r] = 0; } }); this.gain(pi, r, n);
      this.log(`${this.name(pi)} claimed every ${CAT.NAME[r]} — ${n} card${n === 1 ? '' : 's'}`);
    }
    this.checkWin(pi); this.up();
  }
  updateArmy() {
    const st = this.st, cur = st.army >= 0 ? this.P(st.army).knights : 2;
    st.players.forEach((p, i) => { if (p.knights >= 3 && p.knights > cur && i !== st.army) { st.army = i; this.log(`${p.name} takes the Largest Army ⚔️`); } });
  }
  updateRoad() {
    const st = this.st, lens = st.players.map((_, i) => CAT.R.longestRoad(st, i));
    st.players.forEach((p, i) => { p.roadLen = lens[i]; });
    const holder = st.road, hl = holder >= 0 ? lens[holder] : 4;
    let best = holder, bl = holder >= 0 && hl >= 5 ? hl : 4;
    lens.forEach((l, i) => { if (l > bl) { best = i; bl = l; } });
    if (holder >= 0 && hl < 5) { const top = Math.max(...lens); const leaders = lens.map((l, i) => l === top && top >= 5 ? i : -1).filter(i => i >= 0); best = leaders.length === 1 ? leaders[0] : -1; }
    if (best !== st.road) { st.road = best; if (best >= 0) this.log(`${this.name(best)} takes the Longest Road 🛣️`); }
  }
  checkWin(pi) {
    const st = this.st;
    if (!st.over && CAT.R.vp(st, pi) >= 10) {
      st.over = true; st.winner = pi; st.phase = 'over';
      this.log(`${this.name(pi)} wins with ${CAT.R.vp(st, pi)} points!`);
      this.io.fx('winner', pi);
    }
  }

  // one action by the current player during their turn
  async action(pi, a) {
    const st = this.st, p = this.P(pi), R = CAT.R;
    if (!a || !st.rolled) return;
    if (a.type === 'road' && R.canPay(p, CAT.COST.road) && R.count(st, pi, 'road') < CAT.LIMIT.road && R.roadSpots(st, pi).includes(a.e)) {
      this.pay(pi, CAT.COST.road); st.edge[a.e] = pi; st.last = { e: a.e }; this.log(`${p.name} built a road`); this.io.fx('build', pi); this.updateRoad();
    } else if (a.type === 'settlement' && R.canPay(p, CAT.COST.settlement) && R.count(st, pi, 'settlement') < CAT.LIMIT.settlement && R.settlementSpots(st, pi).includes(a.v)) {
      this.pay(pi, CAT.COST.settlement); st.vert[a.v] = { o: pi, city: false }; st.last = { v: a.v }; this.log(`${p.name} built a settlement`); this.io.fx('build', pi); this.updateRoad();
    } else if (a.type === 'city' && R.canPay(p, CAT.COST.city) && R.count(st, pi, 'city') < CAT.LIMIT.city && R.citySpots(st, pi).includes(a.v)) {
      this.pay(pi, CAT.COST.city); st.vert[a.v].city = true; st.last = { v: a.v }; this.log(`${p.name} upgraded to a city`); this.io.fx('build', pi);
    } else if (a.type === 'dev' && R.canPay(p, CAT.COST.dev) && st.deck.length) {
      this.pay(pi, CAT.COST.dev); const t = st.deck.pop(); p.dev.push({ t, new: true }); this.log(`${p.name} bought a development card`); this.io.fx('card', pi);
    } else if (a.type === 'play' && this.canPlay(pi, a.card)) {
      await this.playDev(pi, a); return;
    } else if (a.type === 'bank' && CAT.RES.includes(a.give) && CAT.RES.includes(a.get) && a.give !== a.get) {
      const ratio = R.ratios(st, pi)[a.give];
      if (p.res[a.give] >= ratio) { p.res[a.give] -= ratio; this.gain(pi, a.get); this.log(`${p.name} traded ${ratio}${CAT.ICON[a.give]} for 1${CAT.ICON[a.get]}`); this.io.fx('trade'); }
    } else if (a.type === 'offer') {
      await this.offer(pi, a.give, a.want); return;
    } else return;
    this.checkWin(pi); this.up();
  }

  // offer cards to the other players; they answer at the same time; the offerer picks a partner
  async offer(pi, give, want) {
    const st = this.st, p = this.P(pi), clean = o => Object.fromEntries(CAT.RES.map(r => [r, Math.max(0, Math.min(19, Math.round(+((o || {})[r]) || 0)))]).filter(([, n]) => n));
    give = clean(give); want = clean(want);
    if (!Object.keys(give).length || !Object.keys(want).length || !CAT.R.canPay(p, give)) return;
    st.offer = { from: pi, give, want, answers: {} };
    this.log(`${p.name} offers ${Object.entries(give).map(([r, n]) => n + CAT.ICON[r]).join(' ')} for ${Object.entries(want).map(([r, n]) => n + CAT.ICON[r]).join(' ')}`);
    st.phase = 'offer'; this.up();
    const others = st.players.map((_, i) => i).filter(i => i !== pi);
    await Promise.all(others.map(async i => {
      const a = CAT.R.canPay(this.P(i), want) ? await this.ask(i, 'respond', { from: pi, give, want }) : { accept: false };
      st.offer.answers[i] = !!(a && a.accept && CAT.R.canPay(this.P(i), want)); this.up();
    }));
    const yes = others.filter(i => st.offer.answers[i]);
    let partner = -1;
    if (yes.length) {
      if (p.kind === 'cpu') partner = yes[0];
      else { st.phase = 'pick'; this.up(); const a = await this.ask(pi, 'pick', { yes }); if (a && yes.includes(a.p)) partner = a.p; }
    }
    if (partner >= 0 && CAT.R.canPay(p, give) && CAT.R.canPay(this.P(partner), want)) {
      this.pay(pi, give); this.pay(partner, want);
      Object.entries(want).forEach(([r, n]) => this.gain(pi, r, n)); Object.entries(give).forEach(([r, n]) => this.gain(partner, r, n));
      this.log(`${p.name} traded with ${this.name(partner)}`); this.io.fx('trade');
    } else this.log(yes.length ? `${p.name} cancelled the trade` : 'Nobody accepted the trade');
    st.offer = null; st.phase = 'main'; this.up();
  }

  /* ---------------- computer players (also used when a person's time runs out) ---------------- */
  vScore(v, pi) {
    const st = this.st, hexes = CAT.V[v].hexes.filter(h => h !== st.robber);
    const res = new Set(hexes.map(h => st.tiles[h].t).filter(t => t !== 'desert'));
    let s = hexes.reduce((t, h) => t + (CAT.PIPS[st.tiles[h].n] || 0), 0) + res.size * 1.5;
    const mine = new Set(Object.keys(st.vert).filter(x => st.vert[x].o === pi).flatMap(x => CAT.V[x].hexes.map(h => st.tiles[h].t)));
    res.forEach(r => { if (!mine.has(r)) s += 1.2; });
    if (res.has('brick') || res.has('wood')) s += 0.6;
    st.ports.forEach(pt => { const e = CAT.E[pt.e]; if (e.a === v || e.b === v) s += pt.type === 'any' ? 1 : res.has(pt.type) ? 2 : 0.5; });
    return s;
  }
  bestRoad(pi, spots) {
    const st = this.st, R = CAT.R;
    let best = spots[0], bs = -1;
    for (const e of spots) {
      const far = [CAT.E[e].a, CAT.E[e].b].filter(v => !R.touchesOwnRoad(st, pi, v) || R.ownerAt(st, v) === -1);
      let s = 0;
      for (const v of far) {
        if (R.distanceOk(st, v)) s = Math.max(s, this.vScore(v, pi) + 3);
        CAT.V[v].adj.forEach(w => { if (R.distanceOk(st, w)) s = Math.max(s, this.vScore(w, pi) * 0.75); });
      }
      s += Math.random();
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }
  neediest(pi) {
    const p = this.P(pi), st = this.st, R = CAT.R;
    const target = R.citySpots(st, pi).length ? CAT.COST.city : CAT.COST.settlement;
    let best = 'wheat', gap = -1;
    CAT.RES.forEach(r => { const g = (target[r] || 0) - p.res[r]; if (g > gap) { gap = g; best = r; } });
    return gap > 0 ? best : CAT.RES.reduce((a, b) => (p.res[a] <= p.res[b] ? a : b));
  }
  auto(pi, phase, data = {}) {
    const st = this.st, R = CAT.R, p = this.P(pi);
    switch (phase) {
      case 'setup-s': {
        const spots = R.settlementSpots(st, pi, true);
        return { v: spots.reduce((a, b) => (this.vScore(b, pi) + Math.random() * 0.5 > this.vScore(a, pi) ? b : a)) };
      }
      case 'setup-r': return { e: this.bestRoad(pi, R.roadSpots(st, pi, data.v)) };
      case 'free-road': { const s = R.roadSpots(st, pi); return { e: s.length ? this.bestRoad(pi, s) : -1 }; }
      case 'pre': {
        const threatened = CAT.HEX[st.robber].v.some(v => R.ownerAt(st, v) === pi);
        if (this.canPlay(pi, 'knight') && (threatened || (p.knights >= 2 && st.army !== pi && Math.random() < 0.5))) return { type: 'play', card: 'knight' };
        return { type: 'roll' };
      }
      case 'robber': {
        let best = -1, bs = -1e9;
        st.tiles.forEach((t, h) => {
          if (h === st.robber) return;
          let s = Math.random() * 0.5;
          CAT.HEX[h].v.forEach(v => { const b = st.vert[v]; if (!b) return; const w = (b.city ? 2 : 1) * (CAT.PIPS[t.n] || 0); s += b.o === pi ? -3 * w : w * (1 + R.publicVP(st, b.o) / 5); });
          if (s > bs) { bs = s; best = h; }
        });
        return { h: best };
      }
      case 'steal': return { p: data.victims.reduce((a, b) => (R.publicVP(st, b) * 2 + R.hand(this.P(b)) > R.publicVP(st, a) * 2 + R.hand(this.P(a)) ? b : a)) };
      case 'discard': {
        const cards = {}, h = { ...p.res };
        for (let k = 0; k < data.n; k++) { const r = CAT.RES.reduce((a, b) => (h[a] >= h[b] ? a : b)); h[r]--; cards[r] = (cards[r] || 0) + 1; }
        return { cards };
      }
      case 'respond': {
        if (R.vp(st, data.from) >= 8) return { accept: false };
        const need = this.neediest(pi), gets = Object.keys(data.give), gives = Object.entries(data.want);
        const fair = Object.values(data.give).reduce((a, b) => a + b, 0) >= Object.values(data.want).reduce((a, b) => a + b, 0);
        const spare = gives.every(([r, n]) => p.res[r] - n >= 1 && r !== need);
        return { accept: fair && spare && (gets.includes(need) || Math.random() < 0.25) };
      }
      case 'pick': return { p: data.yes[0] };
      case 'main': return { type: 'end' };
      default: return null;
    }
  }
  async cpuMain(pi) {
    const st = this.st, R = CAT.R, p = this.P(pi);
    let offered = false;
    for (let guard = 0; guard < 14 && !st.over; guard++) {
      await this.sleep(420);
      // development cards
      if (this.canPlay(pi, 'roads') && R.count(st, pi, 'road') < 14 && !R.settlementSpots(st, pi).length) { await this.playDev(pi, { card: 'roads' }); continue; }
      if (this.canPlay(pi, 'plenty')) { await this.playDev(pi, { card: 'plenty', res: [this.neediest(pi), this.neediest(pi)] }); continue; }
      if (this.canPlay(pi, 'mono')) {
        const r = CAT.RES.reduce((a, b) => (st.players.reduce((t, q, i) => t + (i !== pi ? q.res[b] : 0), 0) > st.players.reduce((t, q, i) => t + (i !== pi ? q.res[a] : 0), 0) ? b : a));
        if (st.players.reduce((t, q, i) => t + (i !== pi ? q.res[r] : 0), 0) >= 3) { await this.playDev(pi, { card: 'mono', res: r }); continue; }
      }
      // build, best first
      const cities = R.citySpots(st, pi), spots = R.settlementSpots(st, pi);
      if (cities.length && R.canPay(p, CAT.COST.city) && R.count(st, pi, 'city') < 4) { await this.action(pi, { type: 'city', v: cities.reduce((a, b) => (R.pipsAt(st, b) > R.pipsAt(st, a) ? b : a)) }); continue; }
      if (spots.length && R.canPay(p, CAT.COST.settlement) && R.count(st, pi, 'settlement') < 5) { await this.action(pi, { type: 'settlement', v: spots.reduce((a, b) => (this.vScore(b, pi) > this.vScore(a, pi) ? b : a)) }); continue; }
      const roads = R.roadSpots(st, pi);
      if (!spots.length && roads.length && R.canPay(p, CAT.COST.road) && R.count(st, pi, 'road') < 15) { await this.action(pi, { type: 'road', e: this.bestRoad(pi, roads) }); continue; }
      if (R.canPay(p, CAT.COST.dev) && st.deck.length && (R.hand(p) >= 5 || !cities.length)) { await this.action(pi, { type: 'dev' }); continue; }
      // trade toward the next build
      const target = cities.length ? CAT.COST.city : spots.length ? CAT.COST.settlement : CAT.COST.road;
      const missing = CAT.RES.filter(r => (target[r] || 0) > p.res[r]);
      if (missing.length === 1) {
        const ratios = R.ratios(st, pi);
        const spare = CAT.RES.find(r => !target[r] && p.res[r] >= ratios[r]) || CAT.RES.find(r => p.res[r] - (target[r] || 0) >= ratios[r]);
        if (spare) { await this.action(pi, { type: 'bank', give: spare, get: missing[0] }); continue; }
        const extra = CAT.RES.find(r => p.res[r] - (target[r] || 0) >= 1 && r !== missing[0]);
        if (extra && !offered) { offered = true; await this.offer(pi, { [extra]: 1 }, { [missing[0]]: 1 }); continue; }
      }
      if (R.hand(p) > 7) {   // avoid losing half to a 7
        const ratios = R.ratios(st, pi), spare = CAT.RES.find(r => p.res[r] >= ratios[r] + 1);
        if (spare) { await this.action(pi, { type: 'bank', give: spare, get: this.neediest(pi) }); continue; }
      }
      break;
    }
  }
  // a person left: a computer takes over
  forfeit(pi) { const p = this.P(pi); if (p && p.kind === 'human') { p.kind = 'cpu'; p.name += ' 🤖'; this.up(); } }
  // what one player is allowed to see (opponents' hands are hidden)
  static viewFor(st, me) {
    if (st.over) return { ...st, deck: st.deck.length };   // game over: reveal everything (hidden victory point cards count)
    return {
      ...st, deck: st.deck.length,
      players: st.players.map((p, i) => i === me ? p : { ...p, res: null, cards: CAT.R.hand(p), dev: null, devCount: p.dev.length }),
    };
  }
}
CatanGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View                                                                                   */
/* ======================================================================================= */
const CatanView = (() => {
  const { RES, ICON, NAME, COST, DEV, HEX, V, E, S, R, PIPS } = CAT;
  const esc = s => UI.esc(s);
  const TERRAIN = { wood: ['#2f7d32', '#1b5e20'], brick: ['#c0622d', '#8d3f17'], sheep: ['#9ccc65', '#689f38'], wheat: ['#f2c94c', '#c99a1a'], ore: ['#8e9aaf', '#5d6778'], desert: ['#e6cf9c', '#c9ae74'] };
  const hexPts = h => [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i - 30) * Math.PI / 180; return `${(h.x + S * 0.97 * Math.cos(a)).toFixed(2)},${(h.y + S * 0.97 * Math.sin(a)).toFixed(2)}`; }).join(' ');
  const housePath = (x, y, s) => `M${x - s} ${y + s * 0.8}V${y - s * 0.1}L${x} ${y - s}L${x + s} ${y - s * 0.1}V${y + s * 0.8}Z`;
  const cityPath = (x, y, s) => `M${x - s * 1.25} ${y + s * 0.8}V${y - s * 0.2}H${x - s * 0.2}V${y - s * 0.75}L${x + s * 0.5} ${y - s * 1.3}L${x + s * 1.2} ${y - s * 0.75}V${y + s * 0.8}Z`;

  function board(st, opts) {
    const targets = opts.targets || {};
    let svg = '';
    // sea and harbours
    st.ports.forEach(pt => {
      const e = E[pt.e], a = V[e.a], b = V[e.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(mx, my), px = mx + mx / d * 6, py = my + my / d * 6;
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${px}" y2="${py}" class="pier"/><line x1="${b.x}" y1="${b.y}" x2="${px}" y2="${py}" class="pier"/>
        <g class="port"><circle cx="${px}" cy="${py}" r="3.6"/><text x="${px}" y="${py - 0.3}" class="pt">${pt.type === 'any' ? '?' : ICON[pt.type]}</text><text x="${px}" y="${py + 2.1}" class="pr">${pt.type === 'any' ? '3:1' : '2:1'}</text></g>`;
    });
    // tiles
    st.tiles.forEach((t, h) => {
      const H = HEX[h], [c1, c2] = TERRAIN[t.t], target = targets.hex && targets.hex.includes(h);
      svg += `<g class="tile${target ? ' target' : ''}${st.prod && st.prod.n === t.n && h !== st.robber ? ' hot' : ''}" data-h="${h}">
        <polygon points="${hexPts(H)}" fill="url(#g-${t.t})" stroke="#f3e2b5" stroke-width=".6"/>
        <text x="${H.x}" y="${H.y - 4.2}" class="ticon">${ICON[t.t]}</text>
        ${t.n ? `<circle cx="${H.x}" cy="${H.y + 1.6}" r="3.3" class="numtok"/><text x="${H.x}" y="${H.y + 2.5}" class="tnum${t.n === 6 || t.n === 8 ? ' red' : ''}">${t.n}</text>
          <text x="${H.x}" y="${H.y + 4.1}" class="tpips${t.n === 6 || t.n === 8 ? ' red' : ''}">${'•'.repeat(PIPS[t.n])}</text>` : ''}
        ${h === st.robber ? `<g class="robber"><ellipse cx="${H.x - 5}" cy="${H.y + 4.6}" rx="2.3" ry=".8" class="rshadow"/><path d="M${H.x - 7} ${H.y + 4.4}Q${H.x - 5} ${H.y - 2.2} ${H.x - 3} ${H.y + 4.4}Z"/><circle cx="${H.x - 5}" cy="${H.y - 1.4}" r="1.5"/></g>` : ''}
      </g>`;
    });
    // roads
    Object.entries(st.edge).forEach(([e, o]) => {
      const { a, b } = E[e], A = V[a], B = V[b], fx = (B.x - A.x) * 0.16, fy = (B.y - A.y) * 0.16;
      svg += `<line x1="${A.x + fx}" y1="${A.y + fy}" x2="${B.x - fx}" y2="${B.y - fy}" class="road${st.last && st.last.e === +e ? ' fresh' : ''}" style="--pc:${st.players[o].color}"/>`;
    });
    (targets.edge || []).forEach(e => {
      const { a, b } = E[e], A = V[a], B = V[b];
      svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="etarget" data-e="${e}"/><circle cx="${(A.x + B.x) / 2}" cy="${(A.y + B.y) / 2}" r="1.6" class="edot" data-e="${e}"/>`;
    });
    // buildings
    Object.entries(st.vert).forEach(([v, b]) => {
      const P = V[v], c = st.players[b.o].color;
      svg += `<path d="${b.city ? cityPath(P.x, P.y, 2.2) : housePath(P.x, P.y, 1.9)}" class="bld${st.last && st.last.v === +v ? ' fresh' : ''}" style="--pc:${c}"${(targets.vert || []).includes(+v) ? ` data-v="${v}"` : ''}/>`;
    });
    (targets.vert || []).forEach(v => { const P = V[v]; svg += `<circle cx="${P.x}" cy="${P.y}" r="2.3" class="vtarget" data-v="${v}"/>`; });
    const defs = Object.entries(TERRAIN).map(([k, [a, b]]) => `<radialGradient id="g-${k}" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join('');
    return `<svg class="cat-svg" viewBox="-54 -50 108 100" aria-label="Island board"><defs>${defs}</defs>
      <path class="sea" d="M-30 -48 L30 -48 L54 0 L30 48 L-30 48 L-54 0 Z"/>${svg}</svg>`;
  }

  const costHTML = c => Object.entries(c).map(([r, n]) => `<i>${ICON[r].repeat(n)}</i>`).join('');
  function handHTML(p) {
    return `<div class="cat-hand">${RES.map(r => `<span class="rc r-${r}${p.res[r] ? '' : ' zero'}"><b>${ICON[r]}</b><em>${p.res[r]}</em></span>`).join('')}</div>`;
  }
  function playersHTML(st, me) {
    return st.players.map((p, i) => {
      const vp = i === me ? R.vp(st, i) : R.publicVP(st, i), cards = p.res ? R.hand(p) : p.cards, dev = p.dev ? p.dev.length : p.devCount;
      return `<div class="cp${i === st.turn && !st.over ? ' active' : ''}${i === me ? ' me' : ''}" style="--pc:${p.color}">
        <span class="cp-dot"></span><b>${esc(p.name)}</b>
        <span class="cp-vp">${vp}<small>VP</small></span>
        <span class="cp-meta">${cards} card${cards === 1 ? '' : 's'} · ${dev} dev · ⚔️${p.knights}${st.army === i ? ' <i title="Largest Army">🛡️</i>' : ''}${st.road === i ? ' <i title="Longest Road">🛣️</i>' : ''}</span></div>`;
    }).join('');
  }

  // opts: { me, prompt: {phase, data} | null, mode, trade, timer, local }
  function dock(st, opts) {
    const me = opts.me, p = st.players[me], pr = opts.prompt, cur = st.players[st.turn];
    if (st.over) {
      const order = st.players.map((q, i) => ({ q, vp: R.vp(st, i) })).sort((a, b) => b.vp - a.vp);
      return `<div class="dock cat-dock"><h3 class="cat-win">🏆 ${esc(st.players[st.winner].name)} wins!</h3>
        ${order.map(o => `<div class="cp" style="--pc:${o.q.color}"><span class="cp-dot"></span><b>${esc(o.q.name)}</b><span class="cp-vp">${o.vp}<small>VP</small></span></div>`).join('')}
        ${opts.local ? '<div class="act-row"><button class="b b-ghost" data-k="menu">Setup</button><button class="b b-raise" data-k="again">Play again</button></div>' : ''}</div>`;
    }
    if (me < 0 || !p || !p.res) return `<div class="dock cat-dock"><div class="cat-msg">${esc(st.msg)}</div></div>`;
    const hand = handHTML(p);
    const devs = p.dev.length ? `<div class="cat-devs">${p.dev.map(d => `<span class="dv${d.new ? ' new' : ''}">${{ knight: '⚔️', vp: '⭐', roads: '🛣️', plenty: '🎁', mono: '💰' }[d.t]} ${DEV[d.t]}</span>`).join('')}</div>` : '';
    const msg = `<div class="cat-msg">${esc(st.msg)}${opts.timer || ''}</div>`;
    if (!pr) return `<div class="dock cat-dock">${msg}${hand}${devs}<div class="cat-wait">${st.over ? '' : `${esc(cur.name)} is playing…`}</div></div>`;
    const ph = pr.phase;
    let body = '';
    if (ph === 'setup-s') body = `<div class="cat-ask">Tap a glowing spot to place your ${pr.data.second ? 'second ' : ''}settlement${pr.data.second ? ' — it collects starting resources' : ''}</div>`;
    else if (ph === 'setup-r' || ph === 'free-road') body = `<div class="cat-ask">Tap a glowing side to place a ${ph === 'free-road' ? 'free ' : ''}road</div>`;
    else if (ph === 'robber') body = '<div class="cat-ask">Move the robber: tap a tile</div>';
    else if (ph === 'steal') body = `<div class="cat-ask">Steal a card from:</div><div class="act-row">${pr.data.victims.map(v => `<button class="b b-ghost" data-k="steal" data-p="${v}">${esc(st.players[v].name)}</button>`).join('')}</div>`;
    else if (ph === 'discard') {
      const sel = opts.discard || {}, n = pr.data.n, chosen = RES.reduce((t, r) => t + (sel[r] || 0), 0);
      body = `<div class="cat-ask">Robber! Discard ${n} card${n > 1 ? 's' : ''} (${chosen}/${n})</div>
        <div class="cat-pick">${RES.map(r => `<div class="pk"><button data-k="dis" data-r="${r}" data-d="-1" ${!sel[r] ? 'disabled' : ''}>−</button><span>${ICON[r]} ${sel[r] || 0}/${p.res[r]}</span><button data-k="dis" data-r="${r}" data-d="1" ${(sel[r] || 0) >= p.res[r] || chosen >= n ? 'disabled' : ''}>+</button></div>`).join('')}</div>
        <button class="b b-fold big" data-k="discard" ${chosen === n ? '' : 'disabled'}>Discard</button>`;
    } else if (ph === 'respond') {
      const d = pr.data, fmtc = o => Object.entries(o).map(([r, k]) => `${k}${ICON[r]}`).join(' ');
      body = `<div class="cat-offer"><b>${esc(st.players[d.from].name)}</b> offers <span>${fmtc(d.give)}</span> for your <span>${fmtc(d.want)}</span></div>
        <div class="act-row"><button class="b b-ghost" data-k="respond" data-a="0">Decline</button><button class="b b-call" data-k="respond" data-a="1">Accept</button></div>`;
    } else if (ph === 'pick') body = `<div class="cat-ask">Accepted by:</div><div class="act-row">${pr.data.yes.map(v => `<button class="b b-call" data-k="pick" data-p="${v}">Trade with ${esc(st.players[v].name)}</button>`).join('')}<button class="b b-ghost" data-k="pick" data-p="-1">Cancel</button></div>`;
    else if (ph === 'pre') body = `<div class="act-row"><button class="b b-raise pulse big" data-k="roll">🎲 Roll dice</button>${p.dev.some(d => d.t === 'knight' && !d.new) && !st.devPlayed ? '<button class="b b-ghost" data-k="play" data-c="knight">⚔️ Knight</button>' : ''}</div>`;
    else if (ph === 'main') {
      if (opts.mode) body = `<div class="cat-ask">Tap a glowing ${opts.mode === 'road' ? 'side' : 'spot'} to build your ${opts.mode}</div><button class="b b-ghost" data-k="cancel">Cancel</button>`;
      else if (opts.trade) body = tradeHTML(st, me, p, opts.trade);
      else if (opts.pickRes) body = `<div class="cat-ask">${opts.pickRes.card === 'mono' ? 'Monopoly: take every card of' : `Year of Plenty: pick ${2 - opts.pickRes.res.length} more`}</div>
        <div class="cat-res">${RES.map(r => `<button data-k="pickres" data-r="${r}">${ICON[r]}<small>${NAME[r]}</small></button>`).join('')}</div><button class="b b-ghost" data-k="cancel">Cancel</button>`;
      else {
        const can = k => R.canPay(p, COST[k]);
        const playable = [...new Set(p.dev.filter(d => !d.new && d.t !== 'vp').map(d => d.t))].filter(() => !st.devPlayed);
        body = `<div class="cat-build">
          <button data-k="mode" data-m="road" ${can('road') && R.roadSpots(st, me).length ? '' : 'disabled'}><b>Road</b>${costHTML(COST.road)}</button>
          <button data-k="mode" data-m="settlement" ${can('settlement') && R.settlementSpots(st, me).length ? '' : 'disabled'}><b>Settlement</b>${costHTML(COST.settlement)}</button>
          <button data-k="mode" data-m="city" ${can('city') && R.citySpots(st, me).length ? '' : 'disabled'}><b>City</b>${costHTML(COST.city)}</button>
          <button data-k="dev" ${can('dev') && (typeof st.deck === 'number' ? st.deck : st.deck.length) > 0 ? '' : 'disabled'}><b>Dev card</b>${costHTML(COST.dev)}</button></div>
          ${playable.length ? `<div class="act-row">${playable.map(t => `<button class="b b-ghost" data-k="play" data-c="${t}">Play ${DEV[t]}</button>`).join('')}</div>` : ''}
          <div class="act-row"><button class="b b-ghost" data-k="trade">⇄ Trade</button><button class="b b-raise" data-k="end">End turn</button></div>`;
      }
    }
    return `<div class="dock cat-dock">${msg}${hand}${devs}${body}</div>`;
  }
  function tradeHTML(st, me, p, t) {
    const ratios = R.ratios(st, me);
    if (t.tab === 'bank') {
      return `<div class="seg mini cat-tabs"><button class="on">Bank / harbour</button><button data-k="ttab" data-t="players">Players</button></div>
        <div class="cat-ask">Give</div><div class="cat-res">${RES.map(r => `<button data-k="tgive" data-r="${r}" class="${t.give === r ? 'on' : ''}" ${p.res[r] >= ratios[r] ? '' : 'disabled'}>${ICON[r]}<small>${ratios[r]}:1</small></button>`).join('')}</div>
        <div class="cat-ask">Get</div><div class="cat-res">${RES.map(r => `<button data-k="tget" data-r="${r}" class="${t.get === r ? 'on' : ''}" ${r === t.give ? 'disabled' : ''}>${ICON[r]}<small>${NAME[r]}</small></button>`).join('')}</div>
        <div class="act-row"><button class="b b-ghost" data-k="cancel">Close</button><button class="b b-call" data-k="dobank" ${t.give && t.get ? '' : 'disabled'}>Trade ${t.give ? ratios[t.give] + ICON[t.give] : ''} → ${t.get ? '1' + ICON[t.get] : ''}</button></div>`;
    }
    const row = (side, r) => `<div class="pk"><button data-k="tstep" data-s="${side}" data-r="${r}" data-d="-1" ${!(t[side][r]) ? 'disabled' : ''}>−</button><span>${ICON[r]} ${t[side][r] || 0}</span><button data-k="tstep" data-s="${side}" data-r="${r}" data-d="1" ${side === 'give' && (t.give[r] || 0) >= p.res[r] ? 'disabled' : ''}>+</button></div>`;
    const ok = RES.some(r => t.give[r]) && RES.some(r => t.want[r]);
    return `<div class="seg mini cat-tabs"><button data-k="ttab" data-t="bank">Bank / harbour</button><button class="on">Players</button></div>
      <div class="cat-ask">You give</div><div class="cat-pick">${RES.map(r => row('give', r)).join('')}</div>
      <div class="cat-ask">You want</div><div class="cat-pick">${RES.map(r => row('want', r)).join('')}</div>
      <div class="act-row"><button class="b b-ghost" data-k="cancel">Close</button><button class="b b-call" data-k="offer" ${ok ? '' : 'disabled'}>Offer to everyone</button></div>`;
  }
  // which board spots are tappable for this player right now
  function targets(st, opts) {
    const me = opts.me, pr = opts.prompt;
    if (!pr || me < 0) return {};
    if (pr.phase === 'setup-s') return { vert: R.settlementSpots(st, me, true) };
    if (pr.phase === 'setup-r') return { edge: R.roadSpots(st, me, pr.data.v) };
    if (pr.phase === 'free-road') return { edge: R.roadSpots(st, me) };
    if (pr.phase === 'robber') return { hex: st.tiles.map((_, h) => h).filter(h => h !== st.robber) };
    if (pr.phase === 'main' && opts.mode === 'road') return { edge: R.roadSpots(st, me) };
    if (pr.phase === 'main' && opts.mode === 'settlement') return { vert: R.settlementSpots(st, me) };
    if (pr.phase === 'main' && opts.mode === 'city') return { vert: R.citySpots(st, me) };
    return {};
  }
  function html(st, opts) {
    const dice = opts.rollingFace && st.rolling ? opts.rollingFace : st.dice;
    return `<div class="cat">
      <div class="cat-players">${playersHTML(st, opts.me)}</div>
      <div class="cat-board">${board(st, { targets: targets(st, opts) })}
        <div class="cat-dice${st.rolling ? ' rolling' : ''}">${dice.map(n => `<span class="ludo-die small" data-n="${n}">${'<i></i>'.repeat(n)}</span>`).join('')}</div></div>
      ${dock(st, opts)}
      ${opts.footer || ''}
    </div>`;
  }
  return { html };
})();

/* ======================================================================================= */
/*  Shared input handling for the dock (used by the single-phone screen and online play)   */
/* ======================================================================================= */
// ui: { mode, trade, discard, pickRes } local UI state; answer(action) sends the reply to the current prompt
function catanClick(b, st, me, prompt, ui, answer) {
  const k = b.dataset.k, ph = prompt && prompt.phase;
  if (b.dataset.v !== undefined && ph) {
    const v = +b.dataset.v;
    if (ph === 'setup-s') return answer({ v });
    if (ph === 'main' && (ui.mode === 'settlement' || ui.mode === 'city')) { const m = ui.mode; ui.mode = null; return answer({ type: m, v }); }
  }
  if (b.dataset.e !== undefined && ph) {
    const e = +b.dataset.e;
    if (ph === 'setup-r' || ph === 'free-road') return answer({ e });
    if (ph === 'main' && ui.mode === 'road') { ui.mode = null; return answer({ type: 'road', e }); }
  }
  if (b.dataset.h !== undefined && ph === 'robber') return answer({ h: +b.dataset.h });
  if (!k) return false;
  const p = st.players[me];
  switch (k) {
    case 'roll': return answer({ type: 'roll' });
    case 'end': ui.mode = ui.trade = ui.pickRes = null; return answer({ type: 'end' });
    case 'mode': ui.mode = b.dataset.m; ui.trade = null; return true;
    case 'cancel': ui.mode = ui.trade = ui.pickRes = null; return true;
    case 'dev': return answer({ type: 'dev' });
    case 'play': {
      const c = b.dataset.c;
      if (c === 'plenty' || c === 'mono') { ui.pickRes = { card: c, res: [] }; return true; }
      return answer({ type: 'play', card: c });
    }
    case 'pickres': {
      const pr = ui.pickRes; if (!pr) return true;
      if (pr.card === 'mono') { ui.pickRes = null; return answer({ type: 'play', card: 'mono', res: b.dataset.r }); }
      pr.res.push(b.dataset.r);
      if (pr.res.length === 2) { ui.pickRes = null; return answer({ type: 'play', card: 'plenty', res: pr.res }); }
      return true;
    }
    case 'trade': ui.trade = { tab: 'bank', give: null, get: null }; ui.mode = null; return true;
    case 'ttab': ui.trade = b.dataset.t === 'bank' ? { tab: 'bank', give: null, get: null } : { tab: 'players', give: {}, want: {} }; return true;
    case 'tgive': ui.trade.give = b.dataset.r; if (ui.trade.get === b.dataset.r) ui.trade.get = null; return true;
    case 'tget': ui.trade.get = b.dataset.r; return true;
    case 'dobank': { const t = ui.trade; ui.trade = { tab: 'bank', give: null, get: null }; return answer({ type: 'bank', give: t.give, get: t.get }); }
    case 'tstep': { const s = ui.trade[b.dataset.s], r = b.dataset.r; s[r] = Math.max(0, (s[r] || 0) + +b.dataset.d); return true; }
    case 'offer': { const t = ui.trade; ui.trade = null; return answer({ type: 'offer', give: t.give, want: t.want }); }
    case 'steal': return answer({ p: +b.dataset.p });
    case 'respond': return answer({ accept: b.dataset.a === '1' });
    case 'pick': return answer({ p: +b.dataset.p });
    case 'dis': { ui.discard = ui.discard || {}; const r = b.dataset.r; ui.discard[r] = Math.max(0, Math.min(p.res[r], (ui.discard[r] || 0) + +b.dataset.d)); return true; }
    case 'discard': { const cards = ui.discard || {}; ui.discard = null; return answer({ cards }); }
  }
  return false;
}

/* ======================================================================================= */
/*  Single-phone screen                                                                    */
/* ======================================================================================= */
const Catan = (() => {
  const KEY = 'cardroom.catan';
  const CPU = ['Raju', 'Meena', 'Arjun'];
  let el = null, game = null, waiter = null, ui = {}, rollFace = [1, 1], rollTimer = null;
  let setup = load('setup') || { cpus: 3 };
  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }
  const io = {
    update() { save(); render(); },
    decide(pi, phase, data) { return new Promise(r => { waiter = { r, phase, data }; ui.mode = null; if (phase === 'discard') ui.discard = {}; render(); if (phase === 'pre' || phase === 'setup-s') { navigator.vibrate?.(80); Sfx.turn(); } }); },
    fx(name, pi, extra) { catanFx(name, pi === 0, extra); },
  };
  function render() {
    if (!el || !game) return;
    clearInterval(rollTimer);
    if (game.st.rolling) rollTimer = setInterval(() => { rollFace = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; draw(); }, 80);
    draw();
  }
  function draw() {
    if (!el || !game) return;
    el.innerHTML = CatanView.html(game.st, { me: 0, prompt: waiter && { phase: waiter.phase, data: waiter.data }, ...ui, local: true, rollingFace: rollFace,
      footer: game.st.over ? '' : '<button class="b b-ghost wide small-b2" data-k="menu">Setup / quit</button>' });
  }
  function renderSetup() {
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🏝️</div>
      <h2 class="wordmark small">Settlers</h2>
      <p class="tagline">Catan-style island trading game</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Settlers</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts"><label>Computer players <span class="stepper"><button data-s="-1" ${setup.cpus <= 1 ? 'disabled' : ''}>−</button><b>${setup.cpus}</b><button data-s="1" ${setup.cpus >= 3 ? 'disabled' : ''}>+</button></span></label></div>
      <p class="hint small">Build roads, settlements and cities on a random island. Roll for resources, trade with the bank, harbours and other players, buy development cards, and race to 10 victory points. Longest Road and Largest Army are worth 2 points each.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-k="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-k="start">Start game</button>
    </div>`;
  }
  function start(st) {
    game?.stop(); waiter = null; ui = {};
    game = st ? CatanGame.restore(st, io) : new CatanGame({ players: [{ name: 'You', kind: 'human' }, ...CPU.slice(0, setup.cpus).map(n => ({ name: n + ' 🤖', kind: 'cpu' }))] }, io);
    save(); render(); game.run();
  }
  function onClick(e) {
    const b = e.target.closest('button, [data-v], [data-e], [data-h]'); if (!b) return;
    if (!game) {
      if (b.dataset.s) { setup.cpus = Math.min(3, Math.max(1, setup.cpus + +b.dataset.s)); save(); return renderSetup(); }
      if (b.dataset.k === 'start') return start();
      if (b.dataset.k === 'resume') return start(load('game'));
      return;
    }
    if (b.dataset.k === 'menu') { const go = () => { game.stop(); save(); game = null; waiter = null; renderSetup(); }; if (!game.st.over) UI.ask('Leave this game? It is saved — you can resume it later.', 'Leave').then(ok => ok && go()); else go(); return; }
    if (b.dataset.k === 'again') return start();
    const prompt = waiter && { phase: waiter.phase, data: waiter.data };
    const handled = catanClick(b, game.st, 0, prompt, ui, a => { const w = waiter; waiter = null; w && w.r(a); return true; });
    if (handled) draw();
  }
  function mount(container) { el = container; el.onclick = onClick; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); game = null; clearInterval(rollTimer); if (el) el.onclick = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();

// sounds & celebrations shared by both modes
function catanFx(name, mine, extra) {
  if (name === 'dice') Sfx.dice();
  else if (name === 'build') Sfx.hop();
  else if (name === 'produce') Sfx.chips();
  else if (name === 'card') Sfx.flip();
  else if (name === 'trade') Sfx.chip();
  else if (name === 'robber' || name === 'steal') Sfx.capture();
  else if (name === 'winner') { if (mine) UI.burst('You win!', 'big'); else Sfx.lose(); }
}
