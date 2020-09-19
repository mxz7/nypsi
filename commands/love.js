const { MessageEmbed } = require("discord.js");
const { getMember, getColor } = require("../utils/utils");

const cache = new Map()
const cooldown = new Map();

module.exports = {
    name: "love",
    description: "calculate your love with another person",
    category: "fun",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }
        
        const color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            return message.channel.send("❌ $love <user> (user)");
        }

        let target1;
        let target2;

        if (args.length == 1) {
            target1 = message.member;

            if (!message.mentions.members.first()) {
                target2 = getMember(message, args[0]);
            } else {
                target2 = message.mentions.members.first();
            }
        } else {
            if (message.mentions.members.size == 2) {
                target1 = message.mentions.members.first()
                
                target2 = message.mentions.members.get(message.mentions.members.keyArray()[1])
            } else if (message.mentions.members.size == 1) {
                if (args[0].startsWith("<@")) {
                    target1 = message.mentions.members.first()

                    target2 = getMember(message, args[1])
                } else {
                    target2 = message.mentions.members.first()

                    target1 = getMember(message, args[0])
                }
            } else if (message.mentions.members.size == 0) {
                target1 = getMember(message, args[0])
                target2 = getMember(message, args[1])
            } else {
                return message.channel.send("❌ $love <user> (user)");
            }
        }
        
        if (!target1 || !target2) {
            return message.channel.send("❌ invalid user(s)");
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const combo = (parseInt(target1.user.id) + parseInt(target2.user.id)).toString()

        let lovePercent

        if (cache.has(combo)) {
            lovePercent = cache.get(combo)
        } else {
            lovePercent = Math.ceil(Math.random() * 101) - 1;

            cache.set(combo, lovePercent)

            setTimeout(() => {
                cache.delete(combo)
            }, 60000)
        }

        let loveLevel;
        let loveEmoji;
        let loveBar = "";

        if (target1 == target2) {
            lovePercent = 0
        }

        if (lovePercent == 100) {
            loveLevel = "perfect!!";
            loveEmoji = "💞👀🍆🍑";
        } else if (lovePercent == 69) {
            loveLevel = "ooo 69 hehe horny";
            loveEmoji = "🍆🍑💦😩";
        } else if (lovePercent > 90) {
            loveLevel = "perfect!!";
            loveEmoji = "💞👀";
        } else if (lovePercent > 75) {
            loveLevel = "amazing!!";
            loveEmoji = "💕";
        } else if (lovePercent > 55) {
            loveLevel = "good";
            loveEmoji = "💖";
        } else if (lovePercent > 40) {
            loveLevel = "okay";
            loveEmoji = "💝";
        } else if (lovePercent > 25) {
            loveLevel = "uhh..";
            loveEmoji = "❤";
        } else if (lovePercent < 5 && lovePercent != 0) {
            loveLevel = "alone forever";
            loveEmoji = "😭";
        } else if (lovePercent == 0) {
            loveLevel = "lol loner";
            loveEmoji = "😭";
        } else {
            loveLevel = "lets not talk about it..";
            loveEmoji = "💔";
        }

        let loveBarNum = Math.ceil(lovePercent / 10) * 10;

        if (loveBarNum == 100) {
            loveBar = "**❤❤❤❤❤❤❤❤❤**";
        } else if (loveBarNum > 90) {
            loveBar = "**❤❤❤❤❤❤❤❤❤** 💔";
        } else if (loveBarNum > 80) {
            loveBar = "**❤❤❤❤❤❤❤❤** 💔💔";
        } else if (loveBarNum > 70) {
            loveBar = "**❤❤❤❤❤❤❤** 💔💔💔";
        } else if (loveBarNum > 60) {
            loveBar = "**❤❤❤❤❤❤** 💔💔💔💔";
        } else if (loveBarNum > 50) {
            loveBar = "**❤❤❤❤❤** 💔💔💔💔💔";
        } else if (loveBarNum > 40) {
            loveBar = "**❤❤❤❤** 💔💔💔💔💔💔";
        } else if (loveBarNum > 30) {
            loveBar = "**❤❤❤** 💔💔💔💔💔💔💔";
        } else if (loveBarNum > 20) {
            loveBar = "**❤❤** 💔💔💔💔💔💔";
        } else if (loveBarNum > 10) {
            loveBar = "**❤** 💔💔💔💔💔💔💔";
        } else {
            loveBar = "💔💔💔💔💔💔💔💔💔💔";
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("❤ " + target1.displayName + " ❤ " + target2.displayName + " ❤")
            .setDescription(target1.user.toString() + " **x** " + target2.user.toString())

            .addField("love level", 
            "**" + lovePercent + "**%\n" +
            loveBar + "\n\n" +
            "**" + loveLevel + "** " + loveEmoji)

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
         });
            

    }
};