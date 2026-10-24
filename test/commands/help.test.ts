import { beforeEach, expect, test, vi } from "vitest";
import type { Command } from "../../src/models/Command";

const mocks = vi.hoisted(() => ({
  commands: [] as Command[],
  registry: new Map<string, Command>(),
  getItems: vi.fn(),
  runItemInfo: vi.fn(),
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
  getUserId: (member: { id: string }) => member.id,
}));
vi.mock("../../src/utils/functions/premium/color", () => ({
  getEmbedColor: vi.fn(async () => "default"),
}));
vi.mock("../../src/utils/logger", () => ({ logger: { debug: vi.fn() } }));
vi.mock("../../src/utils/functions/ai/help-chat", () => ({
  isHelpChatAvailable: vi.fn(async () => true),
}));
vi.mock("../../src/utils/functions/date", () => ({ formatDate: vi.fn() }));
vi.mock("../../src/utils/functions/economy/item_info", () => ({
  runItemInfo: mocks.runItemInfo,
}));
vi.mock("../../src/utils/functions/economy/utils", () => ({ getItems: mocks.getItems }));
vi.mock("../../src/utils/functions/guilds/utils", () => ({
  getPrefix: vi.fn(async () => ["$"]),
}));
vi.mock("../../src/utils/functions/news", () => ({
  getNews: vi.fn(async () => ({ text: "" })),
}));
vi.mock("../../src/utils/functions/premium/command", () => ({ getCommand: vi.fn() }));
vi.mock("../../src/utils/handlers/commandhandler", () => ({
  getCommandKeys: () => mocks.registry.keys(),
  getCmdCategory: (key: string) => mocks.registry.get(key).category,
  getCmdName: (key: string) => mocks.registry.get(key).name,
  getCmdDesc: (key: string) => mocks.registry.get(key).description,
  getCommandData: (key: string) => mocks.registry.get(key),
  commandExists: (key: string) => mocks.registry.has(key),
  commandAliasExists: () => false,
  getCommandFromAlias: vi.fn(),
}));

import "../../src/commands/help";

const command = mocks.commands[0];

function context(query: string | null = null) {
  const response = {
    edit: vi.fn(async () => response),
    awaitMessageComponent: vi.fn().mockRejectedValue(new Error("expired")),
  };
  const message = {
    member: { id: "self" },
    author: { id: "self" },
    guild: {},
    client: { user: { displayAvatarURL: () => "https://example.com/avatar.png" } },
    channel: {
      send: vi.fn(() => {
        throw new Error("must acknowledge the interaction");
      }),
    },
    isChatInputCommand: () => true,
    options: { getString: (name: string) => (name === "query" ? query : null) },
  };
  const send = vi.fn(async (_data: unknown) => response);
  return {
    message,
    send,
    response,
    run: async () =>
      command.run(message as unknown as Parameters<Command["run"]>[0], send as never, [
        "ignored-adapter-input",
      ]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registry.clear();
  mocks.registry.set("work", {
    name: "work",
    description: "earn money",
    category: "money",
    slashEnabled: true,
  } as Command);
  mocks.getItems.mockReturnValue({});
  mocks.runItemInfo.mockResolvedValue(true);
});

test("slash help without a query replies with the menu and help chat button", async () => {
  const ctx = context();
  await ctx.run();

  const payload = ctx.send.mock.calls[0][0] as {
    embeds: { data: { title: string; fields: { value: string }[] } }[];
    components: { components: { data: { custom_id: string } }[] }[];
  };
  expect(payload.embeds[0].data.title).toBe("help menu");
  expect(payload.embeds[0].data.fields[0].value).toContain("/help query:");
  expect(payload.components[0].components[0].data.custom_id).toBe("btn-help-ai-start");
  expect(ctx.message.channel.send).not.toHaveBeenCalled();
});

test("slash category help paginates the reply and distinguishes prefix-only commands", async () => {
  for (let index = 0; index < 10; index++) {
    mocks.registry.set(`legacy${index}`, {
      name: `legacy${index}`,
      description: "prefix only",
      category: "money",
      slashEnabled: false,
    } as Command);
  }
  const ctx = context("money");
  ctx.response.awaitMessageComponent.mockResolvedValueOnce({
    customId: "btn-next-page",
    deferUpdate: vi.fn(),
  });
  await ctx.run();

  expect(ctx.send).toHaveBeenCalledOnce();
  expect(ctx.response.edit).toHaveBeenCalledTimes(2);
  const edit = ctx.response.edit.mock.calls[0][0] as {
    embeds: { data: { description: string; footer: { text: string } } }[];
  };
  expect(edit.embeds[0].data.description).toContain("$**legacy9**");
  expect(edit.embeds[0].data.footer.text).toBe("page 2/2");
  expect(ctx.response.edit).toHaveBeenLastCalledWith({ components: [] });
});

test("slash item help forwards the reply function and preserves a multiword query", async () => {
  const item = { id: "fishing_rod", name: "fishing rod" };
  mocks.getItems.mockReturnValue({ fishing_rod: item });
  const ctx = context("fishing rod");
  await ctx.run();

  expect(mocks.runItemInfo).toHaveBeenCalledWith(
    ctx.message,
    ["fishing", "rod"],
    item,
    "general",
    ctx.send,
  );
  expect(ctx.message.channel.send).not.toHaveBeenCalled();
});

test("an unknown slash help query replies with an error", async () => {
  const ctx = context("nonexistent");
  await ctx.run();

  const payload = ctx.send.mock.calls[0][0] as { embeds: { data: { description: string } }[] };
  expect(payload.embeds[0].data.description).toContain("unknown command or item");
  expect(ctx.message.channel.send).not.toHaveBeenCalled();
});
