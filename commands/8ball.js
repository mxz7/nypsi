const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils.js")

const answers = ["as i see it, yes",
    "ask again later",
    "better not tell you now",
    "cannot predict now",
    "concentrate and ask again",
    "don’t count on it",
    "it is certain",
    "it is decidedly so",
    "most likely",
    "my reply is no",
    "my sources say no",
    "outlook not so good",
    "outlook good",
    "reply hazy, try again",
    "signs point to yes",
    "very doubtful",
    "without a doubt",
    "yes.",
    "yes – definitely",
    "you may rely on it"]

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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        if (args.length == 0) {
            return message.channel.send("❌ you must ask the 8ball something")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const question = args.join(" ")

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("8ball")
            .setDescription("\n**" + question + "** - " + message.member.user.toString() + "\n\n" + answers[Math.floor(Math.random() * answers.length)])
            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_MESSAGES'")
        })
    }
}