import { Collection, MessageFlags } from "discord.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Command } from "../../src/models/Command";

const mocks = vi.hoisted(() => ({
  commands: [] as Command[],
  getMember: vi.fn(),
  getAllMembersRest: vi.fn(),
  clearAvatarHistory: vi.fn(),
  clearUsernameHistory: vi.fn(),
  deleteAvatar: vi.fn(),
  fetchAvatarHistory: vi.fn(),
  fetchUsernameHistory: vi.fn(),
  isTracking: vi.fn(),
  onCooldown: vi.fn(),
  addCooldown: vi.fn(),
  getRawLevel: vi.fn(),
  getResponse: vi.fn(),
  addView: vi.fn(),
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
vi.mock("../../src/utils/cache", () => ({
  RedisCache: class {
    async get() {
      return null;
    }
    async set() {}
  },
}));
vi.mock("../../src/utils/functions/member", () => ({
  getMember: mocks.getMember,
  getUserId: (member: string | { id: string }) => (typeof member === "string" ? member : member.id),
}));
vi.mock("../../src/utils/functions/guilds/members", () => ({
  getAllMembersRest: mocks.getAllMembersRest,
}));
vi.mock("../../src/utils/functions/users/history", () => ({
  addNewAvatar: vi.fn(),
  clearAvatarHistory: mocks.clearAvatarHistory,
  clearUsernameHistory: mocks.clearUsernameHistory,
  deleteAvatar: mocks.deleteAvatar,
  fetchAvatarHistory: mocks.fetchAvatarHistory,
  fetchUsernameHistory: mocks.fetchUsernameHistory,
  isTracking: mocks.isTracking,
}));
vi.mock("../../src/utils/functions/users/utils", () => ({ hasProfile: vi.fn(async () => true) }));
vi.mock("../../src/utils/functions/users/views", () => ({ addView: mocks.addView }));
vi.mock("../../src/utils/functions/premium/color", () => ({
  getEmbedColor: vi.fn(async () => "default"),
}));
vi.mock("../../src/utils/functions/economy/levelling", () => ({ getRawLevel: mocks.getRawLevel }));
vi.mock("../../src/utils/functions/economy/utils", () => ({
  isEcoBanned: vi.fn(async () => ({ banned: false })),
}));
vi.mock("../../src/utils/functions/s3", () => ({ putObject: vi.fn() }));
vi.mock("../../src/utils/functions/workers/sort", () => ({ default: vi.fn() }));
vi.mock("../../src/utils/handlers/cooldownhandler", () => ({
  onCooldown: mocks.onCooldown,
  addCooldown: mocks.addCooldown,
  getResponse: mocks.getResponse,
}));
vi.mock("../../src/utils/logger", () => ({ logger: { debug: vi.fn() } }));

import "../../src/commands/user";
import Constants from "../../src/utils/Constants";

const command = mocks.commands[0];
const avatar = "https://example.com/avatar.png";
const banner = "https://example.com/banner.png";

function member(id: string, username: string) {
  return {
    id,
    user: {
      id,
      username,
      createdAt: new Date("2020-01-01"),
      avatarURL: () => avatar,
      displayAvatarURL: () => avatar,
      toString: () => `<@${id}>`,
    },
    joinedAt: new Date("2021-01-01"),
    displayAvatarURL: () => avatar,
    roles: { cache: new Collection() },
  };
}

const self = member("111111111111111111", "self");
const target = member("222222222222222222", "target");

function context(action?: string, values: Record<string, unknown> = {}) {
  const response = {
    edit: vi.fn(async () => response),
    awaitMessageComponent: vi.fn().mockRejectedValue(new Error("expired")),
  };
  const fetchMember = vi.fn(async () => target);
  const fetchUser = vi.fn(async () => ({ banner: "banner", bannerURL: () => banner }));
  const message = {
    author: self.user,
    member: self,
    guildId: "guild",
    guild: { id: "guild", members: { fetch: fetchMember } },
    client: { user: { id: Constants.BOT_USER_ID }, users: { fetch: fetchUser } },
    isChatInputCommand: () => Boolean(action),
    options: {
      getSubcommand: () => action,
      getUser: (key: string) => values[key] ?? null,
      getInteger: (key: string) => values[key] ?? null,
      getBoolean: (key: string) => values[key] ?? null,
    },
  };
  const send = vi.fn(async () => response);
  const run = async (args: string[] = []) =>
    command.run(
      message as unknown as Parameters<Command["run"]>[0],
      send as unknown as Parameters<Command["run"]>[1],
      args,
    );

  return { run, send, response, fetchMember, fetchUser };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMember.mockResolvedValue(target);
  mocks.getAllMembersRest.mockResolvedValue([
    { userId: self.id, joinedTimestamp: 1 },
    { userId: target.id, joinedTimestamp: 2 },
  ]);
  mocks.fetchUsernameHistory.mockResolvedValue([{ value: "old-name", createdAt: new Date() }]);
  mocks.fetchAvatarHistory.mockResolvedValue([{ id: 1, value: avatar, createdAt: new Date() }]);
  mocks.isTracking.mockResolvedValue(true);
  mocks.onCooldown.mockResolvedValue(false);
  mocks.getRawLevel.mockResolvedValue(500);
});

describe("consolidated user command", () => {
  test("registers the six user subcommands and keeps avatar history self-only", () => {
    const payload = command.slashData.toJSON();

    expect(payload.name).toBe("user");
    expect(payload.options.map((option) => option.name)).toEqual([
      "info",
      "avatar",
      "banner",
      "avatar-history",
      "username-history",
      "join",
    ]);
    const history = payload.options.find((option) => option.name === "avatar-history");
    if (history.type !== 1) throw new Error("expected a subcommand");
    expect(history.options.map((option) => option.name)).toEqual(["clear", "page"]);
  });

  test("defaults bare prefix user lookups to information, including names with spaces", async () => {
    const own = context();
    await own.run();
    expect(mocks.addView).toHaveBeenCalledWith(self, self, "user in guild");

    const other = context();
    await other.run(["Some", "Member"]);
    expect(mocks.getMember).toHaveBeenCalledWith(expect.any(Object), "Some Member");
    expect(mocks.addView).toHaveBeenCalledWith(target, self, "user in guild");
  });

  test.each(["whois", "who", "avatar", "av", "pfp", "picture", "banner", "avh", "un", "joined"])(
    "preserves prefix shorthand %s with a working route",
    async (alias) => {
      const expansion = command.shorthands[alias].split(" ");
      expect(expansion.shift()).toBe("user");
      const request = context();

      await request.run(expansion);
      expect(request.send).toHaveBeenCalled();
    },
  );

  test("reads slash ID-only without requiring a user or relying on flattened args", async () => {
    const request = context("info", { "id-only": true });

    await request.run(["info"]);
    expect(request.send).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({ description: `\`${self.id}\`` }),
        }),
      ],
    });
    expect(mocks.getMember).not.toHaveBeenCalled();
  });

  test.each(["avatar", "banner", "username-history"])(
    "looks up the selected member for slash %s",
    async (action) => {
      const request = context(action, { user: target.user });
      await request.run([action, "misleading", "flattened", "args"]);

      expect(mocks.getMember).toHaveBeenCalledWith(expect.any(Object), `<@${target.id}>`);
      expect(request.send).toHaveBeenCalled();
      if (action === "banner")
        expect(request.fetchUser).toHaveBeenCalledWith(target.id, { force: true });
    },
  );

  test("resolves a join position when the optional user was omitted", async () => {
    const request = context("join", { position: 2 });
    await request.run(["join", "2"]);

    expect(request.fetchMember).toHaveBeenCalledWith(target.id);
    expect(request.send).toHaveBeenCalledWith({
      components: [expect.any(Object)],
      flags: MessageFlags.IsComponentsV2,
    });
    expect(mocks.getMember).not.toHaveBeenCalled();
  });

  test("treats a selected join user as a member rather than a numeric position", async () => {
    const request = context("join", { user: target.user });
    await request.run();

    expect(mocks.getMember).toHaveBeenCalledWith(expect.any(Object), `<@${target.id}>`);
    expect(request.fetchMember).not.toHaveBeenCalled();
    expect(request.send).toHaveBeenCalled();
  });

  test("rejects conflicting join inputs before doing a member lookup", async () => {
    const request = context("join", { user: target.user, position: 2 });
    await request.run();

    expect(mocks.getMember).not.toHaveBeenCalled();
    expect(mocks.getAllMembersRest).not.toHaveBeenCalled();
    expect(request.send).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  test.each(["avatar-history", "username-history"])("clears only your own %s", async (action) => {
    const request = context(action, { clear: true });
    await request.run();

    expect(
      action === "avatar-history" ? mocks.clearAvatarHistory : mocks.clearUsernameHistory,
    ).toHaveBeenCalledExactlyOnceWith(self);
  });

  test("rejects a request to clear another member's username history", async () => {
    const request = context("username-history", { user: target.user, clear: true });
    await request.run();

    expect(mocks.clearUsernameHistory).not.toHaveBeenCalled();
    expect(mocks.fetchUsernameHistory).not.toHaveBeenCalled();
    expect(request.send).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  test("retains the existing username-history cooldown across prefix and slash routes", async () => {
    mocks.onCooldown.mockResolvedValue(true);
    mocks.getResponse.mockResolvedValue({ respond: false });

    await context("username-history").run();
    await context().run(["username-history"]);

    expect(mocks.onCooldown).toHaveBeenNthCalledWith(1, "usernamehistory", self);
    expect(mocks.onCooldown).toHaveBeenNthCalledWith(2, "usernamehistory", self);
    expect(mocks.fetchUsernameHistory).not.toHaveBeenCalled();
  });

  test("opens the requested avatar-history page with matching navigation state", async () => {
    const secondAvatar = "https://example.com/second.png";
    mocks.fetchAvatarHistory.mockResolvedValue([
      { id: 1, value: avatar, createdAt: new Date() },
      { id: 2, value: secondAvatar, createdAt: new Date() },
    ]);
    const request = context("avatar-history", { page: 2 });
    await request.run();

    const payload = request.send.mock.calls[0][0] as unknown as {
      embeds: { data: { image: { url: string } } }[];
      components: { components: { data: { disabled: boolean } }[] }[];
    };
    expect(payload.embeds[0].data.image.url).toBe(secondAvatar);
    expect(payload.components[0].components[0].data.disabled).toBe(false);
    expect(payload.components[0].components[1].data.disabled).toBe(true);
  });
});
