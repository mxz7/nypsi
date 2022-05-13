import { CommandInteraction, Message } from "discord.js"
import fetch from "node-fetch"
import { getPrefix } from "../utils/guilds/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getSkin } from "mc-names"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"

const cmd = new Command("skin", "view the skin of a minecraft account", Categories.MINECRAFT)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}skin <account>`)] })
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    await addCooldown(cmd.name, message.member, 10)

    const username = args[0]

    const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username
    let uuid

    try {
        uuid = await fetch(uuidURL).then((uuidURL) => uuidURL.json())
    } catch (e) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid account")] })
    }

    const skin = await getSkin(username)

    const embed = new CustomEmbed(message.member, false, `[download](https://mc-heads.net/download/${uuid.id})`)
        .setTitle(uuid.name)
        .setURL("https://namemc.com/profile/" + username)
        .setImage(skin.render)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
