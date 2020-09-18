const { MessageEmbed } = require("discord.js");
const { getMember, getColor } = require("../utils/utils");

module.exports = {
    name: "avatar",
    description: "get a person's avatar",
    category: "info",
    aliases: ["av"],
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        let member;

        if (args.length == 0) {
            member = message.member;
        } else {
            if (!message.mentions.members.first()) {
                member = getMember(message, args.join(" "));
            } else {
                member = message.mentions.members.first();
            }
        }

        if (!member) {
            return message.channel.send("❌ invalid user");
        }

        let avatar = member.user.displayAvatarURL({ dynamic: true, size: 256 })

        const color = getColor(member);

        const embed = new MessageEmbed()
            .setTitle(member.user.tag)
            .setColor(color)
            .setImage(avatar)

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
};