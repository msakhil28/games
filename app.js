const $ = s => document.querySelector(s);
const view = $('#view'), title = $('#title'), back = $('#back'), dlg = $('#settings');
let screen = null;

function route() {
  let name = location.hash.slice(1), joinCode = '';
  if (name.startsWith('join/')) { joinCode = name.slice(5); name = 'mp'; history.replaceState(null, '', '#mp'); }
  if (screen === 'poker') Poker.unmount();
  if (screen === 'blackjack') Blackjack.unmount();
  if (screen === 'mp') MP.unmount();
  if (screen === 'ludo') Ludo.unmount();
  if (screen === 'business') Business.unmount();
  screen = ['poker', 'blackjack', 'mp', 'ludo', 'business'].includes(name) ? name : 'menu';
  back.hidden = screen === 'menu';
  $('.bank').hidden = ['mp', 'ludo', 'business'].includes(screen);
  if (screen === 'menu') {
    title.textContent = '';
    view.className = 'menu';
    const C = (r, s) => UI.card({ r, s }, null, 'lg');
    view.innerHTML = `
      <section class="hero">
        <div class="fan">${C(14, '♠')}${C(13, '♥')}${C(12, '♣')}${C(11, '♦')}</div>
        <h2 class="wordmark">Card Room</h2>
        <p class="tagline">Casino night, in your pocket</p>
      </section>
      <nav class="tiles">
        <a class="tile t-poker" href="#poker">
          <div class="art">${UI.card({ r: 14, s: '♠' }, null, 'sm')}${UI.card({ r: 14, s: '♥' }, null, 'sm')}</div>
          <div class="txt"><b>Texas Hold’em</b><small>Up to 6 sharp opponents</small></div><span class="go">›</span></a>
        <a class="tile t-bj" href="#blackjack">
          <div class="art">${UI.card({ r: 14, s: '♣' }, null, 'sm')}${UI.card({ r: 13, s: '♦' }, null, 'sm')}</div>
          <div class="txt"><b>Blackjack</b><small>Beat the dealer · pays 3 to 2</small></div><span class="go">›</span></a>
        <a class="tile t-ludo" href="#ludo">
          <div class="art"><span class="token t-red static"></span><span class="token t-green static"></span><span class="token t-yellow static"></span><span class="token t-blue static"></span></div>
          <div class="txt"><b>Ludo</b><small>Indian rules · online with friends or vs computer</small></div><span class="go">›</span></a>
        <a class="tile t-biz" href="#business">
          <div class="art"><span class="biz-art">🏙️</span></div>
          <div class="txt"><b>Business</b><small>Indian property game · online or vs computer</small></div><span class="go">›</span></a>
        ${MP.inRoom()
          ? `<a class="tile t-live" href="#mp"><div class="art"><span class="live-dot"></span></div><div class="txt"><b>Back to room ${MP.code()}</b><small>Your friends are waiting</small></div><span class="go">›</span></a>`
          : `<a class="tile t-friends" href="#mp"><div class="art">${UI.chipStack(600, 'art')}</div><div class="txt"><b>Play with friends</b><small>Private table · join from any phone</small></div><span class="go">›</span></a>`}
      </nav>
      <button class="b b-ghost wide" id="open-settings">Cashier · add money & settings</button>
      <p class="hint" id="install-hint"></p>`;
    $('#open-settings').onclick = openSettings;
    showInstallHint();
  } else if (screen === 'business') {
    title.textContent = 'Business';
    view.className = 'biz-view';
    Business.mount(view);
  } else if (screen === 'ludo') {
    title.textContent = 'Ludo';
    view.className = 'ludo-view';
    Ludo.mount(view);
  } else if (screen === 'mp') {
    view.className = 'mp';
    MP.mount(view, { code: joinCode });
  } else {
    title.textContent = screen === 'poker' ? 'Hold’em' : 'Blackjack';
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
      <h3>Poker — computer players</h3>
      <div class="row"><label>Opponents</label>
        <span class="stepper"><button type="button" data-botcount="-1" ${s.botCount <= 1 ? 'disabled' : ''}>−</button><b>${s.botCount}</b><button type="button" data-botcount="1" ${s.botCount >= 6 ? 'disabled' : ''}>+</button></span></div>
      ${Store.activeBots().map((b, i) => `<div class="row"><label for="bot${i}">${b.name}</label>
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
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('add' in d) { const n = d.add === 'custom' ? num('custom-add') : +d.add; if (n) Store.addMoney(n); }
  else if ('setbank' in d) { if (document.getElementById('set-bank').value !== '') Store.addMoney(num('set-bank') - Store.s.bank); }
  else if ('bot' in d) Store.setBotStack(+d.bot, num('bot' + d.bot));
  else if ('botcount' in d) Store.setBotCount(Store.s.botCount + +d.botcount);
  else if ('allbots' in d) { if (document.getElementById('all-bots').value !== '') { const n = num('all-bots'); Store.activeBots().forEach((_, i) => Store.setBotStack(i, n)); } }
  else if ('buyin' in d) { Store.s.botBuyIn = Math.max(10, num('buyin')); Store.changed(); }
  else if ('reset' in d) { UI.ask('Reset your money and all computer players to defaults?', 'Reset', true).then(ok => { if (ok) { Store.reset(); if (dlg.open) dlg.innerHTML = settingsHTML(); } }); return; }
  else return;
  if (dlg.open) dlg.innerHTML = settingsHTML();
});

/* ---------- light-dismiss fallback for browsers without <dialog closedby> ---------- */
function lightDismiss(d) {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
    if (!inside) d.close();
  });
}
lightDismiss(dlg);

/* ---------- sound toggle ---------- */
const soundBtn = $('#sound');
const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/>';
function paintSound() {
  soundBtn.innerHTML = SPK + (Sfx.enabled()
    ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');
  soundBtn.setAttribute('aria-pressed', String(Sfx.enabled()));
}
soundBtn.onclick = () => { Sfx.toggle(); paintSound(); };
paintSound();

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

if ('serviceWorker' in navigator) {
  // When a new version takes over (after a deploy), reload once so the new files show up immediately.
  // Skip it on the very first install, and never while a multiplayer room is active.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || MP.inRoom()) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => {
      reg.update().catch(() => {});
      // Check for updates whenever the app comes back to the foreground (installed apps stay open for days).
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    })
    .catch(() => {});
}
route();
