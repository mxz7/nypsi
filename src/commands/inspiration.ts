import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import fetch from "node-fetch";
import { isImageUrl } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("inspiration", "generate an inspirational quote (inspirobot.me)", Categories.FUN).setAliases([
    "quote",
    "inspire",
]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 10);

    const res = await fetch("https://inspirobot.me/api?generate=true").then((res) => res.text());

    if (!isImageUrl(res)) {
        return message.channel.send({ embeds: [new ErrorEmbed("error fetching image")] });
    }

    return message.channel.send({ embeds: [new CustomEmbed(message.member).setImage(res)] });
}

cmd.setRun(run);

module.exports = cmd;
