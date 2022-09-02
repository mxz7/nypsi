import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { createUser, getMulti, getPrestige, hasVoted, userExists } from "../utils/economy/utils.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command(
    "vote",
    "vote every 12 hours to get an extra 5% bonus on gambling wins as well as a money reward",
    Categories.MONEY
);

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

    const amount = 15000 * (prestige + 1);
    const voted = await hasVoted(message.member);
    const multi = Math.floor((await getMulti(message.member)) * 100);
    let crateAmount = Math.floor(prestige / 2 + 1);

    if (crateAmount > 3) crateAmount = 3;

    const embed = new CustomEmbed(message.member, "https://top.gg/bot/678711738845102087/vote")
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setFooter({ text: "you get increased rewards for prestiging" });

    if (voted) {
        embed.setHeader("vote ✅", message.author.avatarURL());
        embed.setColor("#5efb8f");
        embed.addField("active rewards", `✓ +**3**% multiplier, total: **${multi}**%\n✓ +$**50k** max bet`);
    } else {
        embed.setHeader("vote ❌", message.author.avatarURL());
        embed.setColor("#e4334f");
        embed.addField(
            "rewards",
            `× +**3**% multiplier, current: **${multi}**%\n× +$**50k** max bet\n× $**${amount.toLocaleString()}** reward\n× **10** karma\n× **${crateAmount}** vote crate${
                crateAmount > 1 ? "s" : ""
            }`
        );
        embed.setFooter({ text: "you get increased rewards for prestiging" });
    }

    send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
