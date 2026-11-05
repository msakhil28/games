const $ = s => document.querySelector(s);

// Real screen height. Installed iOS apps keep a stale 100% height after rotating (the black strip),
// so measure it ourselves and re-measure on every resize / rotation.
(() => {
  const setH = () => document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  setH();
  addEventListener('resize', setH);
  addEventListener('orientationchange', () => [50, 200, 500, 900].forEach(t => setTimeout(setH, t)));
  window.screen.orientation?.addEventListener?.('change', () => [50, 200, 500].forEach(t => setTimeout(setH, t)));
  document.addEventListener('visibilitychange', setH);
})();
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
  if (screen === 'catan') Catan.unmount();
  screen = ['poker', 'blackjack', 'mp', 'ludo', 'business', 'catan'].includes(name) ? name : 'menu';
  back.hidden = screen === 'menu';
  $('.bank').hidden = ['mp', 'ludo', 'business', 'catan'].includes(screen);
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
        <a class="tile t-catan" href="#catan">
          <div class="art"><span class="biz-art">🏝️</span></div>
          <div class="txt"><b>Settlers</b><small>Catan-style island trading · online or vs computer</small></div><span class="go">›</span></a>
        ${MP.inRoom()
          ? `<a class="tile t-live" href="#mp"><div class="art"><span class="live-dot"></span></div><div class="txt"><b>Back to room ${MP.code()}</b><small>Your friends are waiting</small></div><span class="go">›</span></a>`
          : `<a class="tile t-friends" href="#mp"><div class="art">${UI.chipStack(600, 'art')}</div><div class="txt"><b>Play with friends</b><small>Private table · join from any phone</small></div><span class="go">›</span></a>`}
      </nav>
      <button class="b b-ghost wide" id="open-settings">Cashier · add money & settings</button>
      <p class="hint" id="install-hint"></p>`;
    $('#open-settings').onclick = openSettings;
    showInstallHint();
  } else if (screen === 'catan') {
    title.textContent = 'Settlers';
    view.className = 'catan-view';
    Catan.mount(view);
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
  const s = Store.s, fmt = Store.fmt;
  const group = (id, value, placeholder, btn, data, primary) => `<div class="cs-group">
      <span class="cs-cur">$</span><input id="${id}" type="number" inputmode="numeric" min="0" ${value !== '' ? `value="${value}"` : ''} placeholder="${placeholder}">
      <button type="button" class="cs-go${primary ? ' primary' : ''}" ${data}>${btn}</button></div>`;
  return `<div class="cashier">
    <header class="cs-head">
      <div><small>Cashier</small><h2>Money &amp; settings</h2></div>
      <button type="button" class="cs-close" data-close aria-label="Close">✕</button>
    </header>
    <div class="cs-body">
      <section class="cs-card">
        <div class="cs-balance"><i class="chip c1000"></i><div><small>Your balance</small><b id="cs-bal">${fmt(s.bank)}</b></div></div>
        <div class="cs-quick">${[100, 500, 1000, 5000].map(n => `<button type="button" data-add="${n}"><i class="chip c${n === 5000 ? 1000 : n}"></i>+${n >= 1000 ? n / 1000 + 'K' : n}</button>`).join('')}</div>
        <label class="cs-field"><span>Add amount</span>${group('custom-add', '', 'e.g. 2500', 'Add', 'data-add="custom"', true)}</label>
        <label class="cs-field"><span>Set balance to</span>${group('set-bank', '', 'exact amount', 'Set', 'data-setbank')}</label>
      </section>

      <section class="cs-card">
        <div class="cs-title"><div><h3>Poker opponents</h3><small>Computer players at your table</small></div>
          <span class="cs-step"><button type="button" data-botcount="-1" ${s.botCount <= 1 ? 'disabled' : ''} aria-label="Fewer">−</button><b>${s.botCount}</b><button type="button" data-botcount="1" ${s.botCount >= 6 ? 'disabled' : ''} aria-label="More">+</button></span></div>
        <ul class="cs-bots">${Store.activeBots().map((b, i) => `<li>${UI.avatar(b.name, b.name + 's' + (i + 1), true)}<span class="cs-name">${b.name}<small>${fmt(b.stack)}</small></span>
          ${group('bot' + i, b.stack, '0', 'Set', `data-bot="${i}"`)}</li>`).join('')}</ul>
        <label class="cs-field"><span>Give every opponent</span>${group('all-bots', '', 'chips each', 'Apply', 'data-allbots')}</label>
        <label class="cs-field"><span>Re-buy when broke</span>${group('buyin', s.botBuyIn, '1000', 'Save', 'data-buyin')}</label>
      </section>

      <section class="cs-card cs-danger">
        <div><b>Reset everything</b><small>Balance and computer players back to defaults</small></div>
        <button type="button" class="cs-reset" data-reset>Reset</button>
      </section>
    </div>
    <footer class="cs-foot"><button type="button" class="b b-raise big" data-close>Done</button></footer>
  </div>`;
}
function openSettings() { dlg.innerHTML = settingsHTML(); if (!dlg.open) dlg.showModal(); }
const num = id => Math.max(0, Math.round(+document.getElementById(id).value || 0));
dlg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('close' in d) return dlg.close();
  if ('add' in d) { const n = d.add === 'custom' ? num('custom-add') : +d.add; if (n) { Store.addMoney(n); Sfx.chips(); bump = true; } }
  else if ('setbank' in d) { if (document.getElementById('set-bank').value !== '') Store.addMoney(num('set-bank') - Store.s.bank); }
  else if ('bot' in d) Store.setBotStack(+d.bot, num('bot' + d.bot));
  else if ('botcount' in d) Store.setBotCount(Store.s.botCount + +d.botcount);
  else if ('allbots' in d) { if (document.getElementById('all-bots').value !== '') { const n = num('all-bots'); Store.activeBots().forEach((_, i) => Store.setBotStack(i, n)); } }
  else if ('buyin' in d) { Store.s.botBuyIn = Math.max(10, num('buyin')); Store.changed(); }
  else if ('reset' in d) { UI.ask('Reset your money and all computer players to defaults?', 'Reset', true).then(ok => { if (ok) { Store.reset(); if (dlg.open) dlg.innerHTML = settingsHTML(); } }); return; }
  else return;
  if (dlg.open) { const y = dlg.querySelector('.cs-body')?.scrollTop || 0; dlg.innerHTML = settingsHTML(); dlg.querySelector('.cs-body').scrollTop = y; if (bump) dlg.querySelector('#cs-bal').classList.add('bump'); bump = false; }
});
let bump = false;
// Enter in a field presses its button
dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.cs-group input')) { e.preventDefault(); e.target.parentElement.querySelector('button').click(); } });

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
