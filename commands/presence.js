const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders");
const { getMember, getColor } = require("../utils/utils");

const cmd = new Command("presence", "view active presences for a user", categories.INFO).setAliases(["activity", "game"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

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
        return message.channel.send(new ErrorEmbed("invalid user"));
    }

    const embed = new CustomEmbed(message.member)
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

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
                game = "**playing** " + activity.name
                hasGame = true
                if (activity.details) {
                    game = game + " **-** " + activity.details
                }
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
            embed.setDescription(status1)
        } else {
            return message.channel.send(new ErrorEmbed("this user has no active presence"))
        }
    } else {
        return message.channel.send(new ErrorEmbed("this user has no active presence"))
    }

    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd
