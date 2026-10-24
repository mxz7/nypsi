import { isDeepStrictEqual } from "node:util";
import type { REST } from "@discordjs/rest";
import {
  APIApplicationCommand,
  ApplicationCommandType,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord-api-types/v10";

type LegacyCommandVisibility = { dm_permission?: boolean };
type SlashCommandPayload = Omit<RESTPostAPIChatInputApplicationCommandsJSONBody, "dm_permission"> &
  LegacyCommandVisibility;
type DeployedCommand = Omit<APIApplicationCommand, "dm_permission"> & LegacyCommandVisibility;
type SlashCommandRest = Pick<REST, "get" | "post" | "patch" | "delete">;

export interface SlashCommandChanges {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: number;
}

export async function deleteSlashCommands(
  rest: Pick<REST, "put">,
  applicationId: string,
  guildId?: string,
) {
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);

  await rest.put(route, { body: [] });
}

function normalize(value: unknown, key = ""): unknown {
  if (value === undefined || value === null) return undefined;
  if (["required", "autocomplete"].includes(key) && value === false) return undefined;
  if (key === "min_length" && value === 0) return undefined;

  if (Array.isArray(value)) {
    if (!value.length) return undefined;

    const values = value.map((entry) => normalize(entry));

    if (["channel_types", "contexts", "integration_types"].includes(key)) {
      values.sort((a, b) => Number(a) - Number(b));
    }

    return values;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, normalize(entry, key)] as const)
      .filter(([, entry]) => entry !== undefined);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

function comparableCommand(
  command: SlashCommandPayload | DeployedCommand,
  desired: SlashCommandPayload,
  guildId?: string,
) {
  return normalize({
    type: command.type ?? ApplicationCommandType.ChatInput,
    name: command.name,
    description: command.description,
    name_localizations: command.name_localizations,
    description_localizations: command.description_localizations,
    options: "options" in command ? command.options : undefined,
    default_member_permissions: command.default_member_permissions,
    nsfw: command.nsfw ?? false,
    dm_permission:
      !guildId && desired.dm_permission !== undefined ? (command.dm_permission ?? true) : undefined,
    contexts: !guildId && desired.contexts != null ? command.contexts : undefined,
    integration_types:
      !guildId && desired.integration_types != null
        ? (command.integration_types ?? [0])
        : undefined,
  });
}

function commandBody(command: SlashCommandPayload, guildId?: string): SlashCommandPayload {
  const body = {
    ...command,
    options: command.options ?? [],
    name_localizations: command.name_localizations ?? null,
    description_localizations: command.description_localizations ?? null,
    default_member_permissions: command.default_member_permissions ?? null,
    nsfw: command.nsfw ?? false,
  };

  if (guildId) {
    delete body.dm_permission;
    delete body.contexts;
    delete body.integration_types;
  }

  return body;
}

export async function syncSlashCommands(
  rest: SlashCommandRest,
  applicationId: string,
  desired: SlashCommandPayload[],
  guildId?: string,
): Promise<SlashCommandChanges> {
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
  const deployed = (await rest.get(route, {
    query: new URLSearchParams({ with_localizations: "true" }),
  })) as DeployedCommand[];

  const existing = new Map(
    deployed
      .filter((command) => command.type === ApplicationCommandType.ChatInput)
      .map((command) => [command.name, command]),
  );
  const wanted = new Set(desired.map((command) => command.name));
  const changes: SlashCommandChanges = { added: [], updated: [], removed: [], unchanged: 0 };
  const commandRoute = (id: string) =>
    guildId
      ? Routes.applicationGuildCommand(applicationId, guildId, id)
      : Routes.applicationCommand(applicationId, id);

  for (const command of existing.values()) {
    if (wanted.has(command.name)) continue;

    await rest.delete(commandRoute(command.id));
    changes.removed.push(command.name);
  }

  for (const command of desired) {
    const current = existing.get(command.name);

    if (!current) {
      await rest.post(route, { body: commandBody(command, guildId) });
      changes.added.push(command.name);
    } else if (
      !isDeepStrictEqual(
        comparableCommand(current, command, guildId),
        comparableCommand(command, command, guildId),
      )
    ) {
      await rest.patch(commandRoute(current.id), { body: commandBody(command, guildId) });
      changes.updated.push(command.name);
    } else {
      changes.unchanged++;
    }
  }

  return changes;
}
