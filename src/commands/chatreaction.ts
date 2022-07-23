import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Channel,
    CommandInteraction,
    GuildMember,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageOptions,
    PermissionFlagsBits,
    TextChannel,
} from "discord.js";
import {
    createReactionProfile,
    createReactionStatsProfile,
    deleteStats,
    getBlacklisted,
    getReactionSettings,
    getReactionStats,
    getServerLeaderboard,
    getWordList,
    hasReactionProfile,
    hasReactionStatsProfile,
    setBlacklisted,
    startReaction,
    updateReactionSettings,
    updateWords,
} from "../utils/chatreactions/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { isPremium } from "../utils/premium/utils";

const cmd = new Command("chatreaction", "see who can type the fastest", Categories.FUN)
    .setAliases(["cr", "reaction"])
    .setDocs("https://docs.nypsi.xyz/chatreactions/");

cmd.slashEnabled = true;
cmd.slashData
    .addSubcommand((option) => option.setName("start").setDescription("start a chat reaction in the current channel"))
    .addSubcommand((option) => option.setName("stats").setDescription("view your chat reaction stats"))
    .addSubcommand((option) => option.setName("leaderboard").setDescription("view the chat reaction leaderboard"))
    .addSubcommandGroup((words) =>
        words
            .setName("words")
            .setDescription("add or remove words from the chat reactions word list")
            .addSubcommand((list) => list.setName("list").setDescription("show the current word list"))
            .addSubcommand((reset) => reset.setName("reset").setDescription("reset the word list back to default"))
            .addSubcommand((add) =>
                add
                    .setName("add")
                    .setDescription("add word")
                    .addStringOption((option) =>
                        option
                            .setName("word")
                            .setDescription("what word would you like to add to the word list")
                            .setRequired(true)
                    )
            )
            .addSubcommand((remove) =>
                remove
                    .setName("del")
                    .setDescription("remove word")
                    .addStringOption((option) =>
                        option
                            .setName("word")
                            .setDescription("what word would you like to remove from the word list")
                            .setRequired(true)
                    )
            )
    )
    .addSubcommandGroup((blacklist) =>
        blacklist
            .setName("blacklist")
            .setDescription("ban a user from chat reactions")
            .addSubcommand((list) => list.setName("list").setDescription("view currently blacklisted users"))
            .addSubcommand((add) =>
                add
                    .setName("add")
                    .setDescription("add a user to the blacklist")
                    .addUserOption((option) =>
                        option.setName("user").setDescription("user to be blacklisted").setRequired(true)
                    )
            )
            .addSubcommand((remove) =>
                remove
                    .setName("del")
                    .setDescription("remove a user from the blacklist")
                    .addUserOption((option) =>
                        option.setName("user").setDescription("user to remove from the blacklist").setRequired(true)
                    )
            )
    )
    .addSubcommandGroup((settings) =>
        settings
            .setName("settings")
            .setDescription("settings for chat reactions")
            .addSubcommand((view) => view.setName("view").setDescription("view the current configuration"))
            .addSubcommand((enable) =>
                enable.setName("enable").setDescription("enable chat reactions for the current channel")
            )
            .addSubcommand((disable) => disable.setName("disable").setDescription("disable chat reactions"))
            .addSubcommand((offset) =>
                offset
                    .setName("offset")
                    .setDescription("set a maximum offset to be used with the cooldown")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("maximum offset").setRequired(true)
                    )
            )
            .addSubcommand((length) =>
                length
                    .setName("length")
                    .setDescription("set the max time a chat reaction can last")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("amount of time a chat reaction can last").setRequired(true)
                    )
            )
            .addSubcommand((cooldown) =>
                cooldown
                    .setName("cooldown")
                    .setDescription("set the time between automatic chat reactions")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("time between chat reactions").setRequired(true)
                    )
            )
            .addSubcommand((channel) =>
                channel
                    .setName("channel")
                    .setDescription("add/remove a channel for automatic chat reactions")
                    .addChannelOption((option) =>
                        option
                            .setName("channel")
                            .setDescription("channel to add/remove from automatic starting")
                            .setRequired(true)
                    )
            )
    );

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if (!(await hasReactionProfile(message.guild))) await createReactionProfile(message.guild);
    if (!(await hasReactionStatsProfile(message.guild, message.member)))
        await createReactionStatsProfile(message.guild, message.member);

    const prefix = await getPrefix(message.guild);

    const helpCmd = () => {
        const embed = new CustomEmbed(message.member).setHeader("chat reactions");

        embed.setDescription(
            `${prefix}**cr start** *start a random chat reaction*\n` +
                `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
                `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
                `${prefix}**cr blacklist** *add/remove people to the blacklist*\n` +
                `${prefix}**cr stats** *view your chat reaction stats*\n` +
                `${prefix}**cr lb** *view the server leaderboard*`
        );

        return send({ embeds: [embed] });
    };

    const showStats = async () => {
        await addCooldown(cmd.name, message.member, 10);

        const embed = new CustomEmbed(message.member).setHeader(`${message.author.username}'s stats`);

        const stats = await getReactionStats(message.guild, message.member);

        embed.addField(
            "your stats",
            `first place **${stats.wins}**\nsecond place **${stats.secondPlace}**\nthird place **${stats.thirdPlace}**`
        );

        const blacklisted = await getBlacklisted(message.guild);

        if (blacklisted.indexOf(message.author.id) != -1) {
            embed.setFooter({ text: "you are blacklisted from chat reactions in this server" });
        }

        return send({ embeds: [embed] });
    };

    const showLeaderboard = async () => {
        await addCooldown(cmd.name, message.member, 10);

        const embed = new CustomEmbed(message.member).setHeader("chat reactions leaderboard");

        let amount = 3;

        if (parseInt(args[1])) {
            amount = parseInt(args[1]);

            if (amount > 10) {
                if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;
            }
        }

        const leaderboards = await getServerLeaderboard(message.guild, amount);

        if (leaderboards.get("wins")) {
            embed.addField("first place", leaderboards.get("wins"), true);
        }

        if (leaderboards.get("second")) {
            embed.addField("second place", leaderboards.get("second"), true);
        }

        if (leaderboards.get("third")) {
            embed.addField("third place", leaderboards.get("third"), true);
        }

        if (leaderboards.get("overall")) {
            embed.addField("overall", leaderboards.get("overall"));
        }

        return send({ embeds: [embed] });
    };

    if (args.length == 0) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return showStats();
        return helpCmd();
    } else if (args[0].toLowerCase() == "start") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (!(message.channel instanceof TextChannel)) {
            return send({ embeds: [new ErrorEmbed("this is an invalid channel")] });
        }
        const a = await startReaction(message.guild, message.channel);

        if (a == "xoxo69") {
            return send({
                embeds: [new ErrorEmbed("there is already a chat reaction in this channel")],
            });
        }
    } else if (args[0].toLowerCase() == "stats") {
        if (args.length == 2 && args[1].toLowerCase() == "reset") {
            if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                if (message.author.id != message.guild.ownerId) {
                    return send({
                        embeds: [new ErrorEmbed("you need the to be the server owner for this command")],
                    });
                }
                await deleteStats(message.guild);

                return send({
                    embeds: [new CustomEmbed(message.member, "✅ stats have been deleted")],
                });
            }
        }
        return showStats();
    } else if (args[0].toLowerCase() == "leaderboard" || args[0].toLowerCase() == "lb" || args[0].toLowerCase() == "top") {
        return showLeaderboard();
    } else if (args[0].toLowerCase() == "blacklist" || args[0].toLowerCase() == "bl") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            });
        }

        if (args.length == 1 || args[1].toLowerCase() == "list") {
            const embed = new CustomEmbed(message.member).setHeader("chat reactions");

            const blacklisted = await getBlacklisted(message.guild);

            if (blacklisted.length == 0) {
                embed.setDescription("❌ no blacklisted users");
            } else {
                embed.setDescription(`\`${blacklisted.join("`\n`")}\``);
            }

            embed.setFooter({ text: `use ${prefix}cr blacklist (add/del/+/-) to edit blacklisted users` });

            return send({ embeds: [embed] });
        } else {
            if (args[1].toLowerCase() == "add" || args[1] == "+") {
                if (args.length == 2) {
                    return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist add/+ @user`)] });
                }

                let user: string | GuildMember = args[2];

                if (user.length != 18) {
                    if (!message.mentions.members.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name"
                                ),
                            ],
                        });
                    } else {
                        user = message.mentions.members.first();
                    }
                } else {
                    user = await message.guild.members.fetch(user);
                }

                if (!user) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                const blacklisted = await getBlacklisted(message.guild);

                if (blacklisted.length >= 75) {
                    return send({
                        embeds: [new ErrorEmbed("you have reached the maximum amount of blacklisted users (75)")],
                    });
                }

                blacklisted.push(user.id);

                await setBlacklisted(message.guild, blacklisted);

                const embed = new CustomEmbed(message.member, `✅ ${user.toString()} has been blacklisted`);

                return send({ embeds: [embed] });
            } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
                if (args.length == 2) {
                    return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist del/- @user`)] });
                }

                let user = args[2];

                if (user.length != 18) {
                    if (!message.mentions.members.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name"
                                ),
                            ],
                        });
                    } else {
                        user = message.mentions.members.first().id;
                    }
                }

                if (!user) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                const blacklisted = await getBlacklisted(message.guild);

                if (blacklisted.indexOf(user) == -1) {
                    return send({ embeds: [new ErrorEmbed("this user is not blacklisted")] });
                }

                blacklisted.splice(blacklisted.indexOf(user), 1);

                await setBlacklisted(message.guild, blacklisted);

                return send({
                    embeds: [new CustomEmbed(message.member, "✅ user has been unblacklisted")],
                });
            } else if (args[1].toLowerCase() == "reset" || args[1].toLowerCase() == "empty") {
                await setBlacklisted(message.guild, []);

                return send({
                    embeds: [new CustomEmbed(message.member, "✅ blacklist was emptied")],
                });
            }
        }
    } else if (args[0].toLowerCase() == "settings") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            });
        }

        if (args.length == 1 || args[1].toLowerCase() == "view") {
            const embed = new CustomEmbed(message.member);

            embed.setHeader("chat reactions");

            const settings = await getReactionSettings(message.guild);

            let channels;

            if (settings.randomChannels.length == 0) {
                channels = "none";
            } else {
                channels = settings.randomChannels.join("` `");
            }

            embed.setDescription(
                `**automatic start** \`${settings.randomStart}\`\n` +
                    `**random channels** \`${channels}\`\n` +
                    `**time between events** \`${settings.betweenEvents}s\`\n` +
                    `**max offset** \`${settings.randomModifier}s\`\n` +
                    `**max game length** \`${settings.timeout}s\``
            );

            embed.setFooter({ text: `use ${prefix}cr settings help to change this settings` });

            return send({ embeds: [embed] });
        } else if (args.length == 2) {
            if (args[1].toLowerCase() == "help") {
                const embed = new CustomEmbed(message.member);

                embed.setHeader("chat reactions");

                embed.setDescription(
                    `${prefix}**cr settings enable** *enable automatic starting*\n` +
                        `${prefix}**cr settings disable** *disable automatic starting*\n` +
                        `${prefix}**cr settings channel <channel>** *add/remove channels to be used for automatic starting*\n` +
                        `${prefix}**cr settings cooldown <seconds>** *set the time between automatic chat reactions*\n` +
                        `${prefix}**cr settings offset <seconds>** *set a maximum offset to be used with the cooldown*\n` +
                        `${prefix}**cr settings length <seconds>** *set a maximum game length*`
                );

                return send({ embeds: [embed] });
            } else if (args[1].toLowerCase() == "enable") {
                const settings = await getReactionSettings(message.guild);

                if (settings.randomStart) {
                    return send({ embeds: [new ErrorEmbed("already enabled")] });
                }

                settings.randomStart = true;

                if (settings.randomChannels.length == 0) {
                    settings.randomChannels.push(message.channel.id);
                }

                await updateReactionSettings(message.guild, settings);

                return send({
                    embeds: [new CustomEmbed(message.member, "✅ automatic start has been enabled")],
                });
            } else if (args[1].toLowerCase() == "disable") {
                const settings = await getReactionSettings(message.guild);

                if (!settings.randomStart) {
                    return send({ embeds: [new ErrorEmbed("already disabled")] });
                }

                settings.randomStart = false;

                await updateReactionSettings(message.guild, settings);

                return send({
                    embeds: [new CustomEmbed(message.member, "✅ automatic start has been disabled")],
                });
            } else if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name"
                        ),
                    ],
                });
            } else if (args[1].toLowerCase() == "cooldown") {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr settings cooldown <number>`)],
                });
            } else if (args[1].toLowerCase() == "offset") {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings offset <number>`)] });
            } else if (args[1].toLowerCase() == "length") {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings length <number>`)] });
            } else {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] });
            }
        } else if (args.length == 3) {
            if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
                let channel: string | Channel = args[2];

                if (channel.length != 18) {
                    if (!message.mentions.channels.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name\nto remove a channel, simply mention a channel or use an id of a channel that is already selected as a random channel"
                                ),
                            ],
                        });
                    } else {
                        channel = message.mentions.channels.first();
                    }
                } else {
                    channel = message.guild.channels.cache.find((ch) => ch.id == channel);
                }

                if (!channel) {
                    return send({ embeds: [new ErrorEmbed("invalid channel")] });
                }

                if (!channel.isTextBased()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

                if (channel.isDMBased()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

                if (channel.isThread()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

                const settings = await getReactionSettings(message.guild);

                let added = false;
                let max = 1;

                if (await isPremium(message.author.id)) {
                    max = 5;
                }

                if (settings.randomChannels.indexOf(channel.id) != -1) {
                    settings.randomChannels.splice(settings.randomChannels.indexOf(channel.id), 1);
                } else {
                    if (settings.randomChannels.length >= max) {
                        const embed = new ErrorEmbed(
                            `you have reached the maximum amount of random channels (${max})\nyou can subscribe on [patreon](https://patreon.com/nypsi) to have more`
                        );

                        if (max > 1) {
                            embed.setDescription(`you have reached the maximum amount of random channels (${max})`);
                        }

                        return send({ embeds: [embed] });
                    }
                    settings.randomChannels.push(channel.id);
                    added = true;
                }

                if (settings.randomChannels.length == 0) {
                    settings.randomStart = false;
                }

                await updateReactionSettings(message.guild, settings);

                const embed = new CustomEmbed(message.member);

                if (added) {
                    embed.setDescription(`${channel.name} has been added as a random channel`);
                } else {
                    embed.setDescription(`${channel.name} has been removed`);
                }

                return send({ embeds: [embed] });
            } else if (args[1].toLowerCase() == "cooldown") {
                const length = parseInt(args[2]);

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    });
                }

                if (length > 900) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] });
                }

                if (length < 120) {
                    return send({
                        embeds: [new ErrorEmbed("cannot be shorter than 120 seconds")],
                    });
                }

                const settings = await getReactionSettings(message.guild);

                settings.betweenEvents = length;

                await updateReactionSettings(message.guild, settings);

                return send({
                    embeds: [new CustomEmbed(message.member, `✅ event cooldown set to \`${length}s\``)],
                });
            } else if (args[1].toLowerCase() == "offset") {
                let length = parseInt(args[2]);

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    });
                }

                if (length > 900) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] });
                }

                if (length < 0) {
                    length = 0;
                }

                const settings = await getReactionSettings(message.guild);

                settings.randomModifier = length;

                await updateReactionSettings(message.guild, settings);

                return send({
                    embeds: [new CustomEmbed(message.member, `✅ cooldown max offset set to \`${length}s\``)],
                });
            } else if (args[1].toLowerCase() == "length") {
                const length = parseInt(args[2]);

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    });
                }

                if (length > 120) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 120 seconds")] });
                }

                if (length < 30) {
                    return send({ embeds: [new ErrorEmbed("cannot be shorter than 30 seconds")] });
                }

                const settings = await getReactionSettings(message.guild);

                settings.timeout = length;

                await updateReactionSettings(message.guild, settings);

                return send({
                    embeds: [new CustomEmbed(message.member, `✅ max length set to \`${length}s\``)],
                });
            } else {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] });
            }
        }
    } else if (args[0].toLowerCase() == "words" || args[0].toLowerCase() == "word") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            });
        }

        if (args.length == 1) {
            const embed = new CustomEmbed(message.member).setHeader("chat reactions");

            embed.setDescription(
                `${prefix}**cr words list** *view the current wordlist*\n` +
                    `${prefix}**cr words add/+ <word/sentence>** *add a word or sentence to the wordlist*\n` +
                    `${prefix}**cr words del/- <word/sentence>** *remove a word or sentence from the wordlist*\n` +
                    `${prefix}**cr words reset** *delete the custom word list and use the [default list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)*`
            );

            return send({ embeds: [embed] });
        } else if (args[1].toLowerCase() == "add" || args[1] == "+") {
            if (args.length == 2) {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
                });
            }

            const words = await getWordList(message.guild);

            const phrase = args.slice(2, args.length).join(" ");

            if (phrase == "" || phrase == " ") {
                return send({ embeds: [new ErrorEmbed("invalid phrase")] });
            }

            if (words.indexOf(phrase) != -1) {
                return send({
                    embeds: [new ErrorEmbed(`\`${phrase}\` already exists in the word list`)],
                });
            }

            let maxSize = 100;

            if (await isPremium(message.author.id)) {
                maxSize = 200;
            }

            if (words.length >= maxSize) {
                const error = new ErrorEmbed(`wordlist is at max size (${maxSize})`);

                if (maxSize == 100) {
                    error.setFooter({ text: "become a patreon ($patreon) to double this limit" });
                }

                return send({ embeds: [error] });
            }

            if (phrase.length >= 150) {
                return send({
                    embeds: [new ErrorEmbed("phrase is too long (150 characters max)")],
                });
            }

            words.push(phrase);

            await updateWords(message.guild, words);

            return send({
                embeds: [new CustomEmbed(message.member, `✅ added \`${phrase}\` to wordlist`)],
            });
        } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
            if (args.length == 2) {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
                });
            }

            const words = await getWordList(message.guild);

            const phrase = args.slice(2, args.length).join(" ");

            if (words.indexOf(phrase) == -1) {
                return send({
                    embeds: [new ErrorEmbed(`\`${phrase}\` doesn't exist in the word list`)],
                });
            }

            words.splice(words.indexOf(phrase), 1);

            await updateWords(message.guild, words);

            return send({
                embeds: [new CustomEmbed(message.member, `✅ removed \`${phrase}\` from wordlist`)],
            });
        } else if (args[1].toLowerCase() == "reset") {
            await updateWords(message.guild, []);

            return send({
                embeds: [new CustomEmbed(message.member, "✅ wordlist has been reset")],
            });
        } else if (args[1].toLowerCase() == "list") {
            const words = await getWordList(message.guild);

            const embed = new CustomEmbed(message.member);

            if (words.length == 0) {
                embed.setDescription(
                    "using [default word list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)"
                );
                embed.setHeader("chat reactions");
            } else {
                const pages = new Map<number, string[]>();

                for (const word of words) {
                    if (pages.size == 0) {
                        pages.set(1, [`\`${word}\``]);
                    } else if (pages.get(pages.size).length >= 10) {
                        pages.set(pages.size + 1, [`\`${word}\``]);
                    } else {
                        const d = pages.get(pages.size);

                        d.push(`\`${word}\``);

                        pages.set(pages.size, d);
                    }
                }

                embed.setHeader(`word list [${words.length}]`);
                embed.setDescription(`${pages.get(1).join("\n")}`);
                embed.setFooter({ text: `page 1/${pages.size}` });

                if (pages.size > 1) {
                    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
                    );
                    const msg = await send({ embeds: [embed], components: [row] });

                    let currentPage = 1;
                    const lastPage = pages.size;

                    const filter = (i: Interaction) => i.user.id == message.author.id;

                    const edit = async (data: MessageEditOptions, msg: Message) => {
                        if (!(message instanceof Message)) {
                            await message.editReply(data);
                            return await message.fetchReply();
                        } else {
                            return await msg.edit(data);
                        }
                    };

                    const pageManager = async (): Promise<void> => {
                        const reaction = await msg
                            .awaitMessageComponent({ filter, time: 30000 })
                            .then(async (collected) => {
                                await collected.deferUpdate();
                                return collected.customId;
                            })
                            .catch(async () => {
                                await edit({ components: [] }, msg);
                            });

                        if (!reaction) return;

                        if (reaction == "⬅") {
                            if (currentPage <= 1) {
                                return pageManager();
                            } else {
                                currentPage--;
                                embed.setDescription(pages.get(currentPage).join("\n"));
                                embed.setFooter({ text: "page " + currentPage + "/" + lastPage });

                                if (currentPage == 1) {
                                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(true),
                                        new ButtonBuilder()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false)
                                    );
                                } else {
                                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false),
                                        new ButtonBuilder()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false)
                                    );
                                }

                                await edit({ embeds: [embed], components: [row] }, msg);
                                return pageManager();
                            }
                        } else if (reaction == "➡") {
                            if (currentPage >= lastPage) {
                                return pageManager();
                            } else {
                                currentPage++;
                                embed.setDescription(pages.get(currentPage).join("\n"));
                                embed.setFooter({ text: "page " + currentPage + "/" + lastPage });

                                if (currentPage == lastPage) {
                                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false),
                                        new ButtonBuilder()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(true)
                                    );
                                } else {
                                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false),
                                        new ButtonBuilder()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle(ButtonStyle.Primary)
                                            .setDisabled(false)
                                    );
                                }

                                await edit({ embeds: [embed], components: [row] }, msg);
                                return pageManager();
                            }
                        }
                    };
                    return pageManager();
                }
            }

            return send({ embeds: [embed] });
        }
    }
}

cmd.setRun(run);

module.exports = cmd;
