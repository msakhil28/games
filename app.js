const $ = s => document.querySelector(s);
const view = $('#view'), title = $('#title'), back = $('#back'), dlg = $('#settings');
let screen = null;

function route() {
  const name = location.hash.slice(1);
  if (screen === 'poker') Poker.unmount();
  if (screen === 'blackjack') Blackjack.unmount();
  screen = ['poker', 'blackjack'].includes(name) ? name : 'menu';
  back.hidden = screen === 'menu';
  if (screen === 'menu') {
    title.textContent = 'Card Room';
    view.className = 'menu';
    view.innerHTML = `
      <p class="hint">Pick a game. Your money is shared across games and saved on this device.</p>
      <a class="game-card" href="#poker"><span class="big">♠</span><div><b>Poker</b><small>Texas Hold’em vs 3 computer players</small></div></a>
      <a class="game-card" href="#blackjack"><span class="big red">♥</span><div><b>Blackjack</b><small>Beat the dealer to 21 · pays 3:2</small></div></a>
      <button class="btn" id="open-settings">⚙ Add money / settings</button>
      <p class="hint" id="install-hint"></p>`;
    $('#open-settings').onclick = openSettings;
    showInstallHint();
  } else {
    title.textContent = screen === 'poker' ? 'Poker' : 'Blackjack';
    view.className = screen;
    (screen === 'poker' ? Poker : Blackjack).mount(view);
  }
}

/* ---------- settings ---------- */
function settingsHTML() {
  const s = Store.s;
  return `<form method="dialog" class="set">
    <h2>Settings</h2>
    <section>
      <h3>Your money: <b>${Store.fmt(s.bank)}</b></h3>
      <div class="row wrap">
        ${[100, 500, 1000, 5000].map(n => `<button type="button" class="btn" data-add="${n}">+${Store.fmt(n)}</button>`).join('')}
      </div>
      <div class="row">
        <input id="custom-add" type="number" inputmode="numeric" min="1" placeholder="Custom amount">
        <button type="button" class="btn primary" data-add="custom">Add</button>
      </div>
      <div class="row">
        <input id="set-bank" type="number" inputmode="numeric" min="0" placeholder="Set exact amount">
        <button type="button" class="btn" data-setbank>Set</button>
      </div>
    </section>
    <section>
      <h3>Poker — computer players’ chips</h3>
      ${s.bots.map((b, i) => `<div class="row"><label for="bot${i}">${b.name}</label>
        <input id="bot${i}" type="number" inputmode="numeric" min="0" value="${b.stack}">
        <button type="button" class="btn" data-bot="${i}">Set</button></div>`).join('')}
      <div class="row wrap">
        <input id="all-bots" type="number" inputmode="numeric" min="0" placeholder="All players">
        <button type="button" class="btn" data-allbots>Set all</button>
      </div>
      <div class="row"><label for="buyin">Re-buy when broke</label>
        <input id="buyin" type="number" inputmode="numeric" min="10" value="${s.botBuyIn}">
        <button type="button" class="btn" data-buyin>Save</button></div>
    </section>
    <section>
      <button type="button" class="btn danger" data-reset>Reset everything</button>
    </section>
    <div class="row end"><button class="btn primary">Done</button></div>
  </form>`;
}
function openSettings() { dlg.innerHTML = settingsHTML(); if (!dlg.open) dlg.showModal(); }
const num = id => Math.max(0, Math.round(+document.getElementById(id).value || 0));
dlg.addEventListener('click', e => {
  if (e.target === dlg) return dlg.close(); // click on backdrop
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('add' in d) { const n = d.add === 'custom' ? num('custom-add') : +d.add; if (n) Store.addMoney(n); }
  else if ('setbank' in d) { if (document.getElementById('set-bank').value !== '') Store.addMoney(num('set-bank') - Store.s.bank); }
  else if ('bot' in d) Store.setBotStack(+d.bot, num('bot' + d.bot));
  else if ('allbots' in d) { if (document.getElementById('all-bots').value !== '') { const n = num('all-bots'); Store.s.bots.forEach((_, i) => Store.setBotStack(i, n)); } }
  else if ('buyin' in d) { Store.s.botBuyIn = Math.max(10, num('buyin')); Store.changed(); }
  else if ('reset' in d) { if (confirm('Reset your money and all computer players to defaults?')) Store.reset(); }
  else return;
  if (dlg.open) dlg.innerHTML = settingsHTML();
});

/* ---------- misc ---------- */
Store.onBank(() => { $('#bank').textContent = Store.s.bank.toLocaleString('en-US'); });
$('#bank').textContent = Store.s.bank.toLocaleString('en-US');
$('#gear').onclick = openSettings;
back.onclick = () => { location.hash = ''; };
window.addEventListener('hashchange', route);

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; showInstallHint(); });
function showInstallHint() {
  const h = $('#install-hint'); if (!h) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { h.textContent = ''; return; }
  if (deferredInstall) {
    h.innerHTML = '<button class="btn primary" id="install">Install app</button>';
    $('#install').onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; showInstallHint(); };
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    h.textContent = 'To install: tap Share, then “Add to Home Screen”.';
  } else {
    h.textContent = 'To install: use your browser menu → “Install app” / “Add to Home screen”.';
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
route();
