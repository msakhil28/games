// Blackjack: 6-deck shoe, dealer stands on all 17s, blackjack pays 3:2, double & split (up to 4 hands).
const Blackjack = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const MIN_BET = 10, CHIPS = [10, 25, 100, 500];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let el, shoe = [], dealer = [], hands = [], active = 0, phase = 'bet', bet = 0, lastBet = 0, msg = '', gen = 0, hideHole = true;

  const val = c => Math.min(c.r, 10);
  function total(cards) {
    let t = cards.reduce((s, c) => s + val(c), 0);
    const aces = cards.filter(c => c.r === 1).length;
    let soft = false;
    if (aces && t + 10 <= 21) { t += 10; soft = true; }
    return { t, soft };
  }
  const isBJ = h => h.cards.length === 2 && !h.split && total(h.cards).t === 21;

  function newShoe() {
    const d = [];
    for (let k = 0; k < 6; k++) for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  const draw = () => { if (shoe.length < 20) shoe = newShoe(); return shoe.pop(); };

  let roundId = 0;
  function render() {
    if (!el) return;
    const dv = hideHole ? val(dealer[0] || { r: 0 }) + (dealer[0] && dealer[0].r === 1 ? 10 : 0) : total(dealer).t;
    const model = {
      round: 'sb' + roundId, msg,
      dealer: { cards: dealer.map((c, i) => (i === 1 && hideHole ? null : c)), total: dv, hidden: hideHole },
      spots: [{
        id: 'me', name: 'You', chips: Store.s.bank, me: true, bet: phase === 'bet' ? bet : 0,
        hands: hands.map((h, i) => ({ cards: h.cards, ...total(h.cards), bet: h.bet, result: h.result, net: h.net, active: phase === 'play' && i === active && hands.length > 1 })),
      }],
    };
    el.innerHTML = `<div class="game">${UI.bjTable(model)}${controlsHTML()}</div>`;
  }

  function controlsHTML() {
    if (phase === 'play') {
      const h = hands[active];
      const two = h.cards.length === 2;
      return UI.bjPlayDock({
        canDouble: two && Store.s.bank >= h.bet,
        canSplit: two && val(h.cards[0]) === val(h.cards[1]) && hands.length < 4 && Store.s.bank >= h.bet,
      }, `<div class="your-turn">${hands.length > 1 ? `Hand ${active + 1} of ${hands.length}` : 'Your move'}</div>`);
    }
    if (phase !== 'bet') return '<div class="dock quiet"><span>Dealer’s turn…</span></div>';
    const bank = Store.s.bank;
    const rebet = lastBet >= MIN_BET && lastBet <= bank + bet && bet === 0;
    return UI.betTray(bet, bank, `
      <button class="b b-ghost" data-a="clear" ${bet ? '' : 'disabled'}>Clear</button>
      ${rebet ? `<button class="b b-ghost" data-a="rebet">Rebet ${Store.fmt(lastBet)}</button>` : `<button class="b b-ghost" data-a="max" ${bank >= MIN_BET ? '' : 'disabled'}>Max</button>`}
      <button class="b b-raise" data-a="deal" ${bet >= MIN_BET ? '' : 'disabled'}>Deal${bet ? ' ' + Store.fmt(bet) : ''}</button>`);
  }

  async function deal() {
    if (bet < MIN_BET || bet > Store.s.bank) return;
    const g = gen;
    const stake = bet;
    lastBet = stake; bet = 0; roundId++;
    phase = 'dealing'; hands = [{ cards: [], bet: stake, done: false, split: false }];
    dealer = []; active = 0; hideHole = true; msg = '';
    Store.addMoney(-stake);
    if (shoe.length < 52) shoe = newShoe();
    for (const who of [hands[0].cards, dealer, hands[0].cards, dealer]) {
      who.push(draw()); render(); await sleep(220); if (g !== gen) return;
    }
    const pBJ = isBJ(hands[0]), dBJ = total(dealer).t === 21;
    if (pBJ || dBJ) { hideHole = false; return settle(); }
    phase = 'play';
    msg = 'Your move.';
    render();
  }

  function nextHand() {
    while (active < hands.length && hands[active].done) active++;
    if (active >= hands.length) return dealerPlay();
    const h = hands[active];
    if (h.cards.length === 1) { h.cards.push(draw()); } // second card after a split
    if (h.aceSplit || total(h.cards).t >= 21) { h.done = true; render(); return sleep(350).then(nextHand); }
    render();
  }

  async function act(a) {
    if (phase !== 'play') return;
    const h = hands[active];
    if (a === 'hit') {
      h.cards.push(draw());
      if (total(h.cards).t >= 21) h.done = true;
    } else if (a === 'stand') {
      h.done = true;
    } else if (a === 'double') {
      if (h.cards.length !== 2 || Store.s.bank < h.bet) return;
      Store.addMoney(-h.bet); h.bet *= 2; h.doubled = true; Sfx.chips();
      h.cards.push(draw()); h.done = true;
    } else if (a === 'split') {
      if (h.cards.length !== 2 || val(h.cards[0]) !== val(h.cards[1]) || Store.s.bank < h.bet || hands.length >= 4) return;
      Store.addMoney(-h.bet);
      const second = { cards: [h.cards.pop()], bet: h.bet, done: false, split: true };
      h.split = true;
      h.cards.push(draw());
      hands.splice(active + 1, 0, second);
      if (total(h.cards).t >= 21 || h.cards[0].r === 1) h.done = true; // split aces get one card
      if (h.cards[0].r === 1) second.aceSplit = true;
    }
    render();
    if (h.done) { await sleep(450); nextHand(); }
  }

  async function dealerPlay() {
    const g = gen;
    phase = 'dealer'; hideHole = false; render();
    await sleep(500); if (g !== gen) return;
    const anyLive = hands.some(h => total(h.cards).t <= 21);
    while (anyLive && total(dealer).t < 17) {
      dealer.push(draw()); render(); await sleep(600); if (g !== gen) return;
    }
    settle();
  }

  function settle() {
    phase = 'over'; hideHole = false;
    const d = total(dealer).t, dBJ = dealer.length === 2 && d === 21;
    let net = 0;
    hands.forEach(h => {
      const p = total(h.cards).t;
      let ret = 0;
      if (isBJ(h)) { if (dBJ) { ret = h.bet; h.result = 'Push'; } else { ret = h.bet * 2.5; h.result = 'Blackjack!'; } }
      else if (p > 21) h.result = 'Bust';
      else if (dBJ) h.result = 'Dealer blackjack';
      else if (d > 21 || p > d) { ret = h.bet * 2; h.result = 'Win'; }
      else if (p === d) { ret = h.bet; h.result = 'Push'; }
      else h.result = 'Lose';
      h.net = ret - h.bet;
      net += h.net;
      if (ret) Store.addMoney(ret);
    });
    msg = net > 0 ? `You won ${Store.fmt(net)}!` : net < 0 ? `You lost ${Store.fmt(-net)}.` : 'Push — bet returned.';
    if (net > 0) UI.burst(hands.some(h => h.result === 'Blackjack!') ? 'Blackjack!' : `+${Store.fmt(net)}`, hands.some(h => h.result === 'Blackjack!') ? 'big' : 'win');
    else if (net < 0) Sfx.lose();
    if (Store.s.bank < MIN_BET) msg += ' Out of money? Tap ⚙ to add some.';
    bet = 0;
    phase = 'bet';
    render();
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.c === 'chip') {
      if (phase === 'bet') { if (hands.length && hands[0].result) { hands = []; dealer = []; msg = ''; } bet = Math.min(Store.s.bank, bet + +b.dataset.v); Sfx.chip(); render(); }
      return;
    }
    const a = b.dataset.a;
    if (phase === 'bet') {
      if (hands.length && hands[0].result && a !== 'deal') { hands = []; dealer = []; msg = ''; }
      if (a === 'clear') bet = 0;
      else if (a === 'rebet') { bet = Math.min(lastBet, Store.s.bank); Sfx.chips(); }
      else if (a === 'max') { bet = Store.s.bank; Sfx.chips(); }
      else if (a === 'deal') return deal();
      render();
    } else act(a);
  }

  function mount(container) {
    el = container; gen++;
    shoe = shoe.length ? shoe : newShoe();
    dealer = []; hands = []; bet = 0; phase = 'bet'; hideHole = true;
    msg = 'Place your bet';
    el.onclick = onClick;
    render();
  }
  function unmount() {
    // leaving mid-hand: refund the stake so no money silently vanishes
    if (phase === 'play' || phase === 'dealing' || phase === 'dealer') hands.forEach(h => Store.addMoney(h.bet));
    gen++; phase = 'bet';
    if (el) el.onclick = null;
  }
  Store.onChange(() => { if (el && el.querySelector('.table.bj')) { if (phase === 'bet') bet = Math.min(bet, Store.s.bank); render(); } });

  return { mount, unmount };
})();
