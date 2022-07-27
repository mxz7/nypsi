import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import fetch from "node-fetch";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { RedditJSON, RedditJSONPost } from "../utils/models/Reddit";
import ms = require("ms");

const cmd = new Command("dadjoke", "get a hilarious dad joke straight from r/dadjokes", Categories.FUN).setAliases([
    "dadjokes",
    "dj",
]);

cmd.slashEnabled = true;

const url = "https://www.reddit.com/r/dadjokes/top.json?limit=69&t=week";

let cached: RedditJSONPost[] = [];

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

    await addCooldown(cmd.name, message.member, 10);

    const embed = new CustomEmbed(message.member);

    if (cached.length == 0) {
        const res: RedditJSON = await fetch(url).then((res) => res.json());

        cached = res.data.children;

        setTimeout(() => {
            cached = [];
        }, ms("1 hour"));
    }

    const chosen = cached[Math.floor(Math.random() * cached.length)].data;

    embed.setHeader(`u/${chosen.author}`);
    embed.setTitle(chosen.title);
    embed.setURL(chosen.url);
    embed.setDescription(chosen.selftext);

    return send({ embeds: [embed] }).catch(() => {
        send({ embeds: [new ErrorEmbed("unable to find dad joke. please try again")] });
    });
}

cmd.setRun(run);

module.exports = cmd;
