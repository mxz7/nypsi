/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
const { getMember1, getMention } = require("../utils.js");

module.exports = {
    name: "love",
    description: "calculate your love with another person",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (args.length == 0) {
            return message.channel.send("❌\ninvalid account");
        }

        let target1;
        let target2;

        if (args.length == 1) {
            target1 = message.member;

            if (!message.mentions.members.first()) {
                target2 = getMember1(message, args[0]);
            } else {
                target2 = message.mentions.members.first();
            }
        }

        if (args.length == 2) {
            if (!message.mentions.members.first()) {
                target1 = getMember1(message, args[0]);
            } else {
                target1 = message.mentions.members.first();
            }

            if (getMember1(message, args[1])) {
                target2 = getMember1(message, args[1]);
            } else {
                target2 = getMention(message, args[1]);
            }

        }

        if (!target1 || !target2) {
            return message.channel.send("❌\ninvalid account");
        }

        const lovePercent = Math.ceil(Math.random() * 100);
        let loveLevel;
        let loveEmoji;
        let loveBar = "";

        if (lovePercent == 100) {
            loveLevel = "perfect!!";
            loveEmoji = "💞👀🍆🍑";
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

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("❤ " + target1.displayName + " ❤ " + target2.displayName + " ❤")
            .setDescription(target1 + " x " + target2)

            .addField("love level", 
            "**" + lovePercent + "**%\n" +
            loveBar + "\n\n" +
            "**" + loveLevel + "** " + loveEmoji)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
         });
            

    }
};