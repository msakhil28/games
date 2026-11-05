# Card Room

An installable (PWA) card game app: **Texas Hold'em Poker** vs 3 computer players and **Blackjack**.
Plain HTML/CSS/JS — no build step, works offline once loaded.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Install on your phone/desktop
Host the folder on any HTTPS site (e.g. GitHub Pages: Settings → Pages → deploy from branch, root),
open it in your browser, then use **Install app** / **Add to Home Screen**.

## Settings (⚙, available anywhere)
- Add money to your bankroll any time (quick buttons, custom amount, or set an exact amount).
- Set each computer player's poker chips, set all at once, and choose their re-buy amount when they bust.
- Everything is saved in the browser (localStorage). After changing files, bump `VERSION` in `sw.js`.
