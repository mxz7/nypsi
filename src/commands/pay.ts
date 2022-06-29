import { CommandInteraction, Message } from "discord.js";
import { getMember } from "../utils/functions/member";
import {
    updateBalance,
    getBalance,
    userExists,
    createUser,
    getXp,
    getPrestige,
    isEcoBanned,
} from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { isPremium } from "../utils/premium/utils";
import { formatNumber } from "../utils/economy/utils";
import { payment } from "../utils/logger";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("pay", "give other users money", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData
    .addUserOption((option) =>
        option.setName("user").setDescription("who would you like to send money to").setRequired(true)
    )
    .addIntegerOption((option) =>
        option.setName("amount").setDescription("how much would you like to send").setRequired(true)
    );

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data);
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

    const prefix = getPrefix(message.guild);

    if (args.length < 2) {
        const embed = new CustomEmbed(message.member)
            .setHeader("pay help")
            .addField("usage", `${prefix}pay <user> <amount>`);

        return send({ embeds: [embed] });
    }

    let target = message.mentions.members.first();

    if (!target) {
        target = await getMember(message.guild, args[0]);
    }

    if (!target) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == target) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (target.user.bot) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (isEcoBanned(target.user.id)) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!(await userExists(target))) createUser(target);

    if (!(await userExists(message.member))) createUser(message.member);

    if (args[1].toLowerCase() == "all") {
        args[1] = getBalance(message.member).toString();
    } else if (args[1].toLowerCase() == "half") {
        args[1] = (getBalance(message.member) / 2).toString();
    }

    const amount = formatNumber(args[1]);

    if (!amount) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    if (amount > getBalance(message.member)) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
    }

    if (amount <= 0) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    const targetPrestige = getPrestige(target);

    if (targetPrestige < 2) {
        const targetXp = getXp(target);

        let payLimit = 150000;

        let xpBonus = targetXp * 2500;

        if (xpBonus > 200000) xpBonus = 200000;

        payLimit += xpBonus;

        const prestigeBonus = targetPrestige * 750000;

        payLimit += prestigeBonus;

        if (amount > payLimit) {
            return send({ embeds: [new ErrorEmbed("you can't pay this user that much yet")] });
        }
    }

    await addCooldown(cmd.name, message.member, 15);

    let tax = 0;

    if (amount >= 200000) {
        tax = 0.1;
    } else if (amount >= 100000) {
        tax = 0.05;
    }

    if (isPremium(message.member)) {
        tax = 0;
    }

    updateBalance(message.member, getBalance(message.member) - amount);

    if (tax > 0) {
        updateBalance(target, getBalance(target) + (amount - Math.round(amount * tax)));
    } else {
        updateBalance(target, getBalance(target) + amount);
    }

    const embed = new CustomEmbed(message.member)
        .setHeader("payment", message.author.avatarURL())
        .addField(
            message.member.user.tag,
            "$" + (getBalance(message.member) + amount).toLocaleString() + "\n**-** $" + amount.toLocaleString()
        );

    if (tax > 0) {
        embed.setDescription(
            message.member.user.toString() + " -> " + target.user.toString() + "\n**" + tax * 100 + "**% tax"
        );
        embed.addField(
            target.user.tag,
            "$" +
                (getBalance(target) - amount).toLocaleString() +
                "\n**+** $" +
                (amount - Math.round(amount * tax)).toLocaleString()
        );
    } else {
        embed.setDescription(message.member.user.toString() + " -> " + target.user.toString());
        embed.addField(
            target.user.tag,
            "$" + (getBalance(target) - amount).toLocaleString() + "\n**+** $" + amount.toLocaleString()
        );
    }

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    send({ embeds: [embed] }).then((m) => {
        const embed = new CustomEmbed(message.member)
            .setHeader("payment", message.author.avatarURL())
            .setDescription(message.member.user.toString() + " -> " + target.user.toString())
            .addField(message.member.user.tag, "$" + getBalance(message.member).toLocaleString());

        if (tax > 0) {
            embed.addField(
                target.user.tag,
                "$" +
                    getBalance(target).toLocaleString() +
                    " (+$**" +
                    (amount - Math.round(amount * tax)).toLocaleString() +
                    "**)"
            );
            embed.setDescription(
                message.member.user.toString() + " -> " + target.user.toString() + "\n**" + tax * 100 + "**% tax"
            );
        } else {
            embed.addField(
                target.user.tag,
                "$" + getBalance(target).toLocaleString() + " (+$**" + amount.toLocaleString() + "**)"
            );
        }

        setTimeout(() => {
            edit({ embeds: [embed] }, m);
        }, 1500);
    });

    payment(message.author, target.user, amount);
}

cmd.setRun(run);

module.exports = cmd;
