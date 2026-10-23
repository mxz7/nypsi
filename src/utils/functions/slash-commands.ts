import type { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

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
