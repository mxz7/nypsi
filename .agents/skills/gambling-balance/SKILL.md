---
name: gambling-balance
description: Preserve Nypsi gambling RTP and volatility when changing Blackjack, Dragon Tower, High-Low, Mines, or gamble multiplier behavior.
---

# Gambling Balance

Blackjack has approximately 98.8% base RTP under sensible no-split play. Target approximately 95%
base RTP for Dragon Tower and High-Low because they offer larger maximum payouts and bonuses.
Gamble multipliers are an earned bonus and apply to the entire winning payout; draws return the bet
without a multiplier.

## Dragon Tower

All difficulties have nine floors. Their layouts progress by total button count:

- Easy: 4 safe out of 5
- Medium: 3 safe out of 4
- Hard: 2 safe out of 3
- Expert: 1 safe out of 2

Tower payout calculations must include the expected value of the hidden gem, which adds 3x to the
game payout before the gamble multiplier is applied. The rare green-gem inventory reward is globally
limited and should not be treated as reliable currency RTP. Gamble multipliers always apply to
profitable Tower cash-outs, including after the first floor. First-floor payouts target roughly 83%
base RTP so they remain below 100% theoretical RTP with a 20% gamble multiplier. Easy's 0.97x first
floor cannot be cashed out without finding the 3x gem. Later cash-out points target about 95% base
RTP. Expert's rounded 500x top is a deliberate exception at about 97.7% base RTP on its 1-in-512
completion path.

## High-Low

Equal cards continue the game without increasing the correct-guess count. The first correct guess is
an exact 1x draw checkpoint. Later payouts use the cumulative probability of choosing the safer
direction from the actual remaining deck and a 95% house return, not an assumed 50% success chance.
Payouts never decrease after a correct guess. When the calculated payout reaches at least 100x,
award the actual calculated payout and immediately end the game; 100x is a stopping threshold, not a
payout cap. Exhausting the deck also ends the game. High-Low professional achievement progress is
awarded when a player cashes out after at least seven correct guesses.

## Mines

Default Mines randomly chooses 3-6 mines and adds 0.6x per safe selection. RTP analysis must include
the 3x diamond and the money bag, which is credited immediately and remains credited if the player
later hits a mine. The money bag can overwrite the diamond during board generation.
