import { Message } from "discord.js";
import { beforeEach, expect, test, vi } from "vitest";
import type { Command, NypsiMessage, SendMessage } from "../../src/models/Command";
import type { ItemUse } from "../../src/models/ItemUse";
import type { Item } from "../../src/types/Economy";

const mocks = vi.hoisted(() => ({
  commands: [] as Command[],
  items: {} as Record<string, Item>,
  counts: new Map<string, number>(),
  handlers: new Map<string, ItemUse>(),
  getMember: vi.fn(),
  removeInventoryItem: vi.fn(),
  addBooster: vi.fn(),
  getBoosters: vi.fn(),
  getBoostersDisplay: vi.fn(),
  addStat: vi.fn(),
  addTaskProgress: vi.fn(),
  onCooldown: vi.fn(),
  addCooldown: vi.fn(),
  openCrate: vi.fn(),
  addHandcuffs: vi.fn(),
  setPadlock: vi.fn(),
  addPet: vi.fn(),
}));
vi.mock("../../src/models/Command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/models/Command")>();
  return {
    ...actual,
    Command: class extends actual.Command {
      constructor(...args: ConstructorParameters<typeof actual.Command>) {
        super(...args);
        mocks.commands.push(this);
      }
    },
  };
});
vi.mock("../../src/utils/functions/economy/inventory", () => ({
  getInventory: async () => ({
    has: (id: string) => (mocks.counts.get(id) ?? 0) > 0,
    count: (id: string) => mocks.counts.get(id) ?? 0,
  }),
  selectItem: (search: string) =>
    Object.values(mocks.items).find((item) =>
      [item.id, item.name, item.plural, ...(item.aliases ?? [])].includes(search),
    ),
  removeInventoryItem: mocks.removeInventoryItem,
  calcItemValue: vi.fn(async () => 0),
}));
vi.mock("../../src/utils/functions/economy/item-use", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/functions/economy/item-use")>()),
  getItemUseDefinition: async (item: Item) => {
    const handler = mocks.handlers.get(item.role === "crate" ? "crates" : item.id);
    if (handler) return { handler, options: handler.options };
    if (["booster", "seed", "bakery-upgrade", "worker-upgrade"].includes(item.role))
      return { options: { amount: true } };
    if (item.role === "pet") return { options: {} };
  },
}));
vi.mock("../../src/utils/functions/economy/utils", () => ({
  userExists: vi.fn(async () => true),
  createUser: vi.fn(),
  isHandcuffed: vi.fn(async () => false),
  addHandcuffs: mocks.addHandcuffs,
  getItems: () => mocks.items,
  getPetsData: () => ({ cow: { items: [1, 3] } }),
}));
vi.mock("../../src/utils/functions/economy/boosters", () => ({
  addBooster: mocks.addBooster,
  getBoosters: mocks.getBoosters,
  getBoostersDisplay: mocks.getBoostersDisplay,
}));
vi.mock("../../src/utils/functions/economy/stats", () => ({ addStat: mocks.addStat }));
vi.mock("../../src/utils/functions/economy/tasks", () => ({
  addTaskProgress: mocks.addTaskProgress,
}));
vi.mock("../../src/utils/functions/economy/achievements", () => ({ addProgress: vi.fn() }));
vi.mock("../../src/utils/functions/economy/events", () => ({ addEventProgress: vi.fn() }));
vi.mock("../../src/utils/functions/economy/loot_pools", () => ({ openCrate: mocks.openCrate }));
vi.mock("../../src/utils/functions/economy/balance", () => ({
  hasPadlock: vi.fn(async () => false),
  setPadlock: mocks.setPadlock,
}));
vi.mock("../../src/utils/functions/economy/passive", () => ({
  isPassive: vi.fn(async () => false),
}));
vi.mock("../../src/utils/functions/economy/bakery", () => ({
  addBakeryUpgrade: vi.fn(),
  getBakeryUpgrades: vi.fn(),
}));
vi.mock("../../src/utils/functions/economy/farm", () => ({ addFarm: vi.fn(), getFarm: vi.fn() }));
vi.mock("../../src/utils/functions/economy/pets", () => ({
  addPet: mocks.addPet,
  getUserPet: vi.fn(async () => ({ level: 1 })),
}));
vi.mock("../../src/utils/functions/economy/workers", () => ({
  addWorkerUpgrade: vi.fn(),
  getWorkers: vi.fn(),
}));
vi.mock("../../src/utils/functions/users/tags", () => ({ addTag: vi.fn(), getTags: vi.fn() }));
vi.mock("../../src/utils/functions/guilds/utils", () => ({ getPrefix: vi.fn(async () => ["$"]) }));
vi.mock("../../src/utils/functions/guilds/disabledcommands", () => ({
  getDisabledCommands: vi.fn(async () => []),
}));
vi.mock("../../src/utils/functions/member", () => ({
  getMember: mocks.getMember,
  getUserId: (member: { id: string }) => member.id,
}));
vi.mock("../../src/utils/functions/premium/color", () => ({
  getEmbedColor: vi.fn(async () => "default"),
}));
vi.mock("../../src/utils/functions/premium/premium", () => ({
  isPremium: vi.fn(async () => false),
  getTier: vi.fn(async () => 0),
}));
vi.mock("../../src/utils/functions/sleep", () => ({ default: vi.fn(async () => {}) }));
vi.mock("../../src/utils/logger", () => ({ logger: { debug: vi.fn() } }));
vi.mock("../../src/init/redis", () => ({ default: {} }));
vi.mock("../../src/utils/handlers/cooldownhandler", () => ({
  onCooldown: mocks.onCooldown,
  addCooldown: mocks.addCooldown,
  getResponse: vi.fn(async () => ({ respond: false })),
}));

import "../../src/commands/use";
import crates from "../../src/utils/functions/economy/items/crates";
import handcuffs from "../../src/utils/functions/economy/items/handcuffs";
import padlock from "../../src/utils/functions/economy/items/padlock";

const command = mocks.commands[0];
const actor = {
  id: "actor",
  user: { id: "actor", username: "actor", avatarURL: () => "https://example.com/avatar.png" },
};
const target = { id: "123456789012345678", user: { id: "123456789012345678", username: "target" } };

function context(item: string, amount?: string, member = false, prefixArgs?: string[]) {
  const response = { edit: vi.fn(async () => response) };
  const message = Object.assign(prefixArgs ? Object.create(Message.prototype) : {}, {});
  for (const [key, value] of Object.entries({
    member: actor,
    author: actor.user,
    guild: { id: "guild" },
    client: {},
    isChatInputCommand: () => true,
    options: {
      getString: (name: string) =>
        name === "item" ? item : name === "amount" ? amount : undefined,
      getUser: () => (member ? target.user : null),
    },
    editReply: vi.fn(async () => response),
    fetchReply: vi.fn(async () => response),
  }))
    Object.defineProperty(message, key, { value });
  const send = vi.fn(async (_data: unknown) => response);
  return {
    message,
    send,
    response,
    run: async () =>
      command.run(
        message as NypsiMessage,
        send as unknown as SendMessage,
        prefixArgs ?? ["deliberately", "wrong", "positional", "inputs"],
      ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.counts.clear();
  mocks.handlers.clear();
  const item = (id: string, name: string, role: string) =>
    ({ id, name, role, plural: `${name}s`, article: "a", emoji: "🍪" }) as Item;
  mocks.items = {
    handcuffs: item("handcuffs", "handcuffs", "item"),
    padlock: item("padlock", "padlock", "item"),
    basic_crate: item("basic_crate", "basic crate", "crate"),
    cookie: {
      ...item("cookie", "cookie", "booster"),
      max: 10,
      stackable: true,
      boosterEffect: { boosts: [], effect: 1, time: 100 },
    },
    fishing_rod: item("fishing_rod", "fishing rod", "tool"),
    cow: item("cow", "cow", "pet"),
  };
  for (const id of Object.keys(mocks.items)) mocks.counts.set(id, 5);
  for (const handler of [handcuffs, padlock, crates]) mocks.handlers.set(handler.itemId, handler);
  mocks.getMember.mockResolvedValue(target);
  mocks.onCooldown.mockResolvedValue(false);
  mocks.getBoosters.mockResolvedValue(new Map());
  mocks.getBoostersDisplay.mockResolvedValue(new Map([[1, []]]));
  mocks.openCrate.mockResolvedValue([{ money: 10, xp: 0, karma: 0 }]);
  mocks.addPet.mockResolvedValue({ level: 2 });
});

test("targeted slash use ignores quantity and consumes one item for the selected member", async () => {
  const ctx = context("handcuffs", "all", true);
  await ctx.run();
  expect(mocks.getMember).toHaveBeenCalledWith(ctx.message.guild, target.id);
  expect(mocks.addHandcuffs).toHaveBeenCalledExactlyOnceWith(target.id);
  expect(mocks.removeInventoryItem).toHaveBeenCalledExactlyOnceWith(actor, "handcuffs", 1);
  expect(mocks.addCooldown).toHaveBeenCalledExactlyOnceWith("use", actor, 2);
  expect(ctx.message.editReply).toHaveBeenCalled();
});

test("required target errors explain the problem before any item is consumed", async () => {
  for (const selected of [false, true]) {
    vi.clearAllMocks();
    mocks.getMember.mockResolvedValue(null);
    const ctx = context("handcuffs", "invalid", selected);
    await ctx.run();
    const data = ctx.send.mock.calls[0][0] as { embeds: { data: { description: string } }[] };
    expect(data.embeds[0].data.description).toContain(
      selected ? "couldn't find that member" : "choose a member",
    );
    expect(mocks.removeInventoryItem).not.toHaveBeenCalled();
    expect(mocks.addCooldown).not.toHaveBeenCalled();
  }
});

test("single-use items ignore optional targets and invalid quantities", async () => {
  const ctx = context("padlock", "not a number", true);
  await ctx.run();
  expect(mocks.getMember).not.toHaveBeenCalled();
  expect(mocks.removeInventoryItem).toHaveBeenCalledExactlyOnceWith(actor, "padlock", 1);
  expect(mocks.setPadlock).toHaveBeenCalledExactlyOnceWith(actor, true);
});

test("bulk items default invalid amounts to one and retain food progress and global booster scope", async () => {
  const ctx = context("cookie", "-100", true);
  await ctx.run();
  expect(mocks.addBooster).toHaveBeenCalledWith(actor, "cookie", 1, undefined, "user");
  expect(mocks.addTaskProgress).toHaveBeenCalledWith(actor.id, "eat_cookies", 1);
  expect(mocks.removeInventoryItem).toHaveBeenCalledWith(actor, "cookie", 1);
  expect(mocks.getMember).not.toHaveBeenCalled();

  vi.clearAllMocks();
  mocks.items.cookie.boosterEffect.global = true;
  await context("cookie", "2").run();
  expect(mocks.addBooster).toHaveBeenCalledWith(actor, "cookie", 2, undefined, "global");
});

test("crate all preserves the existing opening cap and explains the applied limit", async () => {
  mocks.counts.set("basic_crate", 25);
  const ctx = context("basic crate", "all", true);
  await ctx.run();
  expect(mocks.openCrate).toHaveBeenCalledTimes(10);
  expect(mocks.addStat).toHaveBeenCalledWith(actor.id, "basic_crate", 10);
  const payload = ctx.send.mock.calls[0][0] as { embeds: { data: { footer: { text: string } } }[] };
  expect(payload.embeds[0].data.footer.text).toContain("limited to 10 crates per use");
});

test("prefix use resolves multiword item names and the same quantity path", async () => {
  const ctx = context("", undefined, false, ["basic", "crate", "3"]);
  await ctx.run();
  expect(mocks.openCrate).toHaveBeenCalledTimes(3);
});

test("inventory and unsupported-item errors provide useful information without consuming items", async () => {
  mocks.counts.set("cookie", 2);
  const insufficient = context("cookie", "5");
  await insufficient.run();
  const payload = insufficient.send.mock.calls[0][0] as {
    embeds: { data: { description: string } }[];
  };
  expect(payload.embeds[0].data.description).toBe("you have 2 cookies, but need 5");
  expect(mocks.removeInventoryItem).not.toHaveBeenCalled();
  const unsupported = context("fishing rod");
  await unsupported.run();
  const error = unsupported.send.mock.calls[0][0] as {
    embeds: { data: { description: string } }[];
  };
  expect(error.embeds[0].data.description).toContain("/fish");
});

test("pet use invokes one upgrade and retains its configured item-source statistic", async () => {
  await context("cow", "all", true).run();
  expect(mocks.addPet).toHaveBeenCalledExactlyOnceWith(actor, "cow");
  expect(mocks.addStat).toHaveBeenCalledWith(actor, "cow", 3);
  expect(mocks.getMember).not.toHaveBeenCalled();
});
