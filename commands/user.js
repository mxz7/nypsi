/*jshint esversion: 8 */
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const { getMember, formatDate } = require("../utils.js");

module.exports = {
    name: "user",
    description: "view info about a user",
    category: "info",
    run: async (message, args) => {
        
        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
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
        
        const joined = formatDate(member.joinedAt);

        const created = formatDate(member.user.createdAt);

        let color;

        if (member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setThumbnail(member.user.avatarURL({ format: "png", dynamic: true, size: 256 }))
            .setColor(color)
            .setTitle(member.user.tag)
            .setDescription(member.user)
            
            .addField(member.displayName, stripIndents `**username** ${member.user.tag}
            **id** ${member.user.id}
            **status** ${member.presence.status}\n
            **created** ${created.toString().toLowerCase()}
            **joined** ${joined.toString().toLowerCase()}
            **roles** ${member._roles.length}`)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        if (member.presence.activities.length > 0) {
            let hasStatus = false
            let status = ""
            let hasGame = false
            let game = ""
            let hasSpotify = false
            let spotify = ""
            
            for (activity of member.presence.activities) {
                if (activity.name.toLowerCase() == "custom status" && activity.state != undefined) {
                    if (hasStatus) return

                    status = "**custom status** " + activity.state
                    hasStatus = true
                }

                if (activity.name.toLowerCase() == "spotify") {
                    if (hasSpotify) return

                    spotify = "**listening to** " + activity.details + " by " + activity.state
                    hasSpotify = true
                }

                if (!hasGame && activity.name.toLowerCase() != "custom status" && activity.name.toLowerCase() != "spotify") {
                    game = "**currently playing** " + activity.name
                    hasGame = true
                }
            }

            let status1 = ""
            if (hasStatus) {
                status1 = status1 + status + "\n"
            }
            if (hasSpotify) {
                status1 = status1 + spotify + "\n"
            }
            if (hasGame) {
                status1 = status1 + game
            }
            if (hasStatus || hasSpotify || hasGame) {
                embed.addField("status", status1)
            }
        }

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};