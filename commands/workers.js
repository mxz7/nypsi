const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { getPrestige, getWorkers, getBalance, addWorker, updateBalance } = require("../utils/economy/utils")
const { getAllWorkers, Worker } = require("../utils/economy/workers")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command(
    "workers",
    "view all of the available workers",
    categories.MONEY
).setAliases(["worker", "minion", "minions"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const workers = getAllWorkers()

    const listAllWorkers = () => {
        const embed = new CustomEmbed(
            message.member,
            false,
            "workers create items over time, which you can sell for money"
        ).setTitle("workers | " + message.author.username)

        for (let worker of Array.from(workers.keys())) {
            worker = workers.get(worker)
            embed.addField(
                `${worker.name} [${worker.id}]`,
                `**cost** $${worker.cost.toLocaleString()}\n**prestige** ${
                    worker.prestige
                }\n**item worth** $${worker.perItem.toLocaleString()} / ${
                    worker.itemName
                }\n**rate** ${worker.getHourlyRate().toLocaleString()} ${worker.itemName} / hour`,
                true
            )
        }

        return message.channel.send(embed)
    }

    const listPersonalWorkers = () => {
        const personalWorkers = getWorkers(message.member)

        const embed = new CustomEmbed(message.member, false).setTitle("your workers")

        for (let worker of Object.keys(getWorkers(message.member))) {
            worker = Worker.fromJSON(personalWorkers[worker])
            embed.addField(
                `${worker.name} [${worker.id}]`,
                `**level** ${
                    worker.level
                }\n**upgrade cost** $${worker
                    .getUpgradeCost()
                    .toLocaleString()}\n**item worth** $${worker.perItem.toLocaleString()} / ${
                    worker.itemName
                }\n**rate** ${worker.getHourlyRate().toLocaleString()} ${worker.itemName} / hour`,
                true
            )
        }

        return message.channel.send(embed)
    }

    if (args.length == 0) {
        if (Object.keys(getWorkers(message.member)).length == 0) {
            return listAllWorkers()
        } else {
            return listPersonalWorkers()
        }
    } else {
        if (args[0].toLowerCase() == "buy") {
            if (args.length == 1) {
                return message.channel.send(
                    new ErrorEmbed(`${getPrefix(message.guild)}workers buy <id or name>`)
                )
            }

            let worker

            if (args.length == 2) {
                if (args[1].length == 1) {
                    if (workers.get(parseInt(args[1]))) {
                        worker = workers.get(parseInt(args[1]))
                    }
                }
            } else {
                args.shift()
                const name = args.join(" ").toLowerCase()
                for (let worker1 of Array.from(workers.keys())) {
                    worker1 = workers.get(worker1)
                    if (worker1.name == name) {
                        worker = worker1
                        break
                    }
                }
            }

            if (!worker) {
                return message.channel.send(
                    new ErrorEmbed("invalid worker, please use the worker ID or worker name")
                )
            }

            if (!isPremium(message.author.id) && !getTier(message.author.id) >= 3) {
                if (worker.prestige > getPrestige(message.member)) {
                    return message.channel.send(
                        new ErrorEmbed(
                            `you need to be prestige **${
                                worker.prestige
                            }** to buy this worker, you are prestige **${getPrestige(message.member)}**`
                        )
                    )
                }
            }

            if (getBalance(message.member) < worker.cost) {
                return message.channel.send(new ErrorEmbed("you cannot afford this worker"))
            }

            updateBalance(message.member, getBalance(message.member) - worker.cost)

            addWorker(message.member, worker.id)

            return message.channel.send(new CustomEmbed(message.member, false, `✅ you have bought a **${worker.name}**`))
        }
    }
}

cmd.setRun(run)

module.exports = cmd
