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
    if (g) {
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
    render();
  }
  function onEvent(e) {
    if (e.t === 'toast') toast(e.text);
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
    const poker = s.game === 'poker';
    patch('#lb-settings', `<h3>Game settings ${isHost ? '' : '<small>(set by host)</small>'}</h3>
      <div class="seg">${['poker', 'blackjack'].map(gm => `<button data-set="game" data-v="${gm}" class="${s.game === gm ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${gm === 'poker' ? '♠ Poker' : '♥ Blackjack'}</button>`).join('')}</div>
      <div class="opts">
        <label>Starting chips ${opt('startChips', [500, 1000, 2000, 5000, 10000], s.startChips, fmt)}</label>
        ${poker ? `
          <label>Blinds ${opt('bb', [10, 20, 50, 100, 200], s.bb, v => `${fmt(v / 2)} / ${fmt(v)}`)}</label>
          <label>Computer players <span class="stepper">${isHost ? `<button data-c="bots" data-d="-1">−</button>` : ''}<b>${s.bots}</b>${isHost ? `<button data-c="bots" data-d="1">+</button>` : ''}</span></label>
          <label class="check"><input type="checkbox" data-set="blindsUp" ${s.blindsUp ? 'checked' : ''} ${isHost ? '' : 'disabled'}> Tournament mode: blinds double every 10 hands</label>`
        : `<label>Minimum bet ${opt('minBet', [5, 10, 25, 50, 100], s.minBet, fmt)}</label>`}
        <label>Turn timer ${opt('timer', [0, 15, 30, 60], s.timer, v => v ? v + ' sec' : 'Off')}</label>
      </div>
      ${isHost ? '<p class="hint small">Changing starting chips resets everyone’s chips.</p>' : ''}`);
    const canStart = poker ? view.members.length >= 2 : true;
    patch('#lb-buttons', isHost
      ? `<button class="btn primary big" data-c="start" ${canStart ? '' : 'disabled'}>Start ${poker ? 'Poker' : 'Blackjack'}</button>
         ${poker && !canStart ? '<p class="hint small">Invite a friend or add a computer player to start.</p>' : ''}
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
    const extra = g.kind === 'poker'
      ? `Hand ${g.handNo} · Blinds ${fmt(g.sb)}/${fmt(g.bb)}`
      : `Min bet ${fmt(g.minBet)}`;
    patch('#g-top', `<span>${g.kind === 'poker' ? '♠ Poker' : '♥ Blackjack'} · ${extra}${g.paused ? ' · <b>Paused</b>' : ''}</span>
      <button class="btn small" data-c="sheet">☰ Room</button>`);
    patch('#mp-status', statusBanner());
    if (g.kind === 'poker') renderPoker(g); else renderBlackjack(g);
    patch('#g-emotes', EMOTES.map(e => `<button data-c="emote" data-e="${e}">${e}</button>`).join(''));
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
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const c = b.dataset.c, g = view?.game;
    switch (c) {
      case 'create': return createRoom();
      case 'join': return joinRoom(el.querySelector('#mp-code').value);
      case 'cancel': return leave('');
      case 'leave': {
        const msg = role === 'host' ? 'Close the room for everyone?' : 'Leave this room?';
        if (confirm(msg)) leave('');
        return;
      }
      case 'share': return share();
      case 'start': return send({ t: 'start' });
      case 'kick': { const m = member(b.dataset.id); if (m && confirm(`Remove ${m.name} from the room?`)) send({ t: 'kick', id: m.id }); return; }
      case 'bots': return send({ t: 'settings', patch: { bots: view.settings.bots + +b.dataset.d } });
      case 'sheet': return openSheet();
      case 'closesheet': return closeSheet();
      case 'give': return send({ t: 'chips', id: b.dataset.id, amount: +b.dataset.n });
      case 'pause': return send({ t: 'pause', on: !g.paused });
      case 'lobby': if (confirm('End this game and return everyone to the lobby? Chips are kept.')) { send({ t: 'lobby' }); closeSheet(); } return;
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
    if (el) { el.onclick = el.onchange = el.oninput = el.onkeydown = null; el.dataset.kind = ''; }
    el = null;
  }
  return { mount, unmount, inRoom: () => !!role && status !== 'home', code: () => code };
})();
