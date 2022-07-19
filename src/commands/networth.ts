import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBalance, getBankBalance, getGuildByUser, getInventory, getItems, getWorkers } from "../utils/economy/utils";
import { getAllWorkers, Worker } from "../utils/economy/workers";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("networth", "view your net worth", Categories.MONEY).setAliases(["net"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 30);

    const items = getItems();
    const allWorkers = getAllWorkers();

    const inventory = await getInventory(message.member);
    const workers = await getWorkers(message.member);
    const guild = await getGuildByUser(message.member);

    const money = (await getBalance(message.member)) + (await getBankBalance(message.member));
    let inventoryWorth = 0;
    let workersWorth = 0;
    let guildWorth = 0;

    for (const itemId in inventory) {
        if (items[itemId].worth) {
            inventoryWorth += items[itemId].worth * inventory[itemId];
        }
    }

    for (const workerId in workers) {
        if (workers[workerId].level > 1) {
            const constructor = allWorkers.get(parseInt(workerId));
            const worker = new constructor();

            workersWorth += worker.cost + worker.cost * workers[workerId].level;
        }

        const worker = Worker.fromStorage(workers[workerId]);

        workersWorth += worker.stored * worker.perItem;
    }

    if (guild) {
        guildWorth = guild.balance;
    }

    const total = Math.floor(guildWorth + workersWorth + inventoryWorth + money);

    if (total == 0) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, "damn bro ur broke. $0 net worth lol!")] });
    }

    let description = `🌍 $**${total.toLocaleString()}**\n\n`;

    if (money > 0) {
        description += ` -- 💳 $**${Math.floor(money).toLocaleString()}**\n`;
    }

    if (inventoryWorth > 0) {
        description += ` -- 🎒 $**${Math.floor(inventoryWorth).toLocaleString()}**\n`;
    }

    if (workersWorth > 0) {
        description += ` -- 👷‍♂️ $**${Math.floor(workersWorth).toLocaleString()}**\n`;
    }

    if (guildWorth > 0) {
        description += ` -- 👥 $**${Math.floor(guildWorth).toLocaleString()}**`;
    }

    const embed = new CustomEmbed(message.member, description).setHeader("your net worth", message.author.avatarURL());

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
