import dayjs = require("dayjs");
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageOptions,
} from "discord.js";
import { createUser, getLastVote, getPrestige, hasVoted, userExists } from "../utils/economy/utils.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("vote", "vote every 12 hours to get rewards", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

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

    let prestige = await getPrestige(message.author.id);

    if (prestige > 15) prestige = 15;

    const amount = Math.floor(15000 * (prestige / 2 + 1));
    const voted = await hasVoted(message.member);
    let crateAmount = Math.floor(prestige / 2 + 1);
    const lastVote = await getLastVote(message.member);

    if (crateAmount > 3) crateAmount = 3;

    const embed = new CustomEmbed(message.member);

    if (voted) {
        const nextVote = dayjs(lastVote).add(12, "hours").unix();
        embed.setHeader("thank you for voting", message.author.avatarURL());
        embed.setColor("#5efb8f");
        embed.setDescription(`you can vote again <t:${nextVote}:R>`);
        send({ embeds: [embed] });
    } else {
        embed.setHeader("vote for nypsi", message.author.avatarURL());
        embed.setColor("#e4334f");
        embed.addField(
            "rewards",
            `× **7**% multiplier booster\n× +$**50k** max bet\n× $**${amount.toLocaleString()}** reward\n× **${crateAmount}** vote crate${
                crateAmount > 1 ? "s" : ""
            }`
        );

        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setURL("https://top.gg/bot/678711738845102087/vote")
                .setLabel("top.gg")
        );

        send({ embeds: [embed], components: [row] });
    }
}

cmd.setRun(run);

module.exports = cmd;
