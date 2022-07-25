import { CommandInteraction, GuildMember, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getMember } from "../utils/functions/member";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const cache = new Map<string, number>();

const cmd = new Command("gay", "very accurate gay level calculator", Categories.FUN).setAliases(["howgay", "lgbtdetector"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are u gay"));

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

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
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

    let gayAmount;

    if (cache.has(member.user.id)) {
        gayAmount = cache.get(member.user.id);
    } else {
        gayAmount = Math.ceil(Math.random() * 101) - 1;

        cache.set(member.user.id, gayAmount);

        setTimeout(() => {
            cache.delete(member.user.id);
        }, 60 * 1000);
    }

    let gayText = "";
    let gayEmoji = "";

    if (gayAmount >= 70) {
        gayEmoji = ":rainbow_flag:";
        gayText = "dam hmu 😏";
    } else if (gayAmount >= 45) {
        gayEmoji = "🌈";
        gayText = "good enough 😉";
    } else if (gayAmount >= 20) {
        gayEmoji = "👫";
        gayText = "kinda straight 😐";
    } else {
        gayEmoji = "📏";
        gayText = "thought we coulda had smth 🙄";
    }

    const embed = new CustomEmbed(
        message.member,
        `${member.user.toString()}\n**${gayAmount}**% gay ${gayEmoji}\n${gayText}`
    ).setHeader("gay calculator", member.user.avatarURL());

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
