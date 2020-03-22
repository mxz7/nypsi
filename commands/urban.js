const urban = require("relevant-urban")
const { RichEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "urban",
    description: "get a definition from urban dictionary",
    category: "info",
    run: async (message, args) => {
        
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

        if (args.length == 0) {
            return message.channel.send("❌\n$urban <definition>")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const result = await urban(args.join()).catch(() => {
            return message.channel.send("❌\nunknown definition")
        })

        if (!result.word) return

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setTitle(result.word)
            .setDescription(result.definition + "\n\n" + result.example)
            .setColor(color)
            .setAuthor("published by " + result.author)
            .addField("👍", result.thumbsUp.toLocaleString(), true)
            .addField("👎", result.thumbsDown.toLocaleString(), true)
            .setURL(result.urbanURL)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed)
    }
}