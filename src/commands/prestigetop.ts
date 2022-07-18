import { topAmountPrestige } from "../utils/economy/utils.js";
import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("prestigetop", "view top prestiges in the server", Categories.MONEY).setAliases(["topprestige"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 10);

    let amount;

    if (args.length == 0) {
        args[0] = "5";
    }

    if (isNaN(parseInt(args[0])) || parseInt(args[0]) <= 0) {
        args[0] = "5";
    }

    amount = parseInt(args[0]);

    if (amount > 10 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;

    if (amount < 5) amount = 5;

    const prestigeTop = await topAmountPrestige(message.guild, amount);

    const filtered = prestigeTop.filter(function (el) {
        return el != null;
    });

    const embed = new CustomEmbed(message.member).setHeader("top " + filtered.length).setDescription(filtered.join("\n"));

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
