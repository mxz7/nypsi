import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { calcMinimumEarnedXp, getRequiredBetForXp, getGuildByUser } from "../utils/economy/utils";

const cmd = new Command("minbet", "the minimum amount you need to bet to earn xp", Categories.MONEY);

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const requiredBet = getRequiredBetForXp(message.member);

    let earned = calcMinimumEarnedXp(message.member) + 2;

    let max = 6;

    const guild = getGuildByUser(message.member);

    if (guild) {
        max += guild.level - 1;
    }

    if (earned > max) earned = max;

    const embed = new CustomEmbed(message.member, false);

    embed.setDescription(
        `you must bet atleast $**${requiredBet.toLocaleString()}** to earn xp\n\nthe most xp you can earn per win is **${earned}**xp`
    );

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
