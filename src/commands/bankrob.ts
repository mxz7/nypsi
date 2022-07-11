import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    getInventory,
    setInventory,
    addItemUse,
} from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import * as shuffle from "shuffle-array";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", Categories.MONEY);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) createUser(message.member);

    if ((await getBalance(message.member)) < 1000) {
        return await message.channel.send({
            embeds: [new ErrorEmbed("you must have atleast $1k in your wallet to rob a bank")],
        });
    }

    const bankWorth = new Map();

    if ((await getBalance(message.member)) > 100000000) {
        bankWorth.set("barclays", Math.round((await getBalance(message.member)) * 0.01));
        bankWorth.set("santander", Math.round((await getBalance(message.member)) * 0.008));
        bankWorth.set("bankofamerica", Math.round((await getBalance(message.member)) * 0.0125));
        bankWorth.set("lloyds", Math.round((await getBalance(message.member)) * 0.0075));
        bankWorth.set("hsbc", Math.round((await getBalance(message.member)) * 0.009));
        bankWorth.set("fleeca", Math.round((await getBalance(message.member)) * 0.005));
        bankWorth.set("mazebank", Math.round((await getBalance(message.member)) * 0.01));
    } else if ((await getBalance(message.member)) > 10000000) {
        bankWorth.set("barclays", Math.round((await getBalance(message.member)) * 0.1));
        bankWorth.set("santander", Math.round((await getBalance(message.member)) * 0.08));
        bankWorth.set("bankofamerica", Math.round((await getBalance(message.member)) * 0.125));
        bankWorth.set("lloyds", Math.round((await getBalance(message.member)) * 0.075));
        bankWorth.set("hsbc", Math.round((await getBalance(message.member)) * 0.09));
        bankWorth.set("fleeca", Math.round((await getBalance(message.member)) * 0.05));
        bankWorth.set("mazebank", Math.round((await getBalance(message.member)) * 0.1));
    } else if ((await getBalance(message.member)) > 500000) {
        bankWorth.set("barclays", Math.round((await getBalance(message.member)) * 1));
        bankWorth.set("santander", Math.round((await getBalance(message.member)) * 0.8));
        bankWorth.set("bankofamerica", Math.round((await getBalance(message.member)) * 1.25));
        bankWorth.set("lloyds", Math.round((await getBalance(message.member)) * 0.75));
        bankWorth.set("hsbc", Math.round((await getBalance(message.member)) * 0.9));
        bankWorth.set("fleeca", Math.round((await getBalance(message.member)) * 0.5));
        bankWorth.set("mazebank", Math.round((await getBalance(message.member)) * 1));
    } else {
        bankWorth.set("barclays", Math.round((await getBalance(message.member)) * 2));
        bankWorth.set("santander", Math.round((await getBalance(message.member)) * 1.7));
        bankWorth.set("bankofamerica", Math.round((await getBalance(message.member)) * 2.5));
        bankWorth.set("lloyds", Math.round((await getBalance(message.member)) * 1.5));
        bankWorth.set("hsbc", Math.round((await getBalance(message.member)) * 1.8));
        bankWorth.set("fleeca", Math.round((await getBalance(message.member)) * 1.1));
        bankWorth.set("mazebank", Math.round((await getBalance(message.member)) * 2));
    }

    if (args[0] == "status") {
        let bankList = "";

        for (const bank1 of bankWorth.keys()) {
            bankList = bankList + "**" + bank1 + "** $" + bankWorth.get(bank1).toLocaleString() + "\n";
        }

        bankList = bankList + "the most you can recieve on one robbery is 75% of the bank's balance";

        const embed = new CustomEmbed(message.member, false, bankList).setHeader("current bank balances");

        return message.channel.send({ embeds: [embed] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 600);

    const banks = ["barclays", "santander", "bankofamerica", "lloyds", "hsbc", "fleeca", "mazebank"];

    const bank = shuffle(banks)[Math.floor(Math.random() * banks.length)];
    const amount = Math.floor(Math.random() * 60) + 15;
    const caught = Math.floor(Math.random() * 15);

    let robbedAmount = 0;

    let percentLost;
    let amountLost;

    const embed = new CustomEmbed(message.member, true, "robbing " + bank + "..").setHeader(
        "bank robbery",
        message.author.avatarURL()
    );

    const embed2 = new CustomEmbed(message.member, true, "robbing " + bank + "..").setHeader(
        "bank robbery",
        message.author.avatarURL()
    );

    if (caught <= 10) {
        percentLost = Math.floor(Math.random() * 50) + 10;
        amountLost = Math.round((percentLost / 100) * (await getBalance(message.member)));

        const inventory = getInventory(message.member);

        if (inventory["lawyer"] && inventory["lawyer"] > 0) {
            addItemUse(message.member, "lawyer");
            inventory["lawyer"]--;

            if (inventory["lawyer"] == 0) {
                delete inventory["lawyer"];
            }

            setInventory(message.member, inventory);

            updateBalance(message.member, (await getBalance(message.member)) - Math.floor(amountLost * 0.25));

            embed2.addField(
                "**you were caught**",
                `thanks to your lawyer, you only lost $**${Math.floor(amountLost * 0.25).toLocaleString()}**`
            );
            embed2.setColor("#e4334f");
        } else {
            updateBalance(message.member, (await getBalance(message.member)) - amountLost);

            embed2.addField(
                "**you were caught**",
                "**you lost** $" + amountLost.toLocaleString() + " (" + percentLost + "%)"
            );
            embed2.setColor("#e4334f");
        }
    } else {
        robbedAmount = Math.round((amount / 100) * bankWorth.get(bank));

        updateBalance(message.member, (await getBalance(message.member)) + robbedAmount);

        embed2.addField("**success!!**", "**you stole** $" + robbedAmount.toLocaleString() + " from **" + bank + "**");
        embed2.setColor("#5efb8f");
    }

    message.channel.send({ embeds: [embed] }).then((m) => {
        setTimeout(() => {
            m.edit({ embeds: [embed2] });
        }, 1500);
    });
}

cmd.setRun(run);

module.exports = cmd;
