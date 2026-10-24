import { beforeEach, expect, test, vi } from "vitest";
import type { Item } from "../../src/types/Economy";

const mocks = vi.hoisted(() => ({ selectItem: vi.fn(), readdir: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readdir: mocks.readdir }));
vi.mock("../../src/utils/functions/economy/inventory", () => ({ selectItem: mocks.selectItem }));
vi.mock("../../src/utils/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../src/utils/functions/economy/items/handcuffs", async () => {
  const { ItemUse } = await import("../../src/models/ItemUse");
  return { default: new ItemUse("handcuffs", vi.fn(), { target: true }) };
});
vi.mock("../../src/utils/functions/economy/items/calendar", async () => {
  const { ItemUse } = await import("../../src/models/ItemUse");
  return { default: new ItemUse("calendar", vi.fn(), { suggest: false }) };
});

import {
  getItemUseDefinition,
  parseItemUseAmount,
  parseItemUseArguments,
} from "../../src/utils/functions/economy/item-use";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readdir.mockResolvedValue(["handcuffs.js", "calendar.js"]);
});

test("invalid or missing quantities use one, while supported quantities and all are preserved", () => {
  for (const value of [undefined, "", "nonsense", "-4", "0", "2.5", "Infinity", "9007199254740992"])
    expect(parseItemUseAmount(value)).toBe(1);
  expect(parseItemUseAmount("12")).toBe(12);
  expect(parseItemUseAmount("1,000")).toBe(1000);
  expect(parseItemUseAmount("1.5k")).toBe(1500);
  expect(parseItemUseAmount(" ALL ")).toBe("all");
});

test("prefix parsing resolves the full item name before interpreting the remaining inputs", () => {
  const item = { id: "stolen_credit_card" } as Item;
  mocks.selectItem.mockImplementation((search) =>
    search === "stolen credit card" ? item : undefined,
  );
  expect(parseItemUseArguments(["stolen", "credit", "card", "all"])).toEqual({
    item,
    rest: ["all"],
  });
  expect(parseItemUseArguments(["stolen", "credit", "card", "2", "<@123>"])).toEqual({
    item,
    rest: ["2", "<@123>"],
  });
});

test("the registry shares custom and role capabilities and excludes unsupported items", async () => {
  const [targeted, automatic, booster, tool] = await Promise.all([
    getItemUseDefinition({ id: "handcuffs", role: "item" } as Item),
    getItemUseDefinition({ id: "calendar", role: "item" } as Item),
    getItemUseDefinition({ id: "cookie", role: "booster" } as Item),
    getItemUseDefinition({ id: "fishing_rod", role: "tool" } as Item),
  ]);
  expect(targeted.options.target).toBe(true);
  expect(automatic.options.suggest).toBe(false);
  expect(booster.options.amount).toBe(true);
  expect(tool).toBeUndefined();
  expect(mocks.readdir).toHaveBeenCalledOnce();
});
