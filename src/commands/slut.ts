import { CommandInteraction, GuildMember, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cache = new Map();

const cmd = new Command("slut", "measure how much of a slut you are", Categories.FUN).setAliases([
    "howslut",
    "whore",
    "cumslut",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are you slutty 😳"));

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

    let slutAmount;

    if (cache.has(member.user.id)) {
        slutAmount = cache.get(member.user.id);
    } else {
        slutAmount = Math.ceil(Math.random() * 101) - 1;

        cache.set(member.user.id, slutAmount);

        setTimeout(() => {
            cache.delete(member.user.id);
        }, 60 * 1000);
    }

    let slutText = "";
    let slutEmoji = "";

    if (slutAmount >= 95) {
        slutEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
        slutText = "whore ass hooker cumslut cousin fucker sweet home alabama";
    } else if (slutAmount >= 80) {
        slutEmoji = "🍆🍒🍑😈 👉👌";
        slutText = "pornhub and onlyfans is your family business";
    } else if (slutAmount >= 60) {
        slutEmoji = "🍆👉👌💦";
        slutText = "took 12 loads in one sitting";
    } else if (slutAmount >= 45) {
        slutEmoji = "👉👌💦";
        slutText = "princess cumslut";
    } else if (slutAmount >= 35) {
        slutEmoji = "🍆✊";
        slutText = "you would fuck anyone";
    } else if (slutAmount >= 25) {
        slutEmoji = "🍆🧎‍♂️";
        slutText = "still a whore";
    } else if (slutAmount >= 15) {
        slutEmoji = "🍑";
        slutText = "average 🙄";
    } else {
        slutEmoji = "🤐";
        slutText = "virgin";
    }

    const embed = new CustomEmbed(
        message.member,
        `${member.user.toString()}\n**${slutAmount}**% slut ${slutEmoji}\n${slutText}`
    ).setTitle("slut calculator");

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
