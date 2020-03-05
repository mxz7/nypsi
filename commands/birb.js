const fetch = require("node-fetch")
const { RichEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "birb",
    description: "get a random picture of a birb",
    category: "fun",
    run: async (message, args) => {
        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

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
        }, 5000);

        const url = "https://some-random-api.ml/img/birb"
        let birb

        try {
            birb = await fetch(url).then(url => url.json())
        } catch (e) {
            console.log(e)
            return message.channel.send("❌\nerror")
        }

        birb = birb.link

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setTitle("birb")
            .setURL("https://some-random-api.ml/")
            .setColor(color)
            .setImage(birb)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        })
    }
}