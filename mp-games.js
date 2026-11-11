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
  stop() { clearTimeout(this.offerTimer); super.stop(); }
  act(id, a) {
    const pi = this.seatOf(id); if (pi < 0) return;
    if (a.type === 'manage') { this.game.manage(pi, String(a.action), +a.i); return; }
    if (a.type === 'trade') {
      if (this.game.propose(pi, a.to, a.give, a.want) === '' && this.game.st.offer) {
        clearTimeout(this.offerTimer);
        const o = this.game.st.offer;
        this.offerTimer = setTimeout(() => { if (this.game.st.offer === o) this.game.answer(o.to, false); }, 45000);   // an unanswered offer lapses
      }
      return;
    }
    if (a.type === 'tradeReply') { clearTimeout(this.offerTimer); this.game.answer(pi, !!a.accept); return; }
    if (a.type === 'tradeCancel') { clearTimeout(this.offerTimer); this.game.cancelOffer(pi); return; }
    const p = this.pending;
    if (!p || p.pi !== pi) return;
    const ok = { roll: ['roll'], buy: ['buy', 'skip'], end: ['end'], again: ['end'] }[p.phase] || [];
    if (ok.includes(a.type)) this.resolve(a.type);
  }
}

// Online Settlers: several people can be asked at once (discards on a 7, answers to a trade offer),
// and each phone only receives its own hand.
class CatanRoomEngine {
  constructor(room) {
    this.room = room; this.kind = 'catan'; this.pend = {}; this.turnKey = 0; this.timerSeq = 0;
    const io = {
      update: () => this.room.update(),
      decide: (pi, phase, data) => new Promise(res => { this.turnKey++; this.pend[pi] = { phase, data, res, timer: null }; this.arm(pi); this.room.update(); }),
      fx: (name, pi) => this.room.event({ t: 'fx', name, who: pi >= 0 ? this.game.st.players[pi]?.id : null }),
    };
    this.game = new CatanGame({ players: room.members.slice(0, 4).map(m => ({ id: m.id, name: m.name, kind: m.bot ? 'cpu' : 'human' })) }, io);
  }
  seatOf(id) { return this.game.st.players.findIndex(p => p.id === id); }
  arm(pi) {
    const p = this.pend[pi]; if (!p) return;
    clearTimeout(p.timer);
    const online = this.room.member(this.game.st.players[pi].id)?.online, secs = this.room.settings.timer;
    let ms = !online ? 8000 : secs > 0 ? Math.max(secs, 15) * 1000 : 0;
    if (p.phase === 'respond') ms = Math.min(ms || 30000, 30000);      // trade offers never hang
    p.until = ms ? Date.now() + ms : null; p.total = ms; this.timerSeq++;
    if (ms) p.timer = setTimeout(() => this.resolve(pi, this.game.auto(pi, p.phase, p.data)), ms);
  }
  resolve(pi, v) { const p = this.pend[pi]; if (!p) return; clearTimeout(p.timer); delete this.pend[pi]; p.res(v); this.room.update(); }
  start() { this.game.run(); }
  stop() { this.game.stop(); Object.values(this.pend).forEach(p => clearTimeout(p.timer)); this.pend = {}; }
  act(id, a) { const pi = this.seatOf(id); if (pi >= 0 && this.pend[pi]) this.resolve(pi, a); }
  presence(id) { const pi = this.seatOf(id); if (pi >= 0 && this.pend[pi]) { this.arm(pi); this.room.update(); } }
  left(id) { const pi = this.seatOf(id); if (pi < 0) return; this.game.forfeit(pi); const p = this.pend[pi]; if (p) this.resolve(pi, this.game.auto(pi, p.phase, p.data)); }
  view(id) {
    const me = this.seatOf(id), p = this.pend[me];
    return {
      kind: 'catan', st: CatanGame.viewFor(this.game.st, me), me, paused: false,
      prompt: p ? { phase: p.phase, data: p.data } : null, you: !!p,
      turnKey: this.turnKey, timerSeq: this.timerSeq, timerTotal: p ? p.total : 0, turnRemaining: p && p.until ? Math.max(0, p.until - Date.now()) : null,
    };
  }
}

// Online Tambola: the host calls the numbers; everyone marks and claims on their own phone.
class TambolaRoomEngine {
  constructor(room) {
    this.room = room; this.kind = 'tambola'; this.turnKey = 0; this.timerSeq = 0;
    const s = room.settings;
    this.game = new TambolaGame({
      players: room.members.slice(0, 8).map(m => ({ id: m.id, name: m.name, kind: m.bot ? 'cpu' : 'human' })),
      tickets: s.tamTickets || 1, speed: s.tamSpeed || 5,
    }, {
      update: () => room.update(),
      fx: (name, pi) => room.event({ t: 'fx', name: name === 'number' ? 'dice' : name === 'prize' ? 'tprize' : name === 'bogus' ? 'tbogus' : 'tover', who: pi >= 0 ? this.game.st.players[pi]?.id : null }),
    });
  }
  get paused() { return this.game.st.paused; }
  set paused(v) { this.game.st.paused = !!v; this.game.up(); }
  seatOf(id) { return this.game.st.players.findIndex(p => p.id === id); }
  start() { this.game.run(); }
  stop() { this.game.stop(); }
  presence() {}
  left(id) { const pi = this.seatOf(id); if (pi >= 0) this.game.forfeit(pi); }
  act(id, a) {
    const pi = this.seatOf(id); if (pi < 0) return;
    if (a.type === 'claim') this.game.claim(pi, String(a.prize));
    else if (a.type === 'mark') this.game.mark(pi, +a.n);
    else if (a.type === 'auto') this.game.setAuto(pi, !!a.on);
  }
  view(id) {
    const me = this.seatOf(id);
    return { kind: 'tambola', st: TambolaGame.viewFor(this.game.st, me), me, paused: this.game.st.paused, you: false, turnKey: 0, timerSeq: 0, timerTotal: 0, turnRemaining: null };
  }
}

// Online Rummy: one player decides at a time; everyone's hand stays private on their own phone.
class RummyRoomEngine extends BoardRoomEngine {
  constructor(room) {
    super(room, 'rummy');
    this.game = new RummyGame({ players: room.members.slice(0, 6).map(m => ({ id: m.id, name: m.name, kind: m.bot ? 'cpu' : 'human' })), deals: room.settings.rumDeals || 1 }, this.io());
  }
  auto(p) { return this.game.auto(p.pi, p.phase); }
  act(id, a) {
    const pi = this.seatOf(id); if (pi < 0) return;
    if (a.type === 'arrange') { this.game.arrange(pi, a); return; }
    if (a.type === 'next') { this.game.nextDeal(); return; }
    const p = this.pending; if (!p || p.pi !== pi) return;
    if (p.phase === 'draw' && ['stock', 'discard', 'drop'].includes(a.type)) this.resolve({ type: a.type });
    else if (p.phase === 'discard' && ['discard', 'declare'].includes(a.type) && Number.isInteger(+a.card)) this.resolve({ type: a.type, card: +a.card });
  }
  view(id) {
    const me = this.seatOf(id), now = Date.now(), p = this.pending, mine = !!(p && p.pi === me);
    return {
      kind: 'rummy', st: RummyGame.viewFor(this.game.st, me), me, paused: false, prompt: mine ? { phase: p.phase, data: p.moves } : null,
      you: mine, turnKey: this.turnKey, timerSeq: this.timerSeq, timerTotal: this.timerTotal, turnRemaining: this.until ? Math.max(0, this.until - now) : null,
    };
  }
}

// Online Carrom: the host simulates every shot and sends the recorded animation to all phones.
class CarromRoomEngine extends BoardRoomEngine {
  constructor(room) {
    super(room, 'carrom');
    const ms = room.members.slice(0, 4);
    this.game = new CarromGame({ players: ms.map(m => ({ id: m.id, name: m.name, kind: m.bot ? 'cpu' : 'human' })), level: room.settings.carLevel ?? 1 }, this.io());
  }
  io() {
    const base = super.io();
    return {
      ...base,
      shot: info => this.room.event({ t: 'shot', info }),
      fx: (name, pi) => {
        const st = this.game.st, who = name === 'winner' ? st.players.filter(q => q.team === st.players[pi].team).map(q => q.id) : pi >= 0 ? st.players[pi]?.id : null;
        this.room.event({ t: 'fx', name: name === 'pocket' ? 'chip' : name, who });
      },
    };
  }
  auto(p) { return this.game.auto(p.pi); }
  act(id, a) {
    const p = this.pending, pi = this.seatOf(id);
    if (!p || p.pi !== pi || a.type !== 'shoot') return;
    if ([a.x, a.a, a.p].every(Number.isFinite)) this.resolve({ x: +a.x, a: +a.a, p: +a.p });
  }
  view(id) {
    const me = this.seatOf(id), now = Date.now();
    return {
      kind: 'carrom', st: this.game.st, me, paused: false, you: !!(this.pending && this.pending.pi === me),
      turnKey: this.turnKey, timerSeq: this.timerSeq, timerTotal: this.timerTotal, turnRemaining: this.until ? Math.max(0, this.until - now) : null,
    };
  }
}
