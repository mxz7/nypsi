import { Client, Guild } from "discord.js";
import { updateDisabledCommands } from "../utils/functions/guilds/disabledcommands";
import { setPrefix } from "../utils/functions/guilds/utils";
import { removeKarma } from "../utils/functions/karma/karma";
import { setMuteRole } from "../utils/functions/moderation/mute";
import { profileExists } from "../utils/functions/moderation/utils";
import { logger } from "../utils/logger";

export default async function guildDelete(client: Client, guild: Guild) {
  if (!guild.name) {
    return;
  }

  logger.log({
    level: "guild",
    message: `removed from ${guild.name} (${guild.id})`,
  });

  await setPrefix(guild, "$");
  await updateDisabledCommands(guild, []);
  if (await profileExists(guild)) {
    await setMuteRole(guild, "");
  }

  let amount = Math.floor(guild.memberCount / 10);

  if (amount > 500) {
    amount = 500;
  }

  await removeKarma(guild.ownerId, amount);
}
