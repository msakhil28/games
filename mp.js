// Multiplayer client: home (create/join), lobby, game tables, room menu.
// The host's device also uses this UI; its actions go straight into its RoomHost instead of over the network.
const MP = (() => {
  const idStore = Net.local ? sessionStorage : localStorage; // test mode: every tab is a different player
  const myId = idStore.getItem('cardroom.clientId') || ('p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
  idStore.setItem('cardroom.clientId', myId);
  const SESSION = 'cardroom.session';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Store.fmt(n);

  let el = null, role = null, host = null, conn = null, view = null;
  let status = 'home', error = '', code = '', prefill = '', intentional = false;
  let lastMsg = '', celebrated = '';
  let toasts = [], emotes = {}, bjBet = 0, raiseTo = 0, lastTurnKey = -1, wasMyTurn = false;
  const deadlines = {};
  let retry = null, lastPing = 0, watchdog = null, wakeLock = null, ticker = null;

  /* ---------- connection lifecycle ---------- */
  const myName = () => (idStore.getItem('cardroom.name') || '').trim();

  async function createRoom() {
    const name = readName(); if (!name) return;
    intentional = false; error = ''; role = 'host'; status = 'connecting'; render();
    host = new RoomHost({ id: myId, name }, onState);
    host.onLocalEvent = onEvent;
    try {
      code = await host.open();
      status = 'room';
      sessionStorage.removeItem(SESSION);
      keepAwake();
    } catch (e) {
      host = null; role = null; status = 'home'; error = e.message;
    }
    render();
  }

  async function joinRoom(c, quiet) {
    const name = quiet ? myName() : readName(); if (!name) return;
    c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 5) { error = 'Room codes have 5 characters.'; return render(); }
    intentional = false; error = ''; role = 'guest'; code = c;
    if (status !== 'reconnecting') status = 'connecting';
    render();
    try {
      const cn = await Net.join(c);
      if (intentional) return cn.close();
      attach(cn);
      cn.send({ t: 'hello', id: myId, name });
      sessionStorage.setItem(SESSION, JSON.stringify({ code: c }));
    } catch (e) {
      if (status === 'reconnecting') return scheduleRetry();
      role = null; status = 'home'; error = e.message; render();
    }
  }

  function attach(cn) {
    conn = cn;
    lastPing = Date.now();
    cn.onData(onMessage);
    cn.onClose(() => { if (conn === cn) onDisconnect(); });
    clearInterval(watchdog);
    watchdog = setInterval(() => { if (conn === cn && Date.now() - lastPing > 13000) cn.close(); }, 2000);
  }

  function onMessage(m) {
    if (!m || typeof m !== 'object') return;
    lastPing = Date.now();
    switch (m.t) {
      case 'ping': conn?.send({ t: 'pong' }); break;
      case 'welcome': code = m.code || code; clearTimeout(retry); retry = null; if (status === 'reconnecting') toast('Reconnected'); status = 'room'; keepAwake(); break;
      case 'state': if (status !== 'room') status = 'room'; onState(m.s); break;
      case 'toast': case 'emote': onEvent(m); break;
      case 'kicked': leave('The host removed you from the room.'); break;
      case 'closed': leave('The host closed the room.'); break;
      case 'error': leave(m.msg); break;
    }
  }

  function onDisconnect() {
    conn = null;
    clearInterval(watchdog);
    if (intentional || role !== 'guest') return;
    status = 'reconnecting';
    retryCount = 0;
    render();
    scheduleRetry();
  }
  let retryCount = 0;
  function scheduleRetry() {
    clearTimeout(retry);
    if (++retryCount > 40) { leave('Lost connection to the room.'); return; }
    render();
    retry = setTimeout(() => { if (status === 'reconnecting' && !intentional) joinRoom(code, true); }, retryCount === 1 ? 500 : 3000);
  }

  function leave(reason) {
    intentional = true;
    clearTimeout(retry); clearInterval(watchdog);
    if (host) { host.close(); host = null; }
    if (conn) { conn.send({ t: 'leave' }); const c = conn; conn = null; setTimeout(() => c.close(), 150); }
    sessionStorage.removeItem(SESSION);
    role = null; view = null; status = 'home'; error = reason || ''; code = '';
    releaseWake();
    closeSheet();
    render();
  }

  function send(msg) {
    if (role === 'host' && host) host.handle(myId, msg);
    else if (conn) conn.send(msg);
  }

  /* ---------- incoming ---------- */
  function onState(v) {
    view = v;
    const g = v.game;
    const myTurn = !!(g && g.you);
    if (myTurn && !wasMyTurn) { navigator.vibrate?.([120, 60, 120]); Sfx.turn(); }
    if (g && (g.kind === 'poker' || g.kind === 'blackjack')) {
      if (g.msg !== lastMsg) {
        if (/ calls | raises | bets | all-in|doubles/.test(g.msg)) Sfx.chips();
        else if (/ folds/.test(g.msg)) Sfx.fold();
        lastMsg = g.msg;
      }
      const key = g.kind + ':' + (g.handNo ?? g.round);
      if (g.phase === 'over' && celebrated !== key) {
        celebrated = key;
        if (g.kind === 'poker') {
          const s = g.seats.find(x => x.id === myId);
          if (s?.won) UI.burst(`You win ${fmt(s.won)}`, s.won >= 10 * g.bb ? 'big' : 'win');
          else if (s?.inHand && !s.folded) Sfx.lose();
        } else {
          const p = g.players.find(x => x.id === myId);
          if (p?.net > 0) UI.burst(p.hands.some(h => h.result === 'Blackjack!') ? 'Blackjack!' : `+${fmt(p.net)}`, p.hands.some(h => h.result === 'Blackjack!') ? 'big' : 'win');
          else if (p?.net < 0) Sfx.lose();
        }
      }
    }
    wasMyTurn = myTurn;
    if (g && g.turnKey !== lastTurnKey) { lastTurnKey = g.turnKey; raiseTo = 0; }
    if (g && g.st) {   // board games: animate the dice locally while the host is rolling
      clearInterval(rollAnim);
      if (g.st.rolling) rollAnim = setInterval(() => { rollFace = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; render(); }, 80);
    }
    render();
  }
  let rollAnim = null, rollFace = [1, 1], bizInfo = null, bizManage = false, bizTrade = { t: null };
  function onEvent(e) {
    if (e.t === 'toast') toast(e.text);
    if (e.t === 'fx') {   // sounds and celebrations from Ludo / Business
      const mine = Array.isArray(e.who) ? e.who.includes(myId) : e.who === myId, n = e.name;
      if (n === 'tprize') { if (mine) UI.burst('You win a prize!', 'big'); else Sfx.chips(); return; }
      if (n === 'tbogus') { if (mine) Sfx.lose(); return; }
      if (n === 'tover') { Sfx.win(); return; }
      if (n === 'deal') { Sfx.deal(); return; }
      if (n === 'declare') { Sfx.win(); return; }
      if (n === 'win') { if (mine) UI.burst('You win the deal!', 'big'); return; }
      if (['dice', 'hop', 'chip', 'chips', 'capture'].includes(n)) Sfx[n]?.();
      else if (n === 'card') Sfx.flip();
      else if (['build', 'produce', 'trade', 'robber', 'steal'].includes(n)) catanFx(n, mine);
      else if (n === 'home') Sfx.win();
      else if ((n === 'lose' || n === 'jail') && mine) Sfx.lose();
      else if (n === 'winner') { if (mine) UI.burst('You win!', 'big'); else Sfx.lose(); }
      else if (n === 'finish' && mine) UI.burst(e.extra === 1 ? 'You win!' : ['', '', '2nd place!', '3rd place!'][e.extra] || 'Finished!', e.extra === 1 ? 'big' : 'win');
    }
    if (e.t === 'shot') carView?.play(e.info);
    if (e.t === 'emote') {
      emotes[e.from] = { e: e.e, until: Date.now() + 2600 };
      setTimeout(render, 2700);
      render();
    }
  }
  function toast(text) {
    const t = { text, id: Math.random() };
    toasts.push(t); toasts = toasts.slice(-2);
    renderToasts();
    setTimeout(() => { toasts = toasts.filter(x => x !== t); renderToasts(); }, 2600);
  }

  /* ---------- screen wake lock (keeps the host's phone from sleeping) ---------- */
  async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {} }
  function releaseWake() { try { wakeLock?.release(); } catch {} wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || status !== 'room') return;
    keepAwake();
    if (role === 'guest' && conn && Date.now() - lastPing > 8000) conn.close(); // stale after the phone slept
  });
  window.addEventListener('beforeunload', e => { if (role === 'host' && host) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- helpers ---------- */
  function readName() {
    const inp = el?.querySelector('#mp-name');
    const name = (inp ? inp.value : myName()).trim().slice(0, 16);
    if (!name) { error = 'Enter your name first.'; render(); el?.querySelector('#mp-name')?.focus(); return ''; }
    idStore.setItem('cardroom.name', name);
    return name;
  }
  const inviteUrl = () => location.origin + location.pathname + location.search + '#join/' + code;
  async function share() {
    const url = inviteUrl();
    try {
      if (navigator.share) await navigator.share({ title: 'Join my Card Room', text: `Join my card table! Room code: ${code}`, url });
      else { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
    } catch {}
  }
  let qrCache = { code: '', svg: '' };
  function qrSvg() {
    if (qrCache.code === code) return qrCache.svg;
    try {
      const q = qrcode(0, 'M'); q.addData(inviteUrl()); q.make();
      qrCache = { code, svg: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) };
    } catch { qrCache = { code, svg: '' }; }
    return qrCache.svg;
  }
  const member = id => view?.members.find(m => m.id === id);
  function deadline(name, key, remaining, total) {
    if (remaining == null) { delete deadlines[name]; return null; }
    const d = deadlines[name];
    if (!d || d.key !== key) deadlines[name] = { key, until: Date.now() + remaining, total: total || remaining };
    return deadlines[name];
  }
  const secsLeft = d => d ? `<span class="secs" data-until="${d.until}"></span>` : '';
  const bubble = id => { const e = emotes[id]; return e && e.until > Date.now() ? `<span class="emote-bubble">${e.e}</span>` : ''; };

  /* ---------- rendering ---------- */
  function patch(sel, html) {
    const node = el.querySelector(sel);
    if (node && node._html !== html) { node.innerHTML = html; node._html = html; }
  }
  function layout(kind, html) {
    if (el.dataset.kind !== kind) { el.dataset.kind = kind; el.innerHTML = html + '<div id="mp-toasts" class="toasts"></div>'; renderToasts(true); }
  }

  function render() {
    if (!el) return;
    document.getElementById('title').textContent = status === 'room' && code ? `Room ${code}` : 'Play with friends';
    if (status === 'home') return renderHome();
    if (status === 'connecting' || (status === 'room' && !view)) {
      layout('wait', '<div id="mp-wait" class="mp-center"></div>');
      return patch('#mp-wait', `<div class="spinner"></div><p>${role === 'host' ? 'Creating your room…' : `Joining room ${esc(code)}…`}</p>
        <button class="btn" data-c="cancel">Cancel</button>`);
    }
    if (status === 'reconnecting' && !view) {
      layout('wait', '<div id="mp-wait" class="mp-center"></div>');
      return patch('#mp-wait', `<div class="spinner"></div><p>Reconnecting to room ${esc(code)}…</p><button class="btn" data-c="leave">Leave</button>`);
    }
    if (view.phase === 'lobby') renderLobby(); else renderGame();
    if (sheetOpen()) renderSheet();
  }

  function renderHome() {
    layout('home', '<div id="mp-home" class="mp-home"></div>');
    const name = myName();
    const inputsExist = el.querySelector('#mp-name');
    const html = `
      <div class="hero"><span>♠</span><span class="red">♥</span><span>♣</span><span class="red">♦</span></div>
      <p class="hint">Play Poker or Blackjack with friends in the same room or anywhere — everyone just opens this app on their phone.</p>
      <label class="field"><span>Your name</span><input id="mp-name" maxlength="16" autocomplete="nickname" value="${esc(name)}" placeholder="e.g. Sam"></label>
      <button class="btn primary big" data-c="create">Create a room</button>
      <div class="or"><span>or join a friend</span></div>
      <div class="row"><input id="mp-code" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="ROOM CODE" value="${esc(prefill)}">
        <button class="btn primary" data-c="join">Join</button></div>
      <p class="error">${esc(error)}</p>
      ${Net.local ? '<p class="hint">Test mode: rooms only work between tabs of this browser.</p>' : ''}`;
    if (!inputsExist) patch('#mp-home', html);
    else { el.querySelector('#mp-home .error').textContent = error; }
  }

  function renderLobby() {
    layout('lobby', `<div class="lobby">
      <div id="lb-code" class="code-box"></div>
      <div id="lb-members"></div>
      <div id="lb-settings"></div>
      <div id="lb-buttons"></div>
    </div><div id="mp-status"></div>`);
    const isHost = view.hostId === myId, s = view.settings;
    patch('#lb-code', `<small>Room code</small><div class="code">${esc(code)}</div>
      <div class="qr">${qrSvg()}</div>
      <small>Friends scan this or enter the code in “Play with friends”.</small>
      <button class="btn" data-c="share">Share invite link</button>`);
    patch('#lb-members', `<h3>Players <small>(${view.members.length}/8)</small></h3>
      <ul class="members">${view.members.map(m => `<li class="${m.online ? '' : 'off'}">
        ${UI.avatar(m.name, m.id, m.bot)}<span class="nm">${esc(m.name)}${m.host ? ' 👑' : ''}${m.id === myId ? ' <em>(you)</em>' : ''}${bubble(m.id)}${m.online || m.bot ? '' : ' <em>offline</em>'}</span>
        <span class="chips-l">${fmt(m.chips)}</span>
        ${isHost && !m.host ? `<button class="x" data-c="kick" data-id="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">✕</button>` : ''}
      </li>`).join('')}</ul>`);
    const opt = (key, vals, cur, label = v => v) => `<select data-set="${key}" ${isHost ? '' : 'disabled'}>${vals.map(v => `<option value="${v}" ${v == cur ? 'selected' : ''}>${label(v)}</option>`).join('')}</select>`;
    const gm = s.game, poker = gm === 'poker', board = ['ludo', 'business', 'catan', 'tambola', 'rummy', 'carrom'].includes(gm);
    const GAMES = [['poker', '♠', 'Poker'], ['blackjack', '♥', 'Blackjack'], ['ludo', '🎲', 'Ludo'], ['business', '🏙️', 'Business'], ['catan', '🏝️', 'Settlers'], ['tambola', '🎱', 'Tambola'], ['rummy', '🃏', 'Rummy'], ['carrom', '🎯', 'Carrom']];
    const bots = `<label>Computer players <span class="stepper">${isHost ? `<button data-c="bots" data-d="-1">−</button>` : ''}<b>${s.bots}</b>${isHost ? `<button data-c="bots" data-d="1">+</button>` : ''}</span></label>`;
    const n = view.members.length, max = { ludo: 4, business: 6, catan: 4, rummy: 6, carrom: 4 }[gm] || 8;
    patch('#lb-settings', `<h3>Game ${isHost ? '' : '<small>(chosen by host)</small>'}</h3>
      <div class="seg games">${GAMES.map(([id, ic, name]) => `<button data-set="game" data-v="${id}" class="${gm === id ? 'on' : ''}" ${isHost ? '' : 'disabled'}><span>${ic}</span>${name}</button>`).join('')}</div>
      <div class="opts">
        ${gm === 'poker' || gm === 'blackjack' ? `<label>Starting chips ${opt('startChips', [500, 1000, 2000, 5000, 10000], s.startChips, fmt)}</label>` : ''}
        ${poker ? `
          <label>Blinds ${opt('bb', [10, 20, 50, 100, 200], s.bb, v => `${fmt(v / 2)} / ${fmt(v)}`)}</label>${bots}
          <label class="check"><input type="checkbox" data-set="blindsUp" ${s.blindsUp ? 'checked' : ''} ${isHost ? '' : 'disabled'}> Tournament mode: blinds double every 10 hands</label>` : ''}
        ${gm === 'blackjack' ? `<label>Minimum bet ${opt('minBet', [5, 10, 25, 50, 100], s.minBet, fmt)}</label>` : ''}
        ${gm === 'ludo' ? `${bots}<label class="check"><input type="checkbox" data-set="ludoKill" ${s.ludoKill !== false ? 'checked' : ''} ${isHost ? '' : 'disabled'}> Must capture before entering home</label>` : ''}
        ${gm === 'catan' ? bots : ''}
        ${gm === 'tambola' ? `${bots}<label>Tickets each ${opt('tamTickets', [1, 2, 3], s.tamTickets)}</label>
          <label>Calling speed ${opt('tamSpeed', [3, 5, 8, 12], s.tamSpeed, v => ({ 3: 'Fast', 5: 'Normal', 8: 'Relaxed', 12: 'Slow' }[v]))}</label>` : ''}
        ${gm === 'rummy' ? `${bots}<label>Deals ${opt('rumDeals', [1, 2, 3, 5], s.rumDeals, v => v + (v > 1 ? ' (lowest total wins)' : ''))}</label>` : ''}
        ${gm === 'carrom' ? `${bots}<label>Computer skill ${opt('carLevel', [0, 1, 2], s.carLevel ?? 1, v => ['Easy', 'Medium', 'Hard'][v])}</label>` : ''}
        ${gm === 'business' ? `<label>Starting money ${opt('bizCash', [10000, 15000, 20000, 30000], s.bizCash, v => '₹' + v.toLocaleString('en-IN'))}</label>
          <label>Game length ${opt('bizRounds', [0, 15, 25, 40], s.bizRounds, v => v ? v + ' rounds' : 'Until one is left')}</label>${bots}` : ''}
        <label>Turn timer ${opt('timer', [0, 15, 30, 60], s.timer, v => v ? v + ' sec' : 'Off')}</label>
      </div>
      ${board ? `<p class="hint small">${gm === 'ludo' ? 'Up to 4 players — one colour each.' : gm === 'tambola' ? 'Everyone gets their own ticket(s) — the host calls the numbers. Claim prizes fast!' : gm === 'rummy' ? 'Indian Rummy, 13 cards, 2–6 players. Your cards stay private on your phone.' : gm === 'carrom' ? 'Exactly 2 players — or 4 as two partnerships (partners sit opposite).' : gm === 'catan' ? 'Catan-style, 2–4 players (3–4 is best). Your cards stay private on your phone.' : 'Up to 6 players.'} Everyone plays on their own phone; if someone’s time runs out, a move is made for them.</p>`
        : isHost ? '<p class="hint small">Changing starting chips resets everyone’s chips.</p>' : ''}`);
    const canStart = (poker || board) ? n >= 2 && n <= max && (gm !== 'carrom' || n === 2 || n === 4) : true;
    const NAME = { poker: 'Poker', blackjack: 'Blackjack', ludo: 'Ludo', business: 'Business', catan: 'Settlers', tambola: 'Tambola', rummy: 'Rummy', carrom: 'Carrom' }[gm];
    patch('#lb-buttons', isHost
      ? `<button class="btn primary big" data-c="start" ${canStart ? '' : 'disabled'}>Start ${NAME}</button>
         ${!canStart ? `<p class="hint small">${n < 2 ? 'Invite a friend or add a computer player to start.' : gm === 'carrom' && n <= max ? 'Carrom needs exactly 2 players, or 4 for partnerships — add or remove computer players.' : `${NAME} takes at most ${max} players — remove ${n - max} computer player${n - max > 1 ? 's' : ''}.`}</p>` : ''}
         <button class="btn danger" data-c="leave">Close room</button>`
      : `<p class="waiting">Waiting for the host to start…</p><button class="btn" data-c="leave">Leave room</button>`);
    patch('#mp-status', statusBanner());
  }

  const statusBanner = () => status === 'reconnecting' ? '<div class="banner">Connection lost — reconnecting…</div>' : '';

  function renderGame() {
    const g = view.game;
    layout('game-' + g.kind, `<div class="mp-game">
      <div id="g-top" class="g-top"></div>
      <div id="mp-status"></div>
      <div id="g-main"></div>
      <div id="g-actions" class="p-actions"></div>
      <div id="g-emotes" class="emote-bar"></div>
    </div>`);
    const extra = g.kind === 'poker' ? `♠ Poker · Hand ${g.handNo} · Blinds ${fmt(g.sb)}/${fmt(g.bb)}`
      : g.kind === 'blackjack' ? `♥ Blackjack · Min bet ${fmt(g.minBet)}`
        : g.kind === 'ludo' ? '🎲 Ludo' : g.kind === 'catan' ? '🏝️ Settlers' : g.kind === 'tambola' ? '🎱 Tambola' : g.kind === 'rummy' ? `🃏 Rummy${g.st.deals > 1 ? ` · Deal ${g.st.deal}/${g.st.deals}` : ''}` : g.kind === 'carrom' ? '🎯 Carrom' : `🏙️ Business${g.st.rounds ? ` · Round ${Math.min(g.st.round, g.st.rounds)}/${g.st.rounds}` : ''}`;
    patch('#g-top', `<span>${extra}${g.paused ? ' · <b>Paused</b>' : ''}${g.me === -1 && g.st ? ' · watching' : ''}</span>
      <button class="btn small" data-c="sheet">☰ Room</button>`);
    patch('#mp-status', statusBanner());
    if (g.kind === 'poker') renderPoker(g);
    else if (g.kind === 'blackjack') renderBlackjack(g);
    else if (g.kind === 'ludo') renderLudo(g);
    else if (g.kind === 'catan') renderCatan(g);
    else if (g.kind === 'tambola') renderTambola(g);
    else if (g.kind === 'rummy') renderRummy(g);
    else if (g.kind === 'carrom') renderCarrom(g);
    else renderBusiness(g);
    patch('#g-emotes', EMOTES.map(e => `<button data-c="emote" data-e="${e}">${e}</button>`).join(''));
  }

  /* ---------- Ludo & Business ---------- */
  function boardTimer(g) {
    const d = deadline('turn', g.timerSeq + ':' + g.turnKey, g.you ? g.turnRemaining : null, g.timerTotal);
    return d ? ` <span class="bt-timer">⏱ ${secsLeft(d)}</span>` : '';
  }
  function renderLudo(g) {
    const main = el.querySelector('#g-main');
    if (!main.querySelector('.ludo-board')) { LudoView.mount(main); main._html = null; }
    LudoView.update(main, g.st, { me: g.me, face: rollFace[0], timer: boardTimer(g), results: LudoView.resultsHTML(g.st, view.hostId === myId ? '<button class="btn primary big" data-c="lobby2">Back to lobby</button>' : '<p class="waiting">The host can start another game.</p>') });
    patch('#g-actions', '');
  }
  function renderBusiness(g) {
    if (g.me < 0) { bizManage = false; bizTrade.t = null; }
    patch('#g-main', BizView.html(g.st, { me: g.me, info: bizInfo, manage: bizManage, trade: bizTrade, rollingFace: rollFace, timer: boardTimer(g),
      footer: g.st.over && view.hostId === myId ? '<button class="btn primary big" data-c="lobby2">Back to lobby</button>' : '' }));
    patch('#g-actions', '');
  }
  let catUi = {};
  function renderCatan(g) {
    if (!g.prompt || g.prompt.phase !== 'main') catUi.mode = catUi.trade = catUi.pickRes = null;
    if (!g.prompt || g.prompt.phase !== 'discard') catUi.discard = null; else catUi.discard = catUi.discard || {};
    patch('#g-main', CatanView.html(g.st, { me: g.me, prompt: g.prompt, ...catUi, rollingFace: rollFace, timer: boardTimer(g),
      footer: g.st.over && view.hostId === myId ? '<button class="btn primary big" data-c="lobby2">Back to lobby</button>' : '' }));
    patch('#g-actions', '');
  }
  /* ---------- Tambola, Rummy, Carrom ---------- */
  let tamVoice = false, tamPrev = 0, rumUi = { sel: new Set() }, carView = null;
  const backBtn = g => g.st.over && view.hostId === myId ? '<button class="b b-raise big" data-c="lobby2">Back to lobby</button>' : g.st.over ? '<p class="waiting">The host can start another game.</p>' : '';
  function renderTambola(g) {
    TamView.announce(g.st, tamVoice);
    const fresh = g.st.last !== tamPrev; tamPrev = g.st.last;
    patch('#g-main', TamView.html(g.st, { me: g.me, voice: tamVoice, fresh, canPause: view.hostId === myId && !g.st.over, footer: backBtn(g) }));
    patch('#g-actions', '');
  }
  function renderRummy(g) {
    const me = g.st.players[g.me];
    if (me) { const ids = new Set([...me.groups.flat(), ...me.loose].map(c => c.i)); [...rumUi.sel].forEach(i => { if (!ids.has(i)) rumUi.sel.delete(i); }); }
    patch('#g-main', RumView.html(g.st, { me: g.me, prompt: g.prompt, sel: rumUi.sel, timer: boardTimer(g), footer: backBtn(g) }));
    patch('#g-actions', '');
  }
  function renderCarrom(g) {
    const main = el.querySelector('#g-main');
    if (!carView || !main.querySelector('.car-root')) {
      carView?.destroy(); main.innerHTML = '<div class="car-root"></div>'; main._html = null;
      carView = CarromView.mount(main.firstChild, { canShoot: () => !!view?.game?.you, onShoot: shot => send({ t: 'act', a: { type: 'shoot', x: shot.x, a: shot.a, p: shot.p } }) });
    }
    carView.set(g.st, g.me);
    patch('#g-actions', `${g.you ? boardTimer(g) : ''}${backBtn(g)}`);
  }
  function boardClick(b) {   // taps inside the Ludo / Business / Settlers / Tambola / Rummy board
    const g = view?.game; if (!g || !g.st) return false;
    if (g.kind === 'tambola') {
      if (b.dataset.tn) { send({ t: 'act', a: { type: 'mark', n: +b.dataset.tn } }); return true; }
      if (b.dataset.claim) { send({ t: 'act', a: { type: 'claim', prize: b.dataset.claim } }); return true; }
      const k = b.dataset.k;
      if (k === 'auto') { send({ t: 'act', a: { type: 'auto', on: !g.st.players[g.me]?.auto } }); return true; }
      if (k === 'voice') { tamVoice = !tamVoice; render(); return true; }
      if (k === 'pause') { send({ t: 'pause', on: !g.paused }); return true; }
      return false;
    }
    if (g.kind === 'rummy') {
      const handled = rummyClick(b, g.st, g.me, g.prompt, rumUi, a => { send({ t: 'act', a }); return true; });
      if (handled) render();
      return handled;
    }
    if (g.kind === 'carrom') return false;
    if (g.kind === 'catan') {
      const handled = catanClick(b, g.st, g.me, g.prompt, catUi, a => { send({ t: 'act', a }); return true; });
      if (handled) render();
      return handled;
    }
    if (g.kind === 'ludo') {
      if (b.classList.contains('ludo-die')) { send({ t: 'act', a: { type: 'roll' } }); return true; }
      if (b.classList.contains('token') && +b.dataset.p === g.me) { send({ t: 'act', a: { type: 'pick', ti: +b.dataset.t } }); return true; }
      return b.classList.contains('token');
    }
    const tr = BizView.tradeClick(bizTrade, b, g.st, g.me);
    if (tr.handled) {
      if (bizTrade.t) { bizInfo = null; bizManage = false; }
      if (tr.act) send({ t: 'act', a: tr.act });
      render(); return true;
    }
    if (b.dataset.m) { const [action, i] = b.dataset.m.split(':'); send({ t: 'act', a: { type: 'manage', action, i: +i } }); return true; }
    if (b.dataset.sq !== undefined) { bizInfo = +b.dataset.sq; bizManage = false; bizTrade.t = null; render(); return true; }
    const a = b.dataset.b;
    if (a === 'close') { bizInfo = null; bizManage = false; bizTrade.t = null; render(); return true; }
    if (a === 'manage') { bizManage = true; bizInfo = null; bizTrade.t = null; render(); return true; }
    if (['roll', 'buy', 'skip', 'end'].includes(a)) { bizInfo = null; bizManage = false; send({ t: 'act', a: { type: a } }); return true; }
    return false;
  }

  /* ---------- poker table ---------- */
  const emoteOf = id => { const e = emotes[id]; return e && e.until > Date.now() ? e.e : ''; };
  function renderPoker(g) {
    const turnD = deadline('turn', g.timerSeq + ':' + g.turnKey, g.turnRemaining, g.timerTotal);
    const nextD = deadline('next', 'n' + g.handNo, g.nextIn);
    const model = {
      hand: view.code + ':' + g.handNo, board: g.board, pot: g.pot, msg: g.msg,
      sub: nextD ? `<small>Next hand in ${secsLeft(nextD)}</small>` : '',
      seats: g.seats.map(s => {
        const m = member(s.id);
        const status = !m.online && !m.bot ? 'Offline'
          : s.handName && !s.folded ? s.handName
            : s.folded ? (s.note || 'Fold') : s.allIn ? 'All-in'
              : s.note || (!s.inHand && g.phase === 'play' ? (m.chips > 0 ? 'Next hand' : 'Broke') : '');
        return {
          id: s.id, name: m.name, chips: m.chips, bot: m.bot, me: s.id === myId, offline: !m.online && !m.bot,
          inHand: s.inHand, cards: s.cards, bet: s.bet, folded: s.folded, allIn: s.allIn, dealer: s.dealer, turn: s.turn,
          won: s.won, status, statusCls: s.handName && !s.folded ? 'hand' : '', emote: emoteOf(s.id),
          timer: s.turn ? turnD : null,
        };
      }),
    };
    patch('#g-main', UI.pokerTable(model));

    const y = g.you;
    let act;
    if (y) {
      raiseTo = Math.max(y.minTo, Math.min(y.maxTo, raiseTo || y.minTo));
      act = UI.pokerDock(y, raiseTo, `<div class="your-turn">Your move ${secsLeft(turnD)}</div>`);
    } else {
      const s = g.seats.find(x => x.id === myId), me = member(myId);
      const turnSeat = g.seats.find(x => x.turn);
      const txt = g.phase === 'play' && s?.inHand && !s.folded ? (turnSeat ? `${esc(member(turnSeat.id)?.name)} is thinking…` : '…')
        : me && me.chips <= 0 ? 'You’re out of chips — ask the host for a top-up (☰ Room).'
          : g.phase === 'play' ? 'You’ll be dealt in next hand.' : g.phase === 'over' ? 'Next hand coming up…' : esc(g.msg);
      act = `<div class="dock quiet"><span>${txt}</span></div>`;
    }
    // keep the slider alive while the player is dragging it
    const rs = el.querySelector('#rs');
    if (!(rs && document.activeElement === rs && y)) patch('#g-actions', act);
  }

  /* ---------- blackjack table ---------- */
  function renderBlackjack(g) {
    const turnD = deadline('turn', g.timerSeq + ':' + g.turnKey, g.turnRemaining, g.timerTotal);
    const betD = deadline('bet', 'b' + g.round, g.betRemaining);
    const nextD = deadline('next', 'n' + g.round, g.nextIn);
    const me = member(myId);
    const model = {
      round: view.code + ':' + g.round, msg: g.msg,
      sub: betD ? `<small>Betting closes in ${secsLeft(betD)}</small>` : nextD ? `<small>Next round in ${secsLeft(nextD)}</small>` : '',
      dealer: g.dealer,
      spots: g.players.map(p => {
        const m = member(p.id);
        const isTurn = g.turn && g.turn.id === p.id && g.phase === 'play';
        const status = !m.online ? 'Offline' : g.phase === 'betting' ? (p.ready ? 'Ready ✓' : p.sitout ? 'Sitting out' : 'Betting…')
          : !p.hands.length ? 'Next round' : '';
        const pendingBet = p.id === myId && g.canBet ? bjBet : p.bet;
        return {
          id: p.id, name: m.name, chips: m.chips, me: p.id === myId, offline: !m.online, turn: isTurn,
          bet: pendingBet, status, emote: emoteOf(p.id), timer: isTurn ? turnD : null,
          hands: p.hands.map((h, i) => ({ ...h, active: isTurn && g.turn.hand === i && p.hands.length > 1 })),
        };
      }),
    };
    patch('#g-main', UI.bjTable(model));

    let act;
    if (g.you) act = UI.bjPlayDock(g.you, `<div class="your-turn">Your move ${secsLeft(turnD)}</div>`);
    else if (g.canBet) {
      bjBet = Math.min(bjBet, me.chips);
      act = UI.betTray(bjBet, me.chips, `
        <button class="b b-ghost" data-c="bjclear" ${bjBet ? '' : 'disabled'}>Clear</button>
        <button class="b b-ghost" data-c="bjsit">Sit out</button>
        <button class="b b-raise" data-c="bjbet" ${bjBet >= g.minBet ? '' : 'disabled'}>Bet ${fmt(bjBet)}</button>`,
        `<div class="your-turn">Place your bet ${secsLeft(betD)}</div>`);
    } else {
      const txt = g.phase === 'betting' && me.chips < g.minBet ? 'You’re out of chips — ask the host for a top-up (☰ Room).'
        : g.phase === 'betting' ? 'Waiting for everyone to bet…'
          : g.turn && g.phase === 'play' ? `${esc(member(g.turn.id)?.name)} is playing…`
            : g.phase === 'dealer' ? 'Dealer’s turn…' : g.phase === 'over' ? 'Next round coming up…' : esc(g.msg);
      act = `<div class="dock quiet"><span>${txt}</span></div>`;
    }
    patch('#g-actions', act);
  }

  /* ---------- room menu sheet ---------- */
  let sheet = null;
  const sheetOpen = () => sheet && sheet.open;
  function openSheet() {
    if (!sheet) {
      sheet = document.createElement('dialog');
      sheet.className = 'mp-sheet';
      sheet.setAttribute('closedby', 'any');
      sheet.setAttribute('aria-label', 'Room menu');
      document.body.appendChild(sheet);
      lightDismiss(sheet);
      sheet.addEventListener('click', e => { if (e.target !== sheet) onClick(e); });
    }
    sheet._html = null;
    renderSheet();
    sheet.showModal();
  }
  function closeSheet() { if (sheet?.open) sheet.close(); }
  function renderSheet() {
    if (!sheet || !view) return;
    const isHost = view.hostId === myId, g = view.game;
    const ranked = [...view.members].sort((a, b) => b.chips - a.chips);
    const html = `<div class="set">
      <h2>Room ${esc(code)}</h2>
      <button class="btn small" data-c="share">Share invite link</button>
      <h3>Leaderboard</h3>
      <ol class="board-list">${ranked.map((m, i) => `<li class="${m.online ? '' : 'off'}">
        <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        <span class="nm">${esc(m.name)}${m.id === myId ? ' <em>(you)</em>' : ''}</span>
        <b>${fmt(m.chips)}</b>
        ${isHost ? `<div class="give">${[-100, 100, 500, 1000].map(n => `<button data-c="give" data-id="${esc(m.id)}" data-n="${n}">${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('')}
          ${!m.host ? `<button class="x" data-c="kick" data-id="${esc(m.id)}" aria-label="Remove">✕</button>` : ''}</div>` : ''}
      </li>`).join('')}</ol>
      ${isHost ? '<p class="hint small">As host you can give or take chips — from friends and computer players.</p>' : ''}
      ${isHost && g ? `<div class="row wrap">
        <button class="btn" data-c="pause">${g.paused ? '▶ Resume' : '⏸ Pause after this hand'}</button>
        <button class="btn" data-c="lobby">Back to lobby / switch game</button></div>` : ''}
      <div class="row wrap end">
        <button class="btn danger" data-c="leave">${isHost ? 'Close room' : 'Leave room'}</button>
        <button class="btn primary" data-c="closesheet">Done</button>
      </div></div>`;
    if (sheet._html !== html) { sheet.innerHTML = html; sheet._html = html; }
  }

  /* ---------- toasts & countdowns ---------- */
  function renderToasts() {
    const t = el?.querySelector('#mp-toasts');
    if (t) t.innerHTML = toasts.map(x => `<div class="toast">${esc(x.text)}</div>`).join('');
  }
  /* ---------- input ---------- */
  function onClick(e) {
    const b = e.target.closest('button') || e.target.closest('#g-main [data-v], #g-main [data-e], #g-main [data-h]');
    if (!b || b.disabled) return;
    const c = b.dataset.c, g = view?.game;
    if (!c && boardClick(b)) return;
    if (c === 'lobby2') { send({ t: 'lobby' }); return; }
    switch (c) {
      case 'create': return createRoom();
      case 'join': return joinRoom(el.querySelector('#mp-code').value);
      case 'cancel': return leave('');
      case 'leave': {
        const msg = role === 'host' ? 'Close the room for everyone?' : 'Leave this room?';
        UI.ask(msg, role === 'host' ? 'Close room' : 'Leave', true).then(ok => { if (ok) leave(''); });
        return;
      }
      case 'share': return share();
      case 'start': return send({ t: 'start' });
      case 'kick': {
        const m = member(b.dataset.id); if (!m) return;
        if (m.bot) return send({ t: 'kick', id: m.id });          // computer players go instantly (+ adds them back)
        UI.ask(`Remove ${m.name} from the room?`, 'Remove', true).then(ok => { if (ok) send({ t: 'kick', id: m.id }); });
        return;
      }
      case 'bots': return send({ t: 'settings', patch: { bots: view.settings.bots + +b.dataset.d } });
      case 'sheet': return openSheet();
      case 'closesheet': return closeSheet();
      case 'give': return send({ t: 'chips', id: b.dataset.id, amount: +b.dataset.n });
      case 'pause': return send({ t: 'pause', on: !g.paused });
      case 'lobby': closeSheet(); UI.ask('End this game and return everyone to the lobby? Chips are kept.', 'End game').then(ok => { if (ok) send({ t: 'lobby' }); }); return;
      case 'emote': return send({ t: 'emote', e: b.dataset.e });
      case 'pk': return send({ t: 'act', a: { type: b.dataset.a, to: raiseTo } });
      case 'q': {
        const y = g?.you; if (!y) return;
        const v = b.dataset.q === 'max' ? y.maxTo : Math.round((b.dataset.q === 'half' ? 0.5 : 1) * (y.pot + y.toCall) + y.currentBet);
        raiseTo = Math.max(y.minTo, Math.min(y.maxTo, v));
        const rs = el.querySelector('#rs'); if (rs) rs.value = raiseTo;
        const rv = el.querySelector('#rv'); if (rv) rv.textContent = fmt(raiseTo);
        return;
      }
      case 'bj': return send({ t: 'act', a: { type: b.dataset.a } });
      case 'chip': bjBet += +b.dataset.v; Sfx.chip(); return render();
      case 'bjclear': bjBet = 0; return render();
      case 'bjsit': return send({ t: 'act', a: { type: 'sitout' } });
      case 'bjbet': { const amt = bjBet; return send({ t: 'act', a: { type: 'bet', amount: amt } }); }
    }
    if (b.dataset.set === 'game') send({ t: 'settings', patch: { game: b.dataset.v } });
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.set) send({ t: 'settings', patch: { [t.dataset.set]: t.type === 'checkbox' ? t.checked : +t.value } });
  }
  function onInput(e) {
    if (e.target.id === 'rs') { raiseTo = +e.target.value; const rv = el.querySelector('#rv'); if (rv) rv.textContent = fmt(raiseTo); }
    if (e.target.id === 'mp-code') e.target.value = e.target.value.toUpperCase();
  }
  function onKey(e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'mp-code') joinRoom(e.target.value);
  }

  /* ---------- mount ---------- */
  function mount(container, opts = {}) {
    el = container;
    el.dataset.kind = '';
    el.onclick = onClick; el.onchange = onChange; el.oninput = onInput; el.onkeydown = onKey;
    if (opts.code && !role) { prefill = opts.code.toUpperCase(); error = ''; }
    if (!role) {
      const saved = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
      if (saved && saved.code && myName()) { render(); joinRoom(saved.code, true); return; }
      if (prefill && myName()) { render(); joinRoom(prefill, true); prefill = ''; return; }
    }
    render();
  }
  function unmount() {
    carView?.destroy(); carView = null;
    if (el) { el.onclick = el.onchange = el.oninput = el.onkeydown = null; el.dataset.kind = ''; }
    el = null;
  }
  return { mount, unmount, inRoom: () => !!role && status !== 'home', code: () => code };
})();
