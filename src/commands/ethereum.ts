import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getItems, getInventory, userExists, createUser } from "../utils/economy/utils";

const cmd = new Command("ethereum", "view the current ethereum value (reflects real life USD)", Categories.MONEY).setAliases(
    ["eth"]
);

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);
    const ethereum = getItems()["ethereum"];
    const inventory = await getInventory(message.member);

    let ethereumAmount = 0;

    if (inventory["ethereum"]) {
        ethereumAmount = inventory["ethereum"];
    }

    const embed = new CustomEmbed(
        message.member,
        `**worth** $${ethereum.worth.toLocaleString()}\n**owned** ${ethereumAmount.toLocaleString()} ($${(
            ethereumAmount * ethereum.worth
        ).toLocaleString()})`
    )
        .setFooter({ text: "not real ethereum, although it reflects current worth in USD" })
        .setHeader("your ethereum", message.author.avatarURL());

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
