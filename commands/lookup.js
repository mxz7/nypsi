const { MessageEmbed } = require("discord.js");
const fetch = require("node-fetch");
const { getColor } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "lookup",
    description: "lookup ip addresses and domains",
    category: "info",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        const color = getColor(message.member)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("lookup help")
                .addField("usage", "$lookup ip <ip address>\n$lookup <domain>")
                .addField("help", "if you dont understand what this means you probably shouldn't use this command\nused to gain public information about an ip address or a registered domain")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed)
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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        if (args[0] == "ip") {

            if (args.length == 1) {
                return message.channel.send("❌ you must include an ip address")
            }

            const url = "https://apimon.de/ip/" + args[1]
            let invalid = false

            const res = await fetch(url).then(url => url.json()).catch(() => {
                invalid = true
                return message.channel.send("❌ invalid ip address")
            })

            if (invalid) return

            const ip = res.ip_address
            const hostname = res.hostname
            const country = res.country.name.EN
            const countryCurrency = res.country.currency.name
            const timezone = "UTC " + res.utc_offset
            const region = res.region
            const ispName = res.as.name
            const ispOrg = res.as.org
            const ispEmail = res.as.abuse_contacts

            const embed = new MessageEmbed()
                .setTitle(ip)
                .setAuthor("apimon.de")
                .setColor(color)
                .setDescription("`" + hostname + "`")
                .addField("location", "**country** `" + country + "`\n" +
                    "**region** `" + region + "`\n" +
                    "**currency** `" + countryCurrency + "`\n" +
                    "**timezone** `" + timezone + "`", true)
                .addField("isp", "**name** `" + ispName + "`\n" +
                    "**org** `" + ispOrg + "`\n" +
                    "**abuse** `" + ispEmail + "`", true)
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).then(m => m.delete({timeout: 15000})).catch()
        }

        if (!args[0].includes(".")) {
            return message.channel.send("❌ invalid domain")
        }

        const url = "https://apimon.de/whois/" + args[0]
        let invalid = false

        const res = await fetch(url).then(url => url.json()).catch(() => {
            invalid = true
            return message.channel.send("❌ invalid ip domain")
        })

        if (invalid) return

        const domain = res.domain
        const registrarName = res.registrar.name
        const registrarURL = res.registrar.url
        const registrarEmail = res.registrar.email
        const registrantName = res.registrant.name
        const registrantStreet = res.registrant.street
        const registrantCity = res.registrant.city
        const registrantRegion = res.registrant.region
        const registrantPhone = res.registrant.phone
        const registrantEmail = res.registrant.email
        
        const embed = new MessageEmbed()
            .setTitle(domain)
            .setAuthor("apimon.de")
            .setColor(color)
            .addField("registrant", "**name** `" + registrantName + "`\n" +
                "**street** `" + registrantStreet + "`\n" +
                "**city** `" + registrantCity + "`\n" +
                "**region** `" + registrantRegion + "`\n" +
                "**phone** `" + registrantPhone + "`\n" +
                "**email** `" + registrantEmail + "`", true)
            .addField("registrar", "**name** `" + registrarName + "`\n" +
                "**url** `" + registrarURL + "`\n" +
                "**email** `" + registrarEmail + "`\n", true)
            .setFooter("bot.tekoh.wtf")
        return message.channel.send(embed).then(m => m.delete({timeout: 15000})).catch()
    }
}