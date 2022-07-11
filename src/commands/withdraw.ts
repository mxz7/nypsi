import {
    getBalance,
    getBankBalance,
    getMaxBankBalance,
    updateBalance,
    updateBankBalance,
    userExists,
    createUser,
    formatNumber,
} from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("withdraw", "withdraw money from your bank", Categories.MONEY).setAliases(["with"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("amount").setDescription("amount to withdraw").setRequired(true));

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) createUser(message.member);

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

        return send({ embeds: [embed] });
    }

    const prefix = getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("withdraw help")
            .addField("usage", `${prefix}withdraw <amount>`)
            .addField("help", "you can withdraw money from your bank aslong as you have that amount available in your bank");
        return send({ embeds: [embed] });
    }

    if ((await getBankBalance(message.member)) == 0) {
        return send({ embeds: [new ErrorEmbed("you dont have any money in your bank account")] });
    }

    if (args[0].toLowerCase() == "all") {
        args[0] = (await getBankBalance(message.member)).toString();
    }

    if (args[0] == "half") {
        args[0] = ((await getBankBalance(message.member)) / 2).toString();
    }

    const amount = formatNumber(args[0]);

    if (amount > (await getBankBalance(message.member))) {
        return send({
            embeds: [new ErrorEmbed("you dont have enough money in your bank account")],
        });
    }

    if (!amount) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    if (amount <= 0) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    await addCooldown(cmd.name, message.member, 30);

    const embed = new CustomEmbed(message.member, true)
        .setHeader("bank withdrawal", message.author.avatarURL())
        .addField(
            "bank balance",
            "$**" +
                (await getBankBalance(message.member)).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        )
        .addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

    const m = await send({ embeds: [embed] });

    await updateBankBalance(message.member, (await getBankBalance(message.member)) - amount);
    await updateBalance(message.member, (await getBalance(message.member)) + amount);

    const embed1 = new CustomEmbed(message.member, true)
        .setHeader("bank withdrawal", message.author.avatarURL())
        .addField(
            "bank balance",
            "$**" +
                (await getBankBalance(message.member)).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        );

    embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    setTimeout(() => edit({ embeds: [embed1] }, m), 1500);
}

cmd.setRun(run);

module.exports = cmd;
