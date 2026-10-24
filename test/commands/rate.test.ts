import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Command } from "../../src/models/Command";

const mocks = vi.hoisted(() => ({
  commands: [] as Command[],
  getMember: vi.fn(),
  onCooldown: vi.fn(),
  getResponse: vi.fn(),
  addCooldown: vi.fn(),
  addProgress: vi.fn(),
  addBalance: vi.fn(),
  addStat: vi.fn(),
  addXp: vi.fn(),
  addTaskProgress: vi.fn(),
  userExists: vi.fn(),
  createUser: vi.fn(),
  getBoosters: vi.fn(),
  getItems: vi.fn(),
  isPremium: vi.fn(),
  getTier: vi.fn(),
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
vi.mock("../../src/utils/functions/member", () => ({
  getMember: mocks.getMember,
  getUserId: (member: string | { id: string }) => (typeof member === "string" ? member : member.id),
}));
vi.mock("../../src/utils/functions/premium/color", () => ({
  getEmbedColor: vi.fn(async () => "default"),
}));
vi.mock("../../src/utils/logger", () => ({ logger: { debug: vi.fn() } }));
vi.mock("../../src/utils/handlers/cooldownhandler", () => ({
  onCooldown: mocks.onCooldown,
  getResponse: mocks.getResponse,
  addCooldown: mocks.addCooldown,
}));
vi.mock("../../src/utils/functions/economy/achievements", () => ({
  addProgress: mocks.addProgress,
}));
vi.mock("../../src/utils/functions/economy/balance", () => ({ addBalance: mocks.addBalance }));
vi.mock("../../src/utils/functions/economy/stats", () => ({ addStat: mocks.addStat }));
vi.mock("../../src/utils/functions/economy/xp", () => ({ addXp: mocks.addXp }));
vi.mock("../../src/utils/functions/economy/tasks", () => ({
  addTaskProgress: mocks.addTaskProgress,
}));
vi.mock("../../src/utils/functions/economy/boosters", () => ({ getBoosters: mocks.getBoosters }));
vi.mock("../../src/utils/functions/economy/utils", () => ({
  userExists: mocks.userExists,
  createUser: mocks.createUser,
  getItems: mocks.getItems,
}));
vi.mock("../../src/utils/functions/premium/premium", () => ({
  isPremium: mocks.isPremium,
  getTier: mocks.getTier,
}));

import "../../src/commands/rate";

const command = mocks.commands[0];
let nextId = 0;

function context(rating = "iq", slash = true, selfTarget = false) {
  const user = (id: string) => ({
    id,
    avatarURL: () => "https://example.com/avatar.png",
    toString: () => `<@${id}>`,
  });
  const selfId = `self-${nextId++}`;
  const targetId = `target-${nextId++}`;
  const self = { id: selfId, user: user(selfId) };
  const target = selfTarget ? self : { id: targetId, user: user(targetId) };
  const message = {
    author: self.user,
    member: self,
    guild: { id: "guild" },
    isChatInputCommand: () => slash,
    options: { getSubcommand: () => rating, getUser: () => (selfTarget ? null : target.user) },
  };
  const send = vi.fn(async (_payload: unknown) => undefined);
  mocks.getMember.mockResolvedValue(target);

  return {
    self,
    target,
    send,
    run: async (args = [rating]) =>
      command.run(
        message as unknown as Parameters<Command["run"]>[0],
        send as unknown as Parameters<Command["run"]>[1],
        args,
      ),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.onCooldown.mockResolvedValue(false);
  mocks.userExists.mockResolvedValue(true);
  mocks.getBoosters.mockResolvedValue(new Map());
  mocks.isPremium.mockResolvedValue(false);
  mocks.getTier.mockResolvedValue(0);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("rating command consolidation", () => {
  test("uses the selected slash member and preserves action-specific cooldown keys", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = context("iq");
    await request.run(["iq", "incorrect", "flattened", "arguments"]);

    expect(mocks.getMember).toHaveBeenCalledWith(
      expect.any(Object),
      `<@${request.target.user.id}>`,
    );
    expect(mocks.addCooldown).toHaveBeenCalledExactlyOnceWith("iq", request.self, 3);
    expect(mocks.addProgress).toHaveBeenCalledExactlyOnceWith(request.self, "unsure", 1);
  });

  test("keeps prefix shorthands and member names with spaces working", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = context("hot", false);
    const expansion = command.shorthands.howhot.split(" ");
    expect(expansion.shift()).toBe("rate");
    await request.run([...expansion, "Some", "Member"]);

    expect(mocks.getMember).toHaveBeenCalledWith(expect.any(Object), "Some Member");
    expect(mocks.addCooldown).toHaveBeenCalledWith("hot", request.self, 3);
  });

  test("reuses an action's result for one minute without sharing results between ratings", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = context("iq", false, true);
    await request.run(["iq"]);
    await request.run(["iq"]);
    expect(random).toHaveBeenCalledTimes(2);

    await request.run(["height"]);
    expect(random).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(60_000);
    await request.run(["iq"]);
    expect(random).toHaveBeenCalledTimes(6);
  });

  test("retains the existing money reward and source stat for a qualifying rating", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.95);
    const request = context("hot");
    await request.run();

    expect(mocks.addBalance).toHaveBeenCalledExactlyOnceWith(request.target, 1069);
    expect(mocks.addStat).toHaveBeenCalledExactlyOnceWith(request.target, "earned-hot", 1069);
  });

  test("retains the one-XP reward and account creation for the rated member", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.userExists.mockResolvedValue(false);
    const request = context("furry");
    await request.run();

    expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith(request.target);
    expect(mocks.addXp).toHaveBeenCalledExactlyOnceWith(request.target, 1);
  });

  test("applies the existing booster and only progresses self-rating tasks", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    mocks.getBoosters.mockResolvedValue(new Map([["test-booster", [{}]]]));
    mocks.getItems.mockReturnValue({
      "test-booster": { boosterEffect: { boosts: ["pp"], effect: 2 } },
    });
    const own = context("pp", true, true);
    await own.run();
    expect(mocks.addTaskProgress).toHaveBeenCalledExactlyOnceWith(own.self, "pp_big");
    expect(mocks.getBoosters).toHaveBeenCalledWith(own.self);

    mocks.addTaskProgress.mockClear();
    await context("pp").run();
    expect(mocks.addTaskProgress).not.toHaveBeenCalled();
  });

  test("preserves the premium probability calculation for the rated member", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.2);
    mocks.isPremium.mockResolvedValue(true);
    mocks.getTier.mockResolvedValue(3);
    const request = context("iq");
    await request.run();

    expect(mocks.getTier).toHaveBeenCalledWith(request.target);
    expect(request.send).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({ description: expect.stringContaining("**300** IQ") }),
        }),
      ],
    });
  });

  test("honours an existing cooldown before doing lookups or paying rewards", async () => {
    mocks.onCooldown.mockResolvedValue(true);
    const request = context("hot");
    mocks.getResponse.mockResolvedValue({ respond: true, embed: {} });
    await request.run();

    expect(mocks.getResponse).toHaveBeenCalledWith("hot", request.self);
    expect(mocks.getMember).not.toHaveBeenCalled();
    expect(mocks.addBalance).not.toHaveBeenCalled();
    expect(request.send).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });
});
