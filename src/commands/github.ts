import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("github", "view code for the bot on github", Categories.INFO).setAliases(["git"]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const embed = new CustomEmbed(
        message.member,
        "nypsi is open source!!\n" + "click [here](https://github.com/tekoh/nypsi) to view the source code on github"
    )
        .setTitle("github")
        .setURL("https://github.com/tekoh/nypsi")
        .addField(
            "what does this mean?",
            "if you know how to code, you could fix bugs, add features, create your own commands.. the list goes on."
        );

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
