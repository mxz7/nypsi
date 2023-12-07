import { GuildMember, Role } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { clearMemberCache } from "../utils/functions/member";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { isBooster, setBooster } from "../utils/functions/premium/boosters";

export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
  clearMemberCache(oldMember.guild.id);

  const oldRoleIds = Array.from(oldMember.roles.cache.keys());
  const newRoleIds = Array.from(newMember.roles.cache.keys());

  if (oldRoleIds != newRoleIds && (await isLogsEnabled(newMember.guild))) {
    const newDiff = newRoleIds.filter((r) => !oldRoleIds.includes(r));
    const oldDiff = oldRoleIds.filter((r) => !newRoleIds.includes(r));

    const roles: Role[] = [];

    for (const newRole of newDiff) {
      roles.push(await newMember.guild.roles.cache.get(newRole));
    }

    if (roles.length != 0) await createLog(newMember, roles, true);
    roles.length = 0;

    for (const oldRole of oldDiff) {
      roles.push(await newMember.guild.roles.cache.get(oldRole));
    }

    if (roles.length != 0) await createLog(oldMember, roles, false);
  }

  if (oldMember.displayName !== newMember.displayName && (await isLogsEnabled(newMember.guild))) {
    //not sure if newMember.guild is necessary
    const embed = new CustomEmbed()
      .disableFooter()
      .setTimestamp()
      .setHeader(newMember.user.username, newMember.user.avatarURL());

    embed.setTitle("nickname changed");
    embed.setDescription(
      `${newMember.toString()} (${newMember.id})\n**${oldMember.displayName}** -> **${
        newMember.displayName
      }**`,
    );
    await addLog(newMember.guild, "member", embed);
  }

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

async function createLog(member: GuildMember, roles: Role[], added: boolean) {
  const embed = new CustomEmbed().disableFooter().setTimestamp();

  embed.setHeader(member.user.username, member.user.avatarURL());
  embed.setTitle(!added ? "role removed" : "role added");
  embed.setDescription(`${member.toString()} \`${member.id}\``);
  embed.addField("role", roles.map((r) => r.toString()).join(" "));

  await addLog(member.guild, "member", embed);
}
