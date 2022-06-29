import { Client, Guild } from "discord.js";
import { setPrefix, updateDisabledCommands } from "../utils/guilds/utils";
import { removeKarma } from "../utils/karma/utils";
import { logger } from "../utils/logger";
import { profileExists, setMuteRole } from "../utils/moderation/utils";

/**
 * @param {Client} client
 * @param {Guild} guild
 */
export default async function guildDelete(client: Client, guild: Guild) {
    if (!guild.name) {
        return;
    }

    logger.log({
        level: "guild",
        message: `removed from ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
    });

    setPrefix(guild, "$");
    updateDisabledCommands(guild, []);
    if (profileExists(guild)) {
        setMuteRole(guild, "");
    }

    let amount = Math.floor(guild.memberCount / 10);

    if (amount > 500) {
        amount = 500;
    }

    await removeKarma(guild.ownerId, amount);
}
