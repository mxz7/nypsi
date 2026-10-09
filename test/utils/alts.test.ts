import { Guild } from "discord.js";
import { beforeEach, expect, test, vi } from "vitest";

const { store, redisMock, altMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    redisMock: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => store.set(key, value)),
      del: vi.fn(async (...keys: string[]) => keys.forEach((key) => store.delete(key))),
    },
    altMock: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
});

vi.mock("../../src/init/redis", () => ({ default: redisMock }));
vi.mock("../../src/init/database", () => ({ default: { alt: altMock } }));
vi.mock("../../src/utils/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("../../src/utils/functions/member", () => ({ getUserId: (id: string) => id }));

import { redisSerialize } from "../../src/utils/cache";
import Constants from "../../src/utils/Constants";
import {
  addAlt,
  deleteAlt,
  getAllGroupAccountIds,
  getAlts,
  getMainAccountId,
  isMainAccount,
} from "../../src/utils/functions/moderation/alts";

const entries = [
  { mainId: "main", altId: "alt-1" },
  { mainId: "main", altId: "alt-2" },
];
const guild = Object.assign(Object.create(Guild.prototype), { id: "guild" }) as Guild;
const key = (userId: string) => `${Constants.redis.cache.guild.ALTS}:guild:${userId}`;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  altMock.findMany.mockResolvedValue(entries);
  altMock.findFirst.mockImplementation(
    async ({ where }: { where: { AND: { mainId?: string; altId?: string }[] } }) => {
      const account = where.AND[1];
      return account.mainId === "main" || entries.some((entry) => entry.altId === account.altId)
        ? { mainId: "main" }
        : null;
    },
  );
});

test("cold and cached lookups return the complete group for every account", async () => {
  await expect(getAllGroupAccountIds("guild", "main")).resolves.toEqual(["main", "alt-1", "alt-2"]);
  altMock.findFirst.mockClear();
  altMock.findMany.mockClear();

  for (const userId of ["main", "alt-1", "alt-2"]) {
    await expect(getAllGroupAccountIds("guild", userId)).resolves.toEqual([
      "main",
      "alt-1",
      "alt-2",
    ]);
    await expect(getMainAccountId("guild", userId)).resolves.toBe("main");
    await expect(isMainAccount("guild", userId)).resolves.toBe(userId === "main");
  }
  await expect(getAlts("guild", "main")).resolves.toEqual(["alt-1", "alt-2"]);
  expect(altMock.findFirst).not.toHaveBeenCalled();
  expect(altMock.findMany).not.toHaveBeenCalled();
  expect(redisMock.set).toHaveBeenCalledWith(key("main"), redisSerialize(entries), "EX", 21600);
});

test("a cached standalone account returns itself without querying the database", async () => {
  altMock.findFirst.mockResolvedValue(null);
  await expect(getAllGroupAccountIds("guild", "standalone")).resolves.toEqual(["standalone"]);
  expect(redisMock.set).toHaveBeenCalledWith(key("standalone"), "[]", "EX", 86400);
  altMock.findFirst.mockClear();
  await expect(getAllGroupAccountIds("guild", "standalone")).resolves.toEqual(["standalone"]);
  expect(altMock.findFirst).not.toHaveBeenCalled();
});

test("adding an alt refreshes a cached standalone main and new alt", async () => {
  store.set(key("main"), "[]");
  store.set(key("alt-1"), "[]");
  await expect(addAlt(guild, "main", "alt-1")).resolves.toBe(true);
  await expect(getAllGroupAccountIds("guild", "main")).resolves.toEqual(["main", "alt-1", "alt-2"]);
  await expect(getAllGroupAccountIds("guild", "alt-1")).resolves.toEqual([
    "main",
    "alt-1",
    "alt-2",
  ]);
});

test("deleting an alt invalidates the entire group", async () => {
  for (const userId of ["main", "alt-1", "alt-2"]) store.set(key(userId), redisSerialize(entries));
  await deleteAlt(guild, "alt-1");
  expect(store.size).toBe(0);
});
