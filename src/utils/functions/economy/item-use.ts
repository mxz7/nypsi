import { readdir } from "node:fs/promises";
import { ItemUse, ItemUseOptions } from "../../../models/ItemUse";
import type { Item } from "../../../types/Economy";
import { logger } from "../../logger";
import { pluralize } from "../string";
import { selectItem } from "./inventory";
import { formatNumber } from "./number";

const roleOptions: Partial<Record<Item["role"], ItemUseOptions>> = {
  booster: { amount: true },
  "worker-upgrade": { amount: true },
  "bakery-upgrade": { amount: true },
  seed: { amount: true },
  pet: {},
  tag: {},
};

let itemFunctions: Promise<Map<string, ItemUse>>;

async function loadItemFunctions() {
  const files = (await readdir("./dist/utils/functions/economy/items")).filter((file) =>
    file.endsWith(".js"),
  );
  const functions = new Map<string, ItemUse>();

  for (const file of files) {
    const handler = await import(/* @vite-ignore */ `./items/${file}`).then(
      (module) => module.default,
    );
    if (!(handler instanceof ItemUse)) throw new Error(`invalid item use handler: ${file}`);
    functions.set(handler.itemId, handler);
  }

  logger.info(`item use: loaded ${functions.size} handlers`);
  return functions;
}

export async function getItemUseDefinition(item: Item) {
  itemFunctions ??= loadItemFunctions().catch((error) => {
    itemFunctions = undefined;
    throw error;
  });

  const key =
    item.role === "crate" ? "crates" : item.role === "scratch-card" ? "scratch_card" : item.id;
  const handler = (await itemFunctions).get(key);
  const options = handler?.options ?? roleOptions[item.role];

  return options ? { options, handler } : undefined;
}

export function parseItemUseArguments(args: string[]) {
  for (let length = args.length; length > 0; length--) {
    const item = selectItem(args.slice(0, length).join(" ").toLowerCase());
    if (item) return { item, rest: args.slice(length) };
  }

  return { item: undefined, rest: args };
}

export function parseItemUseAmount(value?: string): number | "all" {
  const input = value?.trim().toLowerCase().replaceAll(",", "");
  if (input === "all") return "all";
  if (!input || !/^(?:\d+|\d+(?:\.\d+)?[kmb])$/.test(input)) return 1;

  const amount = formatNumber(input);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 1;
}

export function getItemUseGuidance(item: Item) {
  if (item.role === "car") return `use **${item.name}** in street races with /race`;
  if (item.id.includes("gun")) return `use **${item.name}** with /hunt`;
  if (item.id.includes("fishing")) return `use **${item.name}** with /fish`;
  if (item.id.includes("pickaxe")) return `use **${item.name}** with /mine`;
  if (item.id.includes("furnace")) return `use **${item.name}** with /bake or /smelt`;
  return `**${item.name}** can't be used with /use. use /item to see what it's for`;
}

export function getItemUseAmountError(item: Item, owned: number, needed: number) {
  return `you have ${owned.toLocaleString()} ${pluralize(item, owned)}, but need ${needed.toLocaleString()}`;
}
