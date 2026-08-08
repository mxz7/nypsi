---
name: market-backend
description: Maintain Nypsi's player market backend, including order matching, fulfillment, cancellation, escrow, tax, transaction safety, and per-item concurrency. Use when changing src/utils/functions/economy/market.ts or any command, interaction, or job that creates, fills, or deletes market orders.
---

# Market backend

## Concurrency

- Serialize every mutation of an item's order book with the shared `RedisMutex` in
  `src/utils/functions/economy/market.ts`. Use the item ID as its key.
- Acquire through `withMarketLock()` so release always happens in `finally`.
- Keep the thin lock-acquiring public wrappers together near the top of `market.ts`; leave their
  unlocked implementations in the relevant backend sections.
- Never restore the legacy local `Set`, `MARKET_IN_TRANSACTION` Redis key, recursive polling, or
  timeout-based forced unlocks.
- Let exported mutation entry points acquire the lock. Helpers called within them, including
  `settleMarketFill()`, must assume the caller already holds it; `RedisMutex` is not reentrant.
- After waiting for the lock, re-read mutable rows before changing them. Cancellation follows this
  pattern so a fill that won the race returns `false` instead of deleting stale state.
- Keep Discord requests and other slow post-mutation effects outside the locked section when they do
  not protect order-book state.

## Settlement

- Treat balance, inventory, escrow, and market-row changes as one settlement boundary.
- Keep market-row state/history, escrow consumption, wallet/inventory transfers, buyer refunds, and
  tax-bank credits together in `market/settlement.ts` using the provided Prisma transaction client.
- For balance and inventory debits, use `update` with the resulting value selected and throw if it is
  negative; the transaction rollback restores the original value. Avoid conditional `updateMany`
  guards for these debits.
- Calculate tax from the executed value and the actual seller's premium tier, regardless of which
  side owns the resting order.
- Invalidate balance, inventory, item-existence, and gem caches only after commit. Run acquisition
  autosell after commit as a separate follow-up so it cannot escape or invalidate the market
  transaction.
- Keep stats, transaction logs, DMs, watcher notifications, and Discord message updates outside the
  database transaction. Derive them from a committed structured result.
- Preserve season-interim and alt-account history behavior unless the task explicitly changes it.

## Matching

- Keep price-time selection and quote arithmetic pure in
  `src/utils/functions/economy/market/matching.ts`. Database functions should fetch candidate rows
  and pass them to `quoteMarketOrder()` rather than implementing their own loops.
- Use one matcher for direct fills and newly crossed orders.
- Match incoming buys against lowest sell price then oldest ID; match incoming sells against highest
  buy price then oldest ID.
- Execute at the resting order's price. Calculate tax from the executed value and explicitly refund
  unused buy-side reservation.
- Add invariant tests for conservation of money/items, price limits, FIFO, partial fills, refunds,
  and rollback before changing settlement behavior.

Run `make check` after changes.
