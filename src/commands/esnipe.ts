import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("esnipe", "snipe the most recently edited message", Categories.FUN).setAliases(["es"]);

declare function require(name: string);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const { eSnipe } = require("../nypsi.js");

    let channel: any = message.channel;

    if (args.length == 1) {
        if (!message.mentions.channels.first()) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }

        channel = message.mentions.channels.first();

        if (!channel.members.find((m) => m.user.id == message.author.id)) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }

        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }
    }

    if (!eSnipe || !eSnipe.get(channel.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("nothing to edit snipe in " + channel.toString())],
        });
    }

    let content = eSnipe.get(channel.id).content;

    if (content.split("\n").length > 10) {
        content = content.split("\n").join(".");
    }

    const created = new Date(eSnipe.get(channel.id).createdTimestamp);

    const embed = new CustomEmbed(message.member, content)
        .setHeader(eSnipe.get(channel.id).member, eSnipe.get(channel.id).memberAvatar)
        .setFooter({ text: timeSince(created) + " ago" });

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

function timeSince(date) {
    const ms = Math.floor(new Date().getTime() - date);

    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const daysms = ms % (24 * 60 * 60 * 1000);
    const hours = Math.floor(daysms / (60 * 60 * 1000));
    const hoursms = ms % (60 * 60 * 1000);
    const minutes = Math.floor(hoursms / (60 * 1000));
    const minutesms = ms % (60 * 1000);
    const sec = Math.floor(minutesms / 1000);

    let output = "";

    if (days > 0) {
        output = output + days + "d ";
    }

    if (hours > 0) {
        output = output + hours + "h ";
    }

    if (minutes > 0) {
        output = output + minutes + "m ";
    }

    if (sec > 0) {
        output = output + sec + "s";
    } else if (output != "") {
        output = output.substr(0, output.length - 1);
    }

    if (output == "") {
        output = "0s";
    }

    return output;
}
