import { GuildMember, Role } from "discord.js";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import Constants from "../utils/Constants";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { addMember, expireUser, getTier, isPremium, setTier } from "../utils/functions/premium/premium";

export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
  const oldRoleIds = Array.from(oldMember.roles.cache.keys());
  const newRoleIds = Array.from(newMember.roles.cache.keys());

  if (oldRoleIds != newRoleIds && (await isLogsEnabled(newMember.guild))) {
    const newDiff = newRoleIds.filter((r) => !oldRoleIds.includes(r));
    const oldDiff = oldRoleIds.filter((r) => !newRoleIds.includes(r));

    const roles: Role[] = [];

    for (const newRole of newDiff) {
      roles.push(await newMember.guild.roles.fetch(newRole));
    }

    if (roles.length != 0) await createLog(newMember, roles, true);
    roles.length = 0;

    for (const oldRole of oldDiff) {
      roles.push(await newMember.guild.roles.fetch(oldRole));
    }

    if (roles.length != 0) await createLog(oldMember, roles, false);
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

async function createLog(member: GuildMember, roles: Role[], added: boolean) {
  const embed = new CustomEmbed().disableFooter().setTimestamp();

  embed.setHeader(!added ? "role removed" : "role added");
  embed.setDescription(`${member.toString()} \`${member.id}\``);
  embed.addField("role", roles.map((r) => r.toString()).join(" "));

  await addLog(member.guild, LogType.MEMBER, embed);
}
