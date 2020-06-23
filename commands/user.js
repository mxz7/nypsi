const { MessageEmbed } = require("discord.js");
const { getMember, formatDate, getColor } = require("../utils/utils");

module.exports = {
    name: "user",
    description: "view info about a user",
    category: "info",
    run: async (message, args) => {
        
        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
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
            return message.channel.send("❌ invalid user");
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

        const members = message.guild.members.cache
        let membersSorted = []

        members.forEach(m => {
            if (m.joinedTimestamp) {
                membersSorted.push(m.id)
            }
        })

        membersSorted.sort(function(a, b) {
            return members.find(m => m.id == a).joinedAt - members.find(m => m.id == b).joinedAt
        })
        
        let joinPos = membersSorted.indexOf(member.id) + 1

        if (joinPos == 0) joinPos = "invalid"

        const joined = formatDate(member.joinedAt);
        const daysAgo = timeSince(new Date(member.joinedAt))
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
            
            .addField("account", `**username** ${username}` +
            `\n**id** ${member.user.id}` +
            `\n**created** ${created.toString().toLowerCase()}`, true)

            .addField("server", "**joined** " + joined.toString().toLowerCase() + "\n" +
                " - **" + daysAgo.toLocaleString() + "** days ago\n" +
                "**join pos** " + joinPos, true)

            .setFooter("bot.tekoh.wtf")
        
        if (rolesText != " ") {
            embed.addField("roles [" + member._roles.length + "]", rolesText,)
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
             return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
};

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}