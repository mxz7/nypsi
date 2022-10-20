import { CommandInteraction, Message, User } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import {
  calcNetWorth,
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  getMulti,
  topAmountGlobal,
} from "../utils/functions/economy/balance";
import { getPrestige } from "../utils/functions/economy/prestige";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { hasVoted } from "../utils/functions/economy/vote";
import { getXp } from "../utils/functions/economy/xp";
import { getPeaks } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import { getPremiumProfile, isPremium } from "../utils/functions/premium/premium";
import { getLastCommand } from "../utils/functions/users/commands";
import { fetchUsernameHistory } from "../utils/functions/users/history";

const cmd = new Command("find", "find info", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (!(message instanceof Message)) return;

  const client = message.client as NypsiClient;

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member);

    embed.setDescription(
      "$find gid <guildid>\n$find gname <guild name>\n$find id <userid>\n$find tag <user tag>\n$find top"
    );

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "gid") {
    if (args.length == 1) return message.react("❌");

    let guild: any = await client.cluster.broadcastEval(
      async (c, { guildId }) => {
        const g = await c.guilds.fetch(guildId);

        if (!g) return null;

        return g;
      },
      { context: { guildId: args[1] } }
    );

    for (const res of guild) {
      if (!res) continue;
      if (res.id) {
        guild = res;
        break;
      }
    }

    if (!guild) return message.react("❌");

    return showGuild(message, guild);
  } else if (args[0].toLowerCase() == "gname") {
    if (args.length == 1) return message.react("❌");

    args.shift();

    let guild: any = await client.cluster.broadcastEval(
      (c, { guildId }) => {
        const g = c.guilds.cache.find((g) => g.name.includes(guildId));

        return g;
      },
      { context: { guildId: args.join(" ") } }
    );

    for (const res of guild) {
      if (res.id) {
        guild = res;
        break;
      }
    }

    if (!guild) return message.react("❌");

    return showGuild(message, guild);
  } else if (args[0].toLowerCase() == "id") {
    if (args.length == 1) return message.react("❌");

    let user: any = await client.cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.fetch(userId);

        return g;
      },
      { context: { userId: args[1] } }
    );

    for (const res of user) {
      if (res.username) {
        user = res;
        break;
      }
    }

    if (!user) return message.react("❌");

    return showUser(message, user);
  } else if (args[0].toLowerCase() == "tag") {
    if (args.length == 1) return message.react("❌");

    args.shift();

    let user: any = await client.cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.cache.find((u) => {
          return `${u.username}#${u.discriminator}`.includes(userId);
        });

        return g;
      },
      { context: { userId: args.join(" ") } }
    );

    for (const res of user) {
      if (!res) continue;
      if (res.username) {
        user = res;
        break;
      }
    }

    if (!user || user instanceof Array) return message.react("❌");

    return showUser(message, user);
  } else if (args[0].toLowerCase() == "top") {
    const balTop = await topAmountGlobal(10, client, false);

    const embed = new CustomEmbed(message.member, balTop.join("\n")).setTitle("top " + balTop.length);

    return message.channel.send({ embeds: [embed] });
  }
}

async function showGuild(message: Message, guild: any) {
  const owner = guild.ownerId;

  const invites = guild.invites.cache;

  const embed = new CustomEmbed(message.member)
    .setDescription(`\`${guild.id}\``)
    .setTitle(guild.name)
    .addField(
      "info",
      `**owner** ${owner}
            **created** ${formatDate(guild.createdAt)}`,
      true
    )
    .addField(
      "member info",
      `**members** ${guild.members.length}
    **peak** ${await getPeaks(guild)}`,
      true
    ); // if guild.members.length works add members field back

  if (invites && invites.length > 0) {
    embed.addField(`invite (${invites.length})`, invites[Math.floor(Math.random() & invites.length)]);
  }

  return message.channel.send({ embeds: [embed] });
}

async function showUser(message: Message, user: User) {
  const embed = new CustomEmbed(message.member)
    .setTitle(user.tag)
    .setDescription(
      `\`${user.id}\`${(await isPremium(user.id)) ? ` (${(await getPremiumProfile(user.id)).getLevelString()}) ` : ""} ${
        (await isEcoBanned(user.id)) ? "[banned]" : ""
      }`
    )
    .addField(
      "user",
      `**tag** ${user.tag}
            **created** ${formatDate(user.createdAt)}${
        (await getLastCommand(user.id))
          ? `\n**last command** <t:${Math.floor((await getLastCommand(user.id)).getTime() / 1000)}:R>`
          : ""
      }`,
      true
    )
    .setFooter({ text: `${await getKarma(user.id)} karma` });

  if (await userExists(user.id)) {
    const voted = await hasVoted(user.id);
    embed.addField(
      "economy",
      `💰 $**${(await getBalance(user.id)).toLocaleString()}**
            💳 $**${(await getBankBalance(user.id)).toLocaleString()}** / $**${(
        await getMaxBankBalance(user.id)
      ).toLocaleString()}**
      🌍 $**${(await calcNetWorth(user.id)).toLocaleString()}**
            **xp** ${(await getXp(user.id)).toLocaleString()}
            **voted** ${voted}
            **prestige** ${await getPrestige(user.id)}
            **bonus** ${Math.floor((await getMulti(user.id)) * 100)}%`,
      true
    );
  }

  const usernameHistory = await fetchUsernameHistory(user.id);

  if (usernameHistory.length > 0) {
    let msg = "";

    let count = 0;
    for (const un of usernameHistory) {
      if (count >= 10) break;
      msg += `\`${un.value}\` | \`${formatDate(un.date)}\`\n`;
      count++;
    }

    embed.addField("username history", msg, true);
  }

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
