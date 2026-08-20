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
5. **Chart** — everyone's total over time. Drag across it to read any moment.
6. **Data** — export a spreadsheet of every game to dig for patterns later.

Anything typed wrong can be fixed: tap any game in the session list to edit or
delete it, and every total is recalculated from scratch.

## House rules the app enforces

- Lowest total wins.
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

## Where the scores live

On the phone that entered them, in that browser. Nothing is uploaded and there
is no account. Export a backup from the **Data** tab now and then, and don't
clear your browser data mid-holiday.

## Running it locally

```
npm install
npm run serve     # http://localhost:8099
npm test          # scoring rules + a full run through the app
```

`npm test` plays a real league in a headless phone browser and checks the
totals against hand-calculated values, including both bonus rules.
