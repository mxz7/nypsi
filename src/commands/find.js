const { Message, Guild, User } = require("discord.js");
const { Command, Categories, NypsiCommandInteraction } = require("../utils/models/Command");
const { CustomEmbed } = require("../utils/models/EmbedBuilders.js");
const {
    topAmount,
    userExists,
    getBalance,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    hasVoted,
    getPrestige,
    getMulti,
    topAmountGlobal,
    isEcoBanned,
} = require("../utils/economy/utils");
const { getPeaks } = require("../utils/guilds/utils");
const { getKarma, getLastCommand } = require("../utils/karma/utils");
const { isPremium, getPremiumProfile } = require("../utils/premium/utils");
const { formatDate, daysAgo } = require("../utils/functions/date");
const { NypsiClient } = require("../utils/models/Client");
const { fetchUsernameHistory } = require("../utils/users/utils");

const cmd = new Command("find", "find info", Categories.NONE).setPermissions(["bot owner"]);

async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return;

    const client = message.client;

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member);

        embed.setDescription(
            "$find gid <guildid>\n$find gname <guild name>\n$find id <userid>\n$find tag <user tag>\n$find top"
        );

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "gid") {
        if (args.length == 1) return message.react("❌");

        let guild = await client.cluster.broadcastEval(
            async (c, { guildId }) => {
                const g = await c.guilds.fetch(guildId);

                return g;
            },
            { context: { guildId: args[1] } }
        );

        for (const res of guild) {
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

        let guild = await client.cluster.broadcastEval(
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

        let user = await client.cluster.broadcastEval(
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

        let user = await client.cluster.broadcastEval(
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
        const balTop = await topAmountGlobal(10, message.client, false);

        const embed = new CustomEmbed(message.member, balTop.join("\n")).setTitle("top " + balTop.length);

        return message.channel.send({ embeds: [embed] });
    }
}

async function showGuild(message, guild) {
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
            `**members** ${guild.memberCount.toLocaleString()}
    **peak** ${await getPeaks(guild)}`,
            true
        );

    if (invites && invites.length > 0) {
        embed.addField(`invite (${invites.length})`, invites[Math.floor(Math.random() & invites.length)]);
    }

    return message.channel.send({ embeds: [embed] });
}

async function showUser(message, user) {
    const embed = new CustomEmbed(message.member)
        .setTitle(user.tag)
        .setDescription(
            `\`${user.id}\`${
                (await isPremium(user.id)) ? ` (${(await getPremiumProfile(user.id)).getLevelString()}) ` : ""
            } ${(await isEcoBanned(user.id)) ? "[banned]" : ""}`
        )
        .addField(
            "user",
            `**tag** ${user.tag}
            **created** ${formatDate(user.createdAt)}${
                (await getLastCommand(user.id))
                    ? `\n**last command** ${daysAgo(await getLastCommand(user.id))} days ago`
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
