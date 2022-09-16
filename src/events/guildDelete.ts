import { Client, Guild } from "discord.js";
import { setPrefix, updateDisabledCommands } from "../utils/guilds/utils";
import { removeKarma } from "../utils/karma/utils";
import { logger } from "../utils/logger";
import { profileExists, setMuteRole } from "../utils/moderation/utils";

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
