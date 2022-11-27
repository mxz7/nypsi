import { GuildMember, Role } from "discord.js";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import Constants from "../utils/Constants";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { addMember, expireUser, getTier, isPremium, setTier } from "../utils/functions/premium/premium";

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

  if (oldMember.guild.id == Constants.NYPSI_SERVER_ID) {
    if (
      Array.from(newMember.roles.cache.keys()).includes(Constants.BOOST_ROLE_ID) &&
      !Array.from(oldMember.roles.cache.keys()).includes(Constants.BOOST_ROLE_ID)
    ) {
      if (await isPremium(newMember)) {
        if ((await getTier(newMember)) < 2) {
          await setTier(newMember, 2);
          if (Array.from(newMember.roles.cache.keys()).includes(Constants.BRONZE_ROLE_ID)) {
            await newMember.roles.remove(Constants.BRONZE_ROLE_ID);
          }
        }
      } else {
        await addMember(newMember, 2, newMember.client as NypsiClient);
      }
    } else if (
      !Array.from(newMember.roles.cache.keys()).includes(Constants.BOOST_ROLE_ID) &&
      Array.from(oldMember.roles.cache.keys()).includes(Constants.BOOST_ROLE_ID) &&
      !Array.from(newMember.roles.cache.keys()).includes(Constants.SILVER_ROLE_ID)
    ) {
      if ((await isPremium(newMember)) && (await getTier(newMember)) == 2) {
        await expireUser(newMember.user.id, newMember.client as NypsiClient);
      }
    }
  }
}
