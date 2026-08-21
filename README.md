# 🃏 UNO — Road Trip League

A phone-sized scorekeeper for our 7-player Uno league: **Andy, Justin, Julia,
Nathan, Tom, Louna, Nicolas**.

Open it on your phone, tap in each game as it ends, and the leaderboard,
the seating history and the bonus rules take care of themselves.
It works with no signal.

## How to use it

1. **Session** → *Start new session*. Tap each name to fill the circle, going
   clockwise, then confirm. The start time is recorded for you.
2. **Start game** → the clock starts and the app tells you who goes first
   (lowest score). Tap *someone else?* if you need to override it.
3. When the hand ends: tap 🏆 next to the winner (or ✂️ if they went out on a
   cut), type everyone else's leftover card points, and **Save game**.
   A blank box counts as 0.
4. **Leaderboard** — lowest total wins. The small grey number is how far each
   player is from their next jackpot.
5. **Chart** — two views of the same league. *Ahead of / behind the average*
   is each player's total minus the group average at that moment, so everyone
   starts level and the lines cross instead of climbing; below the line is
   better. Underneath it, the raw totals over time. Drag across either to read
   any moment; the other follows.
6. **Data** — export a spreadsheet of every game to dig for patterns later.

Anything typed wrong can be fixed. Tap a past session to open it: you can
correct or delete any game inside it, or delete the whole session. Every total
is recalculated from scratch, on every phone.

## House rules the app enforces

- Lowest total wins.
- Whoever is last (highest total) starts the next game.
- Winner: **−10**, or **−20** if the last card was a cut.
- Everyone else: the value of the cards left in their hand.
- Land **exactly** on a multiple of 200 → **−200**.
- Land **exactly** on your birth year → **−10 × your age**:

  | | Andy | Justin | Julia | Nathan | Tom | Louna | Nicolas |
  |---|---|---|---|---|---|---|---|
  | born | 1999 | 2001 | 2002 | 2002 | 2003 | 2002 | 1999 |
  | bonus | −270 | −250 | −240 | −240 | −230 | −240 | −270 |

Bonuses fire on an exact landing only — 199 and 201 get nothing — and are
worked out once per game, so landing on 400 takes you to 200 and stops there.

## The games we played before the app existed

The first **101 games** (12–19 August) were kept in a Google Sheet by hand.
They are baked into `history.js` and load automatically the first time the app
is opened, so the leaderboard starts where the holiday actually is.

- **12 sessions**, split by the seating order and by gaps of more than 3 hours.
- Games were played **5-, 6- and 7-handed** — Tom joined at game 24, Nicolas at
  game 67 — so the app handles a table of any size.
- **Joining totals** are preserved: Tom started on 416, Nicolas on 1335.
- The one bonus that ever fired is preserved: **Tom landing exactly on 1200**.
- **Who started each game was never written down**, so it is filled in from the
  house rule: whoever was last (highest total) going into that game, ties broken
  by seat order. Reconstructed from the sheet's own running totals and checked
  game by game. Justin started 39 of the 101; Nicolas never did.
- Games 1–23 have no timestamps in the sheet; those sessions show
  "date not recorded".

Every final total was checked against the spreadsheet's own numbers and matches
exactly (`npm test`). `tools/build_history.py` regenerates `history.js` from
`tools/uno-sheet-export.csv`.

## Updates

The app checks for a new version whenever it's opened and, if there is one,
reloads itself once so you always see the current build — except while a game
is being typed in, where it waits until you've saved. The version is shown at
the bottom of the **Data** tab.

When publishing a change, bump `CACHE` in `sw.js` and `APP_VERSION` in
`index.html`; `tests/test-update.mjs` proves an installed copy picks it up.

## Playing on several phones

Everyone can score. Each game is stored as its own record, so two people
entering different games at the same moment both survive — no one overwrites
anyone. If a phone loses signal it keeps working and sends everything up when
the signal returns.

**Setting it up once:**

1. Create a free Realtime Database at <https://console.firebase.google.com>
   (Create project → skip Analytics → Build → Realtime Database → Create
   Database → choose Europe → start in test mode).
2. On the **Rules** tab, set `{"rules": {".read": true, ".write": true}}`, so
   it doesn't stop working after 30 days.
3. Copy the database address it shows you and add a league name on the end,
   e.g. `https://YOUR-PROJECT.europe-west1.firebasedatabase.app/uno-roadtrip`.
4. Paste that into **Data → Sharing with everyone → Connect**.
5. Tap **Copy the invite link** and send it to everyone. One tap joins them.

Anyone who knows the exact address can read and write the scores. For a card
game that's fine; don't reuse the database for anything private.

## Where the scores live

On every phone that has joined, and in the shared database if you set one up.
Without sharing, the scores are on the one phone that entered them. Export a
backup from the **Data** tab now and then either way.

## Running it locally

```
npm install
npm run serve     # http://localhost:8099
npm test          # scoring rules + a full run through the app
```

`npm test` runs four suites in a headless phone browser: the scoring rules
against hand-calculated values, a full run through the app (seating, entry,
editing, export, reload, offline), and the spreadsheet import checked
player-by-player against the sheet's own totals, and a real
install-then-publish cycle proving the app updates itself and keeps its data.
