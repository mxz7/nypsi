const { MessageEmbed } = require("discord.js")
const fetch = require("node-fetch")

const cooldown = new Map()

module.exports = {
    name: "skin",
    description: "view the skin of a minecraft account",
    category: "info",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (args.length == 0) {
            return message.channel.send("❌\ninvalid account");
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
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
            return message.channel.send("❌\ninvalid account");
        }

        const skinIMG = `https://visage.surgeplay.com/full/${uuid.id}.png`

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setURL("https://namemc.com/profile/" + username)
            .setTitle(uuid.name)
            .setDescription(`[download](https://mc-heads.net/download/${uuid})`)
            .setImage(skinIMG)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        })

    }
}