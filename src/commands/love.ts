import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { getMember } from "../utils/functions/member";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cache = new Map();

const cmd = new Command("love", "calculate your love with another person", Categories.FUN);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("is this person your one true love?!"));

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    let target1;
    let target2;

    if (args.length == 0) {
        if (!(message instanceof Message)) {
            await message.deferReply();
        }
        target1 = message.member;

        const members = [];
        const members1 = message.guild.members.cache;

        members1.forEach((m) => {
            if (!m.user.bot) {
                members.push(m.user.id);
            }
        });

        target2 = members[Math.floor(Math.random() * members.length)];

        target2 = await message.guild.members.fetch(target2);
    } else if (args.length == 1) {
        target1 = message.member;

        if (!message.mentions.members.first()) {
            target2 = await getMember(message.guild, args[0]);
        } else {
            target2 = message.mentions.members.first();
        }
    } else {
        if (message.mentions.members.size == 2) {
            target1 = message.mentions.members.first();

            target2 = message.mentions.members.get(Array.from(message.mentions.members.keys())[1]);
        } else if (message.mentions.members.size == 1) {
            if (args[0].startsWith("<@")) {
                target1 = message.mentions.members.first();

                target2 = await getMember(message.guild, args[1]);
            } else {
                target2 = message.mentions.members.first();

                target1 = await getMember(message.guild, args[0]);
            }
        } else if (message.mentions.members.size == 0) {
            target1 = await getMember(message.guild, args[0]);
            target2 = await getMember(message.guild, args[1]);
        } else {
            return send({ embeds: [new ErrorEmbed(`${prefix}love <user> (user)`)] });
        }
    }

    if (!target1 || !target2) {
        return send({ embeds: [new ErrorEmbed("invalid user(s)")] });
    }

    await addCooldown(cmd.name, message.member, 10);

    const combo = (parseInt(target1.user.id) + parseInt(target2.user.id)).toString();

    let lovePercent;

    if (cache.has(combo)) {
        lovePercent = cache.get(combo);
    } else {
        lovePercent = Math.ceil(Math.random() * 101) - 1;

        cache.set(combo, lovePercent);

        setTimeout(() => {
            cache.delete(combo);
        }, 60000);
    }

    let loveLevel;
    let loveEmoji;
    let loveBar = "";

    if (target1 == target2) {
        lovePercent = 0;
    }

    if (lovePercent == 100) {
        loveLevel = "perfect!!";
        loveEmoji = "💞👀🍆🍑";
    } else if (lovePercent == 69) {
        loveLevel = "ooo 69 hehe horny";
        loveEmoji = "🍆🍑💦😩";
    } else if (lovePercent > 90) {
        loveLevel = "perfect!!";
        loveEmoji = "💞👀";
    } else if (lovePercent > 75) {
        loveLevel = "amazing!!";
        loveEmoji = "💕";
    } else if (lovePercent > 55) {
        loveLevel = "good";
        loveEmoji = "💖";
    } else if (lovePercent > 40) {
        loveLevel = "okay";
        loveEmoji = "💝";
    } else if (lovePercent > 25) {
        loveLevel = "uhh..";
        loveEmoji = "❤";
    } else if (lovePercent < 5 && lovePercent != 0) {
        loveLevel = "alone forever";
        loveEmoji = "😭";
    } else if (lovePercent == 0) {
        loveLevel = "lol loner";
        loveEmoji = "😭";
    } else {
        loveLevel = "lets not talk about it..";
        loveEmoji = "💔";
    }

    const loveBarNum = Math.ceil(lovePercent / 10) * 10;

    if (loveBarNum == 100) {
        loveBar = "**❤❤❤❤❤❤❤❤❤**";
    } else if (loveBarNum > 90) {
        loveBar = "**❤❤❤❤❤❤❤❤❤** 💔";
    } else if (loveBarNum > 80) {
        loveBar = "**❤❤❤❤❤❤❤❤** 💔💔";
    } else if (loveBarNum > 70) {
        loveBar = "**❤❤❤❤❤❤❤** 💔💔💔";
    } else if (loveBarNum > 60) {
        loveBar = "**❤❤❤❤❤❤** 💔💔💔💔";
    } else if (loveBarNum > 50) {
        loveBar = "**❤❤❤❤❤** 💔💔💔💔💔";
    } else if (loveBarNum > 40) {
        loveBar = "**❤❤❤❤** 💔💔💔💔💔💔";
    } else if (loveBarNum > 30) {
        loveBar = "**❤❤❤** 💔💔💔💔💔💔💔";
    } else if (loveBarNum > 20) {
        loveBar = "**❤❤** 💔💔💔💔💔💔";
    } else if (loveBarNum > 10) {
        loveBar = "**❤** 💔💔💔💔💔💔💔";
    } else {
        loveBar = "💔💔💔💔💔💔💔💔💔💔";
    }

    const embed = new CustomEmbed(
        message.member,
        `${target1.user.username} **x** ${target2.user.username}\n\n${loveBar}\n**${lovePercent}**% **-** ${loveLevel} ${loveEmoji}`
    );

    send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
