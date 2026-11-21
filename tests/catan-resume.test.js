// Regression: saving and resuming Settlers in the middle of a turn must continue that turn.  Run: node --test tests/
const test = require('node:test'), assert = require('node:assert'), vm = require('vm'), fs = require('fs'), path = require('path');

function load(randoms) {
  // board shuffling uses real randomness; scripted values only start once a test calls ctx.script([...])
  let seq = null;
  const M = Object.create(Math); M.random = () => (seq ? (seq.length ? seq.shift() : 0.5) : Math.random());
  const noop = () => {};
  const ctx = vm.createContext({
    Math: M, console, setTimeout, clearTimeout, WeakMap, JSON, Object, Array, Number,
    UI: { esc: s => String(s) }, Sfx: new Proxy({}, { get: () => noop }),
    document: { addEventListener: noop, body: {}, querySelector: noop, getElementById: noop },
    MutationObserver: class { observe() {} }, MouseEvent: class {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'catan.js'), 'utf8') + ';this.CatanGame = CatanGame; this.CAT = CAT;', ctx);
  ctx.script = a => { seq = [...a]; };
  return ctx;
}
// io that records every prompt and lets the test answer it
function makeIo() {
  const io = { prompts: [], waiting: null, update() {}, fx() {},
    decide(pi, phase, data) { io.prompts.push(phase); return new Promise(r => { io.waiting = { r, phase, data }; }); },
    answer(a) { const w = io.waiting; io.waiting = null; w.r(a); } };
  return io;
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await tick(10); } };

// a finished setup so the game starts straight in the main phase
function mainGame(ctx, io) {
  const g = new ctx.CatanGame({ players: [{ name: 'You', kind: 'human' }, { name: 'Bot', kind: 'cpu' }] }, io);
  g.st.setupLeft = []; g.st.msg = '';
  return g;
}

test('resume while the robber is pending: no roll offered, robber first, then the same turn continues', async () => {
  // dice: 6 then 1 = a 7
  const ctx = load();
  const io1 = makeIo(), g1 = mainGame(ctx, io1);
  ctx.script([0.99, 0]);
  g1.run();
  await until(() => io1.waiting && io1.waiting.phase === 'pre');
  io1.answer({ type: 'roll' });
  await until(() => io1.waiting && io1.waiting.phase === 'robber');
  assert.equal(g1.st.phase, 'robber');
  assert.equal(g1.st.rolled, true);
  // leave through the menu / refresh: stop and keep only the JSON that was saved
  g1.stop();
  const saved = JSON.parse(JSON.stringify(g1.st));

  const io2 = makeIo(), g2 = ctx.CatanGame.restore(saved, io2);
  g2.run();
  await until(() => io2.waiting);
  assert.equal(io2.waiting.phase, 'robber', 'first prompt after resume is the robber, not a roll');
  assert.ok(!io2.prompts.includes('pre'));
  // a roll answer must not be accepted in place of a robber move
  io2.answer({ type: 'roll' });
  await tick(50);
  assert.equal(io2.waiting.phase, 'robber');
  assert.equal(g2.st.dice[0] + g2.st.dice[1], 7, 'dice were not re-rolled');
  const target = saved.tiles.findIndex((_, h) => h !== saved.robber);
  io2.answer({ h: target });
  await until(() => io2.waiting && io2.waiting.phase === 'main');
  assert.equal(g2.st.robber, target);
  assert.equal(g2.st.turn, 0, 'still the original player\'s turn');
  assert.equal(g2.st.rolled, true);
  assert.ok(!io2.prompts.includes('pre'), 'the roll is never offered again this turn');
  g2.stop();
});

test('resume at the steal step does not roll again', async () => {
  const ctx = load();
  const io = makeIo(), g = mainGame(ctx, io);
  g.st.phase = 'steal'; g.st.rolled = true; g.st.v = 2;
  // give the bot a settlement next to the robber so there is a victim
  g.st.robber = 0; g.st.vert[ctx.CAT.HEX[0].v[0]] = { o: 1, city: false }; g.st.players[1].res.wood = 2;
  g.run();
  await until(() => io.waiting || g.st.phase === 'main');
  assert.ok(!io.prompts.includes('pre'));
  g.stop();
});

test('older saves (no st.v): robber phase still resumes safely; other phases restart the turn at the roll', async () => {
  const ctx = load();
  const a = makeIo(), g1 = mainGame(ctx, a);
  g1.st.phase = 'robber'; g1.st.rolled = true;            // legacy: no st.v
  g1.run();
  await until(() => a.waiting);
  assert.equal(a.waiting.phase, 'robber');
  g1.stop();
  const b = makeIo(), g2 = mainGame(ctx, b);
  g2.st.phase = 'main'; g2.st.rolled = true;              // legacy ambiguous state
  g2.run();
  await until(() => b.waiting);
  assert.equal(b.waiting.phase, 'pre');
  assert.equal(g2.st.v, 2, 'later saves carry the version');
  g2.stop();
});

test('resume after the roll continues in the building step, and a mid-game resume keeps whose turn it is', async () => {
  const ctx = load();
  const io = makeIo(), g = mainGame(ctx, io);
  g.st.v = 2; g.st.phase = 'main'; g.st.rolled = true; g.st.turn = 0;
  g.run();
  await until(() => io.waiting);
  assert.equal(io.waiting.phase, 'main');
  g.stop();
  const io2 = makeIo(), g2 = mainGame(ctx, io2);
  g2.st.v = 2; g2.st.phase = 'pre'; g2.st.turn = 1;       // the bot's turn, before its roll
  g2.run(); await tick(100);
  assert.equal(g2.st.turn, 1, 'turn is not reset to player 0 on resume');
  g2.stop();
});
