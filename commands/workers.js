const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const {
    getPrestige,
    getWorkers,
    getBalance,
    addWorker,
    updateBalance,
    userExists,
    createUser,
    emptyWorkersStored,
    upgradeWorker,
} = require("../utils/economy/utils")
const { getAllWorkers, Worker } = require("../utils/economy/workers")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command(
    "workers",
    "view the available workers and manage your own",
    categories.MONEY
).setAliases(["worker", "minion", "minions"])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const workers = getAllWorkers()

    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 5

    if (isPremium(message.author.id)) {
        cooldownLength = 2
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const listAllWorkers = () => {
        const embed = new CustomEmbed(
            message.member,
            false,
            "workers create items over time, which you can sell for money"
        )
            .setTitle("workers | " + message.author.username)
            .setFooter(`${getPrefix(message.guild)}workers help`)

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

        const embed = new CustomEmbed(
            message.member,
            false,
            `you have ${Object.keys(personalWorkers).length} worker${
                Object.keys(personalWorkers).length == 1 ? "" : "s"
            }`
        )
            .setTitle("your workers")
            .setFooter(`${getPrefix(message.guild)}workers help`)

        for (let worker of Object.keys(personalWorkers)) {
            worker = Worker.fromJSON(personalWorkers[worker])
            embed.addField(
                `${worker.name} [${worker.id}]`,
                `**level** ${worker.level}${
                    worker.level >= 5
                        ? ""
                        : `\n**upgrade cost** $${worker.getUpgradeCost().toLocaleString()}`
                }\n**item worth** $${worker.perItem.toLocaleString()} / ${
                    worker.itemName
                }\n**rate** ${worker.getHourlyRate().toLocaleString()} ${
                    worker.itemName
                } / hour\n\n` +
                    `**inventory** ${worker.stored.toLocaleString()} ${
                        worker.itemName
                    } / ${worker.maxStorage.toLocaleString()} ($${(
                        worker.stored * worker.perItem
                    ).toLocaleString()})`,
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
            }

            if (!worker) {
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

            if (!isPremium(message.author.id) || !getTier(message.author.id) >= 3) {
                if (worker.prestige > getPrestige(message.member)) {
                    return message.channel.send(
                        new ErrorEmbed(
                            `you need to be prestige **${
                                worker.prestige
                            }** to buy this worker, you are prestige **${getPrestige(
                                message.member
                            )}**`
                        )
                    )
                }
            }

            if (getBalance(message.member) < worker.cost) {
                return message.channel.send(new ErrorEmbed("you cannot afford this worker"))
            }

            const personalWorkers = getWorkers(message.member)

            for (let worker1 of Object.keys(personalWorkers)) {
                worker1 = personalWorkers[worker1]

                if (worker1.id == worker.id) {
                    return message.channel.send(new ErrorEmbed("you already have this worker"))
                }
            }

            updateBalance(message.member, getBalance(message.member) - worker.cost)

            addWorker(message.member, worker.id)

            return message.channel.send(
                new CustomEmbed(message.member, false, `✅ you have bought a **${worker.name}**`)
            )
        } else if (args[0].toLowerCase() == "claim" || args[0].toLowerCase() == "sell") {
            const personalWorkers = getWorkers(message.member)

            let amountEarned = 0
            let earnedBreakdown = ""

            for (let worker of Object.keys(personalWorkers)) {
                worker = personalWorkers[worker]

                amountEarned += Math.floor(worker.perItem * worker.stored)
                earnedBreakdown += `\n${worker.name} +$${Math.floor(
                    worker.perItem * worker.stored
                ).toLocaleString()} (${worker.stored} ${worker.itemName})`
            }

            if (amountEarned == 0) {
                return message.channel.send(
                    new ErrorEmbed("you have no money to claim from your workers")
                )
            }

            emptyWorkersStored(message.member)
            updateBalance(message.member, getBalance(message.member) + amountEarned)

            const embed = new CustomEmbed(
                message.member,
                false,
                `+$**${amountEarned.toLocaleString()}**\n${earnedBreakdown}`
            ).setTitle("workers | " + message.author.username)

            return message.channel.send(embed)
        } else if (args[0].toLowerCase() == "upgrade") {
            if (args.length == 1) {
                return message.channel.send(
                    new ErrorEmbed(`${getPrefix(message.guild)}workers upgrade <id or name>`)
                )
            }

            let worker

            if (args.length == 2) {
                if (args[1].length == 1) {
                    if (workers.get(parseInt(args[1]))) {
                        worker = workers.get(parseInt(args[1]))
                    }
                }
            }

            if (!worker) {
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

            worker = getWorkers(message.member)[worker.id]

            if (!worker) {
                return message.channel.send(new ErrorEmbed("you don't have this worker"))
            }

            worker = Worker.fromJSON(worker)

            if (worker.level >= 5) {
                return message.channel.send(new ErrorEmbed("this worker is already max level"))
            }

            if (getBalance(message.member) < worker.getUpgradeCost()) {
                return message.channel.send(
                    new ErrorEmbed(
                        `the upgrade cost for \`${
                            worker.name
                        }\` is $${worker.getUpgradeCost().toLocaleString()}, you can't afford this`
                    )
                )
            }

            updateBalance(message.member, getBalance(message.member) - worker.getUpgradeCost())

            upgradeWorker(message.member, worker.id)

            const embed = new CustomEmbed(message.member, true)

            embed.setTitle("workers | " + message.author.username)

            worker = getWorkers(message.member)[worker.id]

            worker = Worker.fromJSON(worker)

            embed.setDescription(
                `your ${worker.name} has been upgraded to level ${worker.level}\n\n` +
                    `**item worth** $${worker.perItem.toLocaleString()} / ${worker.itemName}\n` +
                    `**rate** ${worker.getHourlyRate()} ${worker.itemName} / hour\n` +
                    `**inventory** ${worker.stored.toLocaleString()} ${
                        worker.itemName
                    } / ${worker.maxStorage.toLocaleString()}`
            )

            return message.channel.send(embed)
        } else if (args[0].toLowerCase() == "list") {
            return listAllWorkers()
        } else {
            const embed = new CustomEmbed(message.member, false).setTitle(
                "workers | " + message.author.username
            )

            embed.setDescription(
                `${getPrefix(message.guild)}**workers list** *list all available workers*\n` +
                    `${getPrefix(message.guild)}**workers buy** *buy a worker*\n` +
                    `${getPrefix(
                        message.guild
                    )}**workers claim** *claim money from your workers*\n` +
                    `${getPrefix(message.guild)}**workers upgrade** *upgrade a worker*`
            )

            return message.channel.send(embed)
        }
    }
}

cmd.setRun(run)

module.exports = cmd
