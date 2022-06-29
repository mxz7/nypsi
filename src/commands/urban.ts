import * as urban from "urban-dictionary";
import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { inPlaceSort } from "fast-sort";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("urban", "get a definition from urban dictionary", Categories.INFO).setAliases(["define"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = getPrefix(message.guild);

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}urban <definition>`)] });
    }

    await addCooldown(cmd.name, message.member, 10);

    const results = await urban.define(args.join()).catch(() => {
        return message.channel.send({ embeds: [new ErrorEmbed("unknown definition")] });
    });

    inPlaceSort(results).desc((i: any) => i.thumbs_up);

    const result = results[0];

    if (!result) return;
    if (!result.word) return;

    const embed = new CustomEmbed(message.member, false, result.definition + "\n\n" + result.example)
        .setTitle(result.word)
        .setHeader("published by " + result.author)
        .addField("👍", result.thumbs_up.toLocaleString(), true)
        .addField("👎", result.thumbs_down.toLocaleString(), true)
        .setURL(result.permalink);

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
