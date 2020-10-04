const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("raffle", "select a random user from current online members or a specific role", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 3 - diff

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

    let members = []

    if (args.length == 0) {
        cooldown.set(message.member.id, new Date());

        const members1 = message.guild.members.cache

        members1.forEach(m => {
            if (!m.user.bot && m.presence.status != "offline") {
                if (members.indexOf(m.user.id) == -1) {
                    members.push(m.user.id)
                }
            }
        })
    } else {
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase().includes(args.join(" ")))

        if (!role) {
            return await message.channel.send(new ErrorEmbed("i wasn't able to find that role"))
        }

        cooldown.set(message.member.id, new Date());

        role.members.forEach(m => {
            members.push(m.user.id)
        })

        if (members.length == 0) {
            return message.channel.send(new ErrorEmbed("there is nobody in that role"))
        }
    }

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 3000);

    let chosen = members[Math.floor(Math.random() * members.length)]

    chosen = await message.guild.members.fetch(chosen)

    const embed = new CustomEmbed(message.member)
        .setTitle("raffle by " + message.member.user.tag)
        .setDescription("**" + chosen.user.tag + "**")

    return message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd