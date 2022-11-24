import { GuildMember, Role } from "discord.js";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import Constants from "../utils/Constants";
import { addKarma } from "../utils/functions/karma/karma";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { addMember, getTier, isPremium, renewUser, setExpireDate, setTier } from "../utils/functions/premium/premium";
import { createProfile, hasProfile } from "../utils/functions/users/utils";

export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
  if (oldMember.roles.cache.size != newMember.roles.cache.size && (await isLogsEnabled(newMember.guild))) {
    let roles: Role[];

    const oldIds = Array.from(oldMember.roles.cache.keys());
    const newIds = Array.from(newMember.roles.cache.keys());

    if (oldIds.length > newIds.length) {
      roles = oldIds.filter((a) => !newIds.includes(a)).map((id) => oldMember.roles.cache.get(id));
    } else {
      roles = newIds.filter((a) => !oldIds.includes(a)).map((id) => newMember.roles.cache.get(id));
    }

    if (roles.length == 0) return;

    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader(oldIds.length > newIds.length ? "role removed" : "role added");
    embed.setDescription(`${newMember.user.toString()} \`${newMember.user.id}\``);
    embed.addField(`role${roles.length > 1 ? "s" : ""}`, roles.map((r) => r.toString()).join("\n"));

    await addLog(newMember.guild, LogType.MEMBER, embed);
  }

  if (newMember.guild.id == "747056029795221513") {
    if (oldMember.roles.cache.size < newMember.roles.cache.size) {
      let tier = 0;

      // 747066190530347089 boost role
      // 819870727834566696 silver role
      // 819870846536646666 gold role
      // 819870959325413387 platinum role

      if (newMember.roles.cache.find((r) => r.id == Constants.PLATINUM_ROLE_ID)) {
        // platinum
        tier = 4;
      } else if (newMember.roles.cache.find((r) => r.id == Constants.GOLD_ROLE_ID)) {
        // gold
        tier = 3;
      } else if (newMember.roles.cache.find((r) => r.id == Constants.BOOST_ROLE_ID)) {
        // boost
        tier = 2;
      } else if (newMember.roles.cache.find((r) => r.id == Constants.SILVER_ROLE_ID)) {
        // silver
        tier = 2;
      } else if (newMember.roles.cache.find((r) => r.id == Constants.BRONZE_ROLE_ID)) {
        // bronze
        tier = 1;
      }

      if (tier == 0 || tier > 4) return;

      if (await isPremium(newMember.user.id)) {
        if (tier <= (await getTier(newMember.user.id))) return;

        await setTier(newMember.user.id, tier, newMember.client as NypsiClient);
        await renewUser(newMember.user.id, newMember.client as NypsiClient);
      } else {
        if (!(await hasProfile(newMember.user.id))) await createProfile(newMember.user);
        await addMember(newMember.user.id, tier, newMember.client as NypsiClient);
        await addKarma(newMember.user.id, 50);
      }
    } else if (oldMember.roles.cache.size > newMember.roles.cache.size) {
      // 747066190530347089 boost role
      // 819870727834566696 silver role
      // 819870846536646666 gold role
      // 819870959325413387 platinum role
      if (
        oldMember.roles.cache.find((r) => r.id == Constants.BOOST_ROLE_ID) &&
        !newMember.roles.cache.find((r) => r.id == Constants.BOOST_ROLE_ID)
      ) {
        if (newMember.roles.cache.find((r) => r.id == Constants.PLATINUM_ROLE_ID)) return;
        if (newMember.roles.cache.find((r) => r.id == Constants.GOLD_ROLE_ID)) return;
        if (newMember.roles.cache.find((r) => r.id == Constants.SILVER_ROLE_ID))
          setExpireDate(newMember.id, new Date(0), newMember.client as NypsiClient);
      }
    }
  }
}
