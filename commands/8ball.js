const { MessageEmbed } = require("discord.js")

const answers = [" As I see it, yes.",
    "Ask again later.",
    "Better not tell you now.",
    "Cannot predict now.",
    "Concentrate and ask again.",
    "Don’t count on it.",
    "It is certain.",
    "It is decidedly so.",
    "Most likely.",
    "My reply is no.",
    "My sources say no.",
    "Outlook not so good.",
    "Outlook good.",
    "Reply hazy, try again.",
    "Signs point to yes.",
    "Very doubtful.",
    "Without a doubt.",
    "Yes.",
    "Yes – definitely.",
    "You may rely on it."]

const cooldown = new Map()

module.exports = {
    name: "8ball",
    description: "ask the 8ball a question",
    category: "fun",
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
            return message.channel.send("❌\nyou must ask the 8ball something")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const question = args.join(" ")

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("8ball")
            .setDescription("**" + question + "** - *" + message.member.user.tag + "*\n\n" + answers[Math.floor(Math.random() * answers.length)])
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌\ni may be lacking permission: 'EMBED_MESSAGES'")
        })
    }
}