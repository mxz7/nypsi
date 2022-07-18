import { CommandInteraction, GuildMember, Message } from "discord.js";
import {
    getBalance,
    createUser,
    userExists,
    updateBalance,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    getPrestigeRequirement,
    getPrestigeRequirementBal,
    getPrestige,
    deleteUser,
} from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { getMember } from "../utils/functions/member.js";

const cmd = new Command("balance", "check your balance", Categories.MONEY).setAliases(["bal", "money", "wallet"]);

cmd.slashEnabled = true;

cmd.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view balance of this user").setRequired(false)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (message.member.user.id == "672793821850894347" && args.length == 2) {
        let target: GuildMember | string = message.mentions.members.first();

        if (!target) {
            target = args[0];
            if (!(await userExists(target))) await createUser(target);
        }

        if (args[1] == "reset") {
            await deleteUser(target);
            if (!(message instanceof Message)) return;
            return message.react("✅");
        }

        const amount = parseInt(args[1]);

        await updateBalance(target, amount);

        if (!(message instanceof Message)) return;
        return message.react("✅");
    }

    let target = message.member;

    if (args.length >= 1) {
        target = message.mentions.members.first();

        if (!target) {
            target = await getMember(message.guild, args.join(" "));
        }

        if (!target) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
        }
    }

    if (!(await userExists(target))) await createUser(target);

    let footer = `xp: ${(await getXp(target)).toLocaleString()}`;

    if ((await getPrestige(target)) > 0) {
        footer += ` | prestige: ${await getPrestige(target)}`;
    }

    const embed = new CustomEmbed(message.member)
        .setDescription(
            "💰 $**" +
                (await getBalance(target)).toLocaleString() +
                "**\n" +
                "💳 $**" +
                (await getBankBalance(target)).toLocaleString() +
                "** / $**" +
                (await getMaxBankBalance(target)).toLocaleString() +
                "**"
        )
        .setFooter({ text: footer });

    if (target.user.id == message.author.id) {
        embed.setHeader("your balance | season 3", message.author.avatarURL());
    } else {
        embed.setHeader(`${target.user.username}'s balance | season 3`, target.user.avatarURL());
    }

    const send = async (data) => {
        if (message.interaction) {
            return await message.reply(data);
        } else {
            return await message.channel.send(data);
        }
    };

    if (message.member == target) {
        if (
            (await getXp(target)) >= (await getPrestigeRequirement(target)) &&
            (await getBankBalance(target)) >= getPrestigeRequirementBal(await getXp(target)) &&
            (await getPrestige(target)) < 20
        ) {
            return send({
                content: `you are eligible to prestige, use ${await getPrefix(message.guild)}prestige for more info`,
                embeds: [embed],
            });
        }
    }

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
