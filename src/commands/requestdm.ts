import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed } from "../utils/models/EmbedBuilders";

declare function require(name: string);

const cmd = new Command(
    "requestdm",
    "attempt to send a DM to a given user (this is my way of having fun leave me alone)",
    Categories.NONE
);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (message.author.id != "672793821850894347") return;

    if (args.length < 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("$requestdm <id> <content>")] });
    }

    const { requestDM } = require("../nypsi");

    const user = args[0];

    args.shift();

    const a = await requestDM(user, args.join(" "));

    if (!(message instanceof Message)) return;

    if (a) {
        message.react("✅");
    } else {
        message.react("❌");
    }
}

cmd.setRun(run);

module.exports = cmd;
