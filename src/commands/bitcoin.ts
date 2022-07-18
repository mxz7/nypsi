import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getItems, getInventory, userExists, createUser } from "../utils/economy/utils";

const cmd = new Command("bitcoin", "view the current bitcoin value (reflects real life USD)", Categories.MONEY).setAliases([
    "btc",
]);

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);
    const bitcoin = getItems()["bitcoin"];
    const inventory = await getInventory(message.member);

    let bitcoinAmount = 0;

    if (inventory["bitcoin"]) {
        bitcoinAmount = inventory["bitcoin"];
    }

    const embed = new CustomEmbed(
        message.member,
        `**worth** $${bitcoin.worth.toLocaleString()}\n**owned** ${bitcoinAmount.toLocaleString()} ($${(
            bitcoinAmount * bitcoin.worth
        ).toLocaleString()})`
    )
        .setFooter({ text: "not real bitcoin, although it reflects current worth in USD" })
        .setHeader("your bitcoin", message.author.avatarURL());

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
