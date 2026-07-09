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

## Fuzzy/substring search (multiple results)

`selectItem` only returns a single exact match. If you need to find _candidate_ items from a partial/fuzzy query (e.g. an AI tool letting a model discover an item id first), filter `getItems()` yourself with substring checks against `id`/`name`/`aliases`, still excluding `hidden` items — see `search_items` in `src/utils/functions/ai/tools/items.ts` for the pattern.
