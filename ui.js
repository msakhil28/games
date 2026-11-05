// Shared casino visuals used by single-player and multiplayer screens:
// playing cards (with deal / flip animations that survive re-renders), chip stacks, avatars and the two tables.
const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- cards ---------- */
  // Each card position ("slot") remembers what it showed and when its animation started, so a re-render
  // in the middle of a deal continues the animation (negative delay) instead of restarting or snapping.
  const slots = new Map();
  const DUR = 520;
  let batch = 0, batchAt = 0;
  function card(c, slot, size = 'md') {
    const now = Date.now();
    if (now - batchAt > 60) { batch = 0; batchAt = now; }
    let anim = '', style = '';
    if (slot && !reduced.matches) {
      const face = c ? 'f' : 'b';
      let rec = slots.get(slot);
      if (!rec) {
        rec = { s: face, anim: 'deal', t0: now + batch++ * 110 };
        slots.set(slot, rec);
        Sfx.deal(rec.t0 - now);
        if (slots.size > 800) for (const k of [...slots.keys()].slice(0, 300)) slots.delete(k);
      } else if (rec.s === 'b' && face === 'f') {
        Object.assign(rec, { s: 'f', anim: 'flip', t0: now + batch++ * 140 });
        Sfx.flip(rec.t0 - now);
      } else rec.s = face;
      if (rec.anim && now < rec.t0 + DUR) { anim = ' ' + rec.anim; style = ` style="--d:${rec.t0 - now}ms"`; }
    }
    if (!c) return `<div class="pc back ${size}${anim}"${style}></div>`;
    const red = c.s === '♥' || c.s === '♦' ? ' red' : '';
    const r = RANK[c.r] || c.r;
    const face = c.r >= 11 && c.r <= 13;
    return `<div class="pc ${size}${red}${anim}${face ? ' face' : ''}"${style}>
      <span class="ix">${r}<i>${c.s}</i></span><span class="pip">${face ? `<em>${r}</em>` : ''}${c.s}</span><span class="ix bt">${r}<i>${c.s}</i></span></div>`;
  }
  const emptyCard = size => `<div class="pc empty ${size || 'md'}"></div>`;

  /* ---------- chips ---------- */
  const DENOMS = [1000, 500, 100, 25, 5, 1];
  function chipStack(amount, cls = '') {
    if (!amount) return '';
    let left = Math.round(amount);
    const discs = [];
    for (const d of DENOMS) while (left >= d && discs.length < 9) { discs.push(d); left -= d; }
    return `<div class="stack ${cls}"><div class="discs">${discs.reverse().map((d, i) => `<i class="chip c${d}" style="--i:${i}"></i>`).join('')}</div><b>${fmt(amount)}</b></div>`;
  }
  const chipBtn = (v, attrs = '') => `<button class="chip-btn c${v}" ${attrs}><span>${v >= 1000 ? v / 1000 + 'K' : v}</span></button>`;

  /* ---------- avatars ---------- */
  const HUES = [205, 340, 145, 28, 265, 180, 50, 310, 95, 0];
  function hue(s) { let h = 7; for (const ch of String(s)) h = (h * 131 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }
  function avatar(name, id, bot) {
    const clean = String(name).replace(/🤖/g, '').trim();
    return `<div class="avatar" style="--h:${hue(id || name)}"><span>${esc(clean.slice(0, 1).toUpperCase() || '?')}</span>${bot ? '<i class="bot">🤖</i>' : ''}</div>`;
  }
  const ring = t => t ? `<div class="ring" data-until="${t.until}" data-total="${t.total}"></div>` : '';
  const pct = v => v.toFixed(2) + '%';

  /* ---------- poker table ---------- */
  // model: { hand, seats:[{id,name,chips,cards,bet,folded,allIn,dealer,turn,status,handName,won,me,bot,offline,emote,timer}], board, pot, msg, sub }
  function pokerTable(m) {
    const meIdx = Math.max(0, m.seats.findIndex(s => s.me));
    const order = m.seats.slice(meIdx).concat(m.seats.slice(0, meIdx));
    const k = order.length - 1;
    const rad = d => d * Math.PI / 180;
    // points on a racetrack-like oval (superellipse) so seats hug the straight sides and rounded ends
    const sq = v => Math.sign(v) * Math.pow(Math.abs(v), 0.62);
    let seatsHTML = '', betsHTML = '', puck = '';
    order.forEach((s, i) => {
      const a = rad(i === 0 ? 90 : 90 + 360 * i / (k + 1));
      const x = 50 + 44 * sq(Math.cos(a)), y = 50 + 43 * sq(Math.sin(a));
      const cls = ['seat', s.me && 'me', Math.sin(a) < -0.5 && 'upper', s.turn && 'turn', s.folded && 'folded', s.won && 'winner', s.offline && 'offline', !s.inHand && 'idle'].filter(Boolean).join(' ');
      const cards = s.cards.map((c, j) => card(c, `${m.hand}:${s.id}:${j}`, s.me ? 'lg' : 'sm')).join('');
      const tag = s.won ? `<div class="won">+${fmt(s.won)}</div>` : '';
      seatsHTML += `<div class="${cls}" style="left:${pct(x)};top:${pct(y)}">
        ${s.emote ? `<span class="emote-bubble">${s.emote}</span>` : ''}
        <div class="hole">${cards}</div>
        <div class="who">
          <div class="pod">${avatar(s.name, s.name + s.id, s.bot)}${ring(s.timer)}</div>
          <div class="plate"><b>${esc(String(s.name).replace(/🤖/g, '').trim())}</b><span>${fmt(s.chips)}</span></div>
          ${s.status ? `<div class="tag ${s.statusCls || ''}">${esc(s.status)}</div>` : ''}
        </div>${tag}
      </div>`;
      if (s.bet) {
        // keep bets off the board: top seats bet just above it, side seats just below it
        const sin = Math.sin(a), cos = Math.cos(a);
        const bx = 50 + (Math.abs(sin) < 0.6 ? 25 : 27) * sq(cos);
        const by = i === 0 ? 72 : sin < -0.6 ? 50 + 19 * sin : Math.abs(sin) < 0.6 ? 59 + 6 * sin : 50 + 26 * sin;
        betsHTML += `<div class="bet-spot" style="left:${pct(bx)};top:${pct(by)}">${chipStack(s.bet, 'sm')}</div>`;
      }
      if (s.dealer) {
        const da = a + rad(i === 0 ? 24 : 18);
        puck = `<div class="puck" style="left:${pct(50 + 33 * sq(Math.cos(da)))};top:${pct(50 + 34 * sq(Math.sin(da)))}">D</div>`;
      }
    });
    const streetBets = m.seats.reduce((t, s) => t + (s.bet || 0), 0);
    const gathered = Math.max(0, m.pot - streetBets);
    const board = [0, 1, 2, 3, 4].map(i => m.board[i] ? card(m.board[i], `${m.hand}:board:${i}`, 'md') : emptyCard('md')).join('');
    return `<div class="table poker">
      <div class="rail"><div class="felt">
        <div class="felt-mark">Card Room</div>
        <div class="pot-area">${m.pot ? `<div class="pot-label">${gathered ? chipStack(gathered, 'pot') : ''}Pot ${fmt(m.pot)}</div>` : ''}</div>
        <div class="board">${board}</div>
        <div class="table-msg">${m.msg ? `<span>${esc(m.msg)}</span>` : ''}${m.sub || ''}</div>
      </div></div>
      ${betsHTML}${puck}${seatsHTML}
    </div>`;
  }

  /* ---------- blackjack table ---------- */
  // model: { round, dealer:{cards,total,hidden}, spots:[{id,name,chips,me,bet,hands:[{cards,t,soft,result,net,active,bet}],status,turn,emote,timer,offline,bot}], msg, sub }
  function bjTable(m) {
    const meIdx = m.spots.findIndex(s => s.me);
    // put "me" in the middle of the arc
    let order = m.spots.slice();
    if (meIdx >= 0) { const me = order.splice(meIdx, 1)[0]; order.splice(Math.floor(order.length / 2), 0, me); }
    const n = order.length;
    const spots = order.map((s, i) => {
      const a = (n === 1 ? 90 : 150 - 120 * i / (n - 1)) * Math.PI / 180;
      const x = 50 + 37 * Math.cos(a), y = 30 + 44 * Math.sin(a);
      const size = s.me ? (s.hands.length > 1 ? 'md' : 'lg') : 'sm';
      const hands = s.hands.map((h, j) => {
        const cards = h.cards.map((c, k) => `<div class="casc" style="--k:${k}">${card(c, `${m.round}:${s.id}:${j}:${k}`, size)}</div>`).join('');
        const res = h.result ? `<div class="result ${h.net > 0 ? 'win' : h.net < 0 ? 'lose' : 'push'}">${esc(h.result)}</div>` : '';
        return `<div class="hand${h.active ? ' active' : ''}" style="--n:${h.cards.length}">
          <div class="cascade">${cards}</div>
          ${h.cards.length ? `<div class="total${h.t > 21 ? ' bust' : h.t === 21 ? ' bj' : ''}">${h.soft && h.t < 21 ? 'soft ' : ''}${h.t}</div>` : ''}
          ${res}
        </div>`;
      }).join('');
      const circleBet = s.hands.length ? s.hands.reduce((t, h) => t + h.bet, 0) : s.bet;
      return `<div class="spot${s.me ? ' me' : ''}${s.turn ? ' turn' : ''}${s.offline ? ' offline' : ''}" style="left:${pct(x)};top:${pct(y)}">
        ${s.emote ? `<span class="emote-bubble">${s.emote}</span>` : ''}
        <div class="hands">${hands}</div>
        <div class="circle">${circleBet ? chipStack(circleBet, 'sm') + `<span class="betamt">${fmt(circleBet)}</span>` : ''}</div>
        <div class="plate">${avatar(s.name, s.id, s.bot)}<b>${esc(s.name)}</b><span>${fmt(s.chips)}</span>${ring(s.timer)}</div>
        ${s.status ? `<div class="tag">${esc(s.status)}</div>` : ''}
      </div>`;
    }).join('');
    const d = m.dealer;
    const dealerCards = d.cards.map((c, k) => card(c, `${m.round}:dealer:${k}`, 'md')).join('');
    return `<div class="table bj">
      <div class="rail"><div class="felt">
        <svg class="arc" viewBox="0 0 300 120" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
          <defs><path id="arc1" d="M18 22 Q150 112 282 22"/><path id="arc2" d="M40 46 Q150 124 260 46"/></defs>
          <text><textPath href="#arc1" startOffset="50%" text-anchor="middle" class="t1">BLACKJACK PAYS 3 TO 2</textPath></text>
          <text><textPath href="#arc2" startOffset="50%" text-anchor="middle" class="t2">DEALER MUST DRAW TO 16 AND STAND ON ALL 17s</textPath></text>
        </svg>
        <div class="shoe"><i></i></div>
        <div class="dealer">
          <div class="dcards">${dealerCards || ''}</div>
          ${d.cards.length ? `<div class="total">${d.total}${d.hidden ? '' : ''}</div>` : ''}
        </div>
        <div class="table-msg">${m.msg ? `<span>${esc(m.msg)}</span>` : ''}${m.sub || ''}</div>
      </div></div>
      ${spots}
    </div>`;
  }

  /* ---------- poker action dock (shared by single-player and multiplayer) ---------- */
  // y: { toCall, minTo, maxTo, canRaise, currentBet, myBet, pot }
  function pokerDock(y, raiseTo, head = '') {
    const verb = y.currentBet === 0 ? 'Bet' : 'Raise to';
    const call = y.toCall === 0 ? 'Check' : y.toCall >= y.maxTo - y.myBet ? `All-in <b>${fmt(y.toCall)}</b>` : `Call <b>${fmt(y.toCall)}</b>`;
    return `<div class="dock">
      ${head}
      ${y.canRaise ? `<div class="raise-row">
        <div class="quick"><button data-c="q" data-q="half">½ Pot</button><button data-c="q" data-q="pot">Pot</button><button data-c="q" data-q="max">All-in</button></div>
        <input type="range" id="rs" min="${y.minTo}" max="${y.maxTo}" step="1" value="${raiseTo}" aria-label="Raise amount">
      </div>` : ''}
      <div class="act-row">
        <button class="b b-fold" data-c="pk" data-a="fold">Fold</button>
        <button class="b b-call" data-c="pk" data-a="call">${call}</button>
        ${y.canRaise ? `<button class="b b-raise" data-c="pk" data-a="raise">${verb} <b id="rv">${fmt(raiseTo)}</b></button>` : ''}
      </div>
    </div>`;
  }

  function bjPlayDock(y, head = '') {
    return `<div class="dock">${head}<div class="act-row">
      <button class="b b-call" data-c="bj" data-a="hit">Hit</button>
      <button class="b b-fold" data-c="bj" data-a="stand">Stand</button>
      <button class="b b-raise" data-c="bj" data-a="double" ${y.canDouble ? '' : 'disabled'}>Double</button>
      <button class="b b-ghost" data-c="bj" data-a="split" ${y.canSplit ? '' : 'disabled'}>Split</button>
    </div></div>`;
  }
  function betTray(bet, max, buttons, head = '') {
    return `<div class="dock tray">${head}
      <div class="tray-chips">${[5, 25, 100, 500, 1000].map(v => chipBtn(v, `data-c="chip" data-v="${v}" ${bet + v > max ? 'disabled' : ''} aria-label="Add ${v}"`)).join('')}</div>
      <div class="act-row">${buttons}</div>
    </div>`;
  }

  /* ---------- timers (rings & countdown text) ---------- */
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-until]').forEach(n => {
      const left = Math.max(0, +n.dataset.until - now);
      if (n.classList.contains('ring')) { n.style.setProperty('--p', (left / (+n.dataset.total || 1)).toFixed(3)); n.classList.toggle('low', left < 5000); }
      else n.textContent = Math.ceil(left / 1000) + 's';
    });
  }, 150);

  /* ---------- celebration ---------- */
  function burst(text, kind = 'win') {
    if (kind === 'win') Sfx.win(); else if (kind === 'big') Sfx.big(); else if (kind === 'lose') Sfx.lose();
    const b = document.createElement('div');
    b.className = 'burst ' + kind;
    b.innerHTML = `<span>${esc(text)}</span>` + (kind === 'lose' || reduced.matches ? '' :
      Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--r:${90 + Math.random() * 70}px;--c:${['#f5d06f', '#e74c3c', '#2ecc71', '#3498db', '#fff'][i % 5]}"></i>`).join(''));
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1900);
  }

  /* ---------- in-app confirmation (native confirm() can be silently blocked in installed apps) ---------- */
  function ask(text, ok = 'OK', danger = false) {
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      d.className = 'ask';
      d.setAttribute('aria-label', 'Confirm');
      d.innerHTML = `<div class="set"><p>${esc(text)}</p><div class="act-row">
        <button class="b b-ghost" data-v="0">Cancel</button><button class="b ${danger ? 'b-fold' : 'b-raise'}" data-v="1">${esc(ok)}</button></div></div>`;
      document.body.appendChild(d);
      let done = false;
      const finish = v => { if (done) return; done = true; d.close(); d.remove(); resolve(v); };
      d.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) finish(b.dataset.v === '1'); else if (e.target === d) finish(false); });
      d.addEventListener('cancel', () => finish(false));
      d.showModal();
    });
  }

  return { ask, esc, fmt, card, emptyCard, chipStack, chipBtn, avatar, pokerTable, bjTable, pokerDock, bjPlayDock, betTray, burst };
})();
