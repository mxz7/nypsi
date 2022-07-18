import { EconomyGuild, EconomyGuildMember, User } from "@prisma/client";
import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageOptions,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    MessageEditOptions,
    Interaction,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    addMember,
    addToGuildBank,
    createGuild,
    createUser,
    deleteGuild,
    formatNumber,
    getBalance,
    getGuildByName,
    getGuildByUser,
    getMaxMembersForGuild,
    getPrestige,
    getRequiredForGuildUpgrade,
    isEcoBanned,
    removeMember,
    RemoveMemberMode,
    setGuildMOTD,
    topGuilds,
    updateBalance,
    userExists,
} from "../utils/economy/utils";
import { daysAgo, formatDate } from "../utils/functions/date";
import { cleanString } from "../utils/functions/string";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("guild", "create and manage your guild/clan", Categories.MONEY).setAliases(["g", "clan"]);

cmd.slashEnabled = true;

cmd.slashData
    .addSubcommand((create) =>
        create
            .setName("create")
            .setDescription("create a guild")
            .addStringOption((option) => option.setName("name").setDescription("name of the guild").setRequired(true))
    )
    .addSubcommand((invite) =>
        invite
            .setName("invite")
            .setDescription("invite a member to your guild")
            .addUserOption((option) =>
                option.setName("member").setDescription("member to invite to the guild").setRequired(true)
            )
    )
    .addSubcommand((leave) => leave.setName("leave").setDescription("leave your current guild"))
    .addSubcommand((deleteOpt) => deleteOpt.setName("delete").setDescription("delete your current guild"))
    .addSubcommand((kick) =>
        kick
            .setName("kick")
            .setDescription("kick a member from your guild")
            .addUserOption((option) =>
                option.setName("member").setDescription("member to kick from the guild").setRequired(true)
            )
    )
    .addSubcommand((deposit) =>
        deposit
            .setName("deposit")
            .setDescription("deposit money into the guild")
            .addIntegerOption((option) =>
                option.setName("amount").setDescription("amount to deposit into the guild").setRequired(true)
            )
    )
    .addSubcommand((stats) => stats.setName("stats").setDescription("view stats for the guild members"))
    .addSubcommand((upgrade) =>
        upgrade.setName("upgrade").setDescription("view the requirements for the next guild upgrade")
    )
    .addSubcommand((motd) =>
        motd
            .setName("motd")
            .setDescription("set the motd for the guild")
            .addStringOption((option) => option.setName("text").setDescription("text for the motd").setRequired(true))
    )
    .addSubcommand((top) => top.setName("top").setDescription("view the top guilds"));

const filter = ["nig", "fag", "queer", "delete", "inv", "create", "leave", "stats", "top", "hitler", "kick", "forcekick"];

const invited: Set<string> = new Set();

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!(await userExists(message.member))) await createUser(message.member);

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data).catch(() => {});
            return await message.fetchReply();
        } else {
            return await msg.edit(data).catch(() => {});
        }
    };

    const showGuild = async (
        guild: EconomyGuild & {
            owner: User;
            members: (EconomyGuildMember & {
                user: {
                    lastKnownTag: string;
                };
            })[];
        }
    ) => {
        await addCooldown(cmd.name, message.member, 5);
        const embed = new CustomEmbed(message.member);

        if (!guild) {
            embed.setDescription(
                `you are not in a guild. you can create one with ${prefix}guild create or join one if you have been invited`
            );
        } else {
            embed.setHeader(guild.guildName, message.author.avatarURL());
            // embed.setDescription(guild.motd + `\n\n**bank** $${guild.balance.toLocaleString()}\n**xp** ${guild.xp.toLocaleString()}`)
            embed.setDescription(guild.motd);
            embed.addField(
                "info",
                `**level** ${guild.level}\n` +
                    `**created on** ${formatDate(guild.createdAt)}\n` +
                    `**owner** ${guild.owner.lastKnownTag}`,
                true
            );
            if (guild.level != 5) {
                embed.addField(
                    "bank",
                    `**money** $${guild.balance.toLocaleString()}\n**xp** ${guild.xp.toLocaleString()}`,
                    true
                );
            }

            let membersText = "";
            const maxMembers = await getMaxMembersForGuild(guild.guildName);

            for (const m of guild.members) {
                membersText += `\`${m.user.lastKnownTag}\` `;

                if (m.userId == message.author.id) {
                    embed.setFooter({ text: `you joined ${daysAgo(m.joinedAt).toLocaleString()} days ago` });
                }
            }

            embed.addField(`members [${guild.members.length}/${maxMembers}]`, membersText);
        }

        return send({ embeds: [embed] });
    };

    const guild = await getGuildByUser(message.member);
    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return showGuild(guild);
    }

    if (args[0].toLowerCase() == "create") {
        if ((await getPrestige(message.member)) < 1) {
            return send({ embeds: [new ErrorEmbed("you must be atleast prestige **1** to create a guild")] });
        }

        if ((await getBalance(message.member)) < 500000) {
            return send({ embeds: [new ErrorEmbed("it costs $500,000 to create a guild. you cannot afford this")] });
        }

        if (guild) {
            return send({
                embeds: [new ErrorEmbed("you are already in a guild, you must leave this guild to create your own")],
            });
        }

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild create <name>`)] });
        }

        args.shift();

        const name = args.join(" ").normalize("NFD");

        if (name.length > 25) {
            return send({ embeds: [new ErrorEmbed("guild names must be shorter than 25 characters")] });
        }

        if ((await getGuildByName(name))?.guildName.toLowerCase() == name.toLowerCase()) {
            return send({ embeds: [new ErrorEmbed("that guild already exists")] });
        }

        for (const word of filter) {
            if (cleanString(name).toLowerCase().includes(word)) {
                return send({ embeds: [new ErrorEmbed("invalid guild name")] });
            }
        }

        await addCooldown(cmd.name, message.member, 3);

        await updateBalance(message.member, (await getBalance(message.member)) - 500000);

        await createGuild(name, message.member);

        return send({ embeds: [new CustomEmbed(message.member, `you are now the owner of **${name}**`)] });
    }

    if (args[0].toLowerCase() == "invite" || args[0].toLowerCase() == "add" || args[0].toLowerCase() == "inv") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you must be the owner of a guild to invite members")] });
        }

        if (guild.ownerId != message.author.id) {
            return send({ embeds: [new ErrorEmbed("you must be the owner of a guild to invite members")] });
        }

        if (guild.members.length >= (await getMaxMembersForGuild(guild.guildName))) {
            let msg = "your guild already has the max amount of members";

            if (guild.level != 5) {
                msg += `. use ${prefix}guild upgrade to increase this`;
            }

            return send({ embeds: [new ErrorEmbed(msg)] });
        }

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild invite <@member>`)] });
        }

        if (!message.mentions?.members?.first()) {
            return send({ embeds: [new ErrorEmbed("you must tag the member you want to invite")] });
        }

        const target = message.mentions.members.first();

        if (invited.has(target.user.id)) {
            return send({ embeds: [new ErrorEmbed("this user has already been invited to a guild")] });
        }

        if (await isEcoBanned(target.user.id)) {
            return send({ embeds: [new ErrorEmbed("invalid user")] });
        }

        if (!(await userExists(target.user.id))) {
            return send({ embeds: [new ErrorEmbed("invalid user")] });
        }

        if (await getGuildByUser(target)) {
            return send({ embeds: [new ErrorEmbed("that user is already in a guild")] });
        }

        await addCooldown(cmd.name, message.member, 15);

        invited.add(target.user.id);

        const embed = new CustomEmbed(message.member);

        embed.setHeader("guild invitation");
        embed.setDescription(`you have been invited to join **${guild.guildName}**\n\ndo you accept?`);

        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("yes").setLabel("accept").setStyle(ButtonStyle.Success)
        );

        const msg = await message.channel
            .send({ content: target.toString(), embeds: [embed], components: [row] })
            .catch(() => {
                invited.delete(target.user.id);
            });

        const filter = (i: Interaction) => i.user.id == target.user.id;
        let fail = false;

        if (!msg) return;

        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
            })
            .catch(async () => {
                await edit({ components: [] }, msg).catch(() => {});
                fail = true;
                invited.delete(target.user.id);
            });

        if (fail) return;

        if (reaction == "yes") {
            const targetGuild = await getGuildByUser(target.user.id);
            const refreshedGuild = await getGuildByName(guild.guildName);

            if (targetGuild) {
                embed.setDescription("❌ you are already in a guild");
            } else if (refreshedGuild.members.length >= (await getMaxMembersForGuild(refreshedGuild.guildName))) {
                embed.setDescription("❌ this guild has too many members");
            } else {
                await addMember(guild.guildName, target);
                embed.setDescription(`you have successfully joined **${guild.guildName}**`);
            }
        } else {
            embed.setDescription("invitation denied");
        }

        return edit({ embeds: [embed], components: [] }, msg);
    }

    if (args[0].toLowerCase() == "leave" || args[0].toLowerCase() == "exit") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (guild.ownerId == message.author.id) {
            return send({ embeds: [new ErrorEmbed("you are the guild owner, you must delete the guild")] });
        }

        await addCooldown(cmd.name, message.member, 20);

        const res = await removeMember(message.author.id, RemoveMemberMode.ID);

        if (res) {
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, `✅ you have left **${guild.guildName}**`)],
            });
        } else {
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, "failed while leaving guild")],
            });
        }
    }

    if (args[0].toLowerCase() == "forcekick") {
        if (message.author.id != "672793821850894347") return;

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild kick <tag>`)] });
        }

        return await removeMember(args[1], RemoveMemberMode.ID);
    }

    if (args[0].toLowerCase() == "kick") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (guild.ownerId != message.author.id) {
            return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
        }

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild kick <tag>`)] });
        }

        let target: string;
        let mode = RemoveMemberMode.ID;

        if (message.mentions?.members?.first()) {
            let found = false;
            for (const m of guild.members) {
                if (m.userId == message.mentions.members.first().user.id) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                return send({
                    embeds: [
                        new ErrorEmbed(`\`${message.mentions.members.first().user.tag}\` is not in **${guild.guildName}**`),
                    ],
                });
            }

            target = message.mentions.members.first().user.id;
        } else {
            let found = false;
            for (const m of guild.members) {
                if (m.userId == args[1]) {
                    found = true;
                    mode = RemoveMemberMode.ID;
                    break;
                } else if (m.user.lastKnownTag == args[1]) {
                    found = true;
                    mode = RemoveMemberMode.TAG;
                    break;
                }
            }

            if (!found) {
                return send({ embeds: [new ErrorEmbed(`\`${args[1]}\` is not in **${guild.guildName}**`)] });
            }

            target = args[1];
        }

        await addCooldown(cmd.name, message.member, 10);

        const res = await removeMember(target, mode);

        if (res) {
            return send({
                embeds: [new CustomEmbed(message.member, `✅ \`${target}\` has been kicked from **${guild.guildName}**`)],
            });
        } else {
            return send({
                embeds: [new CustomEmbed(message.member, `failed to kick ${target}`)],
            });
        }
    }

    if (args[0].toLowerCase() == "delete") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (guild.ownerId != message.author.id) {
            return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
        }

        await addCooldown(cmd.name, message.member, 30);

        await deleteGuild(guild.guildName);

        return send({ embeds: [new CustomEmbed(message.member, `✅ **${guild.guildName}** has been deleted`)] });
    }

    if (args[0].toLowerCase() == "deposit" || args[0].toLowerCase() == "dep") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild dep <amount>`)] });
        }

        if (args[1].toLowerCase() == "all") {
            args[1] = (await getBalance(message.member)).toString();
        } else if (args[1].toLowerCase() == "half") {
            args[1] = ((await getBalance(message.member)) / 2).toString();
        }

        const amount = formatNumber(args[1]);

        if (!amount) {
            return send({ embeds: [new ErrorEmbed("invalid payment")] });
        }

        if (amount > (await getBalance(message.member))) {
            return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
        }

        if (amount <= 0) {
            return send({ embeds: [new ErrorEmbed("invalid payment")] });
        }

        await updateBalance(message.member, (await getBalance(message.member)) - amount);

        await addToGuildBank(guild.guildName, amount, message.member);

        const embed = new CustomEmbed(message.member).setHeader("guild deposit", message.author.avatarURL());

        embed.setDescription(`$**${guild.balance.toLocaleString()}**\n  +$**${amount.toLocaleString()}**`);

        const msg = await send({ embeds: [embed] });

        embed.setDescription(`$**${(guild.balance + amount).toLocaleString()}**`);

        return setTimeout(() => {
            edit({ embeds: [embed] }, msg);
        }, 1500);
    }

    if (args[0].toLowerCase() == "stats") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        await addCooldown(cmd.name, message.member, 10);

        const members = guild.members;

        inPlaceSort(members).desc([(i) => i.contributedMoney, (i) => i.contributedXp]);

        const embed = new CustomEmbed(message.member).setHeader(`${guild.guildName} stats`, message.author.avatarURL());

        let desc = "";

        for (const m of members) {
            let position: number | string = members.indexOf(m) + 1;

            if (position == 1) position = "🥇";
            if (position == 2) position = "🥈";
            if (position == 3) position = "🥉";

            desc += `${position} **${
                m.user.lastKnownTag
            }** $${m.contributedMoney.toLocaleString()} **|** ${m.contributedXp.toLocaleString()}xp\n`;
        }

        embed.setDescription(desc);

        return send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "upgrade") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (guild.level == 5) {
            return send({ embeds: [new CustomEmbed(message.member, `**${guild.guildName}** is at max level`)] });
        }

        await addCooldown(cmd.name, message.member, 3);

        const requirements = await getRequiredForGuildUpgrade(guild.guildName);

        const embed = new CustomEmbed(message.member);

        embed.setHeader(guild.guildName, message.author.avatarURL());
        embed.setDescription(
            `requirements to upgrade to level **${guild.level + 1}**:\n\n` +
                `**money** $${guild.balance.toLocaleString()}/$${requirements.money.toLocaleString()}\n` +
                `**xp** ${guild.xp.toLocaleString()}xp/${requirements.xp.toLocaleString()}xp\n\n` +
                "note: the upgrade will be handled automatically when all requirements are met"
        );

        return send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "motd") {
        if (!guild) {
            return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
        }

        if (guild.ownerId != message.author.id) {
            return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
        }

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed(`${prefix}guild motd <new motd>`)] });
        }

        args.shift();

        const motd = args.join(" ").normalize("NFD");

        if (motd.length > 500) {
            return send({ embeds: [new ErrorEmbed("guild motd cannot be longer than 500 characters")] });
        }

        for (const word of filter) {
            if (cleanString(motd).toLowerCase().includes(word))
                return send({ embeds: [new ErrorEmbed("invalid guild motd")] });
        }

        await addCooldown(cmd.name, message.member, 3);

        await setGuildMOTD(guild.guildName, motd);

        return send({ embeds: [new CustomEmbed(message.member, "✅ motd has been updated")] });
    }

    if (args[0].toLowerCase() == "top") {
        await addCooldown(cmd.name, message.member, 15);

        let limit = 5;

        if (!isNaN(parseInt(args[1]))) {
            limit = parseInt(args[1]);
        }

        const top = await topGuilds(limit);

        const embed = new CustomEmbed(message.member).setHeader(`top ${args[1] ?? 5} guilds`, message.author.avatarURL());

        embed.setDescription(top.join("\n"));

        return send({ embeds: [embed] });
    }

    const name = args.join(" ");

    if (name.length > 25) {
        return send({ embeds: [new ErrorEmbed("invalid guild")] });
    }

    await addCooldown(cmd.name, message.member, 7);

    const targetGuild = await getGuildByName(name);

    if (!targetGuild) {
        return send({ embeds: [new ErrorEmbed("invalid guild")] });
    }

    return showGuild(targetGuild);
}

cmd.setRun(run);

module.exports = cmd;
