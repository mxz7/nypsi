---
name: economy-items
description: How to look up economy items by user-provided text (name/id/alias/plural) and compute their worth in this codebase, centered on selectItem() and calcItemValue() in src/utils/functions/economy/inventory.ts and getItems() in economy/utils.ts. Use whenever a command, tool, or feature needs to resolve a search string to an Item or needs an item's current value.
---

# Economy item lookup

- All item data comes from `getItems()` in `src/utils/functions/economy/utils.ts` — returns `{ [id: string]: Item }` parsed from `data/items.json`. Don't re-read the JSON file yourself.
- The `Item` type is defined in `src/types/Economy.ts`. Notable fields: `id`, `name`, `plural`, `article`, `aliases?`, `hidden?` (excluded from user-facing search), `sell?`/`buy?`, `role`.

## Exact lookup — `selectItem(search: string)`

`src/utils/functions/economy/inventory.ts` exports `selectItem`, the established helper for resolving a single user-typed search string to one `Item`. It's already used by `buy`, `sell`, `give`, `offer`, etc. — reuse it instead of writing new matching logic.

- Lowercases the input and filters out `hidden` items first.
- Matches (in order) against: `item.id`, `item.name`, `item.id` with underscores stripped, any of `item.aliases`, `item.name` with spaces stripped, `item.plural`.
- Returns `undefined` if nothing matches — always check for that.

Note: several older commands (`help.ts`, `autosell.ts`, `buy.ts`, `karmashop.ts`, `top.ts`, `crateall.ts`) have their own hand-rolled inline copies of similar matching logic predating `selectItem` — don't copy those; use `selectItem` for new code.

## Computing worth — `calcItemValue(itemId: string)`

`src/utils/functions/economy/inventory.ts` exports `calcItemValue(item: string): Promise<number | undefined>`. It's cached (`RedisCache`, 1hr TTL). Logic: if the item has a fixed `buy`/`sell` price (or is cookie/bitcoin/ethereum/prey/fish/sellable/ore), it uses `item.sell`; otherwise it averages market + offer prices. Can resolve to `undefined` if there's no sell price and no market/offer data.

After calculating a cache miss, it asynchronously records one global `item-value-<itemId>` `GraphMetrics` row per day for historic graphs. An atomic Redis `SET NX EX` gate limits each item to one database existence check every 7–12 hours, and a shared `RedisMutex` serializes these checks across all processes. This history write is not awaited by the caller.

## Recording item acquisition sources

`addItemSourceStat(itemId, source, amount)` in `src/utils/functions/economy/inventory.ts` increments the global `ItemStats` row identified by `(itemId, source)`. Call it explicitly and without `await` after a successful `addInventoryItem()` whenever an item is newly generated. The function handles and logs its own database errors.

Do not record transfers, trades, market/offer fulfillment, refunds, or inventory restoration. Rewards obtained from a crate or scratch card use `item:<containerItemId>` as their source; `giveLootPoolResult()` and `openCrate()` already propagate this attribution.

## Fuzzy/substring search (multiple results)

`selectItem` only returns a single exact match. If you need to find _candidate_ items from a partial/fuzzy query (e.g. an AI tool letting a model discover an item id first), filter `getItems()` yourself with substring checks against the relevant searchable fields, still excluding `hidden` items. The AI `search_items` tool in `src/utils/functions/ai/tools/items.ts` searches `id`/`name`/`aliases`/`role`, allowing category searches through the same query input.

## Odds of obtaining an item — `getObtainingData(item: Item)`

`src/utils/functions/economy/item_info.ts` exports `getObtainingData`, a synchronous function that computes **all** the ways an item can be obtained, already used by the `item`/`help` command's "obtaining" tab. Don't recompute loot pool weights/chances by hand — reuse this. Returns `ObtainingData`:

- `sources: string[]` — human-facing summary strings (shop, crafting, karma shop, mining, fishing, hunting, voting, streaks, etc).
- `workers: string[]` / `farm: string[]` — which workers produce it as a byproduct / which plants grow it.
- `obtaining: { itemId, chance }[]` — other items (crates/pools) that can drop this item, with the average % chance.
- `pools: { poolName, count, breakdown: { chance, itemId?, amount? }[] }[]` — if the item itself is a container (e.g. a crate), the full odds breakdown of everything inside it, per pool.

`getItems()`/`getLootPools()`/`getBaseWorkers()`/`getPlantsData()` are all read synchronously under the hood — no DB calls, safe to call from anywhere (including AI tool executors) without extra caching.
