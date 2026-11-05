// Persistent state shared by every game (saved in localStorage).
const Store = (() => {
  const KEY = 'cardroom.v1';
  const BOT_NAMES = ['Ace', 'Bella', 'Cruz', 'Dex', 'Echo', 'Faye'];
  const fresh = () => ({
    bank: 1000,                                   // the player's money (shared by all games)
    botBuyIn: 1000,                               // what a computer player re-buys with after busting
    botCount: 3,                                  // computer players at the single-player poker table (1–6)
    bots: BOT_NAMES.map(name => ({ name, stack: 1000 })),
  });
  let s;
  try { s = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { s = fresh(); }
  if (!Array.isArray(s.bots)) s.bots = [];
  // older saves had 3 bots: keep their chips and add the new seats
  BOT_NAMES.forEach((name, i) => { if (!s.bots[i] || typeof s.bots[i].stack !== 'number') s.bots[i] = { name, stack: s.botBuyIn || 1000 }; s.bots[i].name = name; });
  s.bots.length = BOT_NAMES.length;
  s.botCount = Math.min(6, Math.max(1, Math.round(+s.botCount || 3)));
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
    setBotCount(n) { s.botCount = Math.min(6, Math.max(1, Math.round(n))); store.changed(); },
    activeBots() { return s.bots.slice(0, s.botCount); },
    reset() { Object.assign(s, fresh()); store.changed(); },
  };
  return store;
})();
