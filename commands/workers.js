const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getWorkers } = require("../utils/economy/workers")

const cmd = new Command("workers", "view all of the available workers", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {

    if (args.length == 0) {
        const workers = getWorkers()

        const embed = new CustomEmbed(
            message.member,
            false,
            "workers create items over time, which you can sell for money"
        ).setTitle("workers")

        for (const worker of workers) {
            embed.addField(`${worker.name}`, `**cost** $${worker.cost.toLocaleString()}\n**prestige** ${worker.prestige}\n**item worth** $${worker.perItem.toLocaleString()} / ${worker.itemName}\n**rate** ${worker.getHourlyRate().toLocaleString()} ${worker.itemName} / hour`, true)
        }

        return message.channel.send(embed)
    }
}

cmd.setRun(run)

module.exports = cmd