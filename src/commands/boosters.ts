import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBoosters, getItems } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("boosters", "view your current active boosters", Categories.NSFW).setAliases(["booster"]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const send = async (data: MessageOptions) => {
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
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const embed = new CustomEmbed(message.member);

    embed.setHeader("your boosters", message.author.avatarURL());

    const desc: string[] = [];

    const items = getItems();
    const boosters = await getBoosters(message.member);

    if (boosters.size == 0) {
        embed.setDescription("you have no active boosters");
        return send({ embeds: [embed] });
    }

    const counts = new Map<string, number>();

    for (const boosterId of boosters.keys()) {
        if (counts.has(boosterId)) {
            counts.set(boosterId, counts.get(boosterId) + 1);
        } else {
            counts.set(boosterId, 1);
        }
    }

    for (const boosterId of boosters.keys()) {
        const booster = boosters.get(boosterId);
        desc.push(
            `**${items[boosterId].name}** ${items[boosterId].emoji}${
                counts.get(boosterId) > 1 ? ` \`x${counts.get(boosterId)}\` - next expires` : " - expires"
            } <t:${Math.round(booster.expire / 1000)}:R>`
        );
    }

    embed.setDescription(desc.join("\n"));

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
