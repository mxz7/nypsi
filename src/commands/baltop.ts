import { topAmount } from "../utils/economy/utils.js";
import { CommandInteraction, Message, MessageOptions, PermissionFlagsBits } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("baltop", "view top balances in the server", Categories.MONEY).setAliases(["top", "gangsters"]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data);
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

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

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    const balTop = await topAmount(message.guild, amount);

    const filtered = balTop.filter(function (el) {
        return el != null;
    });

    if (filtered.length == 0) {
        return send({ embeds: [new ErrorEmbed("there are no users to show")] });
    }

    const embed = new CustomEmbed(message.member).setHeader("top " + filtered.length).setDescription(filtered.join("\n"));

    send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
