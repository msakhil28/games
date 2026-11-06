// Indian Rummy — 13 cards, two decks plus printed jokers, points rummy.
//  Each turn: draw from the stock or the open discard pile, then discard one card.
//  Declare when all 13 cards are in valid melds: at least two sequences, one of them pure (no joker);
//  the rest may be sequences or sets (3–4 cards of one rank, different suits). Jokers: the 🃏 cards plus every
//  card of the "wild" rank picked at the start of the deal. Losers score their unmatched cards (max 80);
//  a wrong declaration costs 80; dropping costs 20 (before your first draw) or 40. Lowest total wins.
//   RUM        : cards, meld checking and the hand solver
//   RummyGame  : rules engine (no DOM) — runs on this phone, or on the room host for online play
//   RumView    : draws the table and your hand for any player
//   Rummy      : the single-phone screen (you against computer players)
const RUM = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function deck() {
    const d = []; let i = 0;
    for (let k = 0; k < 2; k++) for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ i: i++, r, s });
    d.push({ i: i++, r: 0, s: '' }, { i: i++, r: 0, s: '' });
    return d;
  }
  const pts = c => c.r === 0 ? 0 : (c.r === 1 || c.r >= 10) ? 10 : c.r;
  const joker = (c, w) => c.r === 0 || c.r === w;
  const pop = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const ctz = m => 31 - Math.clz32(m & -m);

  // can `nat` (natural cards of one suit) plus jokers form a run of length n?  Ace is low (A-2-3) or high (Q-K-A), never both
  function seqOK(nat, n) {
    const tryR = high => {
      const rs = nat.map(c => (c.r === 1 && high ? 14 : c.r)).sort((a, b) => a - b);
      for (let i = 1; i < rs.length; i++) if (rs[i] === rs[i - 1]) return false;
      const lo = rs[0], hi = rs[rs.length - 1];
      if (hi - lo + 1 > n) return false;
      return Math.max(1, hi - n + 1) <= Math.min(lo, 15 - n);
    };
    return tryR(false) || tryR(true);
  }
  // 'pure' (sequence without any joker) | 'seq' | 'set' | null
  function meldType(cs, w) {
    const n = cs.length; if (n < 3) return null;
    const nat = cs.filter(c => !joker(c, w)), jk = n - nat.length;
    if (!nat.length) return 'seq';
    if (n <= 14 && nat.every(c => c.s === nat[0].s) && seqOK(nat, n)) return jk ? 'seq' : 'pure';
    if (n <= 4 && nat.every(c => c.r === nat[0].r) && new Set(nat.map(c => c.s)).size === nat.length) return 'set';
    return null;
  }

  // Finds the best way to split a hand into melds. Cost = unmatched points, plus 200 for a missing pure
  // sequence and 200 for a missing second sequence — so a legal arrangement always beats an illegal one.
  class Hand {
    constructor(cards, wild) {
      this.cards = cards; this.w = wild; const n = this.n = cards.length;
      this.byLow = Array.from({ length: n }, () => []);
      for (let m = 7; m < (1 << n); m++) {
        const pc = pop(m); if (pc < 3 || pc > 5) continue;   // longer runs are just these joined together
        const cs = []; for (let i = 0; i < n; i++) if (m >> i & 1) cs.push(cards[i]);
        const t = meldType(cs, wild); if (t) this.byLow[ctz(m)].push({ m, t });
      }
    }
    // skip: index of a card to leave out (the one about to be discarded)
    solve(skip = -1) {
      const n = this.n, cards = this.cards, memo = new Map(), full = ((1 << n) - 1) & ~(skip >= 0 ? 1 << skip : 0);
      const next = (st, t) => { let pure = st & 1, seq = st >> 1; if (t === 'pure') { pure = 1; seq = Math.min(2, seq + 1); } else if (t === 'seq') seq = Math.min(2, seq + 1); return pure | (seq << 1); };
      const f = (mask, st) => {
        if (!mask) return ((st & 1) ? 0 : 200) + ((st >> 1) >= 2 ? 0 : 200);
        const key = mask * 8 + st, hit = memo.get(key); if (hit) return hit.c;
        const b = ctz(mask); let best = pts(cards[b]) + f(mask & ~(1 << b), st), ch = null;
        for (const o of this.byLow[b]) if ((o.m & mask) === o.m) { const c = f(mask & ~o.m, next(st, o.t)); if (c < best) { best = c; ch = o; } }
        memo.set(key, { c: best, ch }); return best;
      };
      const cost = f(full, 0);
      let mask = full, st = 0; const groups = [], rest = [];
      while (mask) {
        const e = memo.get(mask * 8 + st), b = ctz(mask);
        if (e.ch) { groups.push(cards.map((_, i) => i).filter(i => e.ch.m >> i & 1)); st = next(st, e.ch.t); mask &= ~e.ch.m; }
        else { rest.push(b); mask &= ~(1 << b); }
      }
      return { cost, groups, rest, ok: (st & 1) === 1 && (st >> 1) >= 2, dead: rest.reduce((s, i) => s + pts(cards[i]), 0) };
    }
  }
  // 14 cards: which one can be discarded to finish? (-1 = none)
  function declareCard(cards14, wild) { const h = new Hand(cards14, wild); for (let k = 0; k < cards14.length; k++) { const s = h.solve(k); if (s.ok && s.dead === 0) return k; } return -1; }
  function canFinish(cards14, wild, idx) { const s = new Hand(cards14, wild).solve(idx); return s.ok && s.dead === 0; }
  // points a losing hand scores (13 cards)
  function handPoints(cards, wild) {
    const s = new Hand(cards, wild).solve();
    return { pts: Math.min(80, s.ok ? s.dead : cards.reduce((a, c) => a + pts(c), 0)), sol: s };
  }
  return { SUITS, shuffle, deck, pts, joker, meldType, Hand, declareCard, canFinish, handPoints };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), decide(pi, phase, data) → Promise<action>, fx(name, pi) }
//   phase 'draw'    data { top, canDrop }       → { type: 'stock' | 'discard' | 'drop' }
//   phase 'discard' data {}                     → { type: 'discard' | 'declare', card: id }
class RummyGame {
  constructor({ players, deals = 1 }, io) {
    this.io = io; this.gen = 0;
    this.st = {
      players: players.map((p, i) => ({ id: p.id || 'p' + i, name: p.name, kind: p.kind, groups: [], loose: [], score: 0, out: false, drew: false, pts: null })),
      deal: 0, deals, dealer: -1, stock: [], discard: [], cut: null, wild: 0, turn: 0, phase: 'start',
      msg: 'Shuffling…', result: null, over: false, seq: 0, nextAt: 0, nextNow: false, winner: -1,
    };
  }
  static restore(st, io) { const g = Object.create(RummyGame.prototype); g.io = io; g.gen = 0; g.st = st; return g; }
  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(RummyGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  stop() { this.gen++; }
  P(pi) { return this.st.players[pi]; }
  hand(pi) { const p = this.P(pi); return [...p.groups.flat(), ...p.loose]; }
  active() { return this.st.players.map((p, i) => i).filter(i => !this.P(i).out); }

  async ask(pi, phase, data) {
    const p = this.P(pi);
    if (p.kind === 'cpu') { await this.sleep(phase === 'draw' ? 900 : 1100); return this.auto(pi, phase, data); }
    const g = this.gen;
    const a = await this.io.decide(pi, phase, data);
    if (g !== this.gen) throw RummyGame.ABORT;
    return a || this.auto(pi, phase, data);
  }

  async run() { try { await this.loop(); } catch (e) { if (e !== RummyGame.ABORT) console.error(e); } }
  async loop() {
    const st = this.st;
    while (!st.over) {
      if (st.phase === 'start') this.dealCards();
      else if (st.phase === 'draw' || st.phase === 'discard') await this.turn();
      else if (st.phase === 'dealover') {
        const humans = st.players.some(p => p.kind === 'human');
        while (!st.nextNow && Date.now() < st.nextAt && humans) await this.sleep(250);
        if (!humans) await this.sleep(2500);
        st.nextNow = false;
        if (st.deal >= st.deals) this.finish(); else st.phase = 'start';
      } else return;
    }
  }
  nextDeal() { if (this.st.phase === 'dealover') this.st.nextNow = true; }

  dealCards() {
    const st = this.st, n = st.players.length, d = RUM.shuffle(RUM.deck());
    st.deal++; st.dealer = (st.dealer + 1) % n; st.result = null;
    st.players.forEach(p => { p.groups = []; p.loose = []; p.out = false; p.drew = false; p.pts = null; });
    for (let k = 0; k < 13; k++) for (let i = 0; i < n; i++) st.players[i].loose.push(d.pop());
    let cut = d.pop(); while (cut.r === 0) { d.unshift(cut); cut = d.pop(); }   // a printed joker can't be the wild card
    st.cut = cut; st.wild = cut.r;
    st.discard = [d.pop()]; st.stock = d;
    st.turn = (st.dealer + 1) % n; st.phase = 'draw';
    st.players.forEach(p => p.loose.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : a.r - b.r)));
    st.msg = `Deal ${st.deal}${st.deals > 1 ? ' of ' + st.deals : ''} — wild card ${cut.r === 1 ? 'A' : { 11: 'J', 12: 'Q', 13: 'K' }[cut.r] || cut.r}`;
    this.io.fx('deal', -1); this.up();
  }

  async turn() {
    const st = this.st, pi = st.turn, p = this.P(pi);
    if (p.out) return this.advance();
    if (st.phase === 'draw') {
      const a = await this.ask(pi, 'draw', { top: st.discard[st.discard.length - 1] || null, canDrop: !p.drew });
      if (a.type === 'drop') return this.drop(pi);
      this.draw(pi, a.type === 'discard' && st.discard.length ? 'discard' : 'stock');
      st.phase = 'discard'; this.up();
    } else {
      const a = await this.ask(pi, 'discard', {});
      this.finishTurn(pi, a);
    }
  }
  draw(pi, from) {
    const st = this.st, p = this.P(pi);
    if (from === 'stock' && !st.stock.length) {   // recycle the discard pile (keep its top card)
      const top = st.discard.pop(); st.stock = RUM.shuffle(st.discard); st.discard = [top];
    }
    const c = from === 'discard' ? st.discard.pop() : st.stock.pop();
    if (!c) return;
    p.loose.push(c); p.drew = true;
    st.msg = `${p.name} took a card from the ${from === 'discard' ? 'discard pile' : 'stock'}`;
    this.io.fx('card', pi);
  }
  removeCard(pi, id) {
    const p = this.P(pi);
    for (const arr of [...p.groups, p.loose]) { const i = arr.findIndex(c => c.i === id); if (i >= 0) { const [c] = arr.splice(i, 1); p.groups = p.groups.filter(g => g.length); return c; } }
    return null;
  }
  finishTurn(pi, a) {
    const st = this.st, p = this.P(pi), id = +a.card;
    const hand = this.hand(pi);
    if (!hand.some(c => c.i === id)) return this.finishTurn(pi, this.auto(pi, 'discard'));
    if (a.type === 'declare') {
      const card = this.removeCard(pi, id), rest = this.hand(pi);
      const sol = new RUM.Hand(rest, st.wild).solve();
      if (sol.ok && sol.dead === 0) {
        st.discard.push(card); st.msg = `${p.name} declares!`; this.io.fx('declare', pi);
        return this.endDeal(pi);
      }
      // wrong declaration: 80 points and out of this deal
      p.loose.push(card); p.out = true; p.pts = 80; st.msg = `${p.name} made a wrong declaration — 80 points!`; this.io.fx('lose', pi);
      return this.afterOut(pi);
    }
    const c = this.removeCard(pi, id); st.discard.push(c);
    st.msg = `${p.name} discarded`; this.io.fx('card', pi);
    this.advance();
  }
  drop(pi) {
    const st = this.st, p = this.P(pi);
    p.out = true; p.pts = p.drew ? 40 : 20; st.msg = `${p.name} dropped (${p.pts} points)`; this.io.fx('lose', pi);
    this.afterOut(pi);
  }
  afterOut(pi) {
    const left = this.active();
    if (left.length === 1) return this.endDeal(left[0]);
    this.advance();
  }
  advance() {
    const st = this.st, n = st.players.length;
    let t = st.turn; do { t = (t + 1) % n; } while (this.P(t).out);
    st.turn = t; st.phase = 'draw'; this.up();
  }
  endDeal(winner) {
    const st = this.st, rows = [];
    st.players.forEach((p, i) => {
      let pts = 0, sol = null, groups = [], rest = [];
      const hand = this.hand(i);
      if (i === winner) pts = 0;
      else if (p.out) pts = p.pts;
      if (hand.length >= 3) { const h = new RUM.Hand(hand.slice(0, 14), st.wild); sol = h.solve(); }
      if (i !== winner && !p.out) pts = Math.min(80, sol && sol.ok ? sol.dead : hand.reduce((a, c) => a + RUM.pts(c), 0));
      if (sol) { groups = sol.groups.map(g => g.map(k => hand[k])); rest = sol.rest.map(k => hand[k]); } else rest = hand;
      p.pts = pts; p.score += pts;
      rows.push({ pi: i, pts, total: p.score, groups, rest, out: p.out, ok: !!(sol && sol.ok) });
    });
    st.result = { winner, rows };
    st.phase = 'dealover'; st.nextAt = Date.now() + 30000; st.nextNow = false;
    st.msg = `${this.P(winner).name} wins the deal!`; this.io.fx(winner >= 0 ? 'win' : 'lose', winner);
    this.up();
  }
  finish() {
    const st = this.st, min = Math.min(...st.players.map(p => p.score));
    st.over = true; st.winner = st.players.findIndex(p => p.score === min); st.phase = 'over';
    st.msg = `${this.P(st.winner).name} wins the game with ${min} points!`;
    this.io.fx('winner', st.winner); this.up();
  }
  forfeit(pi) { const p = this.P(pi); if (p && p.kind === 'human') p.kind = 'cpu'; }

  // person rearranging their hand (any time): groups of card ids + the loose ones
  arrange(pi, a) {
    const p = this.P(pi); if (!p || !a || !Array.isArray(a.groups) || !Array.isArray(a.loose)) return false;
    const byId = new Map(this.hand(pi).map(c => [c.i, c])), seen = new Set(), pick = ids => ids.map(id => { id = +id; if (!byId.has(id) || seen.has(id)) return null; seen.add(id); return byId.get(id); });
    const groups = a.groups.map(g => Array.isArray(g) ? pick(g) : [null]), loose = pick(a.loose);
    if (groups.some(g => g.includes(null)) || loose.includes(null) || seen.size !== byId.size) return false;
    p.groups = groups.filter(g => g.length); p.loose = loose; this.up(); return true;
  }

  /* ---------------- computer players (also used when a person's time runs out) ---------------- */
  auto(pi, phase) {
    const st = this.st, w = st.wild, hand = this.hand(pi);
    if (phase === 'draw') {
      const top = st.discard[st.discard.length - 1];
      if (!top) return { type: 'stock' };
      if (RUM.joker(top, w)) return { type: 'discard' };
      const base = new RUM.Hand(hand, w).solve().cost, h14 = new RUM.Hand([...hand, top], w);
      let best = Infinity; for (let k = 0; k < hand.length; k++) best = Math.min(best, h14.solve(k).cost);
      return { type: best + 3 < base ? 'discard' : 'stock' };
    }
    const k = RUM.declareCard(hand, w);
    if (k >= 0) return { type: 'declare', card: hand[k].i };
    const h = new RUM.Hand(hand, w);
    let bestK = 0, bestV = Infinity;
    hand.forEach((c, k) => {
      const cost = h.solve(k).cost;
      const near = hand.filter((o, j) => j !== k && !RUM.joker(o, w) && ((o.r === c.r && o.s !== c.s) || (o.s === c.s && Math.abs(o.r - c.r) <= 2 && o.r !== c.r))).length;
      const v = cost * 1000 + near * 40 - RUM.pts(c) + (RUM.joker(c, w) ? 9000 : 0);
      if (v < bestV) { bestV = v; bestK = k; }
    });
    return { type: 'discard', card: hand[bestK].i };
  }

  // what a given player may see: their own hand, never the stock or other hands (until the deal ends)
  static viewFor(st, me) {
    const { stock, ...rest } = st;
    return { ...rest, stockN: stock.length, players: st.players.map((p, i) => i === me ? p : { ...p, groups: [], loose: [], n: p.groups.flat().length + p.loose.length }) };
  }
}
RummyGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View                                                                                   */
/* ======================================================================================= */
const RumView = (() => {
  const esc = s => UI.esc(s);
  const RN = r => r === 1 ? 'A' : { 11: 'J', 12: 'Q', 13: 'K' }[r] || String(r);
  function card(c, o = {}) {
    const cls = `${o.sel ? ' sel' : ''}${o.wild ? ' wild' : ''}`;
    const inner = c.r === 0
      ? `<div class="pc md jk"><span>★</span><em>JOKER</em></div>`
      : UI.card({ r: c.r === 1 ? 14 : c.r, s: c.s }, null, o.size || 'md');
    return o.tap === false ? `<div class="rc${cls}">${inner}</div>` : `<button class="rc${cls}" data-rc="${c.i}">${inner}${o.wild ? '<i class="wtag">W</i>' : ''}</button>`;
  }
  const BADGE = { pure: ['Pure sequence', 'good'], seq: ['Sequence', 'good'], set: ['Set', 'good'] };
  function groupHTML(g, w, sel) {
    const t = RUM.meldType(g, w), b = t ? BADGE[t] : [g.length < 3 ? 'Need 3+' : 'Not a meld', 'bad'];
    return `<div class="rgroup ${b[1]}"><div class="rcards">${g.map(c => card(c, { sel: sel.has(c.i), wild: RUM.joker(c, w) && c.r !== 0 })).join('')}</div>
      <div class="rbadge"><span>${b[0]}</span><button data-r="ungroup" data-g="${g[0].i}" aria-label="Ungroup">✕</button></div></div>`;
  }
  // o: { me, prompt:{phase,data}|null, sel:Set, footer, local, canNext }
  function html(st, o) {
    const me = st.players[o.me], w = st.wild, sel = o.sel || new Set(), pr = o.prompt;
    const over = st.over, dealover = st.phase === 'dealover';
    const wildName = RN(w);
    const opps = st.players.map((p, i) => ({ p, i })).filter(x => x.i !== o.me);
    const you = pr && pr.phase;
    const top = st.discard[st.discard.length - 1];
    const hand = me ? [...me.groups.flat(), ...me.loose] : [];
    let acts = '';
    if (me && !over && !dealover) {
      if (you === 'draw') acts = `<span class="your-turn">Your turn — draw a card${o.timer || ''}</span>${pr.data.canDrop ? '<button class="b b-ghost small-b2" data-r="drop">Drop (20)</button>' : '<button class="b b-ghost small-b2" data-r="drop">Drop (40)</button>'}`;
      else if (you === 'discard') {
        const one = sel.size === 1 ? [...sel][0] : null;
        const idx = one !== null ? hand.findIndex(c => c.i === one) : -1;
        const fin = idx >= 0 && RUM.canFinish(hand, w, idx);
        acts = `<span class="your-turn">Select a card to discard${o.timer || ''}</span>
          <button class="b b-fold small-b2" data-r="discard" ${one !== null ? '' : 'disabled'}>Discard</button>
          <button class="b b-raise small-b2" data-r="declare" ${fin ? '' : 'disabled'}>Declare ✓</button>`;
      }
    }
    return `<div class="rum">
      <div class="rum-opps">${opps.map(({ p, i }) => `<div class="ropp${st.turn === i && !over && !dealover ? ' turn' : ''}${p.out ? ' out' : ''}">
        ${UI.avatar(p.name, p.id, p.kind === 'cpu')}<div><b>${esc(p.name.replace(/ 🤖/, ''))}</b><small>${p.out ? (p.pts === 80 ? 'wrong show' : 'dropped') : (p.n ?? 13) + ' cards'} · ${p.score} pts</small></div></div>`).join('')}</div>
      <div class="rum-table">
        <div class="rpile"><div class="rcap">Stock</div>${st.stockN ? `<button class="rc pile${you === 'draw' ? ' go' : ''}" data-r="stock" ${you === 'draw' ? '' : 'disabled'}><div class="pc md back"></div></button>` : '<div class="pc md empty"></div>'}<small>${st.stockN ?? 0}</small></div>
        <div class="rpile"><div class="rcap">Discard</div>${top ? `<button class="rc pile${you === 'draw' ? ' go' : ''}" data-r="pick" ${you === 'draw' ? '' : 'disabled'}>${card(top, { tap: false, wild: RUM.joker(top, w) && top.r !== 0 })}</button>` : '<div class="pc md empty"></div>'}</div>
        <div class="rpile"><div class="rcap">Wild joker</div>${st.cut ? card(st.cut, { tap: false }) : ''}<small>${wildName}s + 🃏</small></div>
        <div class="rmsg">${esc(st.msg)}<br><small>${st.deals > 1 ? `Deal ${st.deal}/${st.deals} · ` : ''}${st.players.map(p => esc(p.name.replace(/ 🤖/, '')) + ' ' + p.score).join(' · ')}</small></div>
      </div>
      ${dealover || over ? resultHTML(st, o) : ''}
      ${me && !dealover && !over && !me.out ? `<div class="rum-hand">
        <div class="rgroups">${me.groups.map(g => groupHTML(g, w, sel)).join('')}</div>
        ${me.loose.length ? `<div class="rloose"><div class="rcards">${me.loose.map(c => card(c, { sel: sel.has(c.i), wild: RUM.joker(c, w) && c.r !== 0 })).join('')}</div></div>` : ''}
        <div class="rtools">
          <button class="b b-ghost small-b2" data-r="group" ${sel.size >= 2 ? '' : 'disabled'}>Group ${sel.size >= 2 ? sel.size : ''}</button>
          <button class="b b-ghost small-b2" data-r="sort">Sort</button>
          <button class="b b-ghost small-b2" data-r="auto">Auto-arrange</button>
        </div>
        <div class="ract">${acts}</div>
      </div>` : me && me.out && !dealover && !over ? '<p class="hint">You’re out of this deal — watching.</p>' : ''}
      ${o.footer || ''}
    </div>`;
  }
  function resultHTML(st, o) {
    const r = st.result, w = st.wild;
    const rows = r ? r.rows.map(row => {
      const p = st.players[row.pi], win = row.pi === r.winner;
      return `<div class="rres${win ? ' win' : ''}"><div class="rhead"><b>${esc(p.name)}${win ? ' 🏆' : ''}</b><span>${row.out && !win ? (row.pts === 80 && p.pts === 80 ? 'wrong show' : 'dropped') + ' · ' : ''}<b>+${row.pts}</b> → ${row.total}</span></div>
        <div class="rmini">${row.groups.map(g => `<div class="rgm">${g.map(c => card(c, { tap: false, size: 'sm' })).join('')}</div>`).join('')}${row.rest.length ? `<div class="rgm rest">${row.rest.map(c => card(c, { tap: false, size: 'sm' })).join('')}</div>` : ''}</div></div>`;
    }).join('') : '';
    const btn = st.over ? '' : `<button class="b b-raise big" data-r="next">${st.deal >= st.deals ? 'See final result' : 'Next deal'}</button>`;
    return `<div class="rum-result"><h3>${st.over ? 'Final result' : 'Deal result'}</h3>${rows}${st.over ? `<p class="rwin">🏆 ${esc(st.players[st.winner].name)} wins with ${st.players[st.winner].score} points</p>` : ''}${btn}</div>`;
  }
  return { html };
})();

// taps on the rummy table → arrange the hand locally (sent to the engine) or answer the prompt
// ui: { sel:Set }; act(action) delivers an action to the engine (or the host)
function rummyClick(b, st, me, prompt, ui, act) {
  const p = st.players[me]; if (!p) return false;
  const sel = ui.sel || (ui.sel = new Set());
  const hand = [...p.groups.flat(), ...p.loose], r = b.dataset.r;
  const send = (groups, loose) => act({ type: 'arrange', groups: groups.map(g => g.map(c => c.i)), loose: loose.map(c => c.i) });
  const strip = ids => ({ groups: p.groups.map(g => g.filter(c => !ids.has(c.i))).filter(g => g.length), loose: p.loose.filter(c => !ids.has(c.i)) });
  if (b.dataset.rc !== undefined) { const id = +b.dataset.rc; sel.has(id) ? sel.delete(id) : sel.add(id); return true; }
  if (r === 'group' && sel.size >= 2) { const rest = strip(sel); const g = hand.filter(c => sel.has(c.i)); sel.clear(); send([...rest.groups, g], rest.loose); return true; }
  if (r === 'ungroup') { const g = p.groups.find(g => g[0].i === +b.dataset.g); if (g) send(p.groups.filter(x => x !== g), [...p.loose, ...g]); return true; }
  if (r === 'sort') { send(p.groups, [...p.loose].sort((a, c) => (a.s < c.s ? -1 : a.s > c.s ? 1 : a.r - c.r))); return true; }
  if (r === 'auto') {
    const s = new RUM.Hand(hand, st.wild).solve();
    send(s.groups.map(g => g.map(k => hand[k])), s.rest.map(k => hand[k]).sort((a, c) => (a.s < c.s ? -1 : a.s > c.s ? 1 : a.r - c.r)));
    return true;
  }
  if (r === 'next') { act({ type: 'next' }); return true; }
  if (!prompt) return false;
  if (prompt.phase === 'draw' && (r === 'stock' || r === 'pick' || r === 'drop')) {
    if (r === 'drop') { UI.ask('Drop out of this deal? You score ' + (prompt.data.canDrop ? 20 : 40) + ' points.', 'Drop', true).then(ok => ok && act({ type: 'drop' })); return true; }
    act({ type: r === 'pick' ? 'discard' : 'stock' }); return true;
  }
  if (prompt.phase === 'discard' && (r === 'discard' || r === 'declare') && sel.size === 1) {
    const id = [...sel][0]; sel.clear(); act({ type: r, card: id }); return true;
  }
  return false;
}

/* ======================================================================================= */
/*  Single-phone screen                                                                    */
/* ======================================================================================= */
const Rummy = (() => {
  const KEY = 'cardroom.rummy';
  const CPU = ['Raju', 'Meena', 'Arjun', 'Kavya', 'Imran'];
  let el = null, game = null, waiter = null, ui = { sel: new Set() };
  let setup = load('setup') || { cpus: 2, deals: 1 };
  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }
  const io = {
    update() { save(); draw(); },
    decide(pi, phase, data) { return new Promise(r => { waiter = { r, phase, data }; ui.sel.clear(); draw(); navigator.vibrate?.(60); if (phase === 'draw') Sfx.turn(); }); },
    fx(name, pi) { if (name === 'deal') Sfx.deal(); else if (name === 'card') Sfx.flip(); else if (name === 'win') { if (pi === 0) UI.burst('You win the deal!', 'big'); else Sfx.lose(); } else if (name === 'declare') Sfx.win(); else if (name === 'winner') { if (pi === 0) UI.burst('You win the game!', 'big'); } },
  };
  function draw() {
    if (!el || !game) return;
    const st = game.st, me = st.players[0];
    // forget selected cards that are no longer in the hand
    const ids = new Set([...me.groups.flat(), ...me.loose].map(c => c.i)); [...ui.sel].forEach(i => { if (!ids.has(i)) ui.sel.delete(i); });
    const y = el.scrollTop;
    el.innerHTML = RumView.html(RummyGame.viewFor(st, 0), { me: 0, prompt: waiter && { phase: waiter.phase, data: waiter.data }, sel: ui.sel,
      footer: st.over ? '<button class="b b-raise big" data-k="again">Play again</button>' : '<button class="b b-ghost wide small-b2" data-k="menu">Setup / quit</button>' });
    el.scrollTop = y;
  }
  function renderSetup() {
    const sel = (k, vals, f) => `<select data-o="${k}">${vals.map(v => `<option value="${v}" ${setup[k] == v ? 'selected' : ''}>${f(v)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🃏</div>
      <h2 class="wordmark small">Indian Rummy</h2>
      <p class="tagline">13 cards · points rummy</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Rummy</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts">
        <label>Computer players <span class="stepper"><button data-s="-1" ${setup.cpus <= 1 ? 'disabled' : ''}>−</button><b>${setup.cpus}</b><button data-s="1" ${setup.cpus >= 5 ? 'disabled' : ''}>+</button></span></label>
        <label>Deals ${sel('deals', [1, 2, 3, 5], v => v + (v > 1 ? ' (lowest total wins)' : ''))}</label>
      </div>
      <p class="hint small">Draw a card, then discard one. Make <b>two sequences</b> (one <b>pure</b> — no joker) and put the rest in sequences or sets, then <b>Declare</b>. The wild-joker rank and the 🃏 cards substitute for anything. Tap cards to select them, <b>Group</b> them together, or let <b>Auto-arrange</b> do it. Losers score their unmatched cards (max 80); a wrong declaration is 80.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-k="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-k="start">Start game</button>
    </div>`;
  }
  function start(st) {
    game?.stop(); waiter = null; ui = { sel: new Set() };
    game = st ? RummyGame.restore(st, io) : new RummyGame({ players: [{ name: 'You', kind: 'human' }, ...CPU.slice(0, setup.cpus).map(n => ({ name: n + ' 🤖', kind: 'cpu' }))], deals: +setup.deals }, io);
    save(); draw(); game.run();
  }
  const act = a => {
    if (a.type === 'arrange') { game.arrange(0, a); return true; }
    if (a.type === 'next') { game.nextDeal(); return true; }
    const w = waiter; if (w) { waiter = null; w.r(a); } return true;
  };
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (!game) {
      if (b.dataset.s) { setup.cpus = Math.min(5, Math.max(1, setup.cpus + +b.dataset.s)); save(); return renderSetup(); }
      if (b.dataset.k === 'start') return start();
      if (b.dataset.k === 'resume') return start(load('game'));
      return;
    }
    const k = b.dataset.k;
    if (k === 'again') return start();
    if (k === 'menu') { const go = () => { game.stop(); save(); game = null; waiter = null; renderSetup(); }; if (!game.st.over) UI.ask('Leave this game? It is saved — you can resume it later.', 'Leave').then(ok => ok && go()); else go(); return; }
    const handled = rummyClick(b, game.st, 0, waiter && { phase: waiter.phase, data: waiter.data }, ui, act);
    if (handled) draw();
  }
  function onChange(e) { const o = e.target.dataset.o; if (o) { setup[o] = +e.target.value; save(); } }
  function mount(container) { el = container; el.onclick = onClick; el.onchange = onChange; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); game = null; waiter = null; if (el) el.onclick = el.onchange = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();
