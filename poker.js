// Texas Hold'em: you vs 3 computer players. Blinds 10/20.
const Poker = (() => {
  const SB = 10, BB = 20;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const ABORT = Symbol('abort');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rankStr = r => RANKS[r] || String(r);

  /* ---------- hand evaluation ---------- */
  function eval5(c) {
    const rs = c.map(x => x.r).sort((a, b) => b - a);
    const flush = c.every(x => x.s === c[0].s);
    let sh = 0;
    if (new Set(rs).size === 5) {
      if (rs[0] - rs[4] === 4) sh = rs[0];
      else if (rs[0] === 14 && rs[1] === 5) sh = 5;
    }
    const cnt = {};
    rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
    const g = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const byGroup = g.map(x => x[1]);
    let cat, ks;
    if (sh && flush) { cat = 8; ks = [sh]; }
    else if (g[0][0] === 4) { cat = 7; ks = byGroup; }
    else if (g[0][0] === 3 && g[1][0] === 2) { cat = 6; ks = byGroup; }
    else if (flush) { cat = 5; ks = rs; }
    else if (sh) { cat = 4; ks = [sh]; }
    else if (g[0][0] === 3) { cat = 3; ks = byGroup; }
    else if (g[0][0] === 2 && g[1][0] === 2) { cat = 2; ks = byGroup; }
    else if (g[0][0] === 2) { cat = 1; ks = byGroup; }
    else { cat = 0; ks = rs; }
    let score = cat;
    for (let i = 0; i < 5; i++) score = score * 15 + (ks[i] || 0);
    return score;
  }
  function best(cards) { // best 5-card hand out of 5..7 cards -> score
    let top = -1;
    const n = cards.length;
    if (n === 5) return eval5(cards);
    for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
      for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
        const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (s > top) top = s;
      }
    return top;
  }
  const catOf = score => Math.floor(score / Math.pow(15, 5));
  function handName(score) {
    const cat = catOf(score);
    if (cat === 8 && Math.floor(score / Math.pow(15, 4)) % 15 === 14) return 'Royal flush';
    return CATS[cat];
  }

  /* ---------- state ---------- */
  let el, players = [], deck = [], board = [], pot = 0, dealer = 0;
  let currentBet = 0, minRaise = BB, phase = 'idle', msg = '', gen = 0, busy = false;
  let pending = null, current = null, raiseTo = 0, curGen = 0;

  function makePlayers() {
    const mk = (name, human, ref, key) => {
      const p = { name, human, hole: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, reveal: false, note: '', handName: '' };
      Object.defineProperty(p, 'stack', { get: () => ref[key], set: v => { ref[key] = Math.max(0, Math.round(v)); Store.touch(); }, enumerable: true });
      return p;
    };
    players = [mk('You', true, Store.s, 'bank')];
    Store.activeBots().forEach(b => players.push(mk(b.name, false, b, 'stack')));
    dealer = dealer % players.length;
  }

  /* ---------- helpers ---------- */
  function newDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s: SUITS[s] });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  const live = () => players.filter(p => !p.folded);
  const canAct = () => players.filter(p => !p.folded && !p.allIn);
  function chk() { if (curGen !== gen) throw ABORT; }
  async function wait(ms) { await sleep(ms); chk(); }

  function putIn(p, amt) {
    amt = Math.min(amt, p.stack);
    p.stack -= amt; p.bet += amt; p.total += amt; pot += amt;
    if (p.stack === 0) p.allIn = true;
    return amt;
  }

  /* ---------- rendering ---------- */
  let handId = 0;
  function model() {
    return {
      hand: 'sp' + handId, board, pot, msg,
      seats: players.map((p, i) => ({
        id: 's' + i, name: p.name, chips: p.stack, me: p.human, bot: !p.human, inHand: phase !== 'idle',
        cards: p.hole.map(c => (p.human || p.reveal ? c : null)),
        bet: p.bet, folded: p.folded, allIn: p.allIn, turn: p === current, won: p.won || 0,
        dealer: i === dealer && phase !== 'idle',
        status: p.folded ? 'Fold' : p.reveal && p.handName ? p.handName : p.allIn ? 'All-in' : p.note,
        statusCls: p.reveal && p.handName && !p.folded ? 'hand' : '',
      })),
    };
  }

  function actionsHTML() {
    const h = players[0];
    if (pending) {
      const y = {
        toCall: Math.min(currentBet - h.bet, h.stack), maxTo: h.bet + h.stack, currentBet, myBet: h.bet, pot,
        canRaise: h.stack > currentBet - h.bet,
      };
      y.minTo = Math.min(currentBet + minRaise, y.maxTo);
      raiseTo = Math.max(y.minTo, Math.min(y.maxTo, raiseTo || y.minTo));
      return UI.pokerDock(y, raiseTo, '<div class="your-turn">Your move</div>');
    }
    const picker = `<div class="opp-pick"><span>Opponents</span>
      <button data-a="bots-" ${Store.s.botCount <= 1 ? 'disabled' : ''} aria-label="Fewer computer players">−</button>
      <b>${Store.s.botCount}</b>
      <button data-a="bots+" ${Store.s.botCount >= 6 ? 'disabled' : ''} aria-label="More computer players">+</button></div>`;
    if (phase === 'idle') return `<div class="dock">${picker}<button class="b b-raise big" data-a="deal">Deal</button></div>`;
    if (phase === 'over') return `<div class="dock">${picker}<button class="b b-raise big" data-a="deal">Next hand</button></div>`;
    return `<div class="dock quiet"><span>${current ? UI.esc(current.name) + ' is thinking…' : '…'}</span></div>`;
  }

  function render() {
    if (!el) return;
    el.innerHTML = `<div class="game">${UI.pokerTable(model())}${actionsHTML()}</div>`;
    const rs = el.querySelector('#rs');
    if (rs) rs.addEventListener('input', () => { raiseTo = +rs.value; el.querySelector('#rv').textContent = Store.fmt(raiseTo); });
  }

  /* ---------- human input ---------- */
  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const h = players[0];
    if (b.dataset.a === 'deal') return startHand();
    if (b.dataset.a === 'bots-' || b.dataset.a === 'bots+') {
      if (phase === 'play') return;
      Store.setBotCount(Store.s.botCount + (b.dataset.a === 'bots+' ? 1 : -1));
      return;
    }
    if (b.dataset.q && pending) {
      const maxTo = h.bet + h.stack, minTo = Math.min(currentBet + minRaise, maxTo);
      const v = b.dataset.q === 'max' ? maxTo : Math.round((b.dataset.q === 'half' ? 0.5 : 1) * (pot + (currentBet - h.bet)) + currentBet);
      raiseTo = Math.max(minTo, Math.min(maxTo, v));
      const rs = el.querySelector('#rs');
      if (rs) { rs.value = raiseTo; el.querySelector('#rv').textContent = Store.fmt(raiseTo); }
      return;
    }
    if (b.dataset.a && pending) {
      const p = pending; pending = null;
      p({ type: b.dataset.a, to: raiseTo });
    }
  }

  /* ---------- computer players ---------- */
  function preflopStrength(hole) {
    const [a, b] = hole.map(c => c.r).sort((x, y) => y - x);
    const suited = hole[0].s === hole[1].s;
    if (a === b) return 0.5 + (a - 2) / 24;
    return 0.15 + (a - 2) / 12 * 0.3 + (b - 2) / 12 * 0.2 + (suited ? 0.05 : 0) + (a - b <= 2 ? 0.05 : 0);
  }
  function strength(p) {
    if (board.length === 0) return preflopStrength(p.hole);
    const all = p.hole.concat(board);
    const sc = best(all), cat = catOf(sc);
    let s;
    if (cat === 0) s = 0.15 + (Math.max(...p.hole.map(c => c.r)) - 2) / 12 * 0.1;
    else if (cat === 1) {
      const pr = Math.floor(sc / Math.pow(15, 4)) % 15;
      const usesHole = p.hole.some(c => c.r === pr);
      s = usesHole ? 0.42 + (pr - 2) / 12 * 0.2 : 0.3;
    }
    else if (cat === 2) s = 0.72;
    else if (cat === 3) s = 0.8;
    else s = 0.9 + Math.min(cat, 8) * 0.01;
    if (board.length < 5) { // draws
      for (const su of SUITS) if (all.filter(c => c.s === su).length === 4) s += 0.14;
    }
    return Math.min(s, 1);
  }
  function botDecide(p) {
    const toCall = Math.max(0, currentBet - p.bet);
    const potOdds = toCall / (pot + toCall || 1);
    const s = strength(p) + (Math.random() - 0.5) * 0.18 + (p.name === 'Cruz' ? 0.04 : p.name === 'Bella' ? -0.02 : 0);
    const bluff = Math.random() < 0.05;
    const maxTo = p.bet + p.stack;
    const sized = frac => Math.min(maxTo, Math.max(currentBet + minRaise, Math.round((currentBet + frac * (pot + toCall)) / 5) * 5));
    if (toCall === 0) {
      if (s > 0.72 || bluff) return { type: 'raise', to: sized(0.5 + Math.random() * 0.4) };
      if (s > 0.55 && Math.random() < 0.5) return { type: 'raise', to: sized(0.35) };
      return { type: 'call' };
    }
    if (s > 0.86 && Math.random() < 0.65 && p.stack > toCall) return { type: 'raise', to: sized(0.6 + Math.random() * 0.5) };
    const allInCall = toCall >= p.stack;
    const need = potOdds + (allInCall ? 0.2 : 0.1);
    if (s > need) return { type: 'call' };
    if (board.length === 0 && toCall <= BB && s > 0.33) return { type: 'call' };
    if (s > potOdds + 0.04 && toCall <= BB * 2 && !allInCall) return { type: 'call' };
    return { type: 'fold' };
  }

  /* ---------- betting ---------- */
  function apply(p, a) {
    const toCall = Math.max(0, currentBet - p.bet);
    if (a.type === 'fold') { p.folded = true; p.note = 'Fold'; msg = `${p.name} folds.`; Sfx.fold(); }
    else if (a.type === 'raise' && p.stack > toCall) {
      const maxTo = p.bet + p.stack;
      const to = Math.max(Math.min(a.to, maxTo), Math.min(currentBet + minRaise, maxTo));
      putIn(p, to - p.bet);
      const size = p.bet - currentBet;
      if (size >= minRaise) { minRaise = size; players.forEach(q => { if (q !== p) q.acted = false; }); }
      else if (size > 0) { /* short all-in: does not reopen the betting */ }
      const verb = currentBet === 0 ? 'bets' : 'raises to';
      if (p.bet > currentBet) currentBet = p.bet;
      msg = `${p.name} ${verb} ${Store.fmt(p.bet)}${p.allIn ? ' (all-in)' : ''}.`;
      p.note = p.allIn ? 'All-in' : `${currentBet === p.bet && verb === 'bets' ? 'Bet' : 'Raise'} ${Store.fmt(p.bet)}`;
      Sfx.chips();
    } else { // call / check
      const amt = putIn(p, toCall);
      msg = amt === 0 ? `${p.name} checks.` : `${p.name} calls ${Store.fmt(amt)}${p.allIn ? ' (all-in)' : ''}.`;
      p.note = amt === 0 ? 'Check' : p.allIn ? 'All-in' : `Call ${Store.fmt(amt)}`;
      if (amt) Sfx.chip();
    }
    p.acted = true;
  }

  async function takeTurn(p) {
    current = p;
    render();
    let a;
    if (p.human) {
      raiseTo = 0;
      Sfx.turn();
      a = await new Promise(res => { pending = res; render(); });
      chk();
    } else {
      await wait(600 + Math.random() * 500);
      a = botDecide(p);
    }
    current = null;
    apply(p, a);
    render();
    if (!p.human) await wait(250);
  }

  async function betRound(first) {
    players.forEach(p => { p.acted = false; });
    let i = first;
    for (;;) {
      if (live().length <= 1) return;
      const need = players.filter(p => !p.folded && !p.allIn && (!p.acted || p.bet < currentBet));
      if (!need.length) return;
      const p = players[i % players.length]; i++;
      if (p.folded || p.allIn || (p.acted && p.bet === currentBet)) continue;
      await takeTurn(p);
    }
  }

  function endRound() {
    players.forEach(p => { p.bet = 0; p.note = ''; });
    currentBet = 0; minRaise = BB;
  }

  /* ---------- a hand ---------- */
  async function startHand() {
    if (busy) return;
    busy = true;
    const g = curGen = gen;
    try {
      if (Store.s.bank <= 0) {
        msg = 'You are out of chips — tap ⚙ and add money to keep playing.';
        phase = 'idle'; render(); return;
      }
      if (players.length - 1 !== Store.s.botCount) makePlayers();
      const rebought = [];
      players.forEach(p => {
        Object.assign(p, { hole: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, reveal: false, note: '', handName: '', won: 0 });
        if (!p.human && p.stack <= 0) { p.stack = Store.s.botBuyIn; rebought.push(p.name); }
      });
      dealer = (dealer + 1) % players.length;
      handId++;
      deck = newDeck(); board = []; pot = 0; currentBet = 0; minRaise = BB; phase = 'play';
      msg = rebought.length ? `${rebought.join(' & ')} re-bought. New hand…` : 'New hand…';
      for (let r = 0; r < 2; r++) players.forEach(p => p.hole.push(deck.pop()));
      const n = players.length, heads = n === 2;   // heads-up: the dealer posts the small blind and acts first preflop
      const sb = players[heads ? dealer : (dealer + 1) % n], bb = players[heads ? (dealer + 1) % n : (dealer + 2) % n];
      putIn(sb, SB); putIn(bb, BB);
      sb.note = 'SB'; bb.note = 'BB';
      currentBet = Math.max(sb.bet, bb.bet);
      render();
      await wait(500);
      if (canAct().length > 1) await betRound(heads ? dealer : dealer + 3);
      for (const n of [3, 1, 1]) {
        if (live().length <= 1) break;
        endRound();
        for (let k = 0; k < n; k++) board.push(deck.pop());
        render();
        await wait(canAct().length > 1 ? 400 : 1000);
        if (canAct().length > 1) await betRound(dealer + 1);
      }
      endRound();
      await showdown();
    } catch (e) {
      if (e !== ABORT) throw e;
    } finally {
      if (g === gen) busy = false;
    }
  }

  async function showdown() {
    current = null;
    const contenders = live();
    const won = new Map();
    const add = (p, n) => won.set(p, (won.get(p) || 0) + n);
    const names = new Map();
    if (contenders.length === 1) {
      add(contenders[0], pot);
    } else {
      contenders.forEach(p => { p.reveal = true; p.score = best(p.hole.concat(board)); p.handName = handName(p.score); });
      const levels = [...new Set(contenders.map(p => p.total))].sort((a, b) => a - b);
      let prev = 0;
      for (const lvl of levels) {
        const part = players.reduce((s, p) => s + Math.min(p.total, lvl) - Math.min(p.total, prev), 0);
        const elig = contenders.filter(p => p.total >= lvl);
        const top = Math.max(...elig.map(p => p.score));
        const ws = elig.filter(p => p.score === top);
        const share = Math.floor(part / ws.length);
        ws.forEach((p, i) => { add(p, share + (i === 0 ? part - share * ws.length : 0)); names.set(p, p.handName); });
        prev = lvl;
      }
    }
    let leftover = pot - [...won.values()].reduce((a, b) => a + b, 0);
    if (leftover > 0) add(contenders[0], leftover);
    won.forEach((n, p) => { p.stack += n; p.won = n; });
    const me = players[0];
    if (won.has(me)) UI.burst(`You win ${Store.fmt(won.get(me))}`, won.get(me) >= 500 ? 'big' : 'win');
    else if (contenders.length > 1 && !me.folded) Sfx.lose();
    else if (won.size) Sfx.chips();
    pot = 0;
    players.forEach(p => { p.total = 0; p.bet = 0; });
    const parts = [...won].map(([p, n]) => `${p.human ? 'You win' : p.name + ' wins'} ${Store.fmt(n)}${names.get(p) ? ' with ' + names.get(p) : ''}`);
    msg = parts.join(' · ') + '.';
    phase = 'over';
    render();
  }

  /* ---------- lifecycle ---------- */
  function mount(container) {
    el = container;
    gen++; busy = false; pending = null; current = null;
    if (!players.length) makePlayers();
    board = []; pot = 0; phase = 'idle';
    players.forEach(p => Object.assign(p, { hole: [], folded: false, allIn: false, bet: 0, total: 0, reveal: false, note: '', handName: '' }));
    msg = 'Texas Hold’em · blinds $10 / $20. Press Deal to start.';
    el.onclick = onClick;
    render();
  }
  function unmount() {
    if (phase === 'play') players.forEach(p => { p.stack += p.total; p.total = 0; }); // refund an abandoned hand
    gen++; busy = false;
    if (pending) { const p = pending; pending = null; p({ type: 'fold' }); }
    phase = 'idle';
    if (el) el.onclick = null;
  }
  // re-render when money changes in settings
  Store.onChange(() => {
    if (!el || !players.length || !el.querySelector('.table.poker')) return;
    if (phase !== 'play' && players.length - 1 !== Store.s.botCount) {   // opponents changed between hands
      makePlayers();
      players.forEach(p => Object.assign(p, { hole: [], folded: false, allIn: false, bet: 0, total: 0, reveal: false, note: '', handName: '', won: 0 }));
      if (phase === 'over') { phase = 'idle'; board = []; pot = 0; msg = `Table set for ${players.length} players.`; }
    }
    render();
  });

  return { mount, unmount, _eval: { best, handName, catOf } };
})();
