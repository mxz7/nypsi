import dayjs = require("dayjs");
import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { MStoTime } from "../utils/functions/date";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("timeuntil", "calculate time until a date", Categories.INFO).setAliases(["tu", "until"]);

async function run(message: Message | (CommandInteraction & NypsiCommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data);
        } else {
            return await message.channel.send(data);
        }
    };

    if (args.length == 0) {
        return send({ embeds: [new ErrorEmbed(`${getPrefix(message.guild)}until <date> (label...)`)] });
    }

    let target = dayjs(args[0]);

    if (isNaN(target.unix())) {
        const day = args[0].split("/")[0];
        const month = args[0].split("/")[1];
        const year = args[0].split("/")[2];

        target = dayjs(`${month}/${day}/${year}`);
    }

    if (isNaN(target.unix())) {
        return send({ embeds: [new ErrorEmbed("invalid date")] });
    }

    if (target.isBefore(dayjs())) {
        return send({ embeds: [new ErrorEmbed("date must be in the future")] });
    }

    await addCooldown(cmd.name, message.member, 10);

    args.shift();

    const diff = target.toDate().getTime() - Date.now();
    const length = MStoTime(diff, true);

    let label: string;

    if (args[0]) {
        label = args.join(" ");
    }

    if (label) {
        return send({ embeds: [new CustomEmbed(message.member, false, `**${length}** until ${label}`)] });
    } else {
        return send({ embeds: [new CustomEmbed(message.member, false, `${length}`)] });
    }
}

cmd.setRun(run);

module.exports = cmd;
