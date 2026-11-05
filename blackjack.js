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

  function cardHTML(c) {
    const red = c.s === '♥' || c.s === '♦' ? ' red' : '';
    return `<div class="card${red}"><span class="r">${NAMES[c.r] || c.r}</span><span class="s">${c.s}</span></div>`;
  }

  function render() {
    if (!el) return;
    const dv = hideHole ? val(dealer[0] || { r: 0 }) + (dealer[0] && dealer[0].r === 1 ? 10 : 0) : total(dealer).t;
    const dealerHTML = dealer.map((c, i) => (i === 1 && hideHole) ? '<div class="card back"></div>' : cardHTML(c)).join('');
    const handsHTML = hands.map((h, i) => {
      const t = total(h.cards);
      return `<div class="bj-hand${phase === 'play' && i === active ? ' turn' : ''}">
        <div class="cards">${h.cards.map(cardHTML).join('')}</div>
        <div class="bj-info">${t.t}${t.soft && t.t < 21 ? ' (soft)' : ''}${t.t > 21 ? ' BUST' : ''} · bet ${Store.fmt(h.bet)}${h.result ? ` · <b class="${h.net > 0 ? 'win' : h.net < 0 ? 'lose' : ''}">${h.result}</b>` : ''}</div>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="bj-table">
      <div class="bj-dealer">
        <div class="label">Dealer ${dealer.length ? `· ${dv}${hideHole && dealer.length ? '+' : ''}` : ''}</div>
        <div class="cards">${dealerHTML || '<div class="card empty"></div>'}</div>
      </div>
      <div class="msg bj-msg">${msg}</div>
      <div class="bj-player">${handsHTML}</div>
      <div class="p-actions">${controlsHTML()}</div>
    </div>`;
  }

  function controlsHTML() {
    if (phase === 'play') {
      const h = hands[active];
      const two = h.cards.length === 2;
      const canDouble = two && Store.s.bank >= h.bet;
      const canSplit = two && val(h.cards[0]) === val(h.cards[1]) && hands.length < 4 && Store.s.bank >= h.bet;
      return `<div class="act-row">
        <button class="btn primary" data-a="hit">Hit</button>
        <button class="btn" data-a="stand">Stand</button>
        <button class="btn" data-a="double" ${canDouble ? '' : 'disabled'}>Double</button>
        <button class="btn" data-a="split" ${canSplit ? '' : 'disabled'}>Split</button>
      </div>`;
    }
    if (phase === 'dealer') return '';
    const bank = Store.s.bank;
    const rebet = lastBet >= MIN_BET && lastBet <= bank + bet;
    return `<div class="bet-box">
      <div class="bet-amt">Bet <b>${Store.fmt(bet)}</b></div>
      <div class="chips">${CHIPS.map(c => `<button class="chip c${c}" data-chip="${c}" ${bet + c > bank ? 'disabled' : ''}>${c}</button>`).join('')}</div>
      <div class="act-row">
        <button class="btn" data-a="clear" ${bet ? '' : 'disabled'}>Clear</button>
        ${rebet ? `<button class="btn" data-a="rebet">Rebet ${Store.fmt(lastBet)}</button>` : ''}
        <button class="btn" data-a="max" ${bank >= MIN_BET ? '' : 'disabled'}>Max</button>
        <button class="btn primary" data-a="deal" ${bet >= MIN_BET ? '' : 'disabled'}>Deal</button>
      </div>
    </div>`;
  }

  async function deal() {
    if (bet < MIN_BET || bet > Store.s.bank) return;
    const g = gen;
    const stake = bet;
    lastBet = stake; bet = 0;
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
      Store.addMoney(-h.bet); h.bet *= 2; h.doubled = true;
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
    if (Store.s.bank < MIN_BET) msg += ' Out of money? Tap ⚙ to add some.';
    bet = 0;
    phase = 'bet';
    render();
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.chip) {
      if (phase === 'bet') { if (hands.length && hands[0].result) { hands = []; dealer = []; msg = ''; } bet = Math.min(Store.s.bank, bet + +b.dataset.chip); render(); }
      return;
    }
    const a = b.dataset.a;
    if (phase === 'bet') {
      if (a === 'clear') bet = 0;
      else if (a === 'rebet') bet = Math.min(lastBet, Store.s.bank);
      else if (a === 'max') bet = Store.s.bank;
      else if (a === 'deal') return deal();
      render();
    } else act(a);
  }

  function mount(container) {
    el = container; gen++;
    shoe = shoe.length ? shoe : newShoe();
    dealer = []; hands = []; bet = 0; phase = 'bet'; hideHole = true;
    msg = 'Place your bet. Blackjack pays 3:2, dealer stands on 17.';
    el.onclick = onClick;
    render();
  }
  function unmount() {
    // leaving mid-hand: refund the stake so no money silently vanishes
    if (phase === 'play' || phase === 'dealing' || phase === 'dealer') hands.forEach(h => Store.addMoney(h.bet));
    gen++; phase = 'bet';
    if (el) el.onclick = null;
  }
  Store.onChange(() => { if (el && el.querySelector('.bj-table')) { if (phase === 'bet') bet = Math.min(bet, Store.s.bank); render(); } });

  return { mount, unmount };
})();
