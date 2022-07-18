import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    setInventory,
    getInventory,
    addItemUse,
} from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("storerob", "attempt to rob a store for a reward", Categories.MONEY).setAliases(["shoprob"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    if ((await getBalance(message.member)) < 1000) {
        return await message.channel.send({
            embeds: [new ErrorEmbed("you must have atleast $1k in your wallet to rob a store")],
        });
    }

    const shopWorth = new Map();

    if ((await getBalance(message.member)) > 100000000) {
        shopWorth.set("primark", Math.round((await getBalance(message.member)) * 0.0005));
        shopWorth.set("asda", Math.round((await getBalance(message.member)) * 0.005));
        shopWorth.set("tesco", Math.round((await getBalance(message.member)) * 0.002));
        shopWorth.set("morrisons", Math.round((await getBalance(message.member)) * 0.001));
        shopWorth.set("walmart", Math.round((await getBalance(message.member)) * 0.005));
        shopWorth.set("target", Math.round((await getBalance(message.member)) * 0.002));
        shopWorth.set("7eleven", Math.round((await getBalance(message.member)) * 0.001));
    } else if ((await getBalance(message.member)) > 10000000) {
        shopWorth.set("primark", Math.round((await getBalance(message.member)) * 0.005));
        shopWorth.set("asda", Math.round((await getBalance(message.member)) * 0.05));
        shopWorth.set("tesco", Math.round((await getBalance(message.member)) * 0.02));
        shopWorth.set("morrisons", Math.round((await getBalance(message.member)) * 0.01));
        shopWorth.set("walmart", Math.round((await getBalance(message.member)) * 0.05));
        shopWorth.set("target", Math.round((await getBalance(message.member)) * 0.02));
        shopWorth.set("7eleven", Math.round((await getBalance(message.member)) * 0.01));
    } else if ((await getBalance(message.member)) > 500000) {
        shopWorth.set("primark", Math.round((await getBalance(message.member)) * 0.05));
        shopWorth.set("asda", Math.round((await getBalance(message.member)) * 0.5));
        shopWorth.set("tesco", Math.round((await getBalance(message.member)) * 0.2));
        shopWorth.set("morrisons", Math.round((await getBalance(message.member)) * 0.1));
        shopWorth.set("walmart", Math.round((await getBalance(message.member)) * 0.5));
        shopWorth.set("target", Math.round((await getBalance(message.member)) * 0.2));
        shopWorth.set("7eleven", Math.round((await getBalance(message.member)) * 0.1));
    } else {
        shopWorth.set("primark", Math.round((await getBalance(message.member)) * 0.1));
        shopWorth.set("asda", Math.round((await getBalance(message.member)) * 0.7));
        shopWorth.set("tesco", Math.round((await getBalance(message.member)) * 0.4));
        shopWorth.set("morrisons", Math.round((await getBalance(message.member)) * 0.3));
        shopWorth.set("walmart", Math.round((await getBalance(message.member)) * 0.7));
        shopWorth.set("target", Math.round((await getBalance(message.member)) * 0.3));
        shopWorth.set("7eleven", Math.round((await getBalance(message.member)) * 0.3));
    }

    if (args[0] == "status") {
        let shopList = "";

        for (const shop1 of shopWorth.keys()) {
            shopList = shopList + "**" + shop1 + "** $" + shopWorth.get(shop1).toLocaleString() + "\n";
        }

        shopList = shopList + "the most you can recieve on one robbery is 90% of the store's balance";

        const embed = new CustomEmbed(message.member, shopList).setHeader("current store balances");

        return message.channel.send({ embeds: [embed] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 600);

    const shops = Array.from(shopWorth.keys());

    const shop = shops[Math.floor(Math.random() * shops.length)];
    const amount = Math.floor(Math.random() * 85) + 5;
    const caught = Math.floor(Math.random() * 15);

    let robbedAmount = 0;

    let percentLost;
    let amountLost;

    const embed = new CustomEmbed(message.member, "robbing " + shop + "..").setHeader(
        "store robbery",
        message.author.avatarURL()
    );

    const embed2 = new CustomEmbed(message.member, "robbing " + shop + "..").setHeader(
        "store robbery",
        message.author.avatarURL()
    );

    if (caught <= 5) {
        percentLost = Math.floor(Math.random() * 50) + 10;
        amountLost = Math.round((percentLost / 100) * (await getBalance(message.member)));

        const inventory = await getInventory(message.member);

        if (inventory["lawyer"] && inventory["lawyer"] > 0) {
            await addItemUse(message.member, "lawyer");
            inventory["lawyer"]--;

            if (inventory["lawyer"] == 0) {
                delete inventory["lawyer"];
            }

            await setInventory(message.member, inventory);

            await updateBalance(message.member, (await getBalance(message.member)) - Math.floor(amountLost * 0.25));

            embed2.addField(
                "**you were caught**",
                `thanks to your lawyer, you only lost $**${Math.floor(amountLost * 0.25).toLocaleString()}**`
            );
            embed2.setColor("#e4334f");
        } else {
            await updateBalance(message.member, (await getBalance(message.member)) - amountLost);

            embed2.addField(
                "**you were caught**",
                "**you lost** $" + amountLost.toLocaleString() + " (" + percentLost + "%)"
            );
            embed2.setColor("#e4334f");
        }
    } else {
        robbedAmount = Math.round((amount / 100) * shopWorth.get(shop));

        await updateBalance(message.member, (await getBalance(message.member)) + robbedAmount);

        embed2.addField("**success!!**", "**you stole** $" + robbedAmount.toLocaleString() + " from **" + shop + "**");
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
