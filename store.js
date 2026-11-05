// Persistent state shared by every game (saved in localStorage).
const Store = (() => {
  const KEY = 'cardroom.v1';
  const BOT_NAMES = ['Ace', 'Bella', 'Cruz'];
  const fresh = () => ({
    bank: 1000,                                   // the player's money (shared by all games)
    botBuyIn: 1000,                               // what a computer player re-buys with after busting
    bots: BOT_NAMES.map(name => ({ name, stack: 1000 })),
  });
  let s;
  try { s = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { s = fresh(); }
  if (!Array.isArray(s.bots) || s.bots.length !== 3) s.bots = fresh().bots;
  const listeners = [], bankListeners = [];
  const store = {
    s,
    fmt: n => '$' + Math.round(n).toLocaleString('en-US'),
    save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} },
    changed() { store.save(); bankListeners.forEach(f => f()); listeners.forEach(f => f()); },
    touch() { store.save(); bankListeners.forEach(f => f()); },   // money moved, no full re-render needed
    onBank(f) { bankListeners.push(f); },
    onChange(f) { listeners.push(f); },
    addMoney(n) { s.bank = Math.max(0, Math.round(s.bank + n)); store.changed(); },
    setBotStack(i, n) { s.bots[i].stack = Math.max(0, Math.round(n)); store.changed(); },
    reset() { Object.assign(s, fresh()); store.changed(); },
  };
  return store;
})();
