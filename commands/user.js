const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getMember, formatDate, getColor } = require("../utils/utils");

const cmd = new Command("user", "view info about a user in the server", categories.INFO).setAliases(["whois", "who"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
    }

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {

            let username = args.join(" ")

            if (username.includes(" -id")) {
                username = username.split(" -id").join("")
            } else if (username.includes("-id ")) {
                username = username.split("-id ").join("")
            }

            member = getMember(message, username);
        } else {
            member = message.mentions.members.first();
        }
        if (args[0] == "-id" && args.length == 1) {
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

    const embed = new MessageEmbed()
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))
        .setColor(color)
        .setTitle(member.user.tag)
        .setDescription(member.user.toString())
        
        .addField("account", `**id** ${member.user.id}` +
        `\n**created** ${created.toString().toLowerCase()}`, true)

        .addField("server", "**joined** " + joined.toString().toLowerCase() + "\n" +
            "**join pos** " + joinPos, true)

        .setFooter("bot.tekoh.wtf")
    
    if (rolesText != " ") {
        embed.addField("roles [" + member._roles.length + "]", rolesText,)
    }

    message.channel.send(embed).catch(() => {
         return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
    });

}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}