import { CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    addItemUse,
    createUser,
    getBalance,
    getBoosters,
    getInventory,
    getItems,
    getMaxBitcoin,
    getMaxEthereum,
    getXp,
    setInventory,
    updateBalance,
    updateXp,
    userExists,
} from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("fish", "go to a pond and fish", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const inventory = await getInventory(message.member);
    const items = getItems();

    let fishingRod;

    if (inventory["incredible_fishing_rod"] && inventory["incredible_fishing_rod"] > 0) {
        fishingRod = "incredible_fishing_rod";
    } else if (inventory["fishing_rod"] && inventory["fishing_rod"] > 0) {
        fishingRod = "fishing_rod";
    } else if (inventory["terrible_fishing_rod"] && inventory["terrible_fishing_rod"] > 0) {
        fishingRod = "terrible_fishing_rod";
    }

    if (!fishingRod) {
        return send({
            embeds: [
                new ErrorEmbed(
                    "you need a fishing rod to fish\n[how do i get a fishing rod?](https://docs.nypsi.xyz/economy/fishinghunting)"
                ),
            ],
        });
    }

    await addCooldown(cmd.name, message.member, 1800);

    const fishItems = [
        "money:1000",
        "money:5000",
        "money:10000",
        "money:20000",
        "xp:5",
        "xp:10",
        "xp:15",
        "xp:25",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
        "nothing",
    ];

    for (const i of Array.from(Object.keys(items))) {
        fishItems.push(i);
    }

    await addItemUse(message.member, fishingRod);

    let times = 1;

    if (fishingRod == "fishing_rod") {
        times = 2;
    } else if (fishingRod == "incredible_fishing_rod") {
        times = 3;
    }

    const boosters = await getBoosters(message.member);

    let unbreaking = false;

    for (const boosterId of boosters.keys()) {
        if (items[boosterId].boosterEffect.boosts.includes("fish")) {
            if (items[boosterId].id == "unbreaking") {
                unbreaking = true;
            } else {
                times++;
            }
        }
    }

    if (!unbreaking) {
        inventory[fishingRod]--;

        if (inventory[fishingRod] <= 0) {
            delete inventory[fishingRod];
        }

        await setInventory(message.member, inventory);
    }

    const foundItems = [];

    for (let i = 0; i < times; i++) {
        const fishItemsModified = [];

        for (const i of fishItems) {
            if (items[i]) {
                if (items[i].role == "prey") continue;
                if (items[i].role == "tool") continue;
                if (items[i].role == "car") continue;
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15);
                    if (chance == 4 && fishingRod == "incredible_fishing_rod") {
                        if (items[i].role == "fish") {
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                        }
                        fishItemsModified.push(i);
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3);
                    if (chance == 2 && fishingRod != "terrible_fishing_rod") {
                        if (items[i].role == "fish") {
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                            fishItemsModified.push(i);
                        }
                        fishItemsModified.push(i);
                    }
                } else if (items[i].rarity == 2 && fishingRod != "terrible_fishing_rod") {
                    if (items[i].role == "fish") {
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                    }
                    fishItemsModified.push(i);
                } else if (items[i].rarity == 1) {
                    if (items[i].role == "fish") {
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                    }
                    fishItemsModified.push(i);
                    fishItemsModified.push(i);
                } else if (items[i].rarity == 0) {
                    if (items[i].role == "fish") {
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                    } else if (fishingRod == "incredible_fishing_rod") {
                        fishItemsModified.push(i);
                    } else {
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                        fishItemsModified.push(i);
                    }
                }
            } else {
                fishItemsModified.push(i);
                fishItemsModified.push(i);
            }
        }

        const chosen = fishItemsModified[Math.floor(Math.random() * fishItemsModified.length)];

        if (chosen == "nothing") continue;

        if (chosen == "bitcoin") {
            const owned = inventory["bitcoin"] || 0;
            const max = await getMaxBitcoin(message.member);

            if (owned + 1 > max) {
                i--;
                continue;
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1;
                } else {
                    inventory[chosen] = 1;
                }
                foundItems.push(`${items[chosen].emoji} ${items[chosen].name}`);
            }
        } else if (chosen == "ethereum") {
            const owned = inventory["ethereum"] || 0;
            const max = await getMaxEthereum(message.member);

            if (owned + 1 > max) {
                i--;
                continue;
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1;
                } else {
                    inventory[chosen] = 1;
                }
                foundItems.push(`${items[chosen].emoji} ${items[chosen].name}`);
            }
        } else if (chosen.includes("money:") || chosen.includes("xp:")) {
            if (chosen.includes("money:")) {
                const amount = parseInt(chosen.substr(6));

                await updateBalance(message.member, (await getBalance(message.member)) + amount);
                foundItems.push("$" + amount.toLocaleString());
            } else if (chosen.includes("xp:")) {
                const amount = parseInt(chosen.substr(3));

                await updateXp(message.member, (await getXp(message.member)) + amount);
                foundItems.push(amount + "xp");
            }
        } else {
            let amount = 1;

            if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun") {
                amount = 5;
            } else if (chosen == "fishing_rod" || chosen == "gun") {
                amount = 10;
            } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun") {
                amount = 10;
            }

            if (inventory[chosen]) {
                inventory[chosen] += amount;
            } else {
                inventory[chosen] = amount;
            }
            foundItems.push(`${items[chosen].emoji} ${items[chosen].name}`);
        }
    }
    await setInventory(message.member, inventory);

    const embed = new CustomEmbed(message.member, `you go to the pond and cast your **${items[fishingRod].name}**`);

    const msg = await send({ embeds: [embed] });

    embed.setDescription(
        `you go to the pond and cast your **${items[fishingRod].name}**\n\nyou caught${
            foundItems.length > 0 ? `: \n - ${foundItems.join("\n - ")}` : " **nothing**"
        }`
    );

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    setTimeout(() => {
        edit({ embeds: [embed] }, msg);
    }, 1500);
}

cmd.setRun(run);

module.exports = cmd;
