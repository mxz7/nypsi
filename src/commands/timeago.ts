import dayjs = require("dayjs");
import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { MStoTime } from "../utils/functions/date";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("timeago", "calculate how long ago a date was", Categories.INFO).setAliases(["ago"]);

async function run(message: Message | (CommandInteraction & NypsiCommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${await getPrefix(message.guild)}ta <date> (label...)`)] });
    }

    let target = dayjs(args[0]);

    if (isNaN(target.unix())) {
        const day = args[0].split("/")[0];
        const month = args[0].split("/")[1];
        const year = args[0].split("/")[2];

        target = dayjs(`${month}/${day}/${year}`);
    }

    if (isNaN(target.unix())) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid date")] });
    }

    if (target.isAfter(dayjs())) {
        return message.channel.send({ embeds: [new ErrorEmbed("date must be in the past")] });
    }

    await addCooldown(cmd.name, message.member, 10);

    args.shift();

    const diff = Date.now() - target.toDate().getTime();
    const length = MStoTime(diff, true);

    let label: string;

    if (args[0]) {
        label = args.join(" ");
    }

    if (label) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, `${label} was **${length} ago**`)] });
    } else {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, `${length} ago`)] });
    }
}

cmd.setRun(run);

module.exports = cmd;
