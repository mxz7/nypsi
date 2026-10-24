import type { AutocompleteInteraction } from "discord.js";
import { beforeEach, expect, test, vi } from "vitest";
import type { Item } from "../../src/types/Economy";

const mocks = vi.hoisted(() => ({
  inventory: vi.fn(),
  items: {} as Record<string, Item>,
}));
vi.mock("../../src/utils/functions/economy/inventory", () => ({
  getInventory: mocks.inventory,
}));
vi.mock("../../src/utils/functions/economy/utils", () => ({ getItems: () => mocks.items }));
vi.mock("../../src/utils/functions/economy/item-use", () => ({
  getItemUseDefinition: async (item: Item) =>
    item.role === "tool" ? undefined : { options: { suggest: item.id !== "calendar" } },
}));
vi.mock("../../src/utils/logger", () => ({ logger: { warn: vi.fn() } }));

import autocomplete from "../../src/interactions/item-use";

async function choices(search = "") {
  const respond = vi.fn(async (_choices: { name: string; value: string }[]) => {});
  await autocomplete.run({
    user: { id: "user" },
    options: { getFocused: () => search },
    respond,
  } as unknown as AutocompleteInteraction);
  return respond.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.items = Object.fromEntries(
    ["cookie", "handcuffs", "fishing_rod", "calendar", "hidden", "empty", "unowned"].map((id) => [
      id,
      {
        id,
        name: id.replaceAll("_", " "),
        plural: `${id}s`,
        role: id === "fishing_rod" ? "tool" : "item",
        emoji: "🍪",
        hidden: id === "hidden",
      } as Item,
    ]),
  );
  mocks.items.cookie.aliases = ["Food"];
  mocks.inventory.mockResolvedValue({
    entries: Object.keys(mocks.items)
      .filter((id) => id !== "unowned")
      .map((item) => ({ item })),
    count: (id: string) => (id === "empty" ? 0 : 5),
  });
});

test("suggestions include only owned, visible items with an applicable use action", async () => {
  expect((await choices()).map((choice) => choice.value)).toEqual(["cookie", "handcuffs"]);
  expect(await choices("FOO")).toEqual([{ name: "🍪 cookie [5]", value: "cookie" }]);
  expect((await choices("handcuffS")).map((choice) => choice.value)).toEqual(["handcuffs"]);
});

test("suggestions fit Discord's choice and label limits", async () => {
  mocks.items = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `item_${i}`,
      { id: `item_${i}`, name: "x".repeat(110), role: "item", emoji: "🍪" } as Item,
    ]),
  );
  mocks.inventory.mockResolvedValue({
    entries: Object.keys(mocks.items).map((item) => ({ item })),
    count: () => 1,
  });
  const result = await choices();
  expect(result).toHaveLength(25);
  expect(result.every((choice) => choice.name.length <= 100)).toBe(true);
});

test("missing inventories and searches without matches return an empty response", async () => {
  expect(await choices("missing item")).toEqual([]);
  mocks.inventory.mockResolvedValue(null);
  expect(await choices()).toEqual([]);
});
