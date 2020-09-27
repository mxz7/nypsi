const { MessageEmbed, Message } = require("discord.js");
const fetch = require("node-fetch")
const { getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "skin",
    description: "view the skin of a minecraft account",
    category: "info",
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        if (args.length == 0) {
            return message.channel.send("❌ $skin <account>");
        }

        const color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const username = args[0]

        const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username
        let uuid

        try {
            uuid = await fetch(uuidURL).then(uuidURL => uuidURL.json())
        } catch (e) {
            return message.channel.send("❌ invalid account");
        }

        const skinIMG = `https://visage.surgeplay.com/full/${uuid.id}.png`

        const embed = new MessageEmbed()
            .setTitle(uuid.name)
            .setURL("https://namemc.com/profile/" + username)
            .setDescription(`[download](https://mc-heads.net/download/${uuid.id})`)
            .setColor(color)
            .setImage(skinIMG)
            .setFooter("bot.tekoh.wtf")
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        })

    }
}