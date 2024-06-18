import { Client, Guild } from "discord.js";
import { updateDisabledCommands } from "../utils/functions/guilds/disabledcommands";
import { setPrefix } from "../utils/functions/guilds/utils";
import { setMuteRole } from "../utils/functions/moderation/mute";

import { logger } from "../utils/logger";

export default async function guildDelete(client: Client, guild: Guild) {
  if (!guild.name) {
    return;
  }

  logger.info(`::guild removed from ${guild.name} (${guild.id})`);

  await setPrefix(guild, ["$"]);
  await updateDisabledCommands(guild, []);

  await setMuteRole(guild, "");
}
