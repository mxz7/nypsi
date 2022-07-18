import { CommandInteraction, Message } from "discord.js";
import { calcMaxBet, userExists, createUser } from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("maxbet", "calculate your maximum bet", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const maxBet = await calcMaxBet(message.member);

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, `your maximum bet is $**${maxBet.toLocaleString()}**`)],
    });
}

cmd.setRun(run);

module.exports = cmd;
