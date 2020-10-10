const { Message } = require("discord.js");
const { getMember } = require("../utils/utils")
const { profileExists, profileExistsID, createProfile, getProfile, getProfileID, updateProfile } = require("../socials/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js");
const { getPrefix } = require("../guilds/utils");

const cooldown = new Map()

const cmd = new Command("socials", "set yours and view people's different social media accounts", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.user.id)) {
        const init = cooldown.get(message.member.user.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 3 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    cooldown.set(message.member.user.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 3000);
    
    const prefix = getPrefix(message.guild)

    if (args.length <= 1 && args[0] != "help") {
        let member = message.member

        if (args.length == 1) {
            if (!message.mentions.members.first()) {
                member = getMember(message, args[0])
            } else {
                member = message.mentions.members.first();
            }
        }

        if (!member) {
            return message.channel.send(new ErrorEmbed("invalid user"));
        }

        if (!profileExists(member)) {
            createProfile(member)
        }

        const profile = getProfile(member)

        const embed = new CustomEmbed(message.member)
            .setFooter(`do ${prefix}socials help for commands`)

        if (member == message.member) {
            embed.setTitle("your socials")
        } else {
            embed.setTitle(member.user.tag + "'s socials | " + message.member.user.username)
        }
        
        if (profile.youtube.length == 0 && profile.twitter.length == 0 && profile.instagram.length == 0 && profile.snapchat.length == 0 && profile.email.length == 0) {
            embed.setDescription("❌ no social media accounts")
        } else {
            if (profile.youtube.length != 0) {
                const links = []

                for (l of profile.youtube) {
                    const username = l.split(" | ")[0]
                    const url = l.split(" | ")[1]

                    links.push(`[${username}](${url})`)
                }

                embed.addField("youtube", links.join("\n"), true)
            }

            if (profile.twitter.length != 0) {
                const links = []

                for (l of profile.twitter) {
                    const username = l.split(" | ")[0]
                    const url = l.split(" | ")[1]

                    links.push(`[${username}](${url})`)
                }

                embed.addField("twitter", links.join("\n"), true)
            }

            if (profile.instagram.length != 0) {
                const links = []

                for (l of profile.instagram) {
                    const username = l.split(" | ")[0]
                    const url = l.split(" | ")[1]

                    links.push(`[${username}](${url})`)
                }

                embed.addField("instagram", links.join("\n"), true)
            }

            if (profile.snapchat.length != 0) {
                const links = []

                for (l of profile.snapchat) {
                    const username = l.split(" | ")[0]
                    const url = l.split(" | ")[1]

                    links.push(`[${username}](${url})`)
                }

                embed.addField("snapchat", links.join("\n"), true)
            }

            if (profile.email.length != 0) {
                const links = []

                for (l of profile.email) {
                    links.push(l)
                }

                embed.addField("email", links.join("\n"), true)
            }
        }
        return message.channel.send(embed)
    } else {

        if (!profileExists(message.member)) createProfile(message.member)

        if (args[0].toLowerCase() == "help" || args.length < 3 || 
            (args[0].toLowerCase() != "youtube" 
                && args[0].toLowerCase() != "twitter" 
                && args[0].toLowerCase() != "instagram" 
                && args[0].toLowerCase() != "snapchat" 
                && args[0].toLowerCase() != "email") ||
            (args[1].toLowerCase() != "add" 
                && args[1].toLowerCase() != "del"
                && args[1] != "+"
                && args[1] != "-")) {

            const embed = new CustomEmbed(message.member, true, `${prefix}**socials <social media> add/+ <username>** *add a social media*\n${prefix}**socials <social media> del/- <username>** *remove a social media*\n${prefix}**socials <user>** *view a user's social medias*`)
                .setTitle("socials")
                .addField("supported social medias", "`youtube` `twitter` `instagram` `snapchat` `email`")

            return message.channel.send(embed)
        }

        if (args[1].toLowerCase() == "add" || args[1] == "+") {

            const profile = getProfile(message.member)

            switch (args[0].toLowerCase()) {
                case "youtube":
                    if (profile.youtube.length > 0) {
                        return message.channel.send(new ErrorEmbed("you already have the maximum amount of youtube accounts added (1)"))
                    }
                    if (args.length != 4) {
                        return message.channel.send(new ErrorEmbed("you must include a URL with youtube: $socials youtube add <username> <url>"))
                    } else {
                        if (!args[3].toLowerCase().includes("https://youtube.com/") && !args[3].toLowerCase().includes("https://www.youtube.com")) {
                            return message.channel.send(new ErrorEmbed("invalid youtube url"))
                        }
                    
                        if (args[3].toLowerCase().includes(".com/logout")) {
                            return message.channel.send(new ErrorEmbed("invalid youtube url"))
                        }
                    }
                    break
                case "twitter":
                    if (profile.twitter.length > 1) {
                        return message.channel.send(new ErrorEmbed("you already have the maximum amount of twitter accounts added (2)"))
                    }
                    break
                case "instagram":
                    if (profile.instagram.length > 1) {
                        return message.channel.send(new ErrorEmbed("you already have the maximum amount of instagram accounts added (2)"))
                    }
                    break
                case "snapchat":
                    if (profile.snapchat.length > 0) {
                        return message.channel.send(new ErrorEmbed("you already have the maximum amount of snapchat accounts added (1)"))
                    }
                    break
                case "email":
                    if (profile.email.length > 0) {
                        return message.channel.send(new ErrorEmbed("you already have the maximum amount of emails added (1)"))
                    }
                    if (!args[2].toLowerCase().includes("@") || !args[2].toLowerCase().includes(".")) {
                        return message.channel.send(new ErrorEmbed("invalid email address"))
                    }
            }

            const username = args[2]
            let url

            if (username.length > 21) {
                return message.channel.send(new ErrorEmbed("username cannot be longer than 21 characters"))
            }

            if (args[0].toLowerCase() == "youtube") {
                url = args[3].toLowerCase()
            } else {
                if (args[0].toLowerCase() == "twitter" || args[0].toLowerCase() == "instagram") {
                    url = "https://" + args[0].toLowerCase() + ".com/" + username
                } else if (args[0].toLowerCase() == "snapchat") {
                    url = "https://snapchat.com/add/" + username
                }
            }

            switch (args[0].toLowerCase()) {
                case "youtube":
                    profile.youtube.push(username + " | " + url)
                    break
                case "twitter":
                    profile.twitter.push(username + " | " + url)
                    break
                case "instagram":
                    profile.instagram.push(username + " | " + url)
                    break
                case "snapchat":
                    profile.snapchat.push(username + " | " + url)
                    break
                case "email":
                    profile.email.push(username)
                    break
            }

            updateProfile(message.member, profile)

            return message.channel.send(new CustomEmbed(message.member, false, "✅ added `" + username + "`"))
        } else if (args[1].toLowerCase() == "del" || args[1] == "-") {

            const profile = getProfile(message.member)
            const username = args[2]
            let usernames = []

            switch (args[0].toLowerCase()) {
                case "youtube": 
                    for (l of profile.youtube) {
                        usernames.push(l.split(" | ")[0])
                    }
                    break
                case "twitter":
                    for (l of profile.twitter) {
                        usernames.push(l.split(" | ")[0])
                    }
                    break
                case "instagram":
                    for (l of profile.instagram) {
                        usernames.push(l.split(" | ")[0])
                    }
                    break
                case "snapchat":
                    for (l of profile.snapchat) {
                        usernames.push(l.split(" | ")[0])
                    }
                    break
                case "email":
                    for (l of profile.email) {
                        usernames.push(l)
                    }
                    break
            }

            if (usernames.indexOf(username) == -1) {
                return message.channel.send(new ErrorEmbed("not a valid username to remove"))
            }

            switch (args[0].toLowerCase()) {
                case "youtube":
                    profile.youtube.splice(usernames.indexOf(username), 1)
                    break
                case "twitter":
                    profile.twitter.splice(usernames.indexOf(username), 1)
                    break
                case "instagram":
                    profile.instagram.splice(usernames.indexOf(username), 1)
                    break
                case "snapchat":
                    profile.snapchat.splice(usernames.indexOf(username), 1)
                    break
                case "email":
                    profile.email.splice(usernames.indexOf(username), 1)
                    break
            }

            return message.channel.send(new CustomEmbed(message.member, false, `✅ removed \`${username}\``))
        }
    }

}

cmd.setRun(run)

module.exports = cmd