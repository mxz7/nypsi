---
name: scratch-cards
description: Investigate or change interactive scratch cards, including click states, winning lines, rewards, and saved game boards.
---

# Scratch Cards

- `src/utils/functions/economy/scratchies.ts` owns the board, clicks, matching, and rewards;
  `src/utils/functions/economy/items/scratch_card.ts` owns the message and sequential collectors.
- Cell `clicks` is a state: `0` hidden, `1` revealed, `2` part of an awarded winning line.
  A repeated click must reject both revealed states before changing the cell or remaining clicks.
  Discord's disabled buttons alone do not enforce this invariant.
- `clicked()` rejects `clicks !== 0`. Keep this guard before the state mutation: accepting a
  winning cell would reset it from `2` to `1`, consume a click, and render it red while the
  other winning cells stay green. Regression coverage is in `test/utils/scratchies.test.ts`.
- Rewards are granted when a line is completed, before the card finishes. `card.won` stays true
  after a repeat click; a mixed red/green line does not imply the original reward was revoked.
- Displayed game IDs are base 36 (`parseInt(id, 36)` maps to `Game.id`). Scratch-card `outcome`
  stores the final button rows, including styles and emojis, rather than the original loot results
  or click history. `Game.earned` is not populated with scratch-card item prizes. Use interaction
  logs around `Game.date` to reconstruct clicks; coordinates in custom IDs are zero based.
