import { CommandInteraction, GuildMember, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getMember } from "../utils/functions/member";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cache = new Map<string, number>();

const cmd = new Command("horny", "measure how horny you are", Categories.FUN).setAliases([
    "howhorny",
    "fuckmedaddy",
    "makemecum",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how horny are u"));

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

    await addCooldown(cmd.name, message.member, 7);

    let member: GuildMember;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args[0]);
        } else {
            member = message.mentions.members.first();
        }

        if (!member) {
            return send({ embeds: [new ErrorEmbed("invalid user")] });
        }
    }

    let hornyAmount;

    if (cache.has(member.user.id)) {
        hornyAmount = cache.get(member.user.id);
    } else {
        hornyAmount = Math.ceil(Math.random() * 101) - 1;

        cache.set(member.user.id, hornyAmount);

        setTimeout(() => {
            cache.delete(member.user.id);
        }, 60 * 1000);
    }

    let hornyText = "";
    let hornyEmoji = "";

    if (hornyAmount >= 95) {
        hornyEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
        hornyText = "FUCK ME NOW. DADDY.";
    } else if (hornyAmount >= 80) {
        hornyEmoji = "🍆💦🤤";
        hornyText = "hey let me help you pleaseeee";
    } else if (hornyAmount >= 60) {
        hornyEmoji = "🍆✊ 😼👈";
        hornyText = "hehe u kinda turning me on";
    } else if (hornyAmount >= 45) {
        hornyEmoji = "😏🍆";
        hornyText = "i see your incognito tab";
    } else if (hornyAmount >= 35) {
        hornyEmoji = "👉👌";
        hornyText = "dirty thoughts";
    } else if (hornyAmount >= 25) {
        hornyEmoji = "🍆";
        hornyText = "hehe u can do better than that";
    } else if (hornyAmount >= 15) {
        hornyEmoji = "😐";
        hornyText = "cum on man.";
    } else {
        hornyEmoji = "🙄";
        hornyText = "ur so innocent. boring.";
    }

    const embed = new CustomEmbed(
        message.member,
        `${member.user.toString()}\n**${hornyAmount}**% horny ${hornyEmoji}\n${hornyText}`
    ).setHeader("horny calculator", member.user.avatarURL());

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
