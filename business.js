// Business — the Indian property-trading board game.
//   BizGame  : the rules engine (no DOM). Runs on this phone for "You vs computers", or on the room host for online play.
//   BizView  : draws the board from a game state for any player.
//   Business : the single-phone screen (you against computer players).
const BIZ = (() => {
  const SQ = [
    { type: 'start', name: 'Start', icon: '🏁' },
    { type: 'city', name: 'Agra', g: 0, price: 2000, icon: '🕌' },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'Shimla', g: 0, price: 2200, icon: '🏔️' },
    { type: 'tax', name: 'Income Tax', amt: 1000, icon: '🧾' },
    { type: 'transport', name: 'Railways', price: 9500, icon: '🚆' },
    { type: 'city', name: 'Jaipur', g: 1, price: 2800, icon: '🏰' },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Udaipur', g: 1, price: 3000, icon: '🛶' },
    { type: 'jail', name: 'Jail', icon: '🚔' },
    { type: 'city', name: 'Goa', g: 2, price: 3400, icon: '🏖️' },
    { type: 'utility', name: 'Electric Co.', price: 2500, icon: '💡' },
    { type: 'city', name: 'Kochi', g: 2, price: 3500, icon: '⛵' },
    { type: 'city', name: 'Darjeeling', g: 2, price: 3600, icon: '🍵' },
    { type: 'transport', name: 'Airways', price: 10500, icon: '✈️' },
    { type: 'city', name: 'Pune', g: 3, price: 4000, icon: '🎓' },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'Hyderabad', g: 3, price: 4200, icon: '🍛' },
    { type: 'club', name: 'Club', icon: '🥂' },
    { type: 'city', name: 'Ahmedabad', g: 4, price: 4600, icon: '🪁' },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Lucknow', g: 4, price: 4800, icon: '🍢' },
    { type: 'city', name: 'Kolkata', g: 4, price: 5200, icon: '🌉' },
    { type: 'transport', name: 'Waterways', price: 9000, icon: '🚢' },
    { type: 'city', name: 'Chennai', g: 5, price: 5600, icon: '🛕' },
    { type: 'city', name: 'Bengaluru', g: 5, price: 6000, icon: '💻' },
    { type: 'utility', name: 'Water Works', price: 2500, icon: '🚰' },
    { type: 'rest', name: 'Rest House', icon: '🏨' },
    { type: 'city', name: 'Chandigarh', g: 6, price: 6400, icon: '🌹' },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'New Delhi', g: 6, price: 7000, icon: '🏛️' },
    { type: 'transport', name: 'Roadways', price: 8000, icon: '🚌' },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Srinagar', g: 7, price: 8000, icon: '🚣' },
    { type: 'tax', name: 'Wealth Tax', amt: 1500, icon: '💰' },
    { type: 'city', name: 'Mumbai', g: 7, price: 8500, icon: '🎬' },
  ];
  const GROUPS = ['#8d5524', '#4fb3e0', '#d63384', '#f39c12', '#e74c3c', '#e6b800', '#27ae60', '#2747a8'];
  const PCOL = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];
  const SALARY = 1500, JAIL_FINE = 500, CLUB = 200, REST = 200;
  const CHANCE = [
    { t: 'Won a lottery prize', a: 2500 }, { t: 'Go to Jail!', jail: true }, { t: 'Advance to Start', to: 0 },
    { t: 'Take a trip to Mumbai', to: 35 }, { t: 'Pay school fees', a: -1500 }, { t: 'Speeding fine', a: -500 },
    { t: 'Go back 3 spaces', back: 3 }, { t: 'Property repairs: ₹250 per house, ₹1,000 per hotel', repairs: [250, 1000] },
    { t: 'Best employee award', a: 1000 }, { t: 'Board the Railways', to: 5 }, { t: 'Crossword competition prize', a: 1000 },
    { t: 'Traffic challan', a: -1000 },
  ];
  const CHEST = [
    { t: 'Bank error in your favour', a: 2000 }, { t: 'Diwali bonus', a: 1000 }, { t: 'Doctor’s fee', a: -500 },
    { t: 'It’s your birthday! Collect ₹200 from every player', each: 200 }, { t: 'Income tax refund', a: 500 },
    { t: 'Hospital bill', a: -1000 }, { t: 'Sold shares at a profit', a: 1500 }, { t: 'Wedding gift', a: 1000 },
    { t: 'Go to Jail!', jail: true }, { t: 'Insurance premium', a: -750 }, { t: 'Inheritance from a relative', a: 2000 },
    { t: 'Advance to Start', to: 0 },
  ];
  const rs = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const r50 = n => Math.round(n / 50) * 50;
  const isProp = i => ['city', 'transport', 'utility'].includes(SQ[i].type);
  const houseCost = i => Math.round(SQ[i].price * 0.5 / 100) * 100;
  const groupOf = g => SQ.map((s, i) => (s.g === g && s.type === 'city' ? i : -1)).filter(i => i >= 0);
  const unmortgageCost = i => Math.round(SQ[i].price * 0.55);
  // taking over a mortgaged property: the new owner pays the bank 10% of the mortgage value straight away
  const tradeInterest = i => Math.round(SQ[i].price * 0.05);
  // rules that only need the state (shared by engine and view)
  const R = {
    owns: (st, pi, i) => !!st.own[i] && st.own[i].o === pi,
    ownsGroup: (st, pi, g) => groupOf(g).every(i => R.owns(st, pi, i)),
    ownedBy: (st, pi) => Object.keys(st.own).map(Number).filter(i => st.own[i].o === pi),
    countType: (st, pi, type) => R.ownedBy(st, pi).filter(i => SQ[i].type === type && !st.own[i].m).length,
    canBuild(st, pi, i) {
      const s = SQ[i], o = st.own[i];
      if (s.type !== 'city' || !o || o.o !== pi || o.h >= 4 || !R.ownsGroup(st, pi, s.g)) return false;
      const grp = groupOf(s.g);
      if (grp.some(j => st.own[j].m)) return false;
      return o.h <= Math.min(...grp.map(j => st.own[j].h));
    },
    canSell(st, pi, i) {
      const s = SQ[i], o = st.own[i];
      if (s.type !== 'city' || !o || o.o !== pi || o.h === 0) return false;
      return o.h >= Math.max(...groupOf(s.g).map(j => st.own[j].h));
    },
    canMortgage: (st, pi, i) => R.owns(st, pi, i) && !st.own[i].m && (SQ[i].type !== 'city' || groupOf(SQ[i].g).every(j => !st.own[j] || st.own[j].h === 0)),
    // only bare property can change hands: every city of the colour must be free of houses/hotels
    tradable: (st, pi, i) => R.owns(st, pi, i) && (SQ[i].type !== 'city' || groupOf(SQ[i].g).every(j => !st.own[j] || st.own[j].h === 0)),
    // t = { from, to, give: { p: [squares], c: cash }, want: { p: [squares], c: cash } } — returns '' when the swap is allowed
    tradeError(st, t) {
      const A = st.players[t.from], B = st.players[t.to];
      if (!A || !B || t.from === t.to || A.out || B.out) return 'Pick another player';
      if (!t.give.p.length && !t.want.p.length && !t.give.c && !t.want.c) return 'Add something to the trade';
      if (!t.give.p.length && !t.give.c) return 'You must offer something';
      if (t.give.p.some(i => !R.tradable(st, t.from, i)) || t.want.p.some(i => !R.tradable(st, t.to, i))) return 'Houses and hotels must be sold before a property is traded';
      if (t.give.c > A.cash || t.want.c > B.cash) return 'Not enough cash';
      const fee = l => l.reduce((n, i) => n + (st.own[i].m ? tradeInterest(i) : 0), 0);
      if (B.cash - t.want.c + t.give.c < fee(t.give.p) || A.cash - t.give.c + t.want.c < fee(t.want.p)) return 'Not enough cash for the mortgage interest';
      return '';
    },
    worth: (st, pi) => st.players[pi].cash + R.ownedBy(st, pi).reduce((t, i) => t + (st.own[i].m ? SQ[i].price / 2 : SQ[i].price) + (st.own[i].h || 0) * houseCost(i), 0),
    rentFor(st, i, diceTotal) {
      const s = SQ[i], o = st.own[i];
      if (!o || o.m) return 0;
      if (s.type === 'city') {
        const base = r50(s.price * 0.08);
        if (o.h === 0) return R.ownsGroup(st, o.o, s.g) ? base * 2 : base;
        return base * [0, 4, 10, 22, 30][o.h];
      }
      if (s.type === 'transport') return [0, 1000, 1800, 3000, 5000][R.countType(st, o.o, 'transport')];
      return diceTotal * (R.countType(st, o.o, 'utility') === 2 ? 250 : 100);
    },
  };
  return { SQ, GROUPS, PCOL, SALARY, JAIL_FINE, CLUB, REST, CHANCE, CHEST, rs, r50, isProp, houseCost, groupOf, unmortgageCost, tradeInterest, R };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), decide(pi, phase) → Promise<'roll'|'buy'|'skip'|'end'>, fx(name, pi) }
class BizGame {
  constructor({ players, cash, rounds }, io) {
    this.io = io; this.gen = 0;
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    this.st = {
      players: players.map((p, i) => ({ id: p.id || 'p' + i, name: p.name, kind: p.kind, color: BIZ.PCOL[i], cash, pos: 0, skip: 0, out: false, dbl: 0, rank: 0 })),
      own: {}, turn: 0, round: 1, rounds, dice: [3, 4], rolling: false, msg: 'Roll the dice to start', log: [],
      chance: shuffle([...BIZ.CHANCE.keys()]), chest: shuffle([...BIZ.CHEST.keys()]), over: false, phase: 'roll', card: null, stamp: null, seq: 0, offer: null,
    };
  }
  static restore(st, io) { const g = Object.create(BizGame.prototype); g.io = io; g.gen = 0; g.st = st; st.rolling = false; st.card = null; st.stamp = null; st.offer = null; return g; }

  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(BizGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  log(text) { const st = this.st; st.msg = text; st.log.unshift(text); st.log.length = Math.min(st.log.length, 8); }
  stop() { this.gen++; }

  /* money */
  raise(pi, need) {
    const st = this.st, p = st.players[pi], R = BIZ.R;
    for (let guard = 0; p.cash < need && guard < 200; guard++) {
      const sellable = R.ownedBy(st, pi).filter(i => R.canSell(st, pi, i)).sort((a, b) => BIZ.houseCost(a) - BIZ.houseCost(b));
      if (sellable.length) { const i = sellable[0]; st.own[i].h--; p.cash += BIZ.houseCost(i) / 2; this.log(`${p.name} sold a house in ${BIZ.SQ[i].name}`); continue; }
      const mort = R.ownedBy(st, pi).filter(i => R.canMortgage(st, pi, i)).sort((a, b) => BIZ.SQ[a].price - BIZ.SQ[b].price);
      if (mort.length) { const i = mort[0]; st.own[i].m = true; p.cash += BIZ.SQ[i].price / 2; this.log(`${p.name} mortgaged ${BIZ.SQ[i].name}`); continue; }
      break;
    }
    return p.cash >= need;
  }
  pay(pi, to, amt) {
    const st = this.st, p = st.players[pi];
    if (amt <= 0 || p.out) return true;
    if (p.cash < amt && !this.raise(pi, amt)) { this.bankrupt(pi, to); return false; }
    p.cash -= amt;
    if (to >= 0) st.players[to].cash += amt;
    this.io.fx('chip');
    return true;
  }
  bankrupt(pi, to) {
    const st = this.st, p = st.players[pi];
    if (to >= 0) st.players[to].cash += Math.max(0, p.cash);
    BIZ.R.ownedBy(st, pi).forEach(i => { if (to >= 0) st.own[i] = { o: to, h: 0, m: st.own[i].m }; else delete st.own[i]; });
    st.offer = null; p.cash = 0; p.out = true; p.rank = st.players.filter(q => !q.out).length + 1;
    this.log(`${p.name} is bankrupt!`);
    this.io.fx('lose', pi);
  }
  forfeit(pi) {   // a player left the room
    const p = this.st.players[pi];
    if (!p || p.out) return;
    this.bankrupt(pi, -1); this.st.offer = null;
    this.log(`${p.name} left the game`);
    if (this.active().length <= 1 && !this.st.over) { this.finish('Last player standing'); this.stop(); return; }
    this.up();
  }

  /* turn loop */
  active() { return this.st.players.filter(p => !p.out); }
  async run() {
    try { await this.loop(); } catch (e) { if (e !== BizGame.ABORT) console.error(e); }
  }
  async loop() {
    const st = this.st;
    while (!st.over) {
      const pi = st.turn, p = st.players[pi];
      if (p.out) { this.next(); continue; }
      if (p.skip > 0) { p.skip--; this.log(`${p.name} is in jail and misses this turn`); this.up(); await this.sleep(1200); this.next(); continue; }
      st.card = null;
      if (p.kind === 'cpu') { st.phase = 'cpu'; st.msg = `${p.name} is rolling…`; this.up(); await this.sleep(750); }
      else { st.msg = `${p.name}: roll the dice`; await this.decide(pi, 'roll'); }
      const d = await this.roll();
      const doubles = d[0] === d[1];
      if (doubles && ++p.dbl === 3) { this.log(`${p.name} rolled doubles three times — off to jail!`); await this.toJail(pi); this.next(); continue; }
      await this.move(pi, d[0] + d[1]);
      await this.land(pi, d[0] + d[1], 0);
      if (this.checkOver()) return;
      if (p.out) { this.next(); continue; }
      const again = doubles && !p.skip;
      if (p.kind === 'cpu') { this.cpuManage(pi); this.up(); await this.sleep(500); }
      else await this.decide(pi, again ? 'again' : 'end');
      if (again && !p.out && !st.over) { this.log(`${p.name} rolled doubles — roll again!`); continue; }
      this.next();
    }
  }
  async decide(pi, phase) {
    this.st.phase = phase; this.up();
    const g = this.gen; const a = await this.io.decide(pi, phase);
    if (g !== this.gen) throw BizGame.ABORT;
    return a;
  }
  next() {
    const st = this.st, n0 = st.turn;
    st.players[n0].dbl = 0; st.offer = null;
    let n = n0;
    do { n = (n + 1) % st.players.length; } while (st.players[n].out && n !== n0);
    if (n <= n0) { st.round++; if (st.rounds && st.round > st.rounds) return this.finish('Round limit reached'); }
    st.turn = n; this.up();
  }
  checkOver() { if (this.active().length <= 1) { this.finish('Last player standing'); return true; } return false; }
  finish(why) {
    const st = this.st;
    const order = st.players.map((p, i) => ({ p, i, w: p.out ? -1 : BIZ.R.worth(st, i) }))
      .sort((a, b) => (b.p.out ? 0 : 1) - (a.p.out ? 0 : 1) || b.w - a.w || a.p.rank - b.p.rank);
    order.forEach((o, k) => { o.p.rank = k + 1; o.p.finalWorth = Math.max(0, o.w); });
    st.over = true; st.phase = 'over'; st.why = why;
    this.log(`${order[0].p.name} wins! (${why})`);
    this.io.fx('winner', order[0].i);
    this.up();
  }
  async roll() {
    const st = this.st;
    st.rolling = true; st.phase = 'rolling'; this.io.fx('dice'); this.up();
    await this.sleep(650);
    st.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    st.rolling = false; this.up();
    await this.sleep(300);
    return st.dice;
  }
  async move(pi, steps) {
    const st = this.st, p = st.players[pi];
    for (let k = 0; k < steps; k++) {
      p.pos = (p.pos + 1) % BIZ.SQ.length;
      if (p.pos === 0) { p.cash += BIZ.SALARY; this.log(`${p.name} passed Start and collected ${BIZ.rs(BIZ.SALARY)}`); this.io.fx('chips'); }
      this.io.fx('hop'); this.up(); await this.sleep(150);
    }
  }
  async toJail(pi) {
    const p = this.st.players[pi];
    p.pos = 9; p.skip = 1; p.dbl = 0;
    this.pay(pi, -1, BIZ.JAIL_FINE);
    this.log(`${p.name} goes to jail: ${BIZ.rs(BIZ.JAIL_FINE)} fine and misses a turn`);
    this.io.fx('jail', pi); this.up(); await this.sleep(1000);
  }
  async land(pi, diceTotal, depth) {
    const st = this.st, p = st.players[pi], i = p.pos, s = BIZ.SQ[i], rs = BIZ.rs;
    if (BIZ.isProp(i)) {
      const o = st.own[i];
      if (!o) {
        if (p.cash < s.price) { this.log(`${p.name} can’t afford ${s.name} (${rs(s.price)})`); this.up(); await this.sleep(800); return; }
        let buy;
        if (p.kind === 'cpu') { buy = this.cpuWantsToBuy(pi, i); await this.sleep(500); }
        else { st.msg = `${s.name} is for sale: ${rs(s.price)}`; buy = (await this.decide(pi, 'buy')) === 'buy'; }
        if (buy && p.cash >= s.price) {
          p.cash -= s.price; st.own[i] = { o: pi, h: 0, m: false };
          this.log(`${p.name} bought ${s.name} for ${rs(s.price)}`);
          st.stamp = { i, text: 'SOLD', color: p.color };
          this.io.fx('chips'); this.up(); await this.sleep(900);
        } else this.log(`${p.name} passed on ${s.name}`);
      } else if (o.o !== pi) {
        const rent = BIZ.R.rentFor(st, i, diceTotal), owner = st.players[o.o];
        if (o.m) this.log(`${s.name} is mortgaged — no rent`);
        else if (rent > 0 && this.pay(pi, o.o, rent)) { this.log(`${p.name} paid ${rs(rent)} rent to ${owner.name}`); st.stamp = { i, text: '−' + rs(rent), color: '#e53935' }; }
      } else this.log(`${p.name} is visiting their own ${s.name}`);
      st.phase = 'landed'; this.up(); await this.sleep(850); st.stamp = null; return;
    }
    switch (s.type) {
      case 'tax': if (this.pay(pi, -1, s.amt)) this.log(`${p.name} paid ${s.name}: ${rs(s.amt)}`); break;
      case 'jail': await this.toJail(pi); return;
      case 'club': {
        this.log(`Club party! ${p.name} pays ${rs(BIZ.CLUB)} to every player`);
        for (let qi = 0; qi < st.players.length; qi++) if (qi !== pi && !st.players[qi].out && !this.pay(pi, qi, BIZ.CLUB)) break;
        break;
      }
      case 'rest':
        this.log(`Rest House: every player pays ${p.name} ${rs(BIZ.REST)}`);
        st.players.forEach((q, qi) => { if (qi !== pi && !q.out) this.pay(qi, pi, BIZ.REST); });
        break;
      case 'chance': case 'chest': {
        const deck = s.type === 'chance' ? BIZ.CHANCE : BIZ.CHEST;
        const idx = st[s.type].shift(); st[s.type].push(idx);
        const c = deck[idx];
        this.log(`${s.type === 'chance' ? 'Chance' : 'Community Chest'}: ${c.t}`);
        st.card = { kind: s.type, text: c.t };
        this.io.fx('card'); this.up(); await this.sleep(p.kind === 'cpu' ? 1500 : 2000);
        st.card = null;
        if (c.a > 0) { p.cash += c.a; this.io.fx('chips'); }
        else if (c.a < 0) this.pay(pi, -1, -c.a);
        else if (c.each) st.players.forEach((q, qi) => { if (qi !== pi && !q.out) this.pay(qi, pi, c.each); });
        else if (c.repairs) { const cost = BIZ.R.ownedBy(st, pi).reduce((t, j) => t + (st.own[j].h === 4 ? c.repairs[1] : (st.own[j].h || 0) * c.repairs[0]), 0); if (cost) this.pay(pi, -1, cost); }
        else if (c.jail) { await this.toJail(pi); return; }
        else if (c.to !== undefined) { await this.move(pi, (c.to - p.pos + BIZ.SQ.length) % BIZ.SQ.length); if (depth < 2) return this.land(pi, diceTotal, depth + 1); }
        else if (c.back) { p.pos = (p.pos - c.back + BIZ.SQ.length) % BIZ.SQ.length; this.up(); await this.sleep(450); if (depth < 2) return this.land(pi, diceTotal, depth + 1); }
        break;
      }
    }
    st.phase = 'landed'; this.up(); await this.sleep(650);
  }

  /* computer players (also used to play for a person whose time runs out) */
  cpuWantsToBuy(pi, i) {
    const st = this.st, p = st.players[pi], s = BIZ.SQ[i], after = p.cash - s.price;
    const completes = s.type === 'city' && BIZ.groupOf(s.g).every(j => j === i || BIZ.R.owns(st, pi, j));
    const blocks = s.type === 'city' && BIZ.groupOf(s.g).some(j => st.own[j] && st.own[j].o !== pi);
    return after >= (completes ? 500 : blocks ? 4000 : 2500);
  }
  cpuManage(pi) {
    const st = this.st, p = st.players[pi], R = BIZ.R;
    R.ownedBy(st, pi).filter(i => st.own[i].m).forEach(i => { const c = BIZ.unmortgageCost(i); if (p.cash - c > 8000) { p.cash -= c; st.own[i].m = false; this.log(`${p.name} paid off the mortgage on ${BIZ.SQ[i].name}`); } });
    for (let guard = 0; guard < 20; guard++) {
      const i = R.ownedBy(st, pi).filter(j => R.canBuild(st, pi, j)).sort((a, b) => BIZ.SQ[b].price - BIZ.SQ[a].price).find(j => p.cash - BIZ.houseCost(j) > 3000);
      if (i === undefined) break;
      p.cash -= BIZ.houseCost(i); st.own[i].h++;
      this.log(`${p.name} built ${st.own[i].h === 4 ? 'a hotel' : 'a house'} in ${BIZ.SQ[i].name}`);
    }
  }
  /* trading between players: on your own turn, bare property (no houses/hotels) and cash, by agreement */
  canTrade(pi) { const st = this.st; return !st.over && st.turn === pi && !st.offer && ['roll', 'end', 'again'].includes(st.phase); }
  cleanTrade(pi, to, give, want) {
    const ids = l => [...new Set((Array.isArray(l) ? l : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < BIZ.SQ.length))];
    const cash = c => Math.max(0, Math.floor(+c || 0));
    return { from: pi, to: Number(to), give: { p: ids(give && give.p), c: cash(give && give.c) }, want: { p: ids(want && want.p), c: cash(want && want.c) } };
  }
  describe(side) {
    const l = side.p.map(i => BIZ.SQ[i].name); if (side.c) l.push(BIZ.rs(side.c));
    return l.join(', ') || 'nothing';
  }
  // returns '' when the offer was made (or a computer answered it), otherwise the reason it can't be made
  propose(pi, to, give, want) {
    const st = this.st, t = this.cleanTrade(pi, to, give, want);
    if (!this.canTrade(pi)) return 'You can only trade on your own turn';
    const err = BIZ.R.tradeError(st, t); if (err) return err;
    const me = st.players[pi], other = st.players[t.to];
    this.log(`${me.name} offers ${other.name.replace(' 🤖', '')}: ${this.describe(t.give)} for ${this.describe(t.want)}`);
    if (other.kind === 'cpu') {
      if (this.cpuAccepts(t)) this.doTrade(t);
      else this.log(`${other.name} declined the trade`);
    } else st.offer = t;
    this.up();
    return '';
  }
  answer(pi, accept) {
    const st = this.st, t = st.offer;
    if (!t || t.to !== pi) return false;
    st.offer = null;
    if (accept && !BIZ.R.tradeError(st, t)) this.doTrade(t);
    else this.log(`${st.players[pi].name} declined the trade`);
    this.up();
    return true;
  }
  cancelOffer(pi) {
    const st = this.st;
    if (!st.offer || st.offer.from !== pi) return false;
    st.offer = null; this.log(`${st.players[pi].name} withdrew the offer`); this.up();
    return true;
  }
  doTrade(t) {
    const st = this.st, A = st.players[t.from], B = st.players[t.to], fee = BIZ.tradeInterest;
    t.give.p.forEach(i => { st.own[i].o = t.to; if (st.own[i].m) B.cash -= fee(i); });
    t.want.p.forEach(i => { st.own[i].o = t.from; if (st.own[i].m) A.cash -= fee(i); });
    A.cash += t.want.c - t.give.c; B.cash += t.give.c - t.want.c;
    this.log(`${A.name} traded ${this.describe(t.give)} to ${B.name} for ${this.describe(t.want)}`);
    this.io.fx('chips');
  }
  // how much a property is worth to this player (price, plus what it does for their colour sets)
  tradeValue(pi, i, also = []) {
    const st = this.st, s = BIZ.SQ[i], o = st.own[i], R = BIZ.R;
    let v = o && o.m ? s.price * 0.5 - BIZ.tradeInterest(i) : s.price;
    if (s.type === 'city') {
      const grp = BIZ.groupOf(s.g), mine = grp.filter(j => j !== i && (R.owns(st, pi, j) || also.includes(j))).length;
      if (mine === grp.length - 1) v += s.price * 1.5;                 // completes a set
      else if (mine > 0) v += s.price * 0.25 * mine;
    } else v += s.price * 0.15 * R.ownedBy(st, pi).filter(j => BIZ.SQ[j].type === s.type).length;
    return v;
  }
  cpuAccepts(t) {
    const st = this.st, pi = t.to, p = st.players[pi], R = BIZ.R;
    // value of the deal for the computer: what it gets minus what it gives up
    const getV = t.give.p.reduce((n, i) => n + this.tradeValue(pi, i, t.give.p), 0) + t.give.c;
    let giveV = t.want.c;
    for (const i of t.want.p) {
      const s = BIZ.SQ[i]; let v = this.tradeValue(pi, i);
      if (s.type === 'city') {
        const grp = BIZ.groupOf(s.g);
        if (R.ownsGroup(st, pi, s.g)) v += s.price * 2;                 // breaking up its own set
        const theirs = grp.filter(j => j !== i && (R.owns(st, t.from, j) || t.give.p.includes(j))).length;
        if (theirs === grp.length - 1) v += s.price * 2.5;              // handing the other side a full set
      }
      giveV += v;
    }
    if (p.cash - t.want.c + t.give.c < 1500) return false;
    return getV >= giveV * 1.15 && getV > 0;
  }

  // building / selling / mortgaging by a person — only on their own turn, after landing
  manage(pi, action, i) {
    const st = this.st, p = st.players[pi], o = st.own[i], R = BIZ.R, SQ = BIZ.SQ;
    if (st.turn !== pi || !['end', 'again'].includes(st.phase) || !o) return false;
    if (action === 'build' && R.canBuild(st, pi, i) && p.cash >= BIZ.houseCost(i)) { p.cash -= BIZ.houseCost(i); o.h++; this.log(`${p.name} built ${o.h === 4 ? 'a hotel' : 'a house'} in ${SQ[i].name}`); this.io.fx('chips'); }
    else if (action === 'sell' && R.canSell(st, pi, i)) { o.h--; p.cash += BIZ.houseCost(i) / 2; this.log(`${p.name} sold a house in ${SQ[i].name}`); }
    else if (action === 'mortgage' && R.canMortgage(st, pi, i)) { o.m = true; p.cash += SQ[i].price / 2; this.log(`${p.name} mortgaged ${SQ[i].name} for ${BIZ.rs(SQ[i].price / 2)}`); }
    else if (action === 'unmortgage' && o.o === pi && o.m && p.cash >= BIZ.unmortgageCost(i)) { p.cash -= BIZ.unmortgageCost(i); o.m = false; this.log(`${p.name} paid off the mortgage on ${SQ[i].name}`); }
    else return false;
    this.up();
    return true;
  }
}
BizGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View                                                                                   */
/* ======================================================================================= */
const BizView = (() => {
  const { SQ, GROUPS, rs, R } = BIZ;
  const esc = s => UI.esc(s);
  const short = n => '₹' + (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : n);
  function cellRC(i) { if (i <= 9) return [9, 9 - i]; if (i <= 18) return [9 - (i - 9), 0]; if (i <= 27) return [0, i - 18]; return [i - 27, 9]; }
  const side = i => (i % 9 === 0 ? 'corner' : i < 9 ? 'bottom' : i < 18 ? 'left' : i < 27 ? 'top' : 'right');

  function cellHTML(st, i) {
    const s = SQ[i], [r, c] = cellRC(i), o = st.own[i];
    const pawns = st.players.map(p => (!p.out && p.pos === i ? `<i class="pawn" style="--pc:${p.color}"></i>` : '')).join('');
    const houses = o && o.h ? `<span class="houses">${o.h === 4 ? '<em class="hotel"></em>' : '<em></em>'.repeat(o.h)}</span>` : '';
    const owner = o ? `<span class="flag${o.m ? ' mort' : ''}"></span>` : '';
    const here = !st.over && st.players[st.turn] && st.players[st.turn].pos === i;
    const stamp = st.stamp && st.stamp.i === i ? `<span class="stamp" style="--sc:${st.stamp.color}">${esc(st.stamp.text)}</span>` : '';
    const label = s.type === 'chest' ? 'Chest' : s.name;
    const vars = [s.type === 'city' ? `--gc:${GROUPS[s.g]}` : '', o ? `--oc:${st.players[o.o].color}` : ''].filter(Boolean).join(';');
    return `<button class="bsq ${side(i)} t-${s.type}${here ? ' here' : ''}${o ? ' owned' : ''}" style="grid-area:${r + 1}/${c + 1};${vars}" data-sq="${i}" aria-label="${esc(s.name)}">
      ${s.type === 'city' ? '<span class="band"></span>' : ''}<span class="ic">${s.icon}</span><span class="nm">${esc(label)}</span>${s.price ? `<span class="pr">${short(s.price)}</span>` : ''}
      ${houses}${owner}<span class="pawns">${pawns}</span>${stamp}</button>`;
  }

  function infoHTML(st, i) {
    const s = SQ[i], o = st.own[i];
    let rows = '';
    if (s.type === 'city') {
      const base = BIZ.r50(s.price * 0.08);
      rows = `<tr><td>Rent</td><td>${rs(base)}</td></tr><tr><td>Full colour set</td><td>${rs(base * 2)}</td></tr>
        ${[1, 2, 3].map(h => `<tr><td>With ${h} house${h > 1 ? 's' : ''}</td><td>${rs(base * [0, 4, 10, 22][h])}</td></tr>`).join('')}
        <tr><td>With hotel</td><td>${rs(base * 30)}</td></tr><tr><td>Each house / hotel</td><td>${rs(BIZ.houseCost(i))}</td></tr>`;
    } else if (s.type === 'transport') rows = [1, 2, 3, 4].map(n => `<tr><td>Own ${n} transport</td><td>${rs([0, 1000, 1800, 3000, 5000][n])}</td></tr>`).join('');
    else if (s.type === 'utility') rows = '<tr><td>Own 1 utility</td><td>dice × ₹100</td></tr><tr><td>Own both</td><td>dice × ₹250</td></tr>';
    const desc = { start: `Collect ${rs(BIZ.SALARY)} every time you pass`, jail: `Pay ${rs(BIZ.JAIL_FINE)} and miss a turn`, club: `Pay ${rs(BIZ.CLUB)} to every player`, rest: `Every player pays you ${rs(BIZ.REST)}`, tax: `Pay ${rs(s.amt || 0)}`, chance: 'Draw a Chance card', chest: 'Draw a Community Chest card' }[s.type] || '';
    return `<div class="binfo">
      <div class="binfo-head" style="${s.type === 'city' ? `--gc:${GROUPS[s.g]}` : ''}"><span class="binfo-ic">${s.icon}</span>${esc(s.name)}</div>
      ${s.price ? `<div class="binfo-price">${rs(s.price)}${o ? ` · <b style="color:${st.players[o.o].color}">${esc(st.players[o.o].name)}</b>${o.m ? ' (mortgaged)' : ''}` : ' · for sale'}</div>` : ''}
      ${rows ? `<table>${rows}</table>` : `<p>${desc}</p>`}
    </div>`;
  }

  const SKYLINE = `<svg class="skyline" viewBox="0 0 400 90" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><g fill="currentColor">
    <rect x="0" y="52" width="20" height="38"/><rect x="22" y="40" width="15" height="50"/><rect x="39" y="58" width="18" height="32"/>
    <rect x="66" y="30" width="5" height="60"/><circle cx="68.5" cy="29" r="3.6"/><rect x="95" y="30" width="5" height="60"/><circle cx="97.5" cy="29" r="3.6"/>
    <path d="M70 50h26v40h-7V76a6 6 0 0 0-12 0v14h-7z"/>
    <rect x="112" y="64" width="22" height="26"/>
    <rect x="140" y="40" width="4" height="50"/><circle cx="142" cy="39" r="3"/><rect x="226" y="40" width="4" height="50"/><circle cx="228" cy="39" r="3"/>
    <path d="M150 90V62h70v28h-28V78a7 7 0 0 0-14 0v12z"/><path d="M165 62c0-15 9-21 20-28 11 7 20 13 20 28z"/><rect x="184" y="24" width="2" height="11"/>
    <path d="M246 90V48h44v42h-12V68a10 10 0 0 0-20 0v22z"/><rect x="242" y="43" width="52" height="6"/><rect x="262" y="37" width="12" height="6"/>
    <path d="M306 90V62l13-32 13 32v28z"/><path d="M315 32h8l-4-9z"/><rect x="300" y="72" width="38" height="18"/>
    <rect x="346" y="46" width="17" height="44"/><rect x="365" y="58" width="15" height="32"/><rect x="382" y="38" width="18" height="52"/>
  </g></svg>`;

  // opts: { me: player index or -1, info, manage, local, rollingFace, timer, footer }
  function centerHTML(st, opts) {
    const p = st.players[st.turn], me = opts.me, mine = me === st.turn && !st.over, ph = st.phase;
    if (st.offer && me >= 0 && !st.over && (st.offer.to === me || st.offer.from === me)) return offerHTML(st, me);
    if (opts.profile !== null && opts.profile !== undefined && st.players[opts.profile] && !st.over) return profileHTML(st, opts.profile, me);
    if (opts.trade && opts.trade.t && me >= 0) { if (canTradeNow(st, me)) return tradeHTML(st, me, opts.trade.t); opts.trade.t = null; }
    if (opts.manage && me >= 0) return manageHTML(st, me);
    if (opts.info !== null && opts.info !== undefined && !(mine && ph === 'buy')) return `<div class="bcenter-in">${infoHTML(st, opts.info)}<button class="b b-ghost" data-b="close">Close</button></div>`;
    if (st.over) {
      const order = [...st.players].sort((a, b) => a.rank - b.rank);
      return `<div class="bcenter-in"><div class="trophy">🏆</div><h3 class="bwin">${esc(order[0].name)} wins!</h3><small class="muted">${esc(st.why || '')}</small>
        <ol class="bres">${order.map(q => `<li><i class="pawn" style="--pc:${q.color}"></i>${esc(q.name)}<b>${q.out ? 'bankrupt' : rs(q.finalWorth || 0)}</b></li>`).join('')}</ol>
        ${opts.local ? '<div class="act-row"><button class="b b-ghost" data-b="menu">Setup</button><button class="b b-raise" data-b="again">Play again</button></div>' : ''}</div>`;
    }
    const decks = '<div class="deck chance"><span>?</span><small>CHANCE</small></div><div class="deck chest"><span>🎁</span><small>COMMUNITY<br>CHEST</small></div>';
    if (st.card) return `${decks}<div class="bcenter-in"><div class="bcard ${st.card.kind}"><small>${st.card.kind === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'}</small><div class="bcard-ic">${st.card.kind === 'chance' ? '❓' : '🎁'}</div><p>${esc(st.card.text)}</p></div></div>`;
    const dice = opts.rollingFace && st.rolling ? opts.rollingFace : st.dice;
    let actions = '';
    const tradeBtn = canTradeNow(st, me) ? '<button class="b b-ghost" data-b="trade">🤝 Trade</button>' : '';
    if (mine && ph === 'roll') actions = `<div class="act-row">${tradeBtn}<button class="b b-raise pulse" data-b="roll">🎲 Roll dice</button></div>`;
    else if (mine && ph === 'buy') actions = `<div class="act-row"><button class="b b-ghost" data-b="skip">Skip</button><button class="b b-call" data-b="buy">Buy ${rs(SQ[p.pos].price)}</button></div>`;
    else if (mine && (ph === 'end' || ph === 'again')) actions = `<div class="act-row"><button class="b b-ghost" data-b="manage">🏠 Build</button>${tradeBtn}<button class="b b-raise" data-b="end">${ph === 'again' ? '🎲 Roll again' : 'End turn'}</button></div>`;
    else actions = `<div class="bwait">${p.kind === 'cpu' ? '🤖 ' : '⏳ '}${esc(p.name.replace(' 🤖', ''))}${p.kind === 'cpu' ? ' is playing…' : '’s turn'}</div>`;
    return `${decks}<div class="bcenter-in">
      <div class="blogo">BUSINESS<small>The Great Indian Property Game</small></div>
      ${mine && ph === 'buy' ? infoHTML(st, p.pos) : `<div class="bdice${st.rolling ? ' rolling' : ''}">${dice.map(n => `<span class="ludo-die small" data-n="${n}">${'<i></i>'.repeat(n)}</span>`).join('')}</div>`}
      <div class="bmsg">${esc(st.msg)}</div>
      ${opts.timer || ''}${actions}
      ${st.rounds ? `<small class="muted">Round ${Math.min(st.round, st.rounds)} of ${st.rounds}</small>` : ''}
    </div>`;
  }

  function manageHTML(st, pi) {
    const p = st.players[pi], mine = R.ownedBy(st, pi).sort((a, b) => a - b), can = st.turn === pi && ['end', 'again'].includes(st.phase);
    return `<div class="bmanage"><div class="bm-head"><b>My properties</b><span>${rs(p.cash)}</span><button class="x" data-b="close" aria-label="Close">✕</button></div>
      ${!can ? '<p class="hint small">You can build, sell or mortgage after your roll, on your turn.</p>' : ''}
      ${mine.length ? mine.map(i => {
        const s = SQ[i], o = st.own[i];
        return `<div class="bm-row"><span class="bm-ic" style="${s.type === 'city' ? `--gc:${GROUPS[s.g]}` : ''}">${s.icon}</span>
          <span class="bm-name">${esc(s.name)}<small>${o.m ? 'mortgaged' : o.h === 4 ? '🏨 hotel' : o.h ? '🏠'.repeat(o.h) : s.type === 'city' && R.ownsGroup(st, pi, s.g) ? '★ full set' : ''}</small></span>
          ${can && R.canBuild(st, pi, i) ? `<button data-m="build:${i}" ${p.cash < BIZ.houseCost(i) ? 'disabled' : ''}>+ ${o.h === 3 ? 'Hotel' : 'House'} ${rs(BIZ.houseCost(i))}</button>` : ''}
          ${can && R.canSell(st, pi, i) ? `<button data-m="sell:${i}">Sell</button>` : ''}
          ${can ? (o.m ? `<button data-m="unmortgage:${i}" ${p.cash < BIZ.unmortgageCost(i) ? 'disabled' : ''}>Unmortgage ${rs(BIZ.unmortgageCost(i))}</button>`
            : R.canMortgage(st, pi, i) ? `<button data-m="mortgage:${i}">Mortgage +${rs(s.price / 2)}</button>` : '') : ''}
        </div>`;
      }).join('') : '<p class="muted">No property yet — land on a city and buy it!</p>'}
      <p class="hint small">Own every city of a colour to build houses evenly, then a hotel. Mortgaged property earns no rent.</p></div>`;
  }

  /* ---------- trading ---------- */
  const canTradeNow = (st, me) => me >= 0 && !st.over && st.turn === me && !st.offer && ['roll', 'end', 'again'].includes(st.phase)
    && st.players.some((q, i) => i !== me && !q.out);
  const STEP = 500;
  const propList = (st, pi, ids) => ids.map(i => `<span class="tp"><i class="gd" style="--gc:${SQ[i].type === 'city' ? GROUPS[SQ[i].g] : '#8893b8'}"></i>${esc(SQ[i].name)}${st.own[i] && st.own[i].m ? ' <small>(mortgaged)</small>' : ''}</span>`).join('');
  const sideHTML = (st, pi, side) => (side.p.length ? propList(st, pi, side.p) : '') + (side.c ? `<span class="tp cash">${rs(side.c)}</span>` : '') || '<span class="tp">nothing</span>';
  const fees = (st, side) => side.p.filter(i => st.own[i] && st.own[i].m).reduce((n, i) => n + BIZ.tradeInterest(i), 0);

  function offerHTML(st, me) {
    const t = st.offer, A = st.players[t.from], B = st.players[t.to], nm = q => esc(String(q.name).replace(' 🤖', ''));
    if (t.to === me) {
      const fee = fees(st, t.give);
      return `<div class="bmanage btrade"><div class="bm-head"><b>🤝 Trade offer</b></div>
        <p><b style="color:${A.color}">${nm(A)}</b> offers you:</p><div class="tside">${sideHTML(st, t.from, t.give)}</div>
        <p>in exchange for your:</p><div class="tside">${sideHTML(st, t.to, t.want)}</div>
        ${fee ? `<p class="hint small">Mortgaged property: you pay the bank ${rs(fee)} interest now, and can pay it off later for the mortgage plus 10%.</p>` : ''}
        ${BIZ.R.tradeError(st, t) ? `<p class="hint small">${esc(BIZ.R.tradeError(st, t))}</p>` : ''}
        <div class="act-row"><button class="b b-ghost" data-t="no">Decline</button><button class="b b-call" data-t="yes" ${BIZ.R.tradeError(st, t) ? 'disabled' : ''}>Accept</button></div></div>`;
    }
    return `<div class="bmanage btrade"><div class="bm-head"><b>🤝 Waiting for ${nm(B)}…</b></div>
      <p>You give:</p><div class="tside">${sideHTML(st, t.from, t.give)}</div><p>You get:</p><div class="tside">${sideHTML(st, t.to, t.want)}</div>
      <div class="act-row"><button class="b b-ghost" data-t="withdraw">Withdraw offer</button></div></div>`;
  }

  function tradeHTML(st, me, tr) {
    const others = st.players.map((q, i) => i).filter(i => i !== me && !st.players[i].out);
    if (!others.includes(tr.to)) tr.to = others[0];
    const A = st.players[me], B = st.players[tr.to];
    const draft = { from: me, to: tr.to, give: { p: tr.gp, c: tr.gc }, want: { p: tr.wp, c: tr.wc } };
    const err = BIZ.R.tradeError(st, draft);
    const rows = (pi, key, chosen) => {
      const mine = R.ownedBy(st, pi).sort((a, b) => a - b);
      return mine.length ? mine.map(i => {
        const s = SQ[i], o = st.own[i], ok = R.tradable(st, pi, i), on = chosen.includes(i);
        return `<button class="trow${on ? ' on' : ''}" data-t="${key}:${i}" ${ok ? '' : 'disabled'}>
          <i class="gd" style="--gc:${s.type === 'city' ? GROUPS[s.g] : '#8893b8'}"></i><span>${esc(s.name)}</span>
          <small>${rs(s.price)}${o.m ? ' · mortgaged' : ''}${!ok ? ' · has buildings' : ''}</small></button>`;
      }).join('') : '<p class="muted small">No property</p>';
    };
    const cash = (key, v, max) => `<span class="tcash"><button data-t="${key}:-1" ${v <= 0 ? 'disabled' : ''}>−</button><b>${rs(v)}</b><button data-t="${key}:1" ${v + STEP > max ? 'disabled' : ''}>+</button></span>`;
    return `<div class="bmanage btrade"><div class="bm-head"><b>🤝 Trade</b><button class="x" data-t="close" aria-label="Close">✕</button></div>
      <div class="tpick">${others.map(i => `<button class="${i === tr.to ? 'on' : ''}" data-t="to:${i}" style="--pc:${st.players[i].color}">${esc(String(st.players[i].name).replace(' 🤖', ''))}</button>`).join('')}</div>
      <div class="tcols">
        <div><h4>You give</h4>${rows(me, 'gp', tr.gp)}${cash('gc', tr.gc, A.cash)}</div>
        <div><h4>You get</h4>${rows(tr.to, 'wp', tr.wp)}${cash('wc', tr.wc, B.cash)}</div>
      </div>
      ${fees(st, draft.want) || fees(st, draft.give) ? `<p class="hint small">Mortgaged property costs its new owner ${rs(fees(st, draft.want))} + ${rs(fees(st, draft.give))} interest (10% of the mortgage).</p>` : ''}
      <p class="hint small">${err ? esc(err) : 'Both sides must agree. Only property without houses or hotels can be traded.'}</p>
      <div class="act-row"><button class="b b-ghost" data-t="close">Cancel</button><button class="b b-call" data-t="send" ${err ? 'disabled' : ''}>Send offer</button></div></div>`;
  }

  // shared click handling for the trade panels; returns { handled, act } (act = message for the engine)
  function tradeClick(ui, b, st, me) {
    const a = b.dataset.b, t = b.dataset.t;
    if (a === 'trade') { if (canTradeNow(st, me)) ui.t = { to: -1, gp: [], wp: [], gc: 0, wc: 0 }; return { handled: true }; }
    if (t === undefined) return { handled: false };
    const tr = ui.t, [k, v] = t.split(':');
    if (t === 'yes' || t === 'no') return { handled: true, act: { type: 'tradeReply', accept: t === 'yes' } };
    if (t === 'withdraw') return { handled: true, act: { type: 'tradeCancel' } };
    if (!tr) return { handled: true };
    const flip = (l, i) => (l.includes(i) ? l.splice(l.indexOf(i), 1) : l.push(i));
    if (t === 'close') ui.t = null;
    else if (k === 'to') { tr.to = +v; tr.wp = []; tr.wc = 0; }
    else if (k === 'gp') flip(tr.gp, +v);
    else if (k === 'wp') flip(tr.wp, +v);
    else if (k === 'gc') tr.gc = Math.max(0, Math.min(st.players[me].cash, tr.gc + +v * STEP));
    else if (k === 'wc') tr.wc = Math.max(0, Math.min(st.players[tr.to].cash, tr.wc + +v * STEP));
    else if (t === 'send') {
      const act = { type: 'trade', to: tr.to, give: { p: tr.gp, c: tr.gc }, want: { p: tr.wp, c: tr.wc } };
      ui.t = null; return { handled: true, act };
    }
    return { handled: true };
  }

  // everything about one player: money, position, standing and every property they own
  function profileHTML(st, pi, me) {
    const p = st.players[pi], nm = esc(String(p.name).replace(' 🤖', '')), mine = R.ownedBy(st, pi).sort((a, b) => a - b);
    const cities = mine.filter(i => SQ[i].type === 'city'), sets = [...new Set(cities.map(i => SQ[i].g))].filter(g => R.ownsGroup(st, pi, g));
    const houses = cities.reduce((n, i) => n + (st.own[i].h === 4 ? 0 : st.own[i].h), 0), hotels = cities.filter(i => st.own[i].h === 4).length;
    const mort = mine.filter(i => st.own[i].m).length, worth = p.out ? 0 : R.worth(st, pi);
    const standing = st.players.map((q, i) => i).filter(i => !st.players[i].out).sort((a, b) => R.worth(st, b) - R.worth(st, a)).indexOf(pi) + 1;
    const rentIfLanded = mine.filter(i => !st.own[i].m).reduce((n, i) => n + R.rentFor(st, i, 7), 0);
    const where = SQ[p.pos], status = p.out ? 'Bankrupt' : p.skip ? '🚔 In jail — misses a turn' : pi === st.turn ? '🎲 Playing now' : 'Waiting';
    const stat = (k, v) => `<div class="pstat"><small>${k}</small><b>${v}</b></div>`;
    return `<div class="bmanage bprof" style="--pc:${p.color}"><div class="bm-head"><b><i class="pawn" style="--pc:${p.color}"></i> ${nm}${pi === me ? ' (you)' : ''}${p.kind === 'cpu' ? ' 🤖' : ''}</b><button class="x" data-b="close" aria-label="Close">✕</button></div>
      <div class="pstats">
        ${stat('Cash', rs(p.cash))}${stat('Net worth', p.out ? '—' : rs(worth))}
        ${stat('Standing', p.out ? 'Out' : '#' + standing + ' of ' + st.players.filter(q => !q.out).length)}${stat('Status', status)}
        ${stat('Properties', mine.length)}${stat('Full colour sets', sets.length)}
        ${stat('Houses / hotels', houses + ' / ' + hotels)}${stat('Mortgaged', mort)}
        ${stat('Standing on', esc(where.name))}${stat('Rent if everyone lands', rs(rentIfLanded))}
      </div>
      <h4>Properties</h4>
      ${mine.length ? mine.map(i => {
        const s = SQ[i], o = st.own[i];
        return `<div class="bm-row"><span class="bm-ic" style="${s.type === 'city' ? `--gc:${GROUPS[s.g]}` : ''}">${s.icon}</span>
          <span class="bm-name">${esc(s.name)}<small>${rs(s.price)} · rent ${o.m ? 'none' : rs(R.rentFor(st, i, 7))}${o.m ? ' · mortgaged' : o.h === 4 ? ' · 🏨 hotel' : o.h ? ' · ' + '🏠'.repeat(o.h) : s.type === 'city' && R.ownsGroup(st, pi, s.g) ? ' · ★ full set' : ''}</small></span></div>`;
      }).join('') : '<p class="muted small">No property yet.</p>'}
    </div>`;
  }

  function playersHTML(st, me) {
    return st.players.map((p, i) => {
      const props = R.ownedBy(st, i), groups = [...new Set(props.filter(j => SQ[j].type === 'city').map(j => SQ[j].g))];
      const nm = String(p.name).replace(' 🤖', '');
      return `<button class="bp${i === st.turn && !st.over ? ' active' : ''}${p.out ? ' out' : ''}${i === me ? ' me' : ''}" style="--pc:${p.color}" data-pl="${i}" aria-label="Details for ${esc(nm)}">
        <span class="bp-av">${esc(nm.slice(0, 1))}${p.kind === 'cpu' ? '<i>🤖</i>' : ''}</span>
        <span class="bp-txt"><b>${esc(nm)}${i === me && nm !== 'You' ? ' (you)' : ''}</b>
          <small>${groups.map(g => `<i class="gd" style="--gc:${GROUPS[g]}"></i>`).join('')}${props.length} owned${p.skip ? ' · 🚔' : ''}</small></span>
        <span class="bp-cash">${p.out ? 'Bankrupt' : rs(p.cash)}</span></button>`;
    }).join('');
  }

  function html(st, opts) {
    return `<div class="biz">
      <div class="bboard">${SQ.map((_, i) => cellHTML(st, i)).join('')}
        <div class="bcenter"><div class="mandala"></div>${SKYLINE}${centerHTML(st, opts)}</div>
      </div>
      <div class="bplayers">${playersHTML(st, opts.me)}</div>
      <div class="blog">${st.log.slice(0, 3).map(t => `<div>${esc(t)}</div>`).join('')}</div>
      ${opts.footer || ''}
    </div>`;
  }
  return { html, tradeClick };
})();

/* ======================================================================================= */
/*  Single-phone screen: you against computer players                                      */
/* ======================================================================================= */
const Business = (() => {
  const KEY = 'cardroom.business';
  const CPU_NAMES = ['Raju', 'Meena', 'Arjun', 'Priya', 'Vikram'];
  let el = null, game = null, waiter = null, info = null, manage = false, profile = null, tradeUi = { t: null }, rollFace = [1, 1], rollTimer = null;
  let setup = load('setup') || {};
  if (typeof setup.cpus !== 'number') setup = { cpus: 3, cash: setup.cash || 15000, rounds: setup.rounds || 0 };

  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }

  const io = {
    update() { save(); render(); },
    decide() { return new Promise(r => { waiter = r; render(); }); },
    fx(name, pi) {
      if (name === 'winner') { if (game.st.players[pi].kind !== 'cpu') UI.burst('You win!', 'big'); else Sfx.lose(); return; }
      if (name === 'lose') { if (game.st.players[pi]?.kind !== 'cpu') Sfx.lose(); return; }
      if (name === 'jail') return Sfx.lose();
      if (name === 'card') return Sfx.flip();
      Sfx[name]?.();
    },
  };

  function render() {
    if (!el || !game) return;
    clearInterval(rollTimer);
    if (game.st.rolling) rollTimer = setInterval(() => { rollFace = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; draw(); }, 80);
    draw();
  }
  function draw() {
    if (!el || !game) return;
    el.innerHTML = BizView.html(game.st, { me: 0, info, manage, profile, trade: tradeUi, local: true, rollingFace: rollFace,
      footer: game.st.over ? '' : '<button class="b b-ghost wide small-b2" data-b="menu">Setup / quit</button>' });
  }

  function renderSetup() {
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🏙️</div>
      <h2 class="wordmark small">Business</h2>
      <p class="tagline">The Great Indian Property Game</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Business</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts">
        <label>Computer players <span class="stepper"><button data-s="-1" ${setup.cpus <= 1 ? 'disabled' : ''}>−</button><b>${setup.cpus}</b><button data-s="1" ${setup.cpus >= 5 ? 'disabled' : ''}>+</button></span></label>
        <label>Starting money <select id="b-cash">${[10000, 15000, 20000, 30000].map(v => `<option value="${v}" ${v === setup.cash ? 'selected' : ''}>${BIZ.rs(v)}</option>`).join('')}</select></label>
        <label>Game length <select id="b-rounds">${[[0, 'Until one player is left'], [15, '15 rounds (quick)'], [25, '25 rounds'], [40, '40 rounds']].map(([v, t]) => `<option value="${v}" ${v === setup.rounds ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="hint small">Buy cities and transport, collect rent, build houses and hotels on full colour sets. Pass Start: ${BIZ.rs(BIZ.SALARY)}. Doubles roll again (three doubles = jail).</p>
      ${resumable() ? '<button class="b b-ghost wide" data-b="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-b="start">Start game</button>
    </div>`;
  }
  function resumable() { const s = load('game'); return s && s.players && !s.over && s.players.filter(p => p.kind === 'human').length === 1; }

  function start(st) {
    game?.stop();
    waiter = null; info = null; manage = false; profile = null; tradeUi.t = null;
    game = st ? BizGame.restore(st, io) : new BizGame({
      players: [{ name: 'You', kind: 'human' }, ...Array.from({ length: setup.cpus }, (_, i) => ({ name: CPU_NAMES[i] + ' 🤖', kind: 'cpu' }))],
      cash: setup.cash, rounds: setup.rounds,
    }, io);
    save(); render();
    game.run();
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (!game) {
      if (b.dataset.s) { setup.cpus = Math.min(5, Math.max(1, setup.cpus + +b.dataset.s)); save(); return renderSetup(); }
      if (b.dataset.b === 'start') { setup.cash = +el.querySelector('#b-cash').value; setup.rounds = +el.querySelector('#b-rounds').value; return start(); }
      if (b.dataset.b === 'resume' && resumable()) return start(load('game'));
      return;
    }
    if (b.dataset.pl !== undefined) { profile = profile === +b.dataset.pl ? null : +b.dataset.pl; info = null; manage = false; tradeUi.t = null; return draw(); }
    const tr = BizView.tradeClick(tradeUi, b, game.st, 0);
    if (tr.handled) {
      if (tradeUi.t) { info = null; manage = false; profile = null; }
      if (tr.act && tr.act.type === 'trade') { game.propose(0, tr.act.to, tr.act.give, tr.act.want); return; }
      return draw();
    }
    if (b.dataset.m) { const [a, i] = b.dataset.m.split(':'); game.manage(0, a, +i); return; }
    if (b.dataset.sq !== undefined) { info = +b.dataset.sq; manage = false; profile = null; tradeUi.t = null; return draw(); }
    const a = b.dataset.b;
    if (a === 'close') { info = null; manage = false; profile = null; tradeUi.t = null; return draw(); }
    if (a === 'manage') { manage = true; info = null; profile = null; tradeUi.t = null; return draw(); }
    if (a === 'again') return start();
    if (a === 'menu') {
      const go = () => { game.stop(); save(); game = null; waiter = null; renderSetup(); };
      if (!game.st.over) UI.ask('Leave this game? It is saved — you can resume it later.', 'Leave').then(ok => ok && go()); else go();
      return;
    }
    if (waiter && ['roll', 'buy', 'skip', 'end'].includes(a)) { const w = waiter; waiter = null; manage = false; info = null; w(a); }
  }
  function onChange(e) {
    if (e.target.id === 'b-cash') setup.cash = +e.target.value;
    if (e.target.id === 'b-rounds') setup.rounds = +e.target.value;
    save();
  }
  function mount(container) { el = container; el.onclick = onClick; el.onchange = onChange; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); game = null; clearInterval(rollTimer); if (el) el.onclick = el.onchange = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();
