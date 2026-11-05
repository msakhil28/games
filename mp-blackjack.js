// Multiplayer Blackjack engine — runs on the host. Everyone plays against one shared dealer.
class BlackjackEngine {
  constructor(room) {
    this.room = room;
    this.gen = 0; this.roundNo = 0; this.paused = false;
    this.shoe = [];
    this.phase = 'waiting'; this.msg = 'Shuffling the shoe…';
    this.players = []; this.dealer = []; this.turn = null; this.turnKey = 0; this.turnUntil = null; this.pending = null;
    this.betUntil = null; this.betWaiter = null; this.hideHole = true; this.nextAt = null;
  }
  get minBet() { return this.room.settings.minBet; }
  start() { this.loop(); }
  stop() {
    // refund bets of a round that hasn't been settled yet
    if (['betting', 'dealing', 'play', 'dealer'].includes(this.phase)) this.players.forEach(p => { p.m.chips += p.hands.reduce((t, h) => t + h.bet, 0) || p.bet; });
    this.gen++;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.res({ type: 'stand' }); }
    if (this.betWaiter) this.betWaiter();
  }
  check(g) { if (g !== this.gen) throw ABORT_MP; }
  async wait(g, ms) { await mpSleep(ms); this.check(g); }
  update() { this.room.update(); }

  /* ---------- cards ---------- */
  draw() {
    if (this.shoe.length < 30) {
      this.shoe = mpShuffle([...Array(6)].flatMap(() => MP_SUITS.flatMap(s => Array.from({ length: 13 }, (_, i) => ({ r: i + 1, s })))));
      this.room.toast('Dealer shuffles a fresh 6-deck shoe');
    }
    return this.shoe.pop();
  }
  static val(c) { return Math.min(c.r, 10); }
  static total(cards) {
    let t = cards.reduce((s, c) => s + BlackjackEngine.val(c), 0), soft = false;
    if (cards.some(c => c.r === 1) && t + 10 <= 21) { t += 10; soft = true; }
    return { t, soft };
  }
  static isBJ(h) { return h.cards.length === 2 && !h.split && BlackjackEngine.total(h.cards).t === 21; }

  /* ---------- presence / input ---------- */
  presence(id) {
    const p = this.pending;
    if (p && p.id === id) {
      if (!this.room.member(id)?.online) this.armTimer(8000);
      else if (this.room.settings.timer > 0) this.armTimer(this.room.settings.timer * 1000);
    }
    if (this.phase === 'betting') this.checkBets();
  }
  left(id) {
    const p = this.players.find(x => x.id === id);
    if (p) { p.gone = true; p.hands.forEach(h => { h.done = true; }); }
    if (this.pending && this.pending.id === id) this.pending.res({ type: 'stand' });
    if (this.phase === 'betting') { this.players = this.players.filter(x => x.id !== id); this.checkBets(); }
  }
  act(id, a) {
    const m = this.room.member(id);
    if (!m) return;
    if (this.phase === 'betting' && a.type === 'bet') {
      let p = this.players.find(x => x.id === id);
      if (!p) { p = { id, m, bet: 0, ready: false, hands: [] }; this.players.push(p); }
      if (p.ready) return;
      const amt = Math.round(+a.amount || 0);
      if (amt < this.minBet || amt > m.chips) return;
      m.chips -= amt; p.bet = amt; p.ready = true;
      this.update();
      this.checkBets();
    } else if (this.phase === 'betting' && a.type === 'sitout') {
      let p = this.players.find(x => x.id === id);
      if (!p) { p = { id, m, bet: 0, ready: false, hands: [] }; this.players.push(p); }
      if (!p.ready) { p.sitout = true; this.update(); this.checkBets(); }
    } else if (this.pending && this.pending.id === id && ['hit', 'stand', 'double', 'split'].includes(a.type)) {
      this.pending.res({ type: a.type });
    }
  }
  checkBets() {
    const waitingOn = this.room.members.filter(m => !m.bot && m.online && m.chips >= this.minBet)
      .filter(m => { const p = this.players.find(x => x.id === m.id); return !p || (!p.ready && !p.sitout); });
    if (!waitingOn.length && this.players.some(p => p.ready) && this.betWaiter) this.betWaiter();
  }
  armTimer(ms) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.timerSeq = (this.timerSeq || 0) + 1; this.timerTotal = ms;
    this.turnUntil = Date.now() + ms;
    p.timer = setTimeout(() => p.res({ type: 'stand', auto: true }), ms);
    this.update();
  }

  /* ---------- round loop ---------- */
  async loop() {
    const g = this.gen;
    try {
      await this.wait(g, 600);
      while (g === this.gen) {
        if (this.paused) { this.phase = 'paused'; this.msg = 'Paused by the host.'; this.update(); await this.wait(g, 1000); continue; }
        await this.round(g);
      }
    } catch (e) { if (e !== ABORT_MP) { console.error(e); this.msg = 'Something went wrong — the host can go back to the lobby and restart.'; this.update(); } }
  }

  async round(g) {
    const R = this.room;
    this.dealer = []; this.players = []; this.turn = null; this.hideHole = true; this.nextAt = null;
    const eligible = R.members.filter(m => !m.bot && m.online && m.chips >= this.minBet);
    if (!eligible.length) {
      this.phase = 'waiting';
      this.msg = `Waiting for players with at least ${Store.fmt(this.minBet)} — the host can top up chips.`;
      this.update();
      return this.wait(g, 1500);
    }
    // betting
    this.phase = 'betting';
    this.msg = 'Place your bets!';
    const secs = R.settings.timer > 0 ? Math.max(R.settings.timer, 15) : 45;
    this.betUntil = Date.now() + secs * 1000;
    this.update();
    await new Promise(res => {
      const t = setTimeout(res, secs * 1000);
      this.betWaiter = () => { clearTimeout(t); res(); };
    });
    this.betWaiter = null; this.betUntil = null;
    this.check(g);
    this.players = this.players.filter(p => p.ready && !p.gone);
    if (!this.players.length) { this.msg = 'No bets this round.'; this.phase = 'waiting'; this.update(); return this.wait(g, 1500); }
    this.roundNo++;

    // deal
    this.phase = 'dealing';
    this.msg = 'Dealing…';
    this.players.forEach(p => { p.hands = [{ cards: [], bet: p.bet, done: false, split: false }]; });
    for (let r = 0; r < 2; r++) {
      for (const p of this.players) { p.hands[0].cards.push(this.draw()); this.update(); await this.wait(g, 250); }
      this.dealer.push(this.draw()); this.update(); await this.wait(g, 250);
    }
    const T = BlackjackEngine.total;
    const dealerBJ = T(this.dealer).t === 21;
    if (dealerBJ) {
      this.hideHole = false;
      this.msg = 'Dealer has Blackjack!';
      this.update();
      await this.wait(g, 900);
    } else {
      // players' turns
      this.phase = 'play';
      for (const p of this.players) {
        for (let i = 0; i < p.hands.length; i++) {
          const h = p.hands[i];
          for (;;) {
            if (p.gone) { h.done = true; break; }
            if (h.cards.length === 1) { h.cards.push(this.draw()); this.update(); await this.wait(g, 300); }
            if (h.aceSplit || T(h.cards).t >= 21) { h.done = true; break; }
            const a = await this.decision(g, p, i);
            if (a.type === 'stand') { h.done = true; if (a.auto) this.msg = `${p.m.name} ran out of time and stands.`; break; }
            if (a.type === 'hit') { h.cards.push(this.draw()); this.msg = `${p.m.name} hits.`; }
            else if (a.type === 'double' && h.cards.length === 2 && p.m.chips >= h.bet) {
              p.m.chips -= h.bet; h.bet *= 2; h.cards.push(this.draw()); h.done = true; this.msg = `${p.m.name} doubles down.`;
              this.update(); await this.wait(g, 500); break;
            } else if (a.type === 'split' && this.canSplit(p, h)) {
              p.m.chips -= h.bet;
              const second = { cards: [h.cards.pop()], bet: h.bet, done: false, split: true, aceSplit: h.cards[0].r === 1 };
              h.split = true; h.aceSplit = second.aceSplit;
              p.hands.splice(i + 1, 0, second);
              h.cards.push(this.draw());
              this.msg = `${p.m.name} splits.`;
            }
            this.update();
            await this.wait(g, 250);
          }
          this.update();
        }
      }
      // dealer
      this.turn = null; this.turnUntil = null;
      this.phase = 'dealer';
      this.hideHole = false;
      this.msg = 'Dealer’s turn.';
      this.update();
      await this.wait(g, 700);
      const needed = this.players.some(p => p.hands.some(h => T(h.cards).t <= 21 && !BlackjackEngine.isBJ(h)));
      while (needed && T(this.dealer).t < 17) { this.dealer.push(this.draw()); this.update(); await this.wait(g, 650); }
    }
    this.settle();
    this.nextAt = Date.now() + 6000;
    this.update();
    await this.wait(g, 6000);
  }

  canSplit(p, h) {
    const v = BlackjackEngine.val;
    return h.cards.length === 2 && v(h.cards[0]) === v(h.cards[1]) && p.hands.length < 4 && p.m.chips >= h.bet;
  }

  async decision(g, p, i) {
    this.turn = { id: p.id, hand: i }; this.turnKey++;
    const a = await new Promise(res => {
      this.pending = { id: p.id, res, timer: null };
      const secs = this.room.settings.timer;
      if (!this.room.member(p.id)?.online) this.armTimer(8000);
      else if (secs > 0) this.armTimer(secs * 1000);
      else { this.turnUntil = null; this.update(); }
    });
    clearTimeout(this.pending?.timer);
    this.pending = null; this.turnUntil = null;
    this.check(g);
    return a;
  }

  settle() {
    const T = BlackjackEngine.total, d = T(this.dealer).t, dBJ = this.dealer.length === 2 && d === 21;
    const lines = [];
    for (const p of this.players) {
      let net = 0;
      for (const h of p.hands) {
        const t = T(h.cards).t;
        let ret = 0;
        if (BlackjackEngine.isBJ(h)) { if (dBJ) { ret = h.bet; h.result = 'Push'; } else { ret = Math.floor(h.bet * 2.5); h.result = 'Blackjack!'; } }
        else if (t > 21) h.result = 'Bust';
        else if (dBJ) h.result = 'Lose';
        else if (d > 21 || t > d) { ret = h.bet * 2; h.result = 'Win'; }
        else if (t === d) { ret = h.bet; h.result = 'Push'; }
        else h.result = 'Lose';
        h.net = ret - h.bet;
        net += h.net;
        if (ret && !p.gone) p.m.chips += ret;
      }
      p.net = net;
      if (net) lines.push(`${p.m.name} ${net > 0 ? '+' : '−'}${Store.fmt(Math.abs(net))}`);
    }
    this.phase = 'over';
    this.msg = (d > 21 ? 'Dealer busts! ' : `Dealer has ${d}. `) + (lines.join(' · ') || 'All pushes.');
  }

  /* ---------- per-player view ---------- */
  view(id) {
    const now = Date.now(), T = BlackjackEngine.total;
    const showDealer = !this.hideHole;
    const dealerCards = this.dealer.map((c, i) => (i === 1 && !showDealer ? null : c));
    const vis = dealerCards.filter(Boolean);
    let you = null;
    if (this.pending && this.pending.id === id && this.turn) {
      const p = this.players.find(x => x.id === id), h = p.hands[this.turn.hand];
      you = { canDouble: h.cards.length === 2 && p.m.chips >= h.bet, canSplit: this.canSplit(p, h) };
    }
    const me = this.room.member(id);
    const mine = this.players.find(x => x.id === id);
    return {
      kind: 'blackjack', round: this.roundNo, phase: this.phase, msg: this.msg, minBet: this.minBet, paused: this.paused,
      dealer: { cards: dealerCards, total: vis.length ? T(vis).t : 0, hidden: !showDealer && this.dealer.length > 1 },
      turn: this.turn, turnKey: this.turnKey, timerSeq: this.timerSeq || 0, timerTotal: this.timerTotal || 0, turnRemaining: this.turnUntil ? Math.max(0, this.turnUntil - now) : null,
      betRemaining: this.betUntil ? Math.max(0, this.betUntil - now) : null,
      nextIn: this.nextAt ? Math.max(0, this.nextAt - now) : null,
      canBet: this.phase === 'betting' && me && !me.bot && me.chips >= this.minBet && !(mine && (mine.ready || mine.sitout)),
      players: this.room.members.filter(m => !m.bot).map(m => {
        const p = this.players.find(x => x.id === m.id);
        return {
          id: m.id, inRound: !!p && (p.ready || this.phase !== 'betting'), ready: !!p?.ready, sitout: !!p?.sitout, bet: p?.bet || 0, net: p?.net,
          hands: (p?.hands || []).map(h => ({ cards: h.cards, bet: h.bet, ...T(h.cards), result: h.result || '', net: h.net, done: h.done })),
        };
      }),
      you,
    };
  }
}
