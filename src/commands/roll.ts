import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("roll", "roll a dice", Categories.UTILITY);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    let range = 6;

    if (args.length != 0) {
        if (parseInt(args[0])) {
            if (parseInt(args[0]) < 2 || parseInt(args[0]) > 1000000000) {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid range")] });
            } else {
                range = parseInt(args[0]);
            }
        }
    }

    return message.channel.send({
        embeds: [
            new CustomEmbed(
                message.member,
                "🎲 you rolled `" + (Math.floor(Math.random() * range) + 1).toLocaleString() + "`"
            ),
        ],
    });
}

cmd.setRun(run);

module.exports = cmd;
