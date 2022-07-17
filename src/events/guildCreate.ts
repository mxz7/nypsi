import { Client, Guild } from "discord.js";
import { createGuild, hasGuild, runCheck } from "../utils/guilds/utils";
import { addKarma } from "../utils/karma/utils";
import { logger } from "../utils/logger";
import { createProfile, hasProfile } from "../utils/users/utils";

export default async function guildCreate(client: Client, guild: Guild) {
    logger.log({
        level: "guild",
        message: `added to ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
    });

    if (!(await hasGuild(guild))) await createGuild(guild);

    await runCheck(guild);

    let amount = Math.floor(guild.memberCount / 10);

    if (amount > 500) {
        amount = 500;
    }

    if (!(await hasProfile(guild.ownerId))) await createProfile(guild.ownerId);

    await addKarma(guild.ownerId, amount);
}
