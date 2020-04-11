const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const { getMember, formatDate, getColor } = require("../utils.js");

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
            if (args[0] == "-id") {
                member = message.member
            }
        }

        if (!member) {
            return message.channel.send("❌ \ninvalid user");
        }

        const color = getColor(member);

        if (args.join(" ").includes("-id")) {
            const embed = new MessageEmbed()
                .setTitle(member.user.tag)
                .setColor(color)
                .setDescription("`" + member.user.id + "`")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed)
        }
        
        const joined = formatDate(member.joinedAt);
        const created = formatDate(member.user.createdAt);
        const roles = member.roles._roles

        let rolesText = ""

        roles.forEach(role => {
            rolesText = rolesText + role.toString() + " "
        })

        rolesText = rolesText.split("@everyone").join("")

        let username = member.user.tag

        if (username.includes("*")) {
            username = "`" + member.user.tag + "`"
        }

        const embed = new MessageEmbed()
            .setThumbnail(member.user.avatarURL({ format: "png", dynamic: true, size: 128 }))
            .setColor(color)
            .setTitle(member.user.tag)
            .setDescription(member.user.toString())
            
            .addField(member.displayName, stripIndents `**username** ${username}
            **id** ${member.user.id}
            **status** ${member.presence.status}`, true)

            .addField(member.displayName, "**created** " + created.toString().toLowerCase() + "\n" + 
                "**joined** " + joined.toString().toLowerCase() + "\n" + 
                "**roles** " + member._roles.length, true)

            .setFooter("bot.tekoh.wtf")
        
        if (rolesText != " ") {
            embed.addField("roles", rolesText)
        }

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
                embed.addField("activity", status1, true)
            }
        }

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};