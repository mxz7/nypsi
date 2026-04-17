import { GuildMember, PartialGuildMember } from "discord.js";
import Constants from "../utils/Constants";
import { clearMemberCache } from "../utils/functions/member";
import { isBooster, setBooster } from "../utils/functions/premium/boosters";
import { logger } from "../utils/logger";

export default async function guildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) {
  if (oldMember.partial) {
    const fetched: false | GuildMember = await oldMember.fetch().catch(() => false);

    if (!fetched) {
      logger.error("guild member update: failed to fetch partial member");
      return;
    }

    oldMember = fetched;
  }

  clearMemberCache(oldMember.guild.id);

  if (newMember.guild.id === Constants.NYPSI_SERVER_ID) {
    if (
      newMember.roles.cache.has(Constants.BOOST_ROLE_ID) &&
      !(await isBooster(newMember.user.id))
    ) {
      await setBooster(newMember.user.id, true);
    } else if (
      !newMember.roles.cache.has(Constants.BOOST_ROLE_ID) &&
      (await isBooster(newMember.user.id))
    ) {
      await setBooster(newMember.user.id, false);
    }
  }
}
