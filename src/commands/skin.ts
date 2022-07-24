import { CommandInteraction, Message } from "discord.js";
import { getSkin } from "mc-names";
import fetch from "node-fetch";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("skin", "view the skin of a minecraft account", Categories.MINECRAFT);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}skin <account>`)] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 10);

    const username = args[0];

    const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username;
    let uuid;

    try {
        uuid = await fetch(uuidURL).then((uuidURL) => uuidURL.json());
    } catch (e) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid account")] });
    }

    const skin = await getSkin(username);

    console.log(skin);

    if (!skin) {
        return message.channel.send({ embeds: [new ErrorEmbed("error while fetching skin. please try again")] });
    }

    const embed = new CustomEmbed(message.member, `[download](https://mc-heads.net/download/${uuid.id})`)
        .setTitle(uuid.name)
        .setURL("https://namemc.com/profile/" + username)
        .setImage(skin.render);

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
