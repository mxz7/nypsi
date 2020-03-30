const { MessageEmbed } = require("discord.js")
const { getMember } = require("../utils");

const cooldown = new Map()

module.exports = {
    name: "ddos",
    description: "ddos someone (fake)",
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
            return message.channel.send("❌\n$ddos <user>")
        }

        let member;

        if (args.length == 0) {
            member = message.member;
        } else {
            if (!message.mentions.members.first()) {
                member = getMember(message, args[0]);
            } else {
                member = message.mentions.members.first();
            }
        }

        if (!member) {
            return message.channel.send("❌ \ninvalid user");
        }

        const ip = `${randNumber()}.${randNumber()}.${randNumber()}.${randNumber()}`
        const port = `${randPort()}`

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setTitle("ddos tool")
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
            .setDescription("*" + member.user.tag + "*\n\n" +
                "**ip** *obtaining..*" + "\n" +
                "**port** *waiting...*" + "\n\n" +
                "**status** *online*")
        
        return message.channel.send(embed).then(m => {
            embed.setDescription(message.member.user.toString() + "\n\n" +
                `**ip** *${ip}*` + "\n" +
                "**port** *scanning..*" + "\n\n" +
                "**status** *online*")
            
            setTimeout(() => {
                m.edit(embed).then(() => {
                    embed.setDescription(message.member.user.toString() + "\n\n" +
                        `**ip** *${ip}*` + "\n" +
                        `**port** *${port}*` + "\n\n" +
                        "**status** *online*")
                    
                    setTimeout(() => {
                        m.edit(embed).then(() => {
                            embed.setDescription(message.member.user.toString() + "\n\n" +
                                `**ip** *${ip}*` + "\n" +
                                `**port** *${port}*` + "\n\n" +
                                "**status** *offline*")
                            embed.setColor("#5efb8f")
                            
                            setTimeout(() => {
                                m.edit(embed)
                            }, 1000)
                        })
                    }, 1000)
                })
            }, 1000)
        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}

function randNumber() {
    return Math.floor(Math.random() * 254) + 1
}

function randPort() {
    return Math.floor(Math.random() * 25565)
}