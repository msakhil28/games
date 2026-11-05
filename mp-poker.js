// Multiplayer Texas Hold'em engine — runs on the host. Any mix of people and computer players.
const ABORT_MP = Symbol('abort');
const mpSleep = ms => new Promise(r => setTimeout(r, ms));
const MP_SUITS = ['♠', '♥', '♦', '♣'];
function mpShuffle(d) {
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

class PokerEngine {
  constructor(room) {
    this.room = room;
    this.gen = 0; this.handNo = 0; this.dealerId = null; this.paused = false;
    this.reset();
    this.phase = 'waiting'; this.msg = 'Shuffling up…';
  }
  reset() {
    this.seats = []; this.board = []; this.pot = 0; this.currentBet = 0; this.minRaise = 0;
    this.turn = null; this.pending = null; this.turnUntil = null; this.turnKey = 0; this.won = null; this.nextAt = null;
  }
  get level() { return this.room.settings.blindsUp ? Math.floor(Math.max(0, this.handNo - 1) / 10) : 0; }
  get bb() { return this.room.settings.bb * Math.pow(2, this.level); }
  get sb() { return Math.floor(this.bb / 2); }

  start() { this.loop(); }
  stop() {
    // refund chips committed to an unfinished hand
    if (this.phase === 'play') this.seats.forEach(s => { s.m.chips += s.total; s.total = 0; });
    this.gen++;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.res({ type: 'fold' }); }
  }
  check(g) { if (g !== this.gen) throw ABORT_MP; }
  async wait(g, ms) { await mpSleep(ms); this.check(g); }
  update() { this.room.update(); }

  async loop() {
    const g = this.gen;
    try {
      await this.wait(g, 800);
      while (g === this.gen) {
        if (this.paused) { this.phase = 'paused'; this.msg = 'Paused by the host.'; this.update(); await this.wait(g, 1000); continue; }
        const played = await this.playHand(g);
        if (played) { this.nextAt = Date.now() + 6000; this.update(); await this.wait(g, 6000); this.nextAt = null; }
        else await this.wait(g, 1500);
      }
    } catch (e) { if (e !== ABORT_MP) { console.error(e); this.msg = 'Something went wrong — the host can go back to the lobby and restart.'; this.update(); } }
  }

  /* ---------- presence ---------- */
  presence(id) { // a member went offline/online: speed up their pending turn if they're away
    const p = this.pending;
    if (!p || p.id !== id) return;
    if (!this.room.member(id)?.online) return this.armTimer(8000);
    const secs = this.room.settings.timer;
    if (secs > 0) this.armTimer(secs * 1000);
    else { clearTimeout(p.timer); this.turnUntil = null; this.update(); }
  }
  left(id) {
    const s = this.seats.find(x => x.id === id);
    if (s && !s.folded && this.phase === 'play') { s.folded = true; s.note = 'Left'; }
    if (this.pending && this.pending.id === id) this.pending.res({ type: 'fold' });
  }
  act(id, a) {
    if (this.pending && this.pending.id === id && ['fold', 'call', 'raise'].includes(a.type)) {
      this.pending.res({ type: a.type, to: Math.round(+a.to || 0) });
    }
  }
  armTimer(ms) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.timerSeq = (this.timerSeq || 0) + 1; this.timerTotal = ms;
    this.turnUntil = Date.now() + ms;
    p.timer = setTimeout(() => p.res({ type: 'timeout' }), ms);
    this.update();
  }

  /* ---------- a hand ---------- */
  putIn(s, amt) {
    amt = Math.max(0, Math.min(amt, s.m.chips));
    s.m.chips -= amt; s.bet += amt; s.total += amt; this.pot += amt;
    if (s.m.chips === 0) s.allIn = true;
    return amt;
  }
  live() { return this.seats.filter(s => !s.folded); }
  canAct() { return this.seats.filter(s => !s.folded && !s.allIn); }

  async playHand(g) {
    const R = this.room;
    R.members.forEach(m => { if (m.bot && m.chips <= 0) { m.chips = R.settings.startChips; R.toast(`${m.name} re-bought`); } });
    const players = R.members.filter(m => m.chips > 0 && (m.bot || m.online));
    if (players.length < 2) {
      this.reset();
      this.phase = 'waiting';
      const broke = R.members.filter(m => !m.bot && m.chips <= 0).map(m => m.name);
      this.msg = 'Waiting for at least 2 players with chips…' + (broke.length ? ` (${broke.join(', ')} out of chips — the host can top up.)` : '');
      this.update();
      return false;
    }
    this.reset();
    this.handNo++;
    if (this.room.settings.blindsUp && this.handNo > 1 && (this.handNo - 1) % 10 === 0) R.toast(`Blinds up! Now ${Store.fmt(this.sb)} / ${Store.fmt(this.bb)}`);
    this.seats = players.map(m => ({ id: m.id, m, hole: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, note: '', reveal: false, handName: '' }));
    // move the button to the next player in seat order
    const ids = R.members.map(m => m.id);
    const from = ids.indexOf(this.dealerId);
    for (let k = 1; k <= ids.length; k++) {
      const cand = ids[(from + k + ids.length) % ids.length];
      if (this.seats.some(s => s.id === cand)) { this.dealerId = cand; break; }
    }
    const n = this.seats.length, d = this.seats.findIndex(s => s.id === this.dealerId);
    const at = i => this.seats[((i % n) + n) % n];
    const heads = n === 2;
    const sbSeat = heads ? at(d) : at(d + 1), bbSeat = heads ? at(d + 1) : at(d + 2);
    const preFirst = heads ? d : d + 3, postFirst = d + 1;

    this.deck = mpShuffle(MP_SUITS.flatMap(s => Array.from({ length: 13 }, (_, i) => ({ r: i + 2, s }))));
    this.phase = 'play';
    this.msg = `Hand #${this.handNo}`;
    for (let r = 0; r < 2; r++) this.seats.forEach(s => s.hole.push(this.deck.pop()));
    this.putIn(sbSeat, this.sb); this.putIn(bbSeat, this.bb);
    sbSeat.note = 'SB'; bbSeat.note = 'BB';
    this.currentBet = Math.max(sbSeat.bet, bbSeat.bet);
    this.minRaise = this.bb;
    this.update();
    await this.wait(g, 700);
    if (this.canAct().length > 1 || this.needsToAct()) await this.betRound(g, preFirst);
    for (const k of [3, 1, 1]) {
      if (this.live().length <= 1) break;
      this.endRound();
      for (let i = 0; i < k; i++) this.board.push(this.deck.pop());
      this.msg = ['', '', '', 'The flop', 'The turn', 'The river'][this.board.length];
      this.update();
      await this.wait(g, this.canAct().length > 1 ? 600 : 1300);
      if (this.canAct().length > 1) await this.betRound(g, postFirst);
    }
    this.endRound();
    this.showdown();
    return true;
  }
  needsToAct() { return this.canAct().some(s => s.bet < this.currentBet); }

  endRound() {
    this.seats.forEach(s => { s.bet = 0; if (!s.folded && !s.allIn) s.note = ''; });
    this.currentBet = 0; this.minRaise = this.bb;
  }

  async betRound(g, first) {
    this.seats.forEach(s => { s.acted = false; });
    let i = first;
    for (;;) {
      if (this.live().length <= 1) return;
      const need = this.seats.filter(s => !s.folded && !s.allIn && (!s.acted || s.bet < this.currentBet));
      if (!need.length) return;
      // nobody left to bet against: a lone player who has matched the bet doesn't need to act
      if (this.canAct().length === 1 && need.length === 1 && need[0].bet >= this.currentBet) return;
      const s = this.seats[((i % this.seats.length) + this.seats.length) % this.seats.length]; i++;
      if (s.folded || s.allIn || (s.acted && s.bet === this.currentBet)) continue;
      await this.takeTurn(g, s);
    }
  }

  legal(s) {
    const toCall = Math.min(this.currentBet - s.bet, s.m.chips);
    const maxTo = s.bet + s.m.chips;
    const minTo = Math.min(this.currentBet + this.minRaise, maxTo);
    return { toCall, minTo, maxTo, canRaise: s.m.chips > this.currentBet - s.bet, currentBet: this.currentBet, myBet: s.bet, pot: this.pot };
  }

  async takeTurn(g, s) {
    this.turn = s; this.turnKey++;
    let a;
    if (s.m.bot) {
      this.turnUntil = null;
      this.update();
      await this.wait(g, 700 + Math.random() * 800);
      a = this.botDecide(s);
    } else {
      a = await new Promise(res => {
        this.pending = { id: s.id, res, timer: null };
        const secs = this.room.settings.timer;
        const online = this.room.member(s.id)?.online;
        if (!online) this.armTimer(8000);
        else if (secs > 0) this.armTimer(secs * 1000);
        else { this.turnUntil = null; this.update(); }
      });
      clearTimeout(this.pending?.timer);
      this.pending = null; this.turnUntil = null;
      this.check(g);
      if (a.type === 'timeout') a = { type: this.currentBet - s.bet <= 0 ? 'call' : 'fold', auto: true };
    }
    this.turn = null;
    if (!s.folded) this.apply(s, a); // could have left the room while it was their turn
    s.acted = true;
    this.update();
    await this.wait(g, 250);
  }

  apply(s, a) {
    const name = s.m.name;
    const toCall = Math.max(0, this.currentBet - s.bet);
    const fmt = Store.fmt;
    if (a.type === 'fold') { s.folded = true; s.note = a.auto ? 'Timed out' : 'Fold'; this.msg = `${name} ${a.auto ? 'ran out of time and folds' : 'folds'}.`; }
    else if (a.type === 'raise' && s.m.chips > toCall) {
      const maxTo = s.bet + s.m.chips;
      const to = Math.max(Math.min(a.to, maxTo), Math.min(this.currentBet + this.minRaise, maxTo));
      const wasBet = this.currentBet === 0;
      this.putIn(s, to - s.bet);
      const size = s.bet - this.currentBet;
      if (size >= this.minRaise) { this.minRaise = size; this.seats.forEach(q => { if (q !== s) q.acted = false; }); }
      if (s.bet > this.currentBet) this.currentBet = s.bet;
      s.note = s.allIn ? 'All-in' : `${wasBet ? 'Bet' : 'Raise'} ${fmt(s.bet)}`;
      this.msg = `${name} ${wasBet ? 'bets' : 'raises to'} ${fmt(s.bet)}${s.allIn ? ' — all-in!' : '.'}`;
    } else {
      const amt = this.putIn(s, toCall);
      s.note = amt === 0 ? 'Check' : s.allIn ? 'All-in' : `Call ${fmt(amt)}`;
      this.msg = amt === 0 ? `${name} ${a.auto ? 'timed out and checks' : 'checks'}.` : `${name} calls ${fmt(amt)}${s.allIn ? ' — all-in!' : '.'}`;
    }
  }

  /* ---------- computer players ---------- */
  strength(s) {
    const E = Poker._eval;
    if (!this.board.length) {
      const [a, b] = s.hole.map(c => c.r).sort((x, y) => y - x);
      if (a === b) return 0.5 + (a - 2) / 24;
      return 0.15 + (a - 2) / 12 * 0.3 + (b - 2) / 12 * 0.2 + (s.hole[0].s === s.hole[1].s ? 0.05 : 0) + (a - b <= 2 ? 0.05 : 0);
    }
    const all = s.hole.concat(this.board), sc = E.best(all), cat = E.catOf(sc);
    let v;
    if (cat === 0) v = 0.15 + (Math.max(...s.hole.map(c => c.r)) - 2) / 12 * 0.1;
    else if (cat === 1) { const pr = Math.floor(sc / Math.pow(15, 4)) % 15; v = s.hole.some(c => c.r === pr) ? 0.42 + (pr - 2) / 12 * 0.2 : 0.3; }
    else if (cat === 2) v = 0.72;
    else if (cat === 3) v = 0.8;
    else v = 0.9 + cat * 0.01;
    if (this.board.length < 5) for (const su of MP_SUITS) if (all.filter(c => c.s === su).length === 4) v += 0.14;
    return Math.min(v, 1);
  }
  botDecide(s) {
    const toCall = Math.max(0, this.currentBet - s.bet);
    const potOdds = toCall / (this.pot + toCall || 1);
    const v = this.strength(s) + (Math.random() - 0.5) * 0.18;
    const maxTo = s.bet + s.m.chips;
    const sized = f => Math.min(maxTo, Math.max(this.currentBet + this.minRaise, Math.round((this.currentBet + f * (this.pot + toCall)) / 5) * 5));
    if (toCall === 0) {
      if (v > 0.72 || Math.random() < 0.05) return { type: 'raise', to: sized(0.5 + Math.random() * 0.4) };
      if (v > 0.55 && Math.random() < 0.5) return { type: 'raise', to: sized(0.35) };
      return { type: 'call' };
    }
    if (v > 0.86 && Math.random() < 0.65 && s.m.chips > toCall) return { type: 'raise', to: sized(0.6 + Math.random() * 0.5) };
    const allIn = toCall >= s.m.chips;
    if (v > potOdds + (allIn ? 0.2 : 0.1)) return { type: 'call' };
    if (!this.board.length && toCall <= this.bb && v > 0.33) return { type: 'call' };
    if (v > potOdds + 0.04 && toCall <= this.bb * 2 && !allIn) return { type: 'call' };
    return { type: 'fold' };
  }

  /* ---------- showdown ---------- */
  showdown() {
    const E = Poker._eval;
    const contenders = this.live();
    const won = {};
    const add = (s, n) => { won[s.id] = (won[s.id] || 0) + n; };
    const how = {};
    if (contenders.length === 1) add(contenders[0], this.pot);
    else {
      contenders.forEach(s => { s.reveal = true; s.score = E.best(s.hole.concat(this.board)); s.handName = E.handName(s.score); });
      const levels = [...new Set(contenders.map(s => s.total))].sort((a, b) => a - b);
      let prev = 0;
      for (const lvl of levels) {
        const part = this.seats.reduce((t, s) => t + Math.min(s.total, lvl) - Math.min(s.total, prev), 0);
        const elig = contenders.filter(s => s.total >= lvl);
        const top = Math.max(...elig.map(s => s.score));
        const ws = elig.filter(s => s.score === top);
        const share = Math.floor(part / ws.length);
        ws.forEach((s, i) => { add(s, share + (i === 0 ? part - share * ws.length : 0)); how[s.id] = s.handName; });
        prev = lvl;
      }
    }
    const paid = Object.values(won).reduce((a, b) => a + b, 0);
    if (this.pot > paid) add(contenders[0], this.pot - paid); // chips from players who left the room
    for (const s of this.seats) if (won[s.id]) s.m.chips += won[s.id];
    this.won = won;
    this.pot = 0;
    this.seats.forEach(s => { s.total = 0; s.bet = 0; });
    this.phase = 'over';
    this.msg = Object.entries(won).map(([id, n]) => {
      const s = this.seats.find(x => x.id === id);
      return `${s.m.name} wins ${Store.fmt(n)}${how[id] ? ' with ' + how[id] : ''}`;
    }).join(' · ');
    this.update();
  }

  /* ---------- per-player view ---------- */
  view(id) {
    const now = Date.now();
    const mine = this.pending && this.pending.id === id ? this.seats.find(s => s.id === id) : null;
    return {
      kind: 'poker', phase: this.phase, msg: this.msg, handNo: this.handNo, sb: this.sb, bb: this.bb, pot: this.pot,
      board: this.board, paused: this.paused, blindsUp: this.room.settings.blindsUp,
      turnKey: this.turnKey, timerSeq: this.timerSeq || 0, timerTotal: this.timerTotal || 0, turnRemaining: this.turnUntil ? Math.max(0, this.turnUntil - now) : null,
      nextIn: this.nextAt ? Math.max(0, this.nextAt - now) : null,
      seats: this.room.members.map(m => {
        const s = this.seats.find(x => x.id === m.id);
        return {
          id: m.id, inHand: !!s, folded: !!s?.folded, allIn: !!s?.allIn, bet: s?.bet || 0, note: s?.note || '',
          dealer: m.id === this.dealerId && !!s, turn: this.turn?.id === m.id,
          cards: s ? (s.id === id || s.reveal ? s.hole : s.hole.map(() => null)) : [],
          handName: s?.reveal ? s.handName : '', won: this.won?.[m.id] || 0,
        };
      }),
      you: mine ? this.legal(mine) : null,
    };
  }
}
