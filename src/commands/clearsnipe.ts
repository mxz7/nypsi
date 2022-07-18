import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

declare function require(name: string);

const cmd = new Command("clearsnipe", "delete the current sniped thing", Categories.MODERATION)
    .setAliases(["cs"])
    .setPermissions(["MANAGE_MESSAGES"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    const { snipe, eSnipe } = require("../nypsi.js");

    let channel: any = message.channel;

    if (args.length == 1) {
        if (!message.mentions.channels.first()) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }
        channel = message.mentions.channels.first();
        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }
    }

    if (!snipe || (!snipe.get(channel.id) && (!eSnipe || !eSnipe.get(channel.id)))) {
        return message.channel.send({
            embeds: [new ErrorEmbed("nothing has been sniped in " + channel.toString())],
        });
    }

    snipe.delete(channel.id);
    eSnipe.delete(channel.id);

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, "✅ snipe cleared in " + channel.toString())],
    });
}

cmd.setRun(run);

module.exports = cmd;
