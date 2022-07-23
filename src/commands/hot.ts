import { CommandInteraction, GuildMember, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { createUser, getBalance, updateBalance, userExists } from "../utils/economy/utils";
import { getMember } from "../utils/functions/member";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cache = new Map<string, number>();

const cmd = new Command("hot", "measure how hot you are", Categories.FUN).setAliases(["howhot", "sexy"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("hot or not"));

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

    if (!(await userExists(member))) await createUser(member);

    let hotAmount;

    if (cache.has(member.user.id)) {
        hotAmount = cache.get(member.user.id);
    } else {
        hotAmount = Math.ceil(Math.random() * 101) - 1;

        cache.set(member.user.id, hotAmount);

        setTimeout(() => {
            cache.delete(member.user.id);
        }, 60 * 1000);
    }

    let hotText = "";
    let hotEmoji = "";

    if (hotAmount >= 95) {
        hotEmoji = "💰🍆💪😍😘";
        hotText =
            "HEY THERE what does it take to marry you. look. ill give you money. here. ive got big muscles too. im 6'2. please.";

        if (cache.has(member.user.id)) {
            cache.delete(member.user.id);
            await updateBalance(member, (await getBalance(member)) + 1069);
        }
    } else if (hotAmount >= 80) {
        hotEmoji = "💍😍";
        hotText = "marry me wifey";
    } else if (hotAmount >= 60) {
        hotEmoji = "😳😏🥺";
        hotText = "hey there baby girl.. ahaha...";
    } else if (hotAmount >= 45) {
        hotEmoji = "😳😳🥺";
        hotText = "hey hey dam u kinda cute";
    } else if (hotAmount >= 35) {
        hotEmoji = "🥵";
        hotText = "whats ur sc";
    } else if (hotAmount >= 25) {
        hotEmoji = "🍆";
        hotText = "fuckable";
    } else if (hotAmount >= 15) {
        hotEmoji = "🤓";
        hotText = "nerd.";
    } else {
        hotEmoji = "🙄";
        hotText = "ugly.";
    }

    const embed = new CustomEmbed(
        message.member,
        `${member.user.toString()}\n**${hotAmount}**% hot ${hotEmoji}\n${hotText}`
    ).setHeader("hotness calculator", member.user.avatarURL());

    if (hotAmount >= 95) {
        embed.setFooter({ text: "+$1,069" });
    }

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
