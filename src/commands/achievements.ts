import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { getResponse, onCooldown } from "../utils/cooldownhandler";
import { getUncompletedAchievements } from "../utils/economy/achievements";
import { getAchievements } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("achievements", "view your achievement progress", Categories.MONEY).setAliases([
    "ach",
    "achievement",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data: MessageOptions | InteractionReplyOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data as MessageOptions);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed], ephemeral: true });
    }

    const showCurrentProgress = async () => {
        const allAchievementData = getAchievements();
        const achievements = await getUncompletedAchievements(message.author.id);

        if (!achievements || achievements.length == 0) {
            return send({ embeds: [new CustomEmbed(message.member, "you have no achievements in progress")] });
        }

        const desc: string[] = [];

        for (const achievement of achievements) {
            desc.push(
                `${allAchievementData[achievement.achievementId].emoji} ${
                    allAchievementData[achievement.achievementId].name
                } \`${achievement.progress.toLocaleString()} / ${allAchievementData[
                    achievement.achievementId
                ].target.toLocaleString()} (${(
                    (achievement.progress / allAchievementData[achievement.achievementId].target) *
                    100
                ).toFixed(1)}%)\``
            );
        }

        const embed = new CustomEmbed(message.member, desc.join("\n")).setHeader(
            "your achievement progress",
            message.author.avatarURL()
        );

        return send({ embeds: [embed] });
    };

    if (args.length == 0) {
        return showCurrentProgress();
    } else if (args[0].toLowerCase() == "view") {
        return showCurrentProgress();
    }
}

cmd.setRun(run);

module.exports = cmd;
