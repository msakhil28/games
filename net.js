// Networking for multiplayer rooms.
// Default transport: WebRTC data channels via PeerJS (uses the free public PeerJS signaling server,
// so no backend is needed). The host's device runs the game; guests connect to it with a room code.
// Testing transports (URL query): ?transport=local  -> BroadcastChannel between tabs of one browser
//                                 ?peerhost=HOST&peerport=PORT -> a self-hosted PeerJS server
const Net = (() => {
  const PREFIX = 'cardroom-v1-';
  const q = new URLSearchParams(location.search);
  const LOCAL = q.get('transport') === 'local';
  const peerOpts = q.get('peerhost')
    ? { host: q.get('peerhost'), port: +(q.get('peerport') || 9000), path: '/', secure: false, debug: 0 }
    : { debug: 0 };
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  // A connection exposes: send(obj), onData(fn), onClose(fn), close()
  function wrapPeerConn(c, onCloseExtra) {
    let closed = false;
    const closeFns = [];
    const fire = () => { if (closed) return; closed = true; closeFns.forEach(f => f()); onCloseExtra && onCloseExtra(); };
    c.on('close', fire);
    c.on('error', fire);
    return {
      send(o) { if (!closed && c.open) try { c.send(o); } catch {} },
      onData(f) { c.on('data', f); },
      onClose(f) { closeFns.push(f); },
      close() { try { c.close(); } catch {} fire(); },
    };
  }

  /* ---------- PeerJS ---------- */
  function hostPeer(onConn) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error('Multiplayer library failed to load. Check your connection.'));
      let tries = 0;
      const attempt = () => {
        const code = newCode();
        const peer = new Peer(PREFIX + code, peerOpts);
        let opened = false;
        peer.on('open', () => {
          opened = true;
          resolve({ code, close: () => peer.destroy() });
        });
        peer.on('connection', c => c.on('open', () => onConn(wrapPeerConn(c))));
        peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
        peer.on('error', e => {
          if (opened) return console.warn('peer error', e.type);
          peer.destroy();
          if (e.type === 'unavailable-id' && ++tries < 5) attempt();
          else reject(new Error(e.type === 'network' || e.type === 'server-error'
            ? 'Could not reach the matchmaking server. Check your internet connection.' : 'Could not create room (' + e.type + ').'));
        });
      };
      attempt();
    });
  }

  function joinPeer(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error('Multiplayer library failed to load. Check your connection.'));
      const peer = new Peer(peerOpts);
      let done = false;
      const fail = err => { if (done) return; done = true; clearTimeout(t); peer.destroy(); reject(err); };
      const t = setTimeout(() => fail(new Error('Could not reach that room. Check the code, and that the host still has the app open.')), 15000);
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => {
          if (done) return;
          done = true; clearTimeout(t);
          resolve(wrapPeerConn(c, () => setTimeout(() => peer.destroy(), 100)));
        });
      });
      peer.on('error', e => fail(new Error(e.type === 'peer-unavailable' ? `No room with code ${code}. Check the code and try again.`
        : e.type === 'network' || e.type === 'server-error' ? 'Could not reach the matchmaking server. Check your internet connection.'
          : 'Connection failed (' + e.type + ').')));
    });
  }

  /* ---------- BroadcastChannel (testing on one device) ---------- */
  function localConn(post, closeHook) {
    const h = { data: [], close: [] };
    let closed = false;
    return {
      _h: h,
      send(o) { if (!closed) post(JSON.parse(JSON.stringify(o))); },
      onData(f) { h.data.push(f); },
      onClose(f) { h.close.push(f); },
      close() { if (closed) return; closed = true; closeHook && closeHook(); h.close.forEach(f => f()); },
      _remoteClosed() { if (closed) return; closed = true; h.close.forEach(f => f()); },
    };
  }
  function hostLocal(onConn) {
    const code = newCode();
    const bc = new BroadcastChannel('cardroom-' + code);
    const conns = new Map();
    bc.onmessage = ({ data: m }) => {
      if (m.to !== 'host') return;
      if (m.kind === 'hello') {
        const c = localConn(o => bc.postMessage({ to: m.from, kind: 'data', data: o }),
          () => { bc.postMessage({ to: m.from, kind: 'bye' }); conns.delete(m.from); });
        conns.set(m.from, c);
        bc.postMessage({ to: m.from, kind: 'ack' });
        onConn(c);
      } else if (m.kind === 'data') conns.get(m.from)?._h.data.forEach(f => f(m.data));
      else if (m.kind === 'bye') { const c = conns.get(m.from); conns.delete(m.from); c && c._remoteClosed(); }
    };
    return Promise.resolve({ code, close: () => { conns.forEach(c => c.close()); bc.close(); } });
  }
  function joinLocal(code) {
    return new Promise((resolve, reject) => {
      const bc = new BroadcastChannel('cardroom-' + code);
      const me = Math.random().toString(36).slice(2);
      let c = null;
      const t = setTimeout(() => { bc.close(); reject(new Error(`No room with code ${code}.`)); }, 1500);
      bc.onmessage = ({ data: m }) => {
        if (m.to !== me) return;
        if (m.kind === 'ack' && !c) {
          clearTimeout(t);
          c = localConn(o => bc.postMessage({ to: 'host', from: me, kind: 'data', data: o }),
            () => { bc.postMessage({ to: 'host', from: me, kind: 'bye' }); setTimeout(() => bc.close(), 50); });
          resolve(c);
        } else if (m.kind === 'data' && c) c._h.data.forEach(f => f(m.data));
        else if (m.kind === 'bye' && c) { c._remoteClosed(); bc.close(); }
      };
      bc.postMessage({ to: 'host', from: me, kind: 'hello' });
    });
  }

  return {
    local: LOCAL,
    host: onConn => (LOCAL ? hostLocal : hostPeer)(onConn),
    join: code => (LOCAL ? joinLocal : joinPeer)(code.toUpperCase().replace(/[^A-Z0-9]/g, '')),
  };
})();
