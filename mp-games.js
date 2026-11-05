// Online Ludo and Business: the room host runs the same rules engines used for offline play, and every
// person decides on their own phone. If someone runs out of time (or their phone drops), the move is made for them.
class BoardRoomEngine {
  constructor(room, kind) {
    this.room = room; this.kind = kind;
    this.pending = null; this.turnKey = 0; this.timerSeq = 0; this.timerTotal = 0; this.until = null;
    this.paused = false;
  }
  seatOf(id) { return this.game.st.players.findIndex(p => p.id === id); }
  io() {
    return {
      update: () => this.room.update(),
      decide: (pi, phase, moves) => new Promise(res => {
        this.turnKey++;
        this.pending = { pi, phase, moves, res, timer: null };
        this.arm();
        this.room.update();
      }),
      fx: (name, pi, extra) => this.room.event({ t: 'fx', name, who: pi >= 0 ? this.game.st.players[pi]?.id : null, extra }),
    };
  }
  arm() {
    const p = this.pending; if (!p) return;
    clearTimeout(p.timer);
    const id = this.game.st.players[p.pi].id, online = this.room.member(id)?.online;
    const secs = this.room.settings.timer;
    const ms = !online ? 8000 : secs > 0 ? Math.max(secs, 15) * 1000 : 0;
    if (!ms) { this.until = null; return; }
    this.timerSeq++; this.timerTotal = ms; this.until = Date.now() + ms;
    p.timer = setTimeout(() => this.resolve(this.auto(p)), ms);
  }
  resolve(v) {
    const p = this.pending; if (!p) return;
    clearTimeout(p.timer); this.pending = null; this.until = null;
    p.res(v);
  }
  start() { this.game.run(); }
  stop() { this.game.stop(); if (this.pending) { clearTimeout(this.pending.timer); this.pending = null; } }
  presence(id) { if (this.pending && this.game.st.players[this.pending.pi]?.id === id) { this.arm(); this.room.update(); } }
  left(id) {
    const pi = this.seatOf(id); if (pi < 0) return;
    const p = this.pending;
    this.game.forfeit(pi);
    if (p && p.pi === pi) this.resolve(this.auto(p));
  }
  view(id) {
    const me = this.seatOf(id), now = Date.now();
    return {
      kind: this.kind, st: this.game.st, me, paused: false,
      you: !!(this.pending && this.pending.pi === me), turnKey: this.turnKey, timerSeq: this.timerSeq, timerTotal: this.timerTotal,
      turnRemaining: this.until ? Math.max(0, this.until - now) : null,
    };
  }
}

class LudoRoomEngine extends BoardRoomEngine {
  constructor(room) {
    super(room, 'ludo');
    const ms = room.members.slice(0, 4);
    const seats = [0, 1, 2, 3].map(i => ms[i] ? { id: ms[i].id, name: ms[i].name, kind: ms[i].bot ? 'cpu' : 'human' } : { kind: 'none', name: 'Empty' });
    this.game = new LudoGame({ seats, killRule: room.settings.ludoKill !== false }, this.io());
  }
  auto(p) { return p.phase === 'pick' ? this.game.aiPick(p.pi, p.moves).ti : 'roll'; }
  act(id, a) {
    const p = this.pending, pi = this.seatOf(id);
    if (!p || p.pi !== pi) return;
    if (p.phase === 'roll' && a.type === 'roll') this.resolve('roll');
    else if (p.phase === 'pick' && a.type === 'pick' && p.moves.some(m => m.ti === +a.ti)) this.resolve(+a.ti);
  }
}

class BusinessRoomEngine extends BoardRoomEngine {
  constructor(room) {
    super(room, 'business');
    const s = room.settings;
    this.game = new BizGame({
      players: room.members.slice(0, 6).map(m => ({ id: m.id, name: m.name, kind: m.bot ? 'cpu' : 'human' })),
      cash: s.bizCash || 15000, rounds: s.bizRounds || 0,
    }, this.io());
  }
  auto(p) { return p.phase === 'roll' ? 'roll' : p.phase === 'buy' ? 'skip' : 'end'; }
  act(id, a) {
    const pi = this.seatOf(id); if (pi < 0) return;
    if (a.type === 'manage') { this.game.manage(pi, String(a.action), +a.i); return; }
    const p = this.pending;
    if (!p || p.pi !== pi) return;
    const ok = { roll: ['roll'], buy: ['buy', 'skip'], end: ['end'], again: ['end'] }[p.phase] || [];
    if (ok.includes(a.type)) this.resolve(a.type);
  }
}
