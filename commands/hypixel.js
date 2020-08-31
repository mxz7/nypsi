const { MessageEmbed } = require("discord.js");
const fetch = require("node-fetch")
const { getColor } = require("../utils/utils");

const cooldown = new Map()

module.exports = {
    name: "hypixel",
    description: "view hypixel stats for a minecraft account",
    category: "info",
    aliases: ["h"],
    run: async (message, args) => {

        if (args.length == 0) {
            return message.channel.send("❌ $h <username> (sw/bw)");
        }

        const color = getColor(message.member)

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const username = args[0]

        const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username
        let uuid

        try {
            uuid = await fetch(uuidURL).then(uuidURL => uuidURL.json())
        } catch (e) {
            console.log(e)
            return message.channel.send("❌ invalid account");
        }

        let img = "https://hypixel.paniek.de/signature/" + uuid.id
        let url = "https://plancke.io/hypixel/player/stats/" + uuid.id

        if (args.length == 1) {
            img = img + "/general"
        } else if (args[1].toLowerCase() == "sw" || args[1].toLowerCase() == "skywars") {
            img = img + "/skywars"
            url = url + "#SkyWars"
        } else if (args[1].toLowerCase() == "bw" || args[1].toLowerCase() == "bedwars") {
            img = img + "/bedwars"
            url = url + "#BedWars"
        } else {
            return await message.channel.send("❌ invalid option - currently only bw/bedwars and sw/skywars are supported")
        }

        const embed = new MessageEmbed()
            .setTitle(uuid.name)
            .setURL(url)
            .setColor(color)
            .setImage(img)
            .setFooter("bot.tekoh.wtf")

        return await message.channel.send(embed)

    }
}