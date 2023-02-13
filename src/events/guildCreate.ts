import { Client, Guild } from "discord.js";
import { createGuild, hasGuild, runCheck } from "../utils/functions/guilds/utils";
import { logger } from "../utils/logger";

export default async function guildCreate(client: Client, guild: Guild) {
  logger.info(`::guild added to ${guild.name} (${guild.id})`);

  if (!(await hasGuild(guild))) await createGuild(guild);

  await runCheck(guild);
}
