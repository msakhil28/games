// Regression tests for single-player blackjack action legality.  Run: node --test tests/
const test = require('node:test'), assert = require('node:assert'), vm = require('vm'), fs = require('fs'), path = require('path');

function load(bank = 1000) {
  const Store = { s: { bank }, addMoney(n) { this.s.bank += n; }, fmt: n => '$' + n, onChange() {} };
  const log = { docks: [] };
  const UI = {
    bjTable: () => '', betTray: () => '', burst() {},
    bjPlayDock(y) { log.docks.push(y); return ''; },
  };
  const Sfx = new Proxy({}, { get: () => () => {} });
  const ctx = vm.createContext({ Store, UI, Sfx, setTimeout, clearTimeout, console, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'blackjack.js'), 'utf8') + ';this.Blackjack = Blackjack;', ctx);
  ctx.Blackjack.mount({ innerHTML: '' });
  return { BJ: ctx.Blackjack, Store, log };
}
const c = (r, s = '♠') => ({ r, s });
// shoe is popped from the end
function start(h, o = {}) {
  const t = load(o.bank ?? 1000);
  const hands = [{ cards: h.map(x => ({ ...x })), bet: o.bet ?? 100, done: false, split: false }];
  t.Store.s.bank -= hands[0].bet;   // stake already taken at deal time
  t.BJ._test.setup({ shoe: [...Array(30).fill(c(2, '♥')), ...o.shoe], dealer: o.dealer || [c(10), c(7, '♥')], hands });
  return t;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('Double then immediate Hit: hit is rejected, exactly one card and one extra wager', async () => {
  const { BJ, Store } = start([c(8, '♣'), c(10, '♦')], { shoe: [c(12, '♣'), c(9), c(8, '♦')] });
  const p1 = BJ._test.act('double');
  const p2 = BJ._test.act('hit');          // fired while the Double follow-up animation is pending
  await Promise.all([p1, p2]);
  const h = BJ._test.state.hands[0];
  assert.equal(h.cards.length, 3, 'double deals exactly one card');
  assert.equal(h.cards[2].r, 8);
  assert.equal(h.bet, 200);
  assert.equal(h.doubled, true);
  assert.equal(h.done, true);
  assert.equal(Store.s.bank, 800, 'stake 100 + one extra 100 wager charged');
  await sleep(1700);                        // let dealer play + settle finish
});

test('Repeated Double clicks charge once and draw once', async () => {
  const { BJ, Store } = start([c(5), c(6, '♦')], { shoe: [c(2), c(2), c(2), c(10)] });
  await Promise.all([BJ._test.act('double'), BJ._test.act('double'), BJ._test.act('double')]);
  const h = BJ._test.state.hands[0];
  assert.equal(h.cards.length, 3);
  assert.equal(h.bet, 200);
  assert.equal(Store.s.bank, 800);
});

test('Double is illegal without funds or after a hit', async () => {
  const poor = start([c(5), c(6, '♦')], { bank: 100, shoe: [c(2)] });   // bank is 0 after the stake
  await poor.BJ._test.act('double');
  assert.equal(poor.BJ._test.state.hands[0].cards.length, 2);
  const hit = start([c(2), c(3, '♦')], { shoe: [c(2), c(2)] });
  await hit.BJ._test.act('hit');
  await hit.BJ._test.act('double');
  assert.equal(hit.BJ._test.state.hands[0].cards.length, 3);
  assert.equal(hit.BJ._test.state.hands[0].bet, 100);
});

test('Input after bust or stand is ignored', async () => {
  const bust = start([c(10), c(6, '♦')], { shoe: [c(5), c(10)] });
  const before = bust.Store.s.bank;
  await Promise.all([bust.BJ._test.act('hit'), bust.BJ._test.act('hit'), bust.BJ._test.act('stand'), bust.BJ._test.act('double')]);
  assert.equal(bust.BJ._test.state.hands[0].cards.length, 3, 'only the first hit draws (bust)');
  assert.equal(bust.Store.s.bank, before);
  const stand = start([c(10), c(8, '♦')], { shoe: [c(5), c(5)] });
  await Promise.all([stand.BJ._test.act('stand'), stand.BJ._test.act('hit'), stand.BJ._test.act('double')]);
  assert.equal(stand.BJ._test.state.hands[0].cards.length, 2);
  assert.equal(stand.BJ._test.state.hands[0].bet, 100);
});

test('Hand settles only once (bank paid once)', async () => {
  const { BJ, Store } = start([c(10), c(10, '♦')], { shoe: [c(2)], dealer: [c(10), c(8, '♥')] });
  await Promise.all([BJ._test.act('stand'), BJ._test.act('stand'), BJ._test.act('stand')]);
  await sleep(1800);
  assert.equal(Store.s.bank, 1100, '20 beats 18: stake 100 returned plus 100 win, once');
});

test('Split progression: hands play in order and a done hand takes no input', async () => {
  const { BJ, Store } = start([c(8), c(8, '♦')], { shoe: [c(10), c(3), c(2), c(5)] });
  await BJ._test.act('split');
  let st = BJ._test.state;
  assert.equal(st.hands.length, 2);
  assert.equal(st.active, 0);
  assert.equal(Store.s.bank, 800);
  const standing = BJ._test.act('stand');
  await BJ._test.act('hit');                 // stale input while the first hand is finishing
  await standing;
  st = BJ._test.state;
  assert.equal(st.hands[0].cards.length, 2, 'first hand unchanged after it stood');
  assert.equal(st.active, 1, 'now on the second hand');
});
