const { Message } = require("discord.js");
const fetch = require("node-fetch");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("skin", "view the skin of a minecraft account", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed("$skin <account>"));
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 10000);

    const username = args[0]

    const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username
    let uuid

    try {
        uuid = await fetch(uuidURL).then(uuidURL => uuidURL.json())
    } catch (e) {
        return message.channel.send(new ErrorEmbed("invalid account"));
    }

    const skinIMG = `https://visage.surgeplay.com/full/${uuid.id}.png`

    const embed = new CustomEmbed(message.member, true, `[download](https://mc-heads.net/download/${uuid.id})`)
        .setTitle(uuid.name)
        .setURL("https://namemc.com/profile/" + username)
        .setImage(skinIMG)
    
    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd