import { Message } from "discord.js"
const fetch = require("node-fetch")
const { getPrefix } = require("../utils/guilds/utils")
import { Command, Categories } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("lookup", "lookup ip addresses and domains", Categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message, args: string[]) {
    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("lookup help")
            .addField("usage", `${prefix}lookup ip <ip address>\n${prefix}lookup <domain>`)
            .addField(
                "help",
                "if you dont understand what this means you probably shouldn't use this command\nused to gain public information about an ip address or a registered domain"
            )
        return message.channel.send({ embeds: [embed] })
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    if (args[0] == "ip") {
        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed("you must include an ip address")] })
        }

        const url = "https://apimon.de/ip/" + args[1]
        let invalid = false

        const res = await fetch(url)
            .then((url) => url.json())
            .catch(() => {
                invalid = true
                return message.channel.send({ embeds: [new ErrorEmbed("invalid ip address")] })
            })

        if (invalid) return

        let ip
        let hostname
        let country
        let countryCurrency
        let timezone
        let region
        let ispName
        let ispOrg
        let ispEmail
        try {
            ip = res.ip_address
            hostname = res.hostname
            country = res.country.name.EN
            countryCurrency = res.country.currency.name
            timezone = "UTC " + res.utc_offset
            region = res.region
            ispName = res.as.name
            ispOrg = res.as.org
            ispEmail = res.as.abuse_contacts
        } catch {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid ip address")] })
        }

        const embed = new CustomEmbed(message.member, true, "`" + hostname + "`")
            .setTitle(ip)
            .setHeader("apimon.de")
            .addField(
                "location",
                "**country** `" +
                    country +
                    "`\n" +
                    "**region** `" +
                    region +
                    "`\n" +
                    "**currency** `" +
                    countryCurrency +
                    "`\n" +
                    "**timezone** `" +
                    timezone +
                    "`",
                true
            )
            .addField(
                "isp",
                "**name** `" + ispName + "`\n" + "**org** `" + ispOrg + "`\n" + "**abuse** `" + ispEmail + "`",
                true
            )
        return message.channel
            .send({ embeds: [embed] })
            .then((m) => setTimeout(() => m.delete(), 15000))
            .catch()
    }

    if (!args[0].includes(".")) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid domain")] })
    }

    const url = "https://apimon.de/whois/" + args[0]
    let invalid = false

    const res = await fetch(url)
        .then((url) => url.json())
        .catch(() => {
            invalid = true
            return message.channel.send({ embeds: [new ErrorEmbed("invalid domain")] })
        })

    if (invalid) return

    let domain
    let registrarName
    let registrarURL
    let registrarEmail
    let registrantName
    let registrantStreet
    let registrantCity
    let registrantRegion
    let registrantPhone
    let registrantEmail

    try {
        domain = res.domain
        registrarName = res.registrar.name
        registrarURL = res.registrar.url
        registrarEmail = res.registrar.email
        registrantName = res.registrant.name
        registrantStreet = res.registrant.street
        registrantCity = res.registrant.city
        registrantRegion = res.registrant.region
        registrantPhone = res.registrant.phone
        registrantEmail = res.registrant.email
    } catch {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid domain")] })
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle(domain)
        .setHeader("apimon.de")
        .addField(
            "registrant",
            "**name** `" +
                registrantName +
                "`\n" +
                "**street** `" +
                registrantStreet +
                "`\n" +
                "**city** `" +
                registrantCity +
                "`\n" +
                "**region** `" +
                registrantRegion +
                "`\n" +
                "**phone** `" +
                registrantPhone +
                "`\n" +
                "**email** `" +
                registrantEmail +
                "`",
            true
        )
        .addField(
            "registrar",
            "**name** `" +
                registrarName +
                "`\n" +
                "**url** `" +
                registrarURL +
                "`\n" +
                "**email** `" +
                registrarEmail +
                "`\n",
            true
        )
    return message.channel
        .send({ embeds: [embed] })
        .then((m) => setTimeout(() => m.delete(), 15000))
        .catch()
}

cmd.setRun(run)

module.exports = cmd
