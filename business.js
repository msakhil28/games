// Business — the Indian property-trading board game. 2–6 players (people pass the phone, or computers).
const Business = (() => {
  const SQ = [
    { type: 'start', name: 'Start', icon: '🏁' },
    { type: 'city', name: 'Agra', g: 0, price: 2000 },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'Shimla', g: 0, price: 2200 },
    { type: 'tax', name: 'Income Tax', amt: 1000, icon: '🧾' },
    { type: 'transport', name: 'Railways', price: 9500, icon: '🚆' },
    { type: 'city', name: 'Jaipur', g: 1, price: 2800 },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Udaipur', g: 1, price: 3000 },
    { type: 'jail', name: 'Jail', icon: '🚔' },
    { type: 'city', name: 'Goa', g: 2, price: 3400 },
    { type: 'utility', name: 'Electric Co.', price: 2500, icon: '💡' },
    { type: 'city', name: 'Kochi', g: 2, price: 3500 },
    { type: 'city', name: 'Darjeeling', g: 2, price: 3600 },
    { type: 'transport', name: 'Airways', price: 10500, icon: '✈️' },
    { type: 'city', name: 'Pune', g: 3, price: 4000 },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'Hyderabad', g: 3, price: 4200 },
    { type: 'club', name: 'Club', icon: '🥂' },
    { type: 'city', name: 'Ahmedabad', g: 4, price: 4600 },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Lucknow', g: 4, price: 4800 },
    { type: 'city', name: 'Kolkata', g: 4, price: 5200 },
    { type: 'transport', name: 'Waterways', price: 9000, icon: '🚢' },
    { type: 'city', name: 'Chennai', g: 5, price: 5600 },
    { type: 'city', name: 'Bengaluru', g: 5, price: 6000 },
    { type: 'utility', name: 'Water Works', price: 2500, icon: '🚰' },
    { type: 'rest', name: 'Rest House', icon: '🏨' },
    { type: 'city', name: 'Chandigarh', g: 6, price: 6400 },
    { type: 'chest', name: 'Community Chest', icon: '🎁' },
    { type: 'city', name: 'New Delhi', g: 6, price: 7000 },
    { type: 'transport', name: 'Roadways', price: 8000, icon: '🚌' },
    { type: 'chance', name: 'Chance', icon: '❓' },
    { type: 'city', name: 'Srinagar', g: 7, price: 8000 },
    { type: 'tax', name: 'Wealth Tax', amt: 1500, icon: '💰' },
    { type: 'city', name: 'Mumbai', g: 7, price: 8500 },
  ];
  const GROUPS = ['#8d5524', '#6ec6e8', '#d63384', '#f39c12', '#e74c3c', '#f1c40f', '#27ae60', '#2747a8'];
  const PCOL = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];
  const CPU_NAMES = ['Raju', 'Meena', 'Arjun', 'Priya', 'Vikram', 'Anita'];
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
  const KEY = 'cardroom.business';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => UI.esc(s);
  const rs = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const r50 = n => Math.round(n / 50) * 50;

  let el = null, st = null, gen = 0, waiter = null, info = null;
  let setup = load('setup') || { n: 4, kinds: ['human', 'cpu', 'cpu', 'cpu', 'cpu', 'cpu'], cash: 15000, rounds: 0 };

  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (st?.players) localStorage.setItem(KEY + '.game', JSON.stringify(st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }

  /* ---------------- rules ---------------- */
  const isProp = i => ['city', 'transport', 'utility'].includes(SQ[i].type);
  const houseCost = i => Math.round(SQ[i].price * 0.5 / 100) * 100;
  const groupOf = g => SQ.map((s, i) => (s.g === g && s.type === 'city' ? i : -1)).filter(i => i >= 0);
  const owns = (pi, i) => st.own[i] && st.own[i].o === pi;
  const ownsGroup = (pi, g) => groupOf(g).every(i => owns(pi, i));
  const ownedBy = pi => Object.keys(st.own).map(Number).filter(i => st.own[i].o === pi);
  const countType = (pi, type) => ownedBy(pi).filter(i => SQ[i].type === type && !st.own[i].m).length;

  function rentFor(i, diceTotal) {
    const s = SQ[i], o = st.own[i];
    if (!o || o.m) return 0;
    if (s.type === 'city') {
      const base = r50(s.price * 0.08);
      if (o.h === 0) return ownsGroup(o.o, s.g) ? base * 2 : base;
      return base * [0, 4, 10, 22, 30][o.h];
    }
    if (s.type === 'transport') return [0, 1000, 1800, 3000, 5000][countType(o.o, 'transport')];
    return diceTotal * (countType(o.o, 'utility') === 2 ? 250 : 100);
  }
  function canBuild(pi, i) {
    const s = SQ[i], o = st.own[i];
    if (s.type !== 'city' || !o || o.o !== pi || o.h >= 4 || !ownsGroup(pi, s.g)) return false;
    const grp = groupOf(s.g);
    if (grp.some(j => st.own[j].m)) return false;
    return o.h <= Math.min(...grp.map(j => st.own[j].h));          // build evenly
  }
  function canSell(pi, i) {
    const s = SQ[i], o = st.own[i];
    if (s.type !== 'city' || !o || o.o !== pi || o.h === 0) return false;
    return o.h >= Math.max(...groupOf(s.g).map(j => st.own[j].h));  // sell evenly
  }
  const canMortgage = (pi, i) => owns(pi, i) && !st.own[i].m && (SQ[i].type !== 'city' || groupOf(SQ[i].g).every(j => !st.own[j] || st.own[j].h === 0));
  const worth = pi => st.players[pi].cash + ownedBy(pi).reduce((t, i) => t + (st.own[i].m ? SQ[i].price / 2 : SQ[i].price) + (st.own[i].h || 0) * houseCost(i), 0);

  /* ---------------- money ---------------- */
  function log(text) { st.msg = text; st.log.unshift(text); st.log.length = Math.min(st.log.length, 8); }
  // raise cash automatically: sell houses, then mortgage cheapest properties
  function raise(pi, need) {
    const p = st.players[pi];
    let guard = 200;
    while (p.cash < need && guard--) {
      const sellable = ownedBy(pi).filter(i => canSell(pi, i)).sort((a, b) => houseCost(a) - houseCost(b));
      if (sellable.length) { const i = sellable[0]; st.own[i].h--; p.cash += houseCost(i) / 2; log(`${p.name} sold a house in ${SQ[i].name}`); continue; }
      const mort = ownedBy(pi).filter(i => canMortgage(pi, i)).sort((a, b) => SQ[a].price - SQ[b].price);
      if (mort.length) { const i = mort[0]; st.own[i].m = true; p.cash += SQ[i].price / 2; log(`${p.name} mortgaged ${SQ[i].name}`); continue; }
      break;
    }
    return p.cash >= need;
  }
  // pay `amt` to player `to` (or the bank when to < 0). Handles bankruptcy.
  function pay(pi, to, amt) {
    const p = st.players[pi];
    if (amt <= 0) return true;
    if (p.cash < amt && !raise(pi, amt)) {
      // bankrupt: everything goes to the creditor (or back to the bank)
      const left = Math.max(0, p.cash);
      if (to >= 0) st.players[to].cash += left;
      ownedBy(pi).forEach(i => { if (to >= 0) st.own[i] = { o: to, h: 0, m: st.own[i].m }; else delete st.own[i]; });
      p.cash = 0; p.out = true; p.rank = st.players.filter(q => !q.out).length + 1;
      log(`${p.name} is bankrupt!`);
      if (p.kind === 'human') Sfx.lose();
      return false;
    }
    p.cash -= amt;
    if (to >= 0) st.players[to].cash += amt;
    Sfx.chip();
    return true;
  }

  /* ---------------- setup ---------------- */
  function newGame() {
    const humans = setup.kinds.slice(0, setup.n).filter(k => k === 'human').length;
    st = {
      players: Array.from({ length: setup.n }, (_, i) => ({
        name: setup.kinds[i] === 'cpu' ? CPU_NAMES[i] + ' 🤖' : humans > 1 ? `Player ${i + 1}` : 'You',
        kind: setup.kinds[i], color: PCOL[i], cash: setup.cash, pos: 0, skip: 0, out: false, dbl: 0, rank: 0,
      })),
      own: {}, turn: 0, round: 1, rounds: setup.rounds, dice: [1, 1], msg: 'Roll the dice to start', log: [],
      chance: shuffle([...CHANCE.keys()]), chest: shuffle([...CHEST.keys()]), over: false, phase: 'roll',
    };
    save();
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------------- turn loop ---------------- */
  const active = () => st.players.filter(p => !p.out);
  const humanCount = () => st.players.filter(p => p.kind === 'human' && !p.out).length;
  const ask = phase => new Promise(r => { st.phase = phase; waiter = r; render(); });

  async function play() {
    const g = gen, alive = () => g === gen && el;
    while (alive() && !st.over) {
      const pi = st.turn, p = st.players[pi];
      if (p.out) { next(); continue; }
      if (p.skip > 0) { p.skip--; log(`${p.name} is in jail and misses this turn`); render(); await sleep(1100); next(); continue; }
      // roll
      if (p.kind === 'human') { st.msg = humanCount() > 1 ? `${p.name}: roll the dice` : 'Your turn — roll the dice'; await ask('roll'); }
      else { st.phase = 'cpu'; render(); await sleep(700); }
      if (!alive()) return;
      const d = await roll();
      if (!alive()) return;
      const doubles = d[0] === d[1];
      if (doubles && ++p.dbl === 3) { p.dbl = 0; log(`${p.name} rolled doubles three times — off to jail!`); await toJail(pi); next(); continue; }
      await move(pi, d[0] + d[1], g);
      if (!alive()) return;
      await land(pi, d[0] + d[1], g, 0);
      if (!alive()) return;
      if (checkOver()) break;
      if (p.out) { next(); continue; }
      // after landing: people can manage properties; computers build
      if (p.kind === 'cpu') { cpuManage(pi); render(); await sleep(450); }
      else { await ask(doubles && !p.skip ? 'again' : 'end'); if (!alive()) return; }
      save();
      if (doubles && !p.skip && !p.out) { log(`${p.name} rolled doubles — roll again!`); continue; }
      next();
    }
  }
  function next() {
    const p = st.players[st.turn]; p.dbl = 0;
    let n = st.turn;
    do { n = (n + 1) % st.players.length; } while (st.players[n].out && active().length > 0);
    if (n <= st.turn) { st.round++; if (st.rounds && st.round > st.rounds) return finish('Round limit reached'); }
    st.turn = n; save(); render();
  }
  function checkOver() {
    if (active().length <= 1) { finish('Last player standing'); return true; }
    return false;
  }
  function finish(why) {
    const order = st.players.map((p, i) => ({ p, i, w: p.out ? -1 : worth(i) })).sort((a, b) => (b.p.out ? 0 : 1) - (a.p.out ? 0 : 1) || b.w - a.w || a.p.rank - b.p.rank);
    order.forEach((o, k) => { o.p.rank = k + 1; o.p.finalWorth = Math.max(0, o.w); });
    st.over = true; st.phase = 'over'; st.why = why;
    const win = order[0].p;
    log(`${win.name} ${win.name === 'You' ? 'win' : 'wins'}! (${why})`);
    if (win.kind === 'human') UI.burst(humanCount() > 1 ? `${win.name} wins!` : 'You win!', 'big');
    save(); render();
  }

  async function roll() {
    st.phase = 'rolling'; render();
    Sfx.dice?.();
    for (let k = 0; k < 6; k++) { st.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; renderDice(true); await sleep(70); }
    st.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    render(); await sleep(250);
    return st.dice;
  }
  async function move(pi, steps, g) {
    const p = st.players[pi];
    for (let k = 0; k < steps; k++) {
      if (g !== gen) return;
      p.pos = (p.pos + 1) % SQ.length;
      if (p.pos === 0) { p.cash += SALARY; log(`${p.name} passed Start and collected ${rs(SALARY)}`); Sfx.chip(); }
      Sfx.hop?.(); render(); await sleep(140);
    }
  }
  async function toJail(pi) {
    const p = st.players[pi];
    p.pos = 9; p.skip = 1; p.dbl = 0;
    pay(pi, -1, JAIL_FINE);
    log(`${p.name} goes to jail: pays ${rs(JAIL_FINE)} fine and misses a turn`);
    render(); await sleep(900);
  }

  async function land(pi, diceTotal, g, depth) {
    const p = st.players[pi], i = p.pos, s = SQ[i];
    if (isProp(i)) {
      const o = st.own[i];
      if (!o) {
        if (p.cash < s.price) { log(`${p.name} can’t afford ${s.name} (${rs(s.price)})`); render(); await sleep(700); return; }
        let buy;
        if (p.kind === 'cpu') { buy = cpuWantsToBuy(pi, i); await sleep(500); }
        else { st.msg = `${s.name} is for sale: ${rs(s.price)}`; info = i; buy = (await ask('buy')) === 'buy'; info = null; }
        if (g !== gen) return;
        if (buy) { p.cash -= s.price; st.own[i] = { o: pi, h: 0, m: false }; log(`${p.name} bought ${s.name} for ${rs(s.price)}`); Sfx.chips(); }
        else log(`${p.name} passed on ${s.name}`);
      } else if (o.o !== pi) {
        const rent = rentFor(i, diceTotal), owner = st.players[o.o];
        if (o.m) log(`${s.name} is mortgaged — no rent`);
        else if (rent > 0) { const ok = pay(pi, o.o, rent); if (ok) log(`${p.name} paid ${rs(rent)} rent to ${owner.name}`); }
      } else log(`${p.name} is at their own ${s.name}`);
      render(); await sleep(700); return;
    }
    switch (s.type) {
      case 'tax': if (pay(pi, -1, s.amt)) log(`${p.name} paid ${s.name}: ${rs(s.amt)}`); break;
      case 'jail': await toJail(pi); return;
      case 'club': {
        const others = st.players.map((q, qi) => qi).filter(qi => qi !== pi && !st.players[qi].out);
        log(`Club party! ${p.name} pays ${rs(CLUB)} to every player`);
        for (const qi of others) if (!pay(pi, qi, CLUB)) break;
        break;
      }
      case 'rest': {
        log(`Rest House: every player pays ${p.name} ${rs(REST)}`);
        st.players.forEach((q, qi) => { if (qi !== pi && !q.out) pay(qi, pi, REST); });
        break;
      }
      case 'chance': case 'chest': {
        const deck = s.type === 'chance' ? CHANCE : CHEST, key = s.type;
        const idx = st[key].shift(); st[key].push(idx);
        const c = deck[idx];
        log(`${s.type === 'chance' ? 'Chance' : 'Community Chest'}: ${c.t}`);
        st.card = { kind: s.type, text: c.t };
        render(); await sleep(p.kind === 'human' ? 1600 : 1100);
        st.card = null;
        if (c.a > 0) { p.cash += c.a; Sfx.chips(); }
        else if (c.a < 0) pay(pi, -1, -c.a);
        else if (c.each) st.players.forEach((q, qi) => { if (qi !== pi && !q.out) pay(qi, pi, c.each); });
        else if (c.repairs) { const cost = ownedBy(pi).reduce((t, j) => t + (st.own[j].h === 4 ? c.repairs[1] : (st.own[j].h || 0) * c.repairs[0]), 0); if (cost) pay(pi, -1, cost); }
        else if (c.jail) { await toJail(pi); return; }
        else if (c.to !== undefined) { const steps = (c.to - p.pos + SQ.length) % SQ.length; await move(pi, steps, g); if (depth < 2) return land(pi, diceTotal, g, depth + 1); }
        else if (c.back) { p.pos = (p.pos - c.back + SQ.length) % SQ.length; render(); await sleep(400); if (depth < 2) return land(pi, diceTotal, g, depth + 1); }
        break;
      }
    }
    render(); await sleep(600);
  }

  /* ---------------- computer players ---------------- */
  function cpuWantsToBuy(pi, i) {
    const p = st.players[pi], s = SQ[i], after = p.cash - s.price;
    const completes = s.type === 'city' && groupOf(s.g).every(j => j === i || owns(pi, j));
    const blocks = s.type === 'city' && groupOf(s.g).some(j => st.own[j] && st.own[j].o !== pi);
    return after >= (completes ? 500 : blocks ? 4000 : 2500);
  }
  function cpuManage(pi) {
    const p = st.players[pi];
    // lift mortgages when rich
    ownedBy(pi).filter(i => st.own[i].m).forEach(i => { const c = Math.round(SQ[i].price * 0.55); if (p.cash - c > 8000) { p.cash -= c; st.own[i].m = false; log(`${p.name} paid off the mortgage on ${SQ[i].name}`); } });
    for (let guard = 0; guard < 20; guard++) {
      const opts = ownedBy(pi).filter(i => canBuild(pi, i)).sort((a, b) => SQ[b].price - SQ[a].price);
      const i = opts.find(j => p.cash - houseCost(j) > 3000);
      if (i === undefined) break;
      p.cash -= houseCost(i); st.own[i].h++;
      log(`${p.name} built ${st.own[i].h === 4 ? 'a hotel' : 'a house'} in ${SQ[i].name}`);
    }
  }

  /* ---------------- people managing properties ---------------- */
  function manage(action, i) {
    const pi = st.turn, p = st.players[pi], o = st.own[i];
    if (action === 'build' && canBuild(pi, i) && p.cash >= houseCost(i)) { p.cash -= houseCost(i); o.h++; log(`${p.name} built ${o.h === 4 ? 'a hotel' : 'a house'} in ${SQ[i].name}`); Sfx.chips(); }
    if (action === 'sell' && canSell(pi, i)) { o.h--; p.cash += houseCost(i) / 2; log(`${p.name} sold a house in ${SQ[i].name}`); }
    if (action === 'mortgage' && canMortgage(pi, i)) { o.m = true; p.cash += SQ[i].price / 2; log(`${p.name} mortgaged ${SQ[i].name} for ${rs(SQ[i].price / 2)}`); }
    if (action === 'unmortgage' && owns(pi, i) && o.m) { const c = Math.round(SQ[i].price * 0.55); if (p.cash >= c) { p.cash -= c; o.m = false; log(`${p.name} paid off the mortgage on ${SQ[i].name}`); } }
    save(); render();
  }

  /* ---------------- rendering ---------------- */
  function cellRC(i) {   // 10×10 ring, Start bottom-right, moving clockwise (left along the bottom)
    if (i <= 9) return [9, 9 - i];
    if (i <= 18) return [9 - (i - 9), 0];
    if (i <= 27) return [0, i - 18];
    return [i - 27, 9];
  }
  function side(i) { return i === 0 || i === 9 || i === 18 || i === 27 ? 'corner' : i < 9 ? 'bottom' : i < 18 ? 'left' : i < 27 ? 'top' : 'right'; }

  function cellHTML(i) {
    const s = SQ[i], [r, c] = cellRC(i), o = st.own[i];
    const tokens = st.players.map((p, pi) => (!p.out && p.pos === i ? `<i class="pawn" style="--pc:${p.color}"></i>` : '')).join('');
    const band = s.type === 'city' ? `<span class="band" style="background:${GROUPS[s.g]}"></span>` : '';
    const houses = o && o.h ? `<span class="houses">${o.h === 4 ? '<em class="hotel"></em>' : '<em></em>'.repeat(o.h)}</span>` : '';
    const ownerMark = o ? `<span class="owner${o.m ? ' mort' : ''}" style="--pc:${st.players[o.o].color}"></span>` : '';
    const label = s.type === 'city' ? s.name : s.type === 'chest' ? 'Chest' : s.name;
    return `<button class="bsq ${side(i)} t-${s.type}${st.players[st.turn]?.pos === i && !st.over ? ' here' : ''}" style="grid-area:${r + 1}/${c + 1}" data-sq="${i}">
      ${band}<span class="nm">${s.icon ? `<span class="ic">${s.icon}</span>` : ''}${esc(label)}</span>${s.price ? `<span class="pr">${rs(s.price)}</span>` : ''}${houses}${ownerMark}<span class="pawns">${tokens}</span></button>`;
  }

  function infoHTML(i) {
    const s = SQ[i], o = st.own[i];
    let rows = '';
    if (s.type === 'city') {
      const base = r50(s.price * 0.08);
      rows = `<tr><td>Rent</td><td>${rs(base)}</td></tr><tr><td>Full colour set</td><td>${rs(base * 2)}</td></tr>
        ${[1, 2, 3].map(h => `<tr><td>With ${h} house${h > 1 ? 's' : ''}</td><td>${rs(base * [0, 4, 10, 22][h])}</td></tr>`).join('')}
        <tr><td>With hotel</td><td>${rs(base * 30)}</td></tr><tr><td>House / hotel cost</td><td>${rs(houseCost(i))}</td></tr>`;
    } else if (s.type === 'transport') rows = [1, 2, 3, 4].map(n => `<tr><td>Own ${n} transport</td><td>${rs([0, 1000, 1800, 3000, 5000][n])}</td></tr>`).join('');
    else if (s.type === 'utility') rows = '<tr><td>Own 1 utility</td><td>dice × ₹100</td></tr><tr><td>Own both</td><td>dice × ₹250</td></tr>';
    const desc = { start: `Collect ${rs(SALARY)} every time you pass`, jail: `Pay ${rs(JAIL_FINE)} and miss a turn`, club: `Pay ${rs(CLUB)} to every player`, rest: `Every player pays you ${rs(REST)}`, tax: `Pay ${rs(s.amt || 0)}`, chance: 'Draw a Chance card', chest: 'Draw a Community Chest card' }[s.type] || '';
    return `<div class="binfo">
      <div class="binfo-head" style="${s.type === 'city' ? `background:${GROUPS[s.g]}` : ''}">${s.icon || ''} ${esc(s.name)}</div>
      ${s.price ? `<div class="binfo-price">Price ${rs(s.price)}${o ? ` · Owner: <b style="color:${st.players[o.o].color}">${esc(st.players[o.o].name)}</b>${o.m ? ' (mortgaged)' : ''}` : ''}</div>` : ''}
      ${rows ? `<table>${rows}</table>` : `<p>${desc}</p>`}
    </div>`;
  }

  function diceHTML(rolling) {
    return `<div class="bdice${rolling ? ' rolling' : ''}">${st.dice.map(n => `<span class="ludo-die small" data-n="${n}">${'<i></i>'.repeat(n)}</span>`).join('')}</div>`;
  }
  function renderDice(rolling) { const d = el?.querySelector('.bdice'); if (d) d.outerHTML = diceHTML(rolling); }

  function centerHTML() {
    const p = st.players[st.turn], ph = st.phase;
    if (st.over) {
      const order = [...st.players].sort((a, b) => a.rank - b.rank);
      return `<div class="bcenter-in"><h3 class="bwin">${esc(order[0].name)} ${order[0].name === 'You' ? 'win' : 'wins'}!</h3><small class="muted">${esc(st.why || '')}</small>
        <ol class="bres">${order.map(q => `<li><i class="pawn" style="--pc:${q.color}"></i>${esc(q.name)}<b>${q.out ? 'bankrupt' : rs(q.finalWorth || 0)}</b></li>`).join('')}</ol>
        <div class="act-row"><button class="b b-ghost" data-b="menu">Setup</button><button class="b b-raise" data-b="again">Play again</button></div></div>`;
    }
    if (st.card) return `<div class="bcenter-in"><div class="bcard ${st.card.kind}"><small>${st.card.kind === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'}</small><p>${esc(st.card.text)}</p></div></div>`;
    const turnLine = `<div class="bturn"><i class="pawn" style="--pc:${p.color}"></i><b>${esc(p.name)}</b><span>${rs(p.cash)}</span></div>`;
    let actions = '';
    if (ph === 'roll') actions = `<button class="b b-raise" data-b="roll">Roll dice</button>`;
    else if (ph === 'buy') actions = `<div class="act-row"><button class="b b-ghost" data-b="skip">Skip</button><button class="b b-call" data-b="buy">Buy ${rs(SQ[p.pos].price)}</button></div>`;
    else if (ph === 'end' || ph === 'again') actions = `<div class="act-row"><button class="b b-ghost" data-b="manage">My properties</button><button class="b b-raise" data-b="end">${ph === 'again' ? 'Roll again' : 'End turn'}</button></div>`;
    return `<div class="bcenter-in">
      <div class="blogo">BUSINESS</div>
      ${turnLine}
      ${info !== null && ph === 'buy' ? infoHTML(info) : diceHTML(false)}
      <div class="bmsg">${esc(st.msg)}</div>
      ${actions}
      ${st.rounds ? `<small class="muted">Round ${Math.min(st.round, st.rounds)} of ${st.rounds}</small>` : ''}
    </div>`;
  }

  function playersHTML() {
    return st.players.map((p, i) => `<div class="bp${i === st.turn && !st.over ? ' active' : ''}${p.out ? ' out' : ''}" style="--pc:${p.color}">
      <i class="pawn" style="--pc:${p.color}"></i><b>${esc(p.name)}</b><span>${p.out ? 'Bankrupt' : rs(p.cash)}</span>
      <small>${ownedBy(i).length} 🏠</small></div>`).join('');
  }

  function manageHTML() {
    const pi = st.turn, p = st.players[pi], mine = ownedBy(pi).sort((a, b) => a - b);
    return `<div class="bmanage"><div class="bm-head"><b>My properties</b><span>${rs(p.cash)}</span><button class="x" data-b="close" aria-label="Close">✕</button></div>
      ${mine.length ? mine.map(i => {
        const s = SQ[i], o = st.own[i];
        return `<div class="bm-row"><span class="sw" style="--c:${s.type === 'city' ? GROUPS[s.g] : '#888'}"></span>
          <span class="bm-name">${esc(s.name)}<small>${o.m ? 'mortgaged' : o.h === 4 ? 'hotel' : o.h ? o.h + ' house' + (o.h > 1 ? 's' : '') : s.type === 'city' && ownsGroup(pi, s.g) ? 'full set' : ''}</small></span>
          ${canBuild(pi, i) ? `<button data-m="build:${i}" ${p.cash < houseCost(i) ? 'disabled' : ''}>+ ${o.h === 3 ? 'Hotel' : 'House'} ${rs(houseCost(i))}</button>` : ''}
          ${canSell(pi, i) ? `<button data-m="sell:${i}">Sell</button>` : ''}
          ${o.m ? `<button data-m="unmortgage:${i}" ${p.cash < Math.round(s.price * .55) ? 'disabled' : ''}>Unmortgage ${rs(Math.round(s.price * .55))}</button>`
            : canMortgage(pi, i) ? `<button data-m="mortgage:${i}">Mortgage +${rs(s.price / 2)}</button>` : ''}
        </div>`;
      }).join('') : '<p class="muted">You don’t own any property yet.</p>'}
      <p class="hint small">Own every city of a colour to build houses (evenly), then a hotel. Mortgaged property earns no rent.</p></div>`;
  }

  function render() {
    if (!el || !st) return;
    if (!st.players) return renderSetup();
    el.innerHTML = `<div class="biz">
      <div class="bboard">${SQ.map((_, i) => cellHTML(i)).join('')}
        <div class="bcenter">${showManage ? manageHTML() : info !== null && st.phase !== 'buy' ? `<div class="bcenter-in">${infoHTML(info)}<button class="b b-ghost" data-b="close">Close</button></div>` : centerHTML()}</div>
      </div>
      <div class="bplayers">${playersHTML()}</div>
      <div class="blog">${st.log.slice(0, 3).map(t => `<div>${esc(t)}</div>`).join('')}</div>
      ${st.over ? '' : '<button class="b b-ghost wide small-b2" data-b="menu">Setup / quit</button>'}
    </div>`;
  }
  let showManage = false;

  function renderSetup() {
    const kinds = setup.kinds;
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🏙️</div>
      <h2 class="wordmark small">Business</h2>
      <p class="tagline">The Indian property game</p>
      <div class="opts">
        <label>Players <span class="stepper"><button data-s="n:-1" ${setup.n <= 2 ? 'disabled' : ''}>−</button><b>${setup.n}</b><button data-s="n:1" ${setup.n >= 6 ? 'disabled' : ''}>+</button></span></label>
        ${Array.from({ length: setup.n }, (_, i) => `<label><span class="lp-name"><i class="pawn" style="--pc:${PCOL[i]}"></i>Player ${i + 1}</span>
          <span class="seg mini">${['human', 'cpu'].map(k => `<button data-kind="${i}:${k}" class="${kinds[i] === k ? 'on' : ''}">${k === 'human' ? 'Person' : 'Computer'}</button>`).join('')}</span></label>`).join('')}
        <label>Starting money <select id="b-cash">${[10000, 15000, 20000, 30000].map(v => `<option value="${v}" ${v === setup.cash ? 'selected' : ''}>${rs(v)}</option>`).join('')}</select></label>
        <label>Game length <select id="b-rounds">${[[0, 'Until one player is left'], [15, '15 rounds (quick)'], [25, '25 rounds'], [40, '40 rounds']].map(([v, t]) => `<option value="${v}" ${v === setup.rounds ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="hint small">Buy cities and transport, collect rent, and build houses and hotels once you own a full colour group. Pass Start: ${rs(SALARY)}. Doubles roll again (three doubles = jail). With a round limit, the richest player wins.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-b="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-b="start">Start game</button>
    </div>`;
  }

  /* ---------------- input ---------------- */
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.kind) { const [i, k] = b.dataset.kind.split(':'); setup.kinds[+i] = k; if (!setup.kinds.slice(0, setup.n).includes('human')) setup.kinds[0] = 'human'; save(); return renderSetup(); }
    if (b.dataset.s) { setup.n = Math.min(6, Math.max(2, setup.n + +b.dataset.s.split(':')[1])); if (!setup.kinds.slice(0, setup.n).includes('human')) setup.kinds[0] = 'human'; save(); return renderSetup(); }
    if (b.dataset.m) { const [a, i] = b.dataset.m.split(':'); return manage(a, +i); }
    if (b.dataset.sq !== undefined && st?.players) { if (st.phase === 'buy') return; info = +b.dataset.sq; showManage = false; return render(); }
    const a = b.dataset.b;
    if (!a) return;
    if (a === 'start' || a === 'again') { setup.cash = +(el.querySelector('#b-cash')?.value || setup.cash); setup.rounds = +(el.querySelector('#b-rounds')?.value ?? setup.rounds); newGame(); return begin(); }
    if (a === 'resume') { st = load('game'); return begin(); }
    if (a === 'menu') { if (st?.players && !st.over && !confirm('Leave this game? It is saved — you can resume it later.')) return; gen++; waiter = null; save(); st = {}; info = null; showManage = false; return renderSetup(); }
    if (a === 'close') { info = null; showManage = false; return render(); }
    if (a === 'manage') { showManage = true; info = null; return render(); }
    if (waiter && ['roll', 'buy', 'skip', 'end'].includes(a)) { const w = waiter; waiter = null; showManage = false; w(a); }
  }
  function onChange(e) {
    if (e.target.id === 'b-cash') setup.cash = +e.target.value;
    if (e.target.id === 'b-rounds') setup.rounds = +e.target.value;
    save();
  }
  function begin() { gen++; waiter = null; info = null; showManage = false; render(); play(); }

  function mount(container) {
    el = container; el.onclick = onClick; el.onchange = onChange;
    st = {}; info = null; showManage = false;
    renderSetup();
  }
  function unmount() {
    gen++; waiter = null;
    if (st?.players && !st.over) save();
    if (el) el.onclick = el.onchange = null;
    el = null;
  }
  return { mount, unmount, _t: { SQ, rentFor: (...a) => rentFor(...a), canBuild: (...a) => canBuild(...a), get st() { return st; }, set st(v) { st = v; }, pay: (...a) => pay(...a), worth: (...a) => worth(...a) } };
})();
