const { MessageEmbed } = require("discord.js");
const { getMember, getColor } = require("../utils.js");

const cooldown = new Map();

module.exports = {
    name: "love",
    description: "calculate your love with another person",
    category: "fun",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
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

        if (args.length == 0) {
            return message.channel.send("❌\n$love <user> (user)");
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
        }

        if (args.length == 2) {
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
                return message.channel.send("❌\n$love <user> (user)");
            }
        }
        
        if (!target1 || !target2) {
            return message.channel.send("❌\ninvalid account");
        }

        if (target1 == target2) {
            return message.channel.send("❌\nlol loner");
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const lovePercent = Math.ceil(Math.random() * 101) - 1;
        let loveLevel;
        let loveEmoji;
        let loveBar = "";

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

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("❤ " + target1.displayName + " ❤ " + target2.displayName + " ❤")
            .setDescription(target1.user.toString() + " **x** " + target2.user.toString())

            .addField("love level", 
            "**" + lovePercent + "**%\n" +
            loveBar + "\n\n" +
            "**" + loveLevel + "** " + loveEmoji)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
         });
            

    }
};