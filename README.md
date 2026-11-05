# Card Room

An installable (PWA) game app: **Texas Hold'em Poker** vs 1–6 computer players, **Blackjack**, and 4-player **Ludo** with traditional Indian rules.
Plain HTML/CSS/JS — no build step, works offline once loaded.

Casino-style look: oval felt table with a padded rail, realistic cards with deal/flip animations,
casino chips, win celebrations and synthesized sound effects (toggle with the speaker icon).
Animations respect the system "reduce motion" setting. Fonts (Cinzel, Inter — SIL OFL) are bundled in `fonts/`.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Install on your phone/desktop
The site deploys to GitHub Pages automatically on every push to `main` (`.github/workflows/pages.yml`).
One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The app is then at
`https://<user>.github.io/<repo>/` — open it on your phone and use **Install app** / **Add to Home Screen**.

## Ludo
Four colours, each can be a person (pass the phone) or a computer. Traditional Indian rules: a 6 brings a token
out; 6, a capture or reaching home rolls again; three 6s in a row lose the turn; start and ★ squares are safe;
two tokens of one colour form a pair that can't be captured or jumped; exact roll to finish; and (toggle) you must
capture at least once before your tokens may enter the home column. Games are saved and can be resumed.

## Play with friends (multiplayer)
Tap **Play with friends** → **Create a room**. Friends open the same site on their phones and either scan the
QR code, open the shared invite link, or type the 5-letter room code.

- **Lobby:** the host picks the game (Poker or Blackjack), starting chips, blinds, number of computer players,
  turn timer, Blackjack minimum bet, and an optional *tournament mode* where blinds double every 10 hands.
- **In game:** turn timers (auto check/fold or stand), emoji reactions, live leaderboard (☰ Room).
- **Host powers:** give/take chips from anyone (friends or computer players), pause, remove players,
  return to the lobby and switch games — chips carry over between games in the same room.
- **Dropped connection?** Phones reconnect automatically and keep their seat and chips.

How it works: peer-to-peer WebRTC via [PeerJS](https://peerjs.com) (vendored in `vendor/`). The host's phone runs
the game; the free public PeerJS server is only used to introduce the phones to each other. No backend needed.
Keep the host's screen on (the app requests a screen wake lock). Some strict mobile networks block direct
peer-to-peer connections; if a friend can't connect on cellular, join the same Wi-Fi.

Testing on one computer: open `index.html?transport=local#mp` in several tabs of the same browser.

## Settings (⚙, available anywhere)
- Add money to your bankroll any time (quick buttons, custom amount, or set an exact amount).
- Set each computer player's poker chips, set all at once, and choose their re-buy amount when they bust.
- Everything is saved in the browser (localStorage). Each deploy stamps a new cache `VERSION` in `sw.js` automatically.
