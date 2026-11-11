# Card Room

An installable (PWA) game app: **Texas Hold'em Poker** vs 1–6 computer players, **Blackjack**, 4-player **Ludo**, **Business**, **Settlers**, **Tambola**, **Indian Rummy** and **Carrom**.
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
Play online with friends (each on their own phone, via Play with friends → pick Ludo) or against computers.
Seats can be left empty for 2–3 player games. Traditional Indian rules: a 6 brings a token
out; 6, a capture or reaching home rolls again; three 6s in a row lose the turn; start and ★ squares are safe;
two tokens of one colour form a pair that can't be captured or jumped; exact roll to finish; and (toggle) you must
capture at least once before your tokens may enter the home column. Games are saved and can be resumed.

## Business
The Indian property-trading game for 2–6 players — online with friends (each on their own phone, via Play with
friends → pick Business) or against 1–5 computers. 36-square board of Indian
cities in 8 colour groups, plus Railways/Airways/Waterways/Roadways, Electric Co. and Water Works, Chance and
Community Chest, Income and Wealth Tax, and the Start, Jail, Club and Rest House corners. Buy property, collect rent,
build houses evenly and then a hotel on full colour sets, mortgage when short of cash.
**Player details:** tap any player card to see their cash, net worth, standing, status, position, sets, buildings and every property they own (with rent and mortgage state).

**Trading:** on your own turn (before or after your roll) tap 🤝 Trade, pick a player and offer property and/or cash for theirs.
The other player accepts or declines (computer players accept only fair deals; unanswered offers lapse after 45 s online).
Only bare property can be traded — sell any houses/hotels in that colour group first — and nobody can lend or borrow cash.
A mortgaged property can be traded; its new owner pays the bank 10% of the mortgage straight away and can lift the mortgage later.
These follow the standard property-trading rules of the Monopoly family; they are not checked against a published Indian Business rulebook. Doubles roll again (three
doubles = jail). Play until one player is left, or set a round limit and the richest player wins. Games are saved.

## Settlers (Catan-style)
Base-game rules on a random 19-tile island (6s and 8s never touch) with 9 harbours: snake-order setup, dice
production, robber on 7 (discard half above 7 cards, move robber, steal), roads/settlements/cities with the
distance rule and piece limits, development cards (Knight, Victory Point, Road Building, Year of Plenty,
Monopoly), Largest Army and Longest Road, bank 4:1 / harbour 3:1 and 2:1 trades and trade offers to other
players. First to 10 points wins. Online with friends (hands stay private on each phone) or vs 1–3 computers.

## Tambola (Housie)
Tickets of 3 rows × 9 columns with 15 numbers; the numbers 1–90 are called one at a time (optional spoken announcements).
Tap a number when it is called, or switch on auto-mark. Claim **Early Five**, the **Top / Middle / Bottom line** and the
**Full House** the moment your ticket qualifies — a wrong claim knocks you out of that prize, and claims made before the next
number is called share the prize. 1–3 tickets each, calling speed adjustable. Online (the host calls the numbers, each phone
holds its own tickets) or against 1–5 computers.

## Indian Rummy
13-card points rummy for 2–6 players with two decks and printed jokers plus a wild-joker rank cut at the start of each deal.
Draw from the stock or the open pile, then discard. **Declare** with two sequences (at least one pure, with no joker) and the rest
in sequences or sets. Select cards and **Group** them, or use **Auto-arrange**; the Declare button only lights up when your hand
really is a valid finish. Losers score their unmatched cards (max 80), a wrong declaration costs 80, dropping costs 20 / 40.
Play 1, 2, 3 or 5 deals — lowest total wins. Hands stay private on each phone online.

## Carrom
A full physics board: drag back from anywhere like a slingshot and let go to flick the striker, with an aim line and power meter,
and slide the striker along your baseline first. 2 players, or 4 as two partnerships. Pocket your own colour to keep your turn,
the queen (3 points) must be covered on the same or the next shot, a pocketed striker is a foul, and you clear all 9 coins
(queen settled first) to win. The computer tries many simulated shots (easy / medium / hard). Online, the host simulates each
shot and sends the recorded animation to every phone.

## Play with friends (multiplayer)
Tap **Play with friends** → **Create a room**. Friends open the same site on their phones and either scan the
QR code, open the shared invite link, or type the 5-letter room code.

- **Lobby:** the host picks the game (Poker, Blackjack, Ludo, Business or Settlers), starting chips, blinds, number of computer players,
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
