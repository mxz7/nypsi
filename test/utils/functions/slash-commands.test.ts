import type { REST } from "@discordjs/rest";
import { APIApplicationCommand, ApplicationCommandType, Routes } from "discord-api-types/v10";
import { SlashCommandBuilder } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import {
  deleteSlashCommands,
  syncSlashCommands,
} from "../../../src/utils/functions/slash-commands";

const applicationId = "123456789012345678";
const guildId = "234567890123456789";

function definition(name = "use") {
  return new SlashCommandBuilder().setName(name).setDescription(`run ${name}`).toJSON();
}

function deployed(payload = definition(), id = "345678901234567890"): APIApplicationCommand {
  return {
    ...payload,
    id,
    application_id: applicationId,
    version: "456789012345678901",
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: null,
    nsfw: false,
    contexts: [0, 1, 2],
    integration_types: [0],
  };
}

function mockRest(commands: APIApplicationCommand[]) {
  return {
    get: vi.fn<REST["get"]>().mockResolvedValue(commands),
    post: vi.fn<REST["post"]>().mockResolvedValue(undefined),
    patch: vi.fn<REST["patch"]>().mockResolvedValue(undefined),
    delete: vi.fn<REST["delete"]>().mockResolvedValue(undefined),
  };
}

describe("slash command synchronization", () => {
  test("does not write when only Discord metadata and implicit defaults differ", async () => {
    const command = new SlashCommandBuilder()
      .setName("use")
      .setDescription("use an item")
      .addSubcommand((sub) =>
        sub
          .setName("item")
          .setDescription("use an item")
          .addStringOption((option) => option.setName("item").setDescription("item to use")),
      )
      .toJSON();
    const current = deployed(structuredClone(command));
    const subcommand = current.options[0];

    if (subcommand.type !== 1) throw new Error("expected a subcommand");

    Object.assign(subcommand.options[0], {
      required: false,
      autocomplete: false,
      min_length: 0,
      name_localizations: null,
      description_localizations: {},
      choices: [],
    });
    Object.assign(current, { dm_permission: true });
    const rest = mockRest([current]);

    expect(await syncSlashCommands(rest, applicationId, [command])).toEqual({
      added: [],
      updated: [],
      removed: [],
      unchanged: 1,
    });
    expect(rest.get).toHaveBeenCalledWith(Routes.applicationCommands(applicationId), {
      query: new URLSearchParams({ with_localizations: "true" }),
    });
    expect(rest.post).not.toHaveBeenCalled();
    expect(rest.patch).not.toHaveBeenCalled();
    expect(rest.delete).not.toHaveBeenCalled();
  });

  test("adds, edits by existing ID, and removes only slash commands in the selected scope", async () => {
    const changed = { ...definition(), description: "updated description" };
    const removed = deployed(definition("old"), "old-id");
    const current = deployed();
    const menu = { ...deployed(definition("menu"), "menu-id"), type: ApplicationCommandType.User };
    const rest = mockRest([current, removed, deployed(definition("same")), menu]);

    expect(
      await syncSlashCommands(rest, applicationId, [
        definition("new"),
        changed,
        definition("same"),
      ]),
    ).toEqual({ added: ["new"], updated: ["use"], removed: ["old"], unchanged: 1 });
    expect(rest.delete).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationCommand(applicationId, removed.id),
    );
    expect(rest.patch).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationCommand(applicationId, current.id),
      { body: expect.objectContaining({ name: "use", description: "updated description" }) },
    );
    expect(rest.post).toHaveBeenCalledExactlyOnceWith(Routes.applicationCommands(applicationId), {
      body: expect.objectContaining({ name: "new", description: "run new" }),
    });
    expect(rest.delete.mock.invocationCallOrder[0]).toBeLessThan(
      rest.post.mock.invocationCallOrder[0],
    );
  });

  test.each([
    ["required", { required: true }],
    ["autocomplete", { autocomplete: true }],
    ["minimum length", { min_length: 2 }],
    ["maximum length", { max_length: 20 }],
    ["localized description", { description_localizations: { "en-GB": "choose an item" } }],
    ["choices", { choices: [{ name: "cookie", value: "cookie" }] }],
  ])("detects a nested option change: %s", async (_, change) => {
    const command = new SlashCommandBuilder()
      .setName("use")
      .setDescription("use an item")
      .addSubcommand((sub) =>
        sub
          .setName("item")
          .setDescription("use an item")
          .addStringOption((option) => option.setName("item").setDescription("item to use")),
      )
      .toJSON();
    const current = deployed(structuredClone(command));
    const subcommand = current.options[0];

    if (subcommand.type !== 1) throw new Error("expected a subcommand");

    Object.assign(subcommand.options[0], change);
    const rest = mockRest([current]);

    expect((await syncSlashCommands(rest, applicationId, [command])).updated).toEqual(["use"]);
    expect(rest.patch).toHaveBeenCalledOnce();
  });

  test("clears removed options, localizations, permissions, and age restrictions in the edit", async () => {
    const current = deployed(
      new SlashCommandBuilder()
        .setName("use")
        .setDescription("run use")
        .setNameLocalization("en-GB", "activate")
        .setDescriptionLocalization("en-GB", "activate an item")
        .setDefaultMemberPermissions(8n)
        .setNSFW(true)
        .addStringOption((option) => option.setName("item").setDescription("item to use"))
        .toJSON(),
    );
    const rest = mockRest([current]);

    expect((await syncSlashCommands(rest, applicationId, [definition()])).updated).toEqual(["use"]);
    expect(rest.patch).toHaveBeenCalledWith(expect.any(String), {
      body: expect.objectContaining({
        options: [],
        name_localizations: null,
        description_localizations: null,
        default_member_permissions: null,
        nsfw: false,
      }),
    });
  });

  test("preserves option and choice ordering when deciding whether to update", async () => {
    const command = new SlashCommandBuilder()
      .setName("use")
      .setDescription("use an item")
      .addStringOption((option) =>
        option
          .setName("item")
          .setDescription("item to use")
          .addChoices({ name: "cookie", value: "cookie" }, { name: "cake", value: "cake" }),
      )
      .addStringOption((option) => option.setName("amount").setDescription("amount to use"))
      .toJSON();
    const reorderedOptions = deployed(structuredClone(command));
    reorderedOptions.options.reverse();

    const reorderedChoices = deployed(structuredClone(command));
    const option = reorderedChoices.options[0];
    if (option.type !== 3) throw new Error("expected a string option");
    option.choices.reverse();

    for (const current of [reorderedOptions, reorderedChoices]) {
      expect(
        (await syncSlashCommands(mockRest([current]), applicationId, [command])).updated,
      ).toEqual(["use"]);
    }
  });

  test("compares explicit global contexts as sets and detects visibility changes", async () => {
    const command = { ...definition(), contexts: [0, 1], integration_types: [0, 1] };
    const current = { ...deployed(command), contexts: [1, 0], integration_types: [1, 0] };
    const rest = mockRest([current]);

    expect((await syncSlashCommands(rest, applicationId, [command])).unchanged).toBe(1);
    expect(rest.patch).not.toHaveBeenCalled();

    current.contexts = [0];
    expect((await syncSlashCommands(rest, applicationId, [command])).updated).toEqual(["use"]);
  });

  test("patches nullable deployed contexts when all contexts are explicitly requested", async () => {
    const command = { ...definition(), contexts: [0, 1, 2] };
    const current = { ...deployed(command), contexts: null };
    const rest = mockRest([current]);

    expect((await syncSlashCommands(rest, applicationId, [command])).updated).toEqual(["use"]);
    expect(rest.patch).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationCommand(applicationId, current.id),
      { body: expect.objectContaining({ contexts: [0, 1, 2] }) },
    );

    rest.get.mockResolvedValueOnce([deployed(command)]);
    expect((await syncSlashCommands(rest, applicationId, [command])).unchanged).toBe(1);
    expect(rest.patch).toHaveBeenCalledOnce();
  });

  test("preserves deployed visibility when local settings are omitted, including on other edits", async () => {
    const current = { ...deployed(), contexts: [0], integration_types: [1] };
    const rest = mockRest([current]);

    expect((await syncSlashCommands(rest, applicationId, [definition()])).unchanged).toBe(1);
    expect(rest.patch).not.toHaveBeenCalled();

    const command = { ...definition(), description: "updated description" };
    expect((await syncSlashCommands(rest, applicationId, [command])).updated).toEqual(["use"]);
    const body = rest.patch.mock.calls[0][1].body;
    expect(body.contexts).toBeUndefined();
    expect(body.integration_types).toBeUndefined();
  });

  test("uses guild routes and excludes global-only fields from guild comparisons and writes", async () => {
    const command = {
      ...definition(),
      contexts: [0],
      integration_types: [1],
      dm_permission: false,
    };
    const current = deployed(definition());
    const rest = mockRest([current, deployed(definition("old"), "old-id")]);

    expect((await syncSlashCommands(rest, applicationId, [command], guildId)).unchanged).toBe(1);
    expect(rest.get).toHaveBeenCalledWith(
      Routes.applicationGuildCommands(applicationId, guildId),
      expect.any(Object),
    );
    expect(rest.delete).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationGuildCommand(applicationId, guildId, "old-id"),
    );

    await syncSlashCommands(rest, applicationId, [{ ...command, description: "changed" }], guildId);
    await syncSlashCommands(rest, applicationId, [{ ...command, name: "new" }], guildId);

    expect(rest.patch).toHaveBeenCalledWith(
      Routes.applicationGuildCommand(applicationId, guildId, current.id),
      expect.any(Object),
    );
    for (const body of [rest.patch.mock.calls[0][1].body, rest.post.mock.calls[0][1].body]) {
      expect(body).not.toHaveProperty("contexts");
      expect(body).not.toHaveProperty("integration_types");
      expect(body).not.toHaveProperty("dm_permission");
    }
  });

  test("does not report success after a Discord failure and can converge on retry", async () => {
    const command = { ...definition(), description: "changed" };
    const rest = mockRest([deployed()]);
    rest.patch.mockRejectedValueOnce(new Error("Discord unavailable"));

    await expect(syncSlashCommands(rest, applicationId, [command])).rejects.toThrow(
      "Discord unavailable",
    );

    rest.get.mockResolvedValueOnce([deployed(command)]);
    expect((await syncSlashCommands(rest, applicationId, [command])).unchanged).toBe(1);
    expect(rest.patch).toHaveBeenCalledOnce();
  });

  test("removes all obsolete slash commands when none remain locally", async () => {
    const rest = mockRest([deployed(), deployed(definition("old"), "old-id")]);

    expect(await syncSlashCommands(rest, applicationId, [])).toEqual({
      added: [],
      updated: [],
      removed: ["use", "old"],
      unchanged: 0,
    });
    expect(rest.delete).toHaveBeenCalledTimes(2);
    expect(rest.post).not.toHaveBeenCalled();
    expect(rest.patch).not.toHaveBeenCalled();
  });

  test("does not change deployed commands if fetching their definitions fails", async () => {
    const rest = mockRest([]);
    rest.get.mockRejectedValueOnce(new Error("cannot fetch commands"));

    await expect(syncSlashCommands(rest, applicationId, [])).rejects.toThrow(
      "cannot fetch commands",
    );
    expect(rest.delete).not.toHaveBeenCalled();
    expect(rest.post).not.toHaveBeenCalled();
    expect(rest.patch).not.toHaveBeenCalled();
  });
});

describe("explicit slash command deletion", () => {
  test.each([undefined, guildId])("clears only the requested scope: %s", async (targetGuild) => {
    const rest = { put: vi.fn<REST["put"]>().mockResolvedValue([]) };

    await deleteSlashCommands(rest, applicationId, targetGuild);

    expect(rest.put).toHaveBeenCalledExactlyOnceWith(
      targetGuild
        ? Routes.applicationGuildCommands(applicationId, targetGuild)
        : Routes.applicationCommands(applicationId),
      { body: [] },
    );
  });

  test("propagates deletion failures", async () => {
    const rest = {
      put: vi.fn<REST["put"]>().mockRejectedValue(new Error("cannot delete commands")),
    };

    await expect(deleteSlashCommands(rest, applicationId)).rejects.toThrow(
      "cannot delete commands",
    );
  });
});
