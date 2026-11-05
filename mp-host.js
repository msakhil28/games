// The room host: runs on the device that created the room. It is the single source of truth —
// it owns the member list, the chips, the room settings and the game engine, and it sends every
// member a personalised view (so nobody receives the other players' hidden cards).
const BOT_NAMES = ['Ace 🤖', 'Bella 🤖', 'Cruz 🤖', 'Dex 🤖', 'Echo 🤖', 'Faye 🤖', 'Gus 🤖'];
const EMOTES = ['👍', '😂', '😱', '🔥', '💸', '🤔', '🙈', '🎉'];
const MAX_MEMBERS = 8;

class RoomHost {
  constructor(me, onLocalView) {
    this.me = me;
    this.onLocalView = onLocalView;
    this.onLocalEvent = () => {};
    this.settings = { game: 'poker', startChips: 1000, bb: 20, bots: 2, timer: 0, blindsUp: false, minBet: 10, bizCash: 15000, bizRounds: 0, ludoKill: true };
    this.members = [{ id: me.id, name: me.name, chips: 1000, online: true, host: true, conn: null, lastSeen: Date.now() }];
    this.phase = 'lobby';
    this.engine = null;
    this.code = null;
    this.syncBots();
  }

  async open() {
    const r = await Net.host(conn => this.accept(conn));
    this.code = r.code;
    this.closeTransport = r.close;
    this.pinger = setInterval(() => this.heartbeat(), 4000);
    this.update();
    return this.code;
  }

  /* ---------- connections ---------- */
  accept(conn) {
    let memberId = null;
    conn.onData(msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') memberId = this.hello(conn, msg);
      else if (memberId) this.handle(memberId, msg);
    });
    conn.onClose(() => {
      const m = this.member(memberId);
      if (m && m.conn === conn) { m.conn = null; m.online = false; this.engine?.presence(m.id); this.update(); }
    });
  }

  hello(conn, msg) {
    const id = String(msg.id || '').slice(0, 40);
    const name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
    if (!id || id === this.me.id) { conn.send({ t: 'error', msg: 'Invalid player.' }); conn.close(); return null; }
    if (this.kicked?.has(id)) { conn.send({ t: 'kicked' }); setTimeout(() => conn.close(), 200); return null; }
    let m = this.member(id);
    if (!m) {
      if (this.members.length >= MAX_MEMBERS && !this.removeOneBot()) {
        conn.send({ t: 'error', msg: 'This room is full.' }); setTimeout(() => conn.close(), 200); return null;
      }
      m = { id, name, chips: this.settings.startChips, online: true, conn, lastSeen: Date.now() };
      this.members.push(m);
      this.toast(`${name} joined`);
    } else {
      if (m.conn && m.conn !== conn) m.conn.close();
      if (!m.online) this.toast(`${name} is back`);
    }
    Object.assign(m, { name, conn, online: true, lastSeen: Date.now() });
    conn.send({ t: 'welcome', id, code: this.code });
    this.engine?.presence(id);
    this.update();
    return id;
  }

  heartbeat() {
    const now = Date.now();
    for (const m of this.members) {
      if (!m.conn) continue;
      if (now - m.lastSeen > 13000) { const c = m.conn; m.conn = null; m.online = false; c.close(); this.engine?.presence(m.id); this.update(); }
      else m.conn.send({ t: 'ping' });
    }
  }

  /* ---------- messages from members (also used for the host's own actions) ---------- */
  handle(id, msg) {
    const m = this.member(id);
    if (!m) return;
    m.lastSeen = Date.now();
    const isHost = id === this.me.id;
    switch (msg.t) {
      case 'pong': break;
      case 'act': if (this.engine && msg.a && typeof msg.a === 'object') this.engine.act(id, msg.a); break;
      case 'emote': if (EMOTES.includes(msg.e)) this.event({ t: 'emote', from: id, e: msg.e }); break;
      case 'leave': this.removeMember(id, `${m.name} left`); break;
      default: if (isHost) this.hostCommand(msg);
    }
  }

  hostCommand(msg) {
    switch (msg.t) {
      case 'settings': {
        if (this.phase !== 'lobby') return;
        const s = this.settings, p = msg.patch || {};
        if (['poker', 'blackjack', 'ludo', 'business', 'catan'].includes(p.game)) s.game = p.game;
        if (p.bizCash > 0) s.bizCash = Math.min(100000, Math.round(p.bizCash));
        if (p.bizRounds >= 0) s.bizRounds = Math.min(100, Math.round(p.bizRounds));
        if (typeof p.ludoKill === 'boolean') s.ludoKill = p.ludoKill;
        if (p.startChips > 0) { s.startChips = Math.min(1e6, Math.round(p.startChips)); this.members.forEach(m => { m.chips = s.startChips; }); }
        if (p.bb > 0) s.bb = Math.round(p.bb);
        if (p.bots >= 0) { s.bots = Math.min(6, Math.round(p.bots)); this.syncBots(); }
        if (p.timer >= 0) s.timer = Math.round(p.timer);
        if (typeof p.blindsUp === 'boolean') s.blindsUp = p.blindsUp;
        if (p.minBet > 0) s.minBet = Math.round(p.minBet);
        break;
      }
      case 'start': this.startGame(); break;
      case 'lobby': this.stopGame(); this.toast('Back to the lobby'); break;
      case 'pause': this.engine && (this.engine.paused = !!msg.on); this.toast(msg.on ? 'Host paused after this hand' : 'Game resumed'); break;
      case 'chips': {
        const m = this.member(msg.id);
        const n = Math.round(+msg.amount || 0);
        if (m && n) { m.chips = Math.max(0, m.chips + n); this.toast(`${m.name} ${n > 0 ? 'got' : 'lost'} ${Store.fmt(Math.abs(n))} chips from the host`); }
        break;
      }
      case 'kick': {
        const m = this.member(msg.id);
        if (!m || m.host) return;
        if (!m.bot) { (this.kicked ||= new Set()).add(m.id); m.conn?.send({ t: 'kicked' }); }
        this.removeMember(m.id, `${m.name} was removed`);
        if (m.bot) this.settings.bots = this.members.filter(x => x.bot).length;
        break;
      }
    }
    this.update();
  }

  /* ---------- members ---------- */
  member(id) { return this.members.find(m => m.id === id); }
  syncBots() {
    if (this.phase !== 'lobby') return;
    let bots = this.members.filter(m => m.bot);
    while (bots.length > this.settings.bots) { const b = bots.pop(); this.members.splice(this.members.indexOf(b), 1); }
    for (const name of BOT_NAMES) {
      if (bots.length >= this.settings.bots || this.members.length >= MAX_MEMBERS) break;
      if (bots.some(b => b.name === name)) continue;
      const b = { id: 'bot-' + name, name, bot: true, chips: this.settings.startChips, online: true };
      this.members.push(b); bots.push(b);
    }
    this.settings.bots = bots.length;
  }
  removeOneBot() {
    if (this.phase !== 'lobby') return false;
    const b = [...this.members].reverse().find(m => m.bot);
    if (!b) return false;
    this.members.splice(this.members.indexOf(b), 1);
    this.settings.bots--;
    return true;
  }
  removeMember(id, note) {
    const m = this.member(id);
    if (!m || m.host) return;
    this.engine?.left(id);
    this.members.splice(this.members.indexOf(m), 1);
    if (m.conn) { const c = m.conn; m.conn = null; setTimeout(() => c.close(), 300); }
    this.toast(note);
    this.update();
  }

  /* ---------- game ---------- */
  startGame() {
    if (this.phase !== 'lobby') return;
    const humans = this.members.filter(m => !m.bot).length, n = this.members.length, g = this.settings.game;
    const NAMES = { poker: 'Poker', blackjack: 'Blackjack', ludo: 'Ludo', business: 'Business', catan: 'Settlers' };
    if (g === 'poker' && n < 2) return this.toast('Poker needs at least 2 players — add a computer player or invite a friend.');
    if (g === 'blackjack' && humans < 1) return;
    if ((g === 'ludo' || g === 'business' || g === 'catan') && n < 2) return this.toast(`${NAMES[g]} needs at least 2 players — add a computer player or invite a friend.`);
    if (g === 'ludo' && n > 4) return this.toast('Ludo has 4 colours — remove computer players so there are at most 4 players.');
    if (g === 'catan' && n > 4) return this.toast('Settlers takes up to 4 players — remove computer players so there are at most 4.');
    if (g === 'business' && n > 6) return this.toast('Business takes up to 6 players — remove computer players so there are at most 6.');
    this.phase = g;
    this.engine = g === 'poker' ? new PokerEngine(this) : g === 'blackjack' ? new BlackjackEngine(this) : g === 'ludo' ? new LudoRoomEngine(this) : g === 'catan' ? new CatanRoomEngine(this) : new BusinessRoomEngine(this);
    this.engine.start();
    this.toast(`${NAMES[g]} started — good luck!`);
  }
  stopGame() {
    if (!this.engine) return;
    this.engine.stop();
    this.engine = null;
    this.phase = 'lobby';
    this.syncBots();
  }

  /* ---------- outgoing ---------- */
  viewFor(id) {
    return {
      code: this.code, hostId: this.me.id, you: id, phase: this.phase, settings: this.settings,
      members: this.members.map(m => ({ id: m.id, name: m.name, chips: m.chips, online: m.online, bot: !!m.bot, host: !!m.host })),
      game: this.engine ? this.engine.view(id) : null,
    };
  }
  update() { // coalesce many changes into one broadcast
    if (this.pending || this.closed) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (this.closed) return;
      for (const m of this.members) if (m.conn) m.conn.send({ t: 'state', s: this.viewFor(m.id) });
      this.onLocalView(this.viewFor(this.me.id));
    });
  }
  event(e) {
    for (const m of this.members) if (m.conn) m.conn.send(e);
    this.onLocalEvent(e);
  }
  toast(text) { this.event({ t: 'toast', text }); }

  close() {
    this.closed = true;
    this.engine?.stop();
    clearInterval(this.pinger);
    for (const m of this.members) if (m.conn) m.conn.send({ t: 'closed' });
    setTimeout(() => { this.members.forEach(m => m.conn?.close()); this.closeTransport?.(); }, 300);
  }
}
