// Tambola (Housie) — tickets of 3 rows × 9 columns with 15 numbers, numbers 1–90 called one by one.
//  Prizes: Early Five, Top / Middle / Bottom Line, Full House. Claim as soon as your ticket qualifies.
//   TambolaGame : rules engine (no DOM) — runs on this phone, or on the room host for online play
//   TamView     : draws the tickets, caller and prize buttons for any player
//   Tambola     : the single-phone screen (you against computer players)
const TAM = (() => {
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const PRIZES = [
    { id: 'early5', name: 'Early Five', short: 'Early 5' },
    { id: 'top', name: 'Top Line', short: 'Top line' },
    { id: 'middle', name: 'Middle Line', short: 'Middle line' },
    { id: 'bottom', name: 'Bottom Line', short: 'Bottom line' },
    { id: 'full', name: 'Full House', short: 'Full house' },
  ];
  // 3×9 grid, five numbers per row, at least one per column; column c holds 10c..10c+9 (1–9, …, 80–90), ascending downwards
  function ticket() {
    for (;;) {
      const rows = [0, 1, 2].map(() => shuffle([...Array(9).keys()]).slice(0, 5));
      const cnt = Array(9).fill(0); rows.forEach(r => r.forEach(c => cnt[c]++));
      if (cnt.some(n => n === 0)) continue;
      const t = [0, 1, 2].map(() => Array(9).fill(0));
      for (let c = 0; c < 9; c++) {
        const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9;
        const pool = shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).slice(0, cnt[c]).sort((a, b) => a - b);
        let k = 0; for (let r = 0; r < 3; r++) if (rows[r].includes(c)) t[r][c] = pool[k++];
      }
      return t;
    }
  }
  const nums = t => t.flat().filter(Boolean);
  // does this ticket qualify for the prize, given the numbers called so far?
  function done(t, called, prize) {
    const has = n => called.has(n);
    if (prize === 'early5') return nums(t).filter(has).length >= 5;
    if (prize === 'full') return nums(t).every(has);
    const r = { top: 0, middle: 1, bottom: 2 }[prize];
    return r !== undefined && t[r].filter(Boolean).every(has);
  }
  // how many numbers are still missing for the prize (best ticket)
  function missing(tickets, called, prize) {
    return Math.min(...tickets.map(t => {
      if (prize === 'early5') return Math.max(0, 5 - nums(t).filter(n => called.has(n)).length);
      if (prize === 'full') return nums(t).filter(n => !called.has(n)).length;
      return t[{ top: 0, middle: 1, bottom: 2 }[prize]].filter(n => n && !called.has(n)).length;
    }));
  }
  const NICK = { 1: 'Kelly’s eye', 2: 'One little duck', 7: 'Lucky seven', 8: 'Garden gate', 11: 'Legs eleven', 13: 'Unlucky for some', 16: 'Sweet sixteen', 21: 'Key of the door',
    22: 'Two little ducks', 45: 'Halfway there', 50: 'Half a century', 57: 'Heinz varieties', 66: 'Clickety click', 77: 'Sunset strip', 88: 'Two fat ladies', 90: 'Top of the shop' };
  return { PRIZES, ticket, nums, done, missing, shuffle, NICK };
})();

/* ======================================================================================= */
/*  Engine                                                                                 */
/* ======================================================================================= */
// io: { update(), fx(name, pi) }
class TambolaGame {
  constructor({ players, tickets = 1, speed = 4 }, io) {
    this.io = io; this.gen = 0;
    this.st = {
      players: players.map((p, i) => ({ id: p.id || 'p' + i, name: p.name, kind: p.kind, tickets: Array.from({ length: tickets }, () => TAM.ticket()), marks: [], auto: p.kind === 'cpu', out: {}, won: [] })),
      bag: TAM.shuffle(Array.from({ length: 90 }, (_, i) => i + 1)), called: [], last: 0, speed,
      prizes: TAM.PRIZES.map(p => ({ id: p.id, winners: [], closedAt: -1 })),
      endAt: -1, over: false, paused: false, msg: 'Get ready — numbers are coming!', seq: 0,
    };
  }
  static restore(st, io) { const g = Object.create(TambolaGame.prototype); g.io = io; g.gen = 0; g.st = st; return g; }
  sleep(ms) { const g = this.gen; return new Promise((res, rej) => setTimeout(() => (g === this.gen ? res() : rej(TambolaGame.ABORT)), ms)); }
  up() { this.st.seq++; this.io.update(); }
  stop() { this.gen++; }
  calledSet() { return new Set(this.st.called); }

  async run() { try { await this.loop(); } catch (e) { if (e !== TambolaGame.ABORT) console.error(e); } }
  async loop() {
    const st = this.st;
    this.up();
    while (!st.over) {
      await this.sleep(st.called.length ? st.speed * 1000 : 1800);
      while (st.paused) await this.sleep(300);
      if (st.endAt >= 0 || !st.bag.length || st.prizes.every(p => p.winners.length)) return this.finish();
      const n = st.bag.pop(); st.called.push(n); st.last = n;
      st.msg = `Number ${n}${TAM.NICK[n] ? ' — ' + TAM.NICK[n] : ''}`;
      st.players.forEach(p => { if (p.auto && !p.marks.includes(n) && p.tickets.some(t => TAM.nums(t).includes(n))) p.marks.push(n); });
      this.io.fx('number');
      this.up();
      this.botClaims();
    }
  }
  finish() {
    const st = this.st; st.over = true;
    const tally = st.players.map(p => p.won.length);
    st.msg = Math.max(...tally) ? 'Game over!' : 'All numbers called — no winners.';
    this.io.fx('over', -1);
    this.up();
  }

  // computer players notice a qualifying ticket a moment after the number is called
  botClaims() {
    const st = this.st, called = this.calledSet(), g = this.gen, n = st.called.length;
    st.players.forEach((p, pi) => {
      if (p.kind !== 'cpu') return;
      st.prizes.forEach(pr => {
        if (p.out[pr.id] || pr.winners.includes(pi)) return;
        if (pr.winners.length && pr.closedAt !== n) return;
        if (!p.tickets.some(t => TAM.done(t, called, pr.id))) return;
        setTimeout(() => { if (g === this.gen && !st.over) this.claim(pi, pr.id); }, Math.min(900 + Math.random() * 1500, st.speed * 600));
      });
    });
  }

  // returns 'ok' | 'late' | 'bogus' | 'dup' | 'bad'
  claim(pi, id) {
    const st = this.st, pr = st.prizes.find(p => p.id === id), p = st.players[pi], info = TAM.PRIZES.find(x => x.id === id);
    if (!pr || !p || st.over) return 'bad';
    if (pr.winners.includes(pi)) return 'dup';
    if (p.out[id]) return 'bad';
    if (pr.winners.length && pr.closedAt !== st.called.length) return 'late';
    if (!p.tickets.some(t => TAM.done(t, this.calledSet(), id))) {
      p.out[id] = true; st.msg = `${p.name}: bogus claim for ${info.name} — out of that prize!`; this.io.fx('bogus', pi); this.up(); return 'bogus';
    }
    pr.winners.push(pi); pr.closedAt = st.called.length; p.won.push(id);
    st.msg = `${p.name} wins ${info.name}!`; this.io.fx('prize', pi);
    if (id === 'full') st.endAt = st.called.length;
    this.up();
    return 'ok';
  }
  mark(pi, n) {
    const p = this.st.players[pi]; n = +n;
    if (!p || !this.st.called.includes(n) || !p.tickets.some(t => TAM.nums(t).includes(n))) return;
    const i = p.marks.indexOf(n); if (i >= 0) p.marks.splice(i, 1); else p.marks.push(n);
    this.up();
  }
  setAuto(pi, on) {
    const p = this.st.players[pi]; if (!p) return;
    p.auto = !!on;
    if (p.auto) p.marks = this.st.called.filter(n => p.tickets.some(t => TAM.nums(t).includes(n)));
    this.up();
  }
  // a person left the room: the computer plays on for them
  forfeit(pi) { const p = this.st.players[pi]; if (p && p.kind === 'human') { p.kind = 'cpu'; p.auto = true; this.setAuto(pi, true); } }

  // what a given player may see: their own tickets, never the bag
  static viewFor(st, me) {
    const { bag, ...rest } = st;
    return { ...rest, left: bag.length, players: st.players.map((p, i) => i === me ? p : { ...p, tickets: [], marks: [], tcount: p.tickets.length }) };
  }
}
TambolaGame.ABORT = Symbol('abort');

/* ======================================================================================= */
/*  View                                                                                   */
/* ======================================================================================= */
const TamView = (() => {
  const esc = s => UI.esc(s);
  function ticketHTML(t, called, marks, mine) {
    return `<div class="tam-ticket">${t.map(row => row.map(n => {
      if (!n) return '<span class="tc blank"></span>';
      const m = marks.has(n), hot = !m && called.has(n);
      return `<button class="tc${m ? ' on' : ''}${hot ? ' hot' : ''}${called.has(n) ? ' called' : ''}" data-tn="${n}" ${mine ? '' : 'disabled'}>${n}</button>`;
    }).join('')).join('')}</div>`;
  }
  function boardHTML(called, last) {
    return `<div class="tam-board">${Array.from({ length: 90 }, (_, i) => i + 1).map(n => `<i class="${called.has(n) ? 'c' : ''}${n === last ? ' last' : ''}">${n}</i>`).join('')}</div>`;
  }
  // o: { me, local, voice, auto, footer }
  function html(st, o) {
    const called = new Set(st.called), me = st.players[o.me], marks = new Set(me ? me.marks : []);
    const last = st.last, recent = st.called.slice(-6, -1).reverse();
    const left = st.left ?? st.bag?.length ?? 0;
    const prizes = TAM.PRIZES.map((info, k) => {
      const pr = st.prizes[k], open = !pr.winners.length || pr.closedAt === st.called.length;
      const names = pr.winners.map(i => st.players[i].name.replace(/ 🤖/, '')).join(' & ');
      const mineOut = me && me.out[info.id], mineWon = me && pr.winners.includes(o.me);
      const dis = st.over || !me || !open || mineOut || mineWon;
      const sub = pr.winners.length ? `<small>${esc(names)}</small>` : mineOut ? '<small>missed</small>' : `<small>${me && TAM.missing(me.tickets, called, info.id) === 0 ? 'ready!' : ''}</small>`;
      const ready = me && !dis && TAM.done ? me.tickets.some(t => TAM.done(t, called, info.id)) : false;
      return `<button class="prize${pr.winners.length ? ' won' : ''}${ready ? ' ready' : ''}" data-claim="${info.id}" ${dis ? 'disabled' : ''}><b>${info.name}</b>${sub}</button>`;
    }).join('');
    const rank = st.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.won.length - a.p.won.length);
    return `<div class="tam">
      <div class="tam-caller${st.paused ? ' paused' : ''}">
        <div class="tam-ball${last ? '' : ' empty'}${o.fresh ? ' fresh' : ''}">${last || '—'}</div>
        <div class="tam-info">
          <div class="tam-msg">${esc(st.msg)}</div>
          <div class="tam-recent">${recent.map(n => `<i>${n}</i>`).join('') || '<small>Previous numbers appear here</small>'}</div>
          <small class="tam-left">${st.called.length} called · ${left} left${st.paused ? ' · paused' : ''}</small>
        </div>
      </div>
      ${me ? `<div class="tam-tickets">${me.tickets.map(t => ticketHTML(t, called, marks, true)).join('')}</div>`
        : '<p class="hint">You’re watching this game.</p>'}
      <div class="tam-prizes">${prizes}</div>
      <div class="tam-players">${rank.map(({ p, i }) => `<span class="${i === o.me ? 'me' : ''}">${esc(p.name)} <b>${p.won.length ? '🏆'.repeat(p.won.length) : ''}</b></span>`).join('')}</div>
      ${boardHTML(called, last)}
      <div class="tam-tools">
        ${me ? `<button class="b b-ghost small-b2" data-k="auto">${me.auto ? '✓ Auto-mark' : 'Auto-mark'}</button>` : ''}
        <button class="b b-ghost small-b2" data-k="voice">${o.voice ? '🔊 Announce' : '🔈 Announce'}</button>
        ${o.canPause ? `<button class="b b-ghost small-b2" data-k="pause">${st.paused ? '▶ Resume' : '⏸ Pause'}</button>` : ''}
      </div>
      ${st.over ? `<div class="tam-over"><h3>Game over</h3>${TAM.PRIZES.map((info, k) => {
        const w = st.prizes[k].winners; return `<p><span>${info.name}</span><b>${w.length ? esc(w.map(i => st.players[i].name).join(' & ')) : '—'}</b></p>`;
      }).join('')}${o.footer || ''}</div>` : (o.footer || '')}
    </div>`;
  }
  // read the number out loud (optional)
  let lastSpoken = 0;
  function announce(st, on) {
    if (!on || !st.last || st.last === lastSpoken || !('speechSynthesis' in window)) { if (st.last) lastSpoken = st.last; return; }
    lastSpoken = st.last;
    try {
      const n = st.last, say = `${TAM.NICK[n] ? TAM.NICK[n] + '. ' : ''}${n > 9 ? String(n).split('').join(' ') + '. ' : ''}${n}`;
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(say); u.rate = 0.9; speechSynthesis.speak(u);
    } catch {}
  }
  const reset = () => { lastSpoken = 0; };
  return { html, announce, reset };
})();

/* ======================================================================================= */
/*  Single-phone screen                                                                    */
/* ======================================================================================= */
const Tambola = (() => {
  const KEY = 'cardroom.tambola';
  const CPU = ['Raju', 'Meena', 'Arjun', 'Kavya', 'Imran'];
  let el = null, game = null, voice = false, prevLast = 0;
  let setup = load('setup') || { cpus: 3, tickets: 1, speed: 4 };
  function load(k) { try { return JSON.parse(localStorage.getItem(KEY + '.' + k)); } catch { return null; } }
  function save() { try { if (game) localStorage.setItem(KEY + '.game', JSON.stringify(game.st)); localStorage.setItem(KEY + '.setup', JSON.stringify(setup)); } catch {} }
  const io = {
    update() { save(); draw(); },
    fx(name, pi) {
      if (name === 'number') Sfx.dice();
      else if (name === 'prize') { if (pi === 0) UI.burst('You win a prize!', 'big'); else Sfx.chips(); }
      else if (name === 'bogus') { if (pi === 0) Sfx.lose(); }
      else if (name === 'over') Sfx.win();
    },
  };
  function draw() {
    if (!el || !game) return;
    TamView.announce(game.st, voice);
    const y = el.querySelector('.tam') ? el.scrollTop : 0;
    const fresh = game.st.last !== prevLast; prevLast = game.st.last;
    el.innerHTML = TamView.html(game.st, { me: 0, voice, fresh, canPause: !game.st.over, footer: game.st.over ? '<button class="b b-raise big" data-k="again">Play again</button>' : '<button class="b b-ghost wide small-b2" data-k="menu">Setup / quit</button>' });
    el.scrollTop = y;
  }
  function renderSetup() {
    const sel = (k, vals, f) => `<select data-o="${k}">${vals.map(v => `<option value="${v}" ${setup[k] == v ? 'selected' : ''}>${f(v)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="ludo-setup">
      <div class="ludo-hero biz-hero">🎱</div>
      <h2 class="wordmark small">Tambola</h2>
      <p class="tagline">Housie · the classic number game</p>
      <a class="tile t-friends online-cta" href="#mp"><div class="art"><span class="biz-art">📱</span></div>
        <div class="txt"><b>Play with friends</b><small>Everyone on their own phone — create a room and pick Tambola</small></div><span class="go">›</span></a>
      <div class="or"><span>or play against the computer</span></div>
      <div class="opts">
        <label>Computer players <span class="stepper"><button data-s="-1" ${setup.cpus <= 1 ? 'disabled' : ''}>−</button><b>${setup.cpus}</b><button data-s="1" ${setup.cpus >= 5 ? 'disabled' : ''}>+</button></span></label>
        <label>Tickets each ${sel('tickets', [1, 2, 3], v => v)}</label>
        <label>Calling speed ${sel('speed', [2.5, 4, 6, 9], v => ({ 2.5: 'Fast', 4: 'Normal', 6: 'Relaxed', 9: 'Slow' }[v]))}</label>
      </div>
      <p class="hint small">Numbers 1–90 are called one at a time. Tap a number on your ticket when it’s called (or switch on auto-mark). Claim <b>Early Five</b>, the <b>Top, Middle and Bottom lines</b> and the <b>Full House</b> by tapping the prize the moment your ticket qualifies — a wrong claim knocks you out of that prize.</p>
      ${load('game') && !load('game').over ? '<button class="b b-ghost wide" data-k="resume">Resume last game</button>' : ''}
      <button class="b b-raise big" data-k="start">Start game</button>
    </div>`;
  }
  function start(st) {
    game?.stop(); TamView.reset();
    game = st ? TambolaGame.restore(st, io) : new TambolaGame({ players: [{ name: 'You', kind: 'human' }, ...CPU.slice(0, setup.cpus).map(n => ({ name: n + ' 🤖', kind: 'cpu' }))], tickets: +setup.tickets, speed: +setup.speed }, io);
    save(); draw(); game.run();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (!game) {
      if (b.dataset.s) { setup.cpus = Math.min(5, Math.max(1, setup.cpus + +b.dataset.s)); save(); return renderSetup(); }
      if (b.dataset.k === 'start') return start();
      if (b.dataset.k === 'resume') return start(load('game'));
      return;
    }
    const k = b.dataset.k;
    if (b.dataset.tn) { const n = +b.dataset.tn; if (game.st.called.includes(n)) { game.mark(0, n); Sfx.chip(); } return; }
    if (b.dataset.claim) { const r = game.claim(0, b.dataset.claim); if (r === 'late') toastMsg('Too late — that prize is taken.'); return; }
    if (k === 'auto') return game.setAuto(0, !game.st.players[0].auto);
    if (k === 'voice') { voice = !voice; if (voice) TamView.reset(); draw(); return; }
    if (k === 'pause') { game.st.paused = !game.st.paused; return game.up(); }
    if (k === 'again') return start();
    if (k === 'menu') { const go = () => { game.stop(); save(); game = null; renderSetup(); }; if (!game.st.over) UI.ask('Leave this game? It is saved — you can resume it later.', 'Leave').then(ok => ok && go()); else go(); }
  }
  function onChange(e) { const o = e.target.dataset.o; if (o) { setup[o] = +e.target.value; save(); } }
  function toastMsg(t) { if (game) { game.st.msg = t; game.up(); } }
  function mount(container) { el = container; el.onclick = onClick; el.onchange = onChange; game = null; renderSetup(); }
  function unmount() { game?.stop(); if (game && !game.st.over) save(); game = null; if (el) el.onclick = el.onchange = null; el = null; }
  return { mount, unmount, get game() { return game; } };
})();
