import {
    CommandInteraction,
    GuildMember,
    InteractionReplyOptions,
    Message,
    MessageEditOptions,
    MessageOptions,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import prisma from "../utils/database/database";
import redis from "../utils/database/redis";
import {
    addBooster,
    addHandcuffs,
    addItemUse,
    createUser,
    getBoosters,
    getDMsEnabled,
    getInventory,
    getItems,
    hasPadlock,
    increaseBaseBankStorage,
    isHandcuffed,
    openCrate,
    setInventory,
    setPadlock,
    userExists,
} from "../utils/economy/utils";
import { getMember } from "../utils/functions/member";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("use", "use an item or open crates", Categories.MONEY).setAliases(["open", "activate"]);

cmd.slashEnabled = true;
cmd.slashData
    .addStringOption((option) =>
        option.setName("item").setDescription("the item you want to use").setRequired(true).setAutocomplete(true)
    )
    .addUserOption((option) => option.setName("member").setDescription("member to use your item on, if applicable"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions | InteractionReplyOptions) => {
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
            return await message.channel.send(data as MessageOptions);
        }
    };

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    `${prefix}use <item>\n\nuse items to open crates or to simply use the item's function`
                ).setHeader("use", message.author.avatarURL()),
            ],
        });
    }

    const items = getItems();
    const inventory = await getInventory(message.member);

    const searchTag = args[0].toLowerCase();

    let selected;

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : [];
        if (searchTag == itemName) {
            selected = itemName;
            break;
        } else if (searchTag == itemName.split("_").join("")) {
            selected = itemName;
            break;
        } else if (aliases.indexOf(searchTag) != -1) {
            selected = itemName;
            break;
        } else if (searchTag == items[itemName].name) {
            selected = itemName;
            break;
        }
    }

    selected = items[selected];

    if (!selected) {
        return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
    }

    if (selected.role == "car") {
        return send({
            embeds: [new ErrorEmbed(`cars are used for street races (${prefix}sr)`)],
        });
    }

    let cooldownLength = 10;

    if (selected.role == "crate") {
        cooldownLength = 5;
    } else if (selected.role == "booster") {
        cooldownLength = 5;
    }

    await addCooldown(cmd.name, message.member, cooldownLength);

    if (selected.id.includes("gun")) {
        return send({
            embeds: [new ErrorEmbed(`this item is used with ${prefix}hunt`)],
        });
    } else if (selected.id.includes("fishing")) {
        return send({
            embeds: [new ErrorEmbed(`this item is used with ${prefix}fish`)],
        });
    } else if (selected.id.includes("coin")) {
        return send({ embeds: [new ErrorEmbed("you cant use a coin 🙄")] });
    } else if (selected.id.includes("pickaxe")) {
        return send({ embeds: [new ErrorEmbed(`this item is used with ${prefix}mine`)] });
    } else if (selected.id.includes("furnace")) {
        return send({ embeds: [new ErrorEmbed(`this item is used with ${prefix}smelt`)] });
    }

    if (selected.role == "booster") {
        let boosters = await getBoosters(message.member);

        if (selected.stackable) {
            if (boosters.has(selected.id)) {
                if (boosters.get(selected.id).length >= selected.max) {
                    return send({
                        embeds: [new ErrorEmbed(`**${selected.name}** can only be stacked ${selected.max} times`)],
                    });
                }
            }
        } else {
            if (boosters.has(selected.id)) {
                return send({ embeds: [new ErrorEmbed(`**${selected.name}** cannot be stacked`)] });
            }
        }

        inventory[selected.id]--;

        if (inventory[selected.id] <= 0) {
            delete inventory[selected.id];
        }

        await setInventory(message.member, inventory);
        await addItemUse(message.member, selected.id);
        await addBooster(message.member, selected.id);

        boosters = await getBoosters(message.member);

        const embed = new CustomEmbed(message.member).setHeader("boosters", message.author.avatarURL());

        const currentBoosters: string[] = [];

        for (const boosterId of boosters.keys()) {
            if (boosters.get(boosterId).length == 1) {
                currentBoosters.push(
                    `**${items[boosterId].name}** ${items[boosterId].emoji} - expires <t:${Math.round(
                        boosters.get(boosterId)[0].expire / 1000
                    )}:R>`
                );
            } else {
                let lowest = boosters.get(boosterId)[0].expire;

                for (const booster of boosters.get(boosterId)) {
                    if (booster.expire < lowest) lowest = booster.expire;
                }

                currentBoosters.push(
                    `**${items[boosterId].name}** ${items[boosterId].emoji} \`x${
                        boosters.get(boosterId).length
                    }\` - next expires <t:${Math.round(boosters.get(boosterId)[0].expire / 1000)}:R>`
                );
            }
        }

        embed.setDescription(`activating **${selected.name}** booster...`);

        const msg = await send({ embeds: [embed] });

        embed.setDescription(`you have activated **${selected.name}**`);
        embed.addField("current boosters", currentBoosters.join("\n"));

        setTimeout(() => {
            return edit({ embeds: [embed] }, msg);
        }, 1000);
        return;
    }

    const embed = new CustomEmbed(message.member).setHeader("use", message.author.avatarURL());

    let laterDescription: string;

    if (selected.role == "crate") {
        await addItemUse(message.member, selected.id);
        const itemsFound = await openCrate(message.member, selected);

        embed.setDescription(`opening ${selected.emoji} ${selected.name}...`);

        laterDescription = `opening ${selected.emoji} ${selected.name}...\n\nyou found: \n - ${itemsFound.join("\n - ")}`;
    } else {
        switch (selected.id) {
            case "standard_watch":
                await addItemUse(message.member, selected.id);
                embed.setDescription("you look down at your watch to check the time..");
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`;
                break;

            case "golden_watch":
                await addItemUse(message.member, selected.id);
                embed.setDescription("you look down at your *golden* 😏 watch to check the time..");
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`;
                break;

            case "diamond_watch":
                await addItemUse(message.member, selected.id);
                embed.setDescription("you look down at your 💎 *diamond* 💎 watch to check the time..");
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`;
                break;

            case "calendar":
                await addItemUse(message.member, selected.id);
                embed.setDescription("you look at your calendar to check the date..");
                laterDescription = `you look at your calendar to check the date..\n\nit's ${new Date().toDateString()}`;
                break;

            case "padlock":
                if (await hasPadlock(message.member)) {
                    return send({
                        embeds: [new ErrorEmbed("you already have a padlock on your balance")],
                    });
                }

                await setPadlock(message.member, true);
                inventory["padlock"]--;

                if (inventory["padlock"] <= 0) {
                    delete inventory["padlock"];
                }

                await setInventory(message.member, inventory);

                await addItemUse(message.member, selected.id);

                embed.setDescription("✅ your padlock has been applied");
                break;

            case "lawyer":
                embed.setDescription("lawyers will be used automatically when you perform a robbery");
                break;

            case "lock_pick":
                if (message.guild.id == "747056029795221513") {
                    return send({ embeds: [new ErrorEmbed("this has been disabled in the support server")] });
                }

                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${prefix}use lockpick <member>`)],
                    });
                }

                let lockPickTarget; // eslint-disable-line

                if (!message.mentions.members.first()) {
                    lockPickTarget = await getMember(message.guild, args[1]);
                } else {
                    lockPickTarget = message.mentions.members.first();
                }

                if (!lockPickTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if (message.member == lockPickTarget) {
                    if ((await redis.exists(`cd:sex-chastity:${message.author.id}`)) == 1) {
                        await addItemUse(message.member, selected.id);
                        await redis.del(`cd:sex-chastity:${message.author.id}`);

                        embed.setDescription("picking chastity cage...");
                        laterDescription = "picking *chastity cage*...\n\nyou are no longer equipped with a *chastity cage*";
                        break;
                    }
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if (!(await hasPadlock(lockPickTarget))) {
                    return send({
                        embeds: [new ErrorEmbed("this member doesn't have a padlock")],
                    });
                }

                await setPadlock(lockPickTarget, false);

                inventory["lock_pick"]--;

                if (inventory["lock_pick"] <= 0) {
                    delete inventory["lock_pick"];
                }

                await addItemUse(message.member, selected.id);

                await setInventory(message.member, inventory);

                const targetEmbed = new CustomEmbed().setFooter({ text: "use $optout to optout of bot dms" });

                targetEmbed.setColor("#e4334f");
                targetEmbed.setTitle("your padlock has been picked");
                targetEmbed.setDescription(
                    "**" +
                        message.member.user.tag +
                        "** has picked your padlock in **" +
                        message.guild.name +
                        "**\n" +
                        "your money is no longer protected by a padlock"
                );

                if (await getDMsEnabled(lockPickTarget)) {
                    await lockPickTarget.send({ embeds: [targetEmbed] });
                }
                embed.setDescription(`picking **${lockPickTarget.user.tag}**'s padlock...`);
                laterDescription = `picking **${lockPickTarget.user.tag}'**s padlock...\n\nyou have successfully picked their padlock`;
                break;

            case "mask":
                const robCooldown = (await redis.exists(`cd:rob:${message.author.id}`)) == 1;
                const bankRobCooldown = (await redis.exists(`cd:bankrob:${message.author.id}`)) == 1;
                const storeRobcooldown = (await redis.exists(`cd:storerob:${message.author.id}`)) == 1;
                if (!robCooldown && !bankRobCooldown && !storeRobcooldown) {
                    return send({
                        embeds: [new ErrorEmbed("you are currently not on a rob cooldown")],
                    });
                }

                if (robCooldown) {
                    await redis.del(`cd:rob:${message.author.id}`);
                    embed.setDescription("you're wearing your **mask** and can now rob someone again");
                } else if (bankRobCooldown) {
                    await redis.del(`cd:bankrob:${message.author.id}`);
                    embed.setDescription("you're wearing your **mask** and can now rob a bank again");
                } else if (storeRobcooldown) {
                    await redis.del(`cd:storerob:${message.author.id}`);
                    embed.setDescription("you're wearing your **mask** and can now rob a store again");
                }

                inventory["mask"]--;

                if (inventory["mask"] <= 0) {
                    delete inventory["mask"];
                }

                await addItemUse(message.member, selected.id);

                await setInventory(message.member, inventory);
                break;

            case "radio":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${prefix}use radio <member>`)],
                    });
                }

                let radioTarget: GuildMember; // eslint-disable-line

                if (!message.mentions.members.first()) {
                    radioTarget = await getMember(message.guild, args[1]);
                } else {
                    radioTarget = message.mentions.members.first();
                }

                if (!radioTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if (message.member == radioTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if ((await redis.exists(`cd:rob-radio:${radioTarget.user.id}`)) == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`the police are already looking for **${radioTarget.user.tag}**`)],
                    });
                }

                await addItemUse(message.member, selected.id);

                await redis.set(`cd:rob-radio:${radioTarget.user.id}`, Date.now());
                await redis.expire(`cd:rob-radio:${radioTarget.user.id}`, 900);

                inventory["radio"]--;

                if (inventory["radio"] <= 0) {
                    delete inventory["radio"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("putting report out on police scanner...");
                laterDescription = `putting report out on police scanner...\n\nthe police are now looking for **${radioTarget.user.tag}**`;
                break;

            case "chastity_cage":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${prefix}use chastity <member>`)],
                    });
                }

                let chastityTarget: GuildMember; // eslint-disable-line

                if (!message.mentions.members.first()) {
                    chastityTarget = await getMember(message.guild, args[1]);
                } else {
                    chastityTarget = message.mentions.members.first();
                }

                if (!chastityTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if (message.member == chastityTarget) {
                    return send({
                        embeds: [new ErrorEmbed("why would you do that to yourself.")],
                    });
                }

                if ((await redis.exists(`cd:sex-chastity:${chastityTarget.user.id}`)) == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`**${chastityTarget.user.tag}** is already equipped with a chastity cage`)],
                    });
                }

                await addItemUse(message.member, selected.id);

                await redis.set(`cd:sex-chastity:${chastityTarget.user.id}`, Date.now());
                await redis.expire(`cd:sex-chastity:${chastityTarget.user.id}`, 10800);

                inventory["chastity_cage"]--;

                if (inventory["chastity_cage"] <= 0) {
                    delete inventory["chastity_cage"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("locking chastity cage...");
                laterDescription = `locking chastity cage...\n\n**${chastityTarget.user.tag}**'s chastity cage is now locked in place`;
                break;

            case "streak_token":
                const query = await prisma.economy.update({
                    where: {
                        userId: message.author.id,
                    },
                    data: {
                        dailyStreak: { increment: 1 },
                    },
                    select: {
                        dailyStreak: true,
                    },
                });

                inventory["streak_token"]--;

                if (inventory["streak_token"] <= 0) {
                    delete inventory["streak_token"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("applying token...");
                laterDescription = `applying token...\n\nyour new daily streak is: \`${query.dailyStreak}\``;
                break;

            case "stolen_credit_card":
                const amount = Math.floor(Math.random() * 499000) + 1000;
                await increaseBaseBankStorage(message.member, amount);

                inventory["stolen_credit_card"]--;

                if (inventory["stolen_credit_card"] <= 0) {
                    delete inventory["stolen_credit_card"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("using stolen credit card...");
                laterDescription = `using stolen credit card...\n\nsuccessfully added $**${amount.toLocaleString()}** to your bank capacity`;
                break;

            case "handcuffs":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${prefix}use handcuffs <member>`)],
                    });
                }

                let handcuffsTarget; // eslint-disable-line

                if (!message.mentions.members.first()) {
                    handcuffsTarget = await getMember(message.guild, args[1]);
                } else {
                    handcuffsTarget = message.mentions.members.first();
                }

                if (!handcuffsTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] });
                }

                if (message.member == handcuffsTarget) {
                    return send({ embeds: [new ErrorEmbed("bit of self bondage huh")] });
                }

                if (await isHandcuffed(handcuffsTarget.user.id)) {
                    return send({
                        embeds: [new ErrorEmbed(`**${handcuffsTarget.user.tag}** is already restrained`)],
                    });
                }

                await addItemUse(message.member, selected.id);

                await addHandcuffs(handcuffsTarget.id);

                inventory["handcuffs"]--;

                if (inventory["handcuffs"] <= 0) {
                    delete inventory["handcuffs"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription(`restraining **${handcuffsTarget.user.tag}**...`);
                laterDescription = `restraining **${handcuffsTarget.user.tag}**...\n\n**${handcuffsTarget.user.tag}** has been restrained for one minute`;
                break;
            case "cookie":
                inventory["cookie"]--;

                if (inventory["cookie"] <= 0) {
                    delete inventory["cookie"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("consuming cookie...");
                laterDescription = "consuming cookie...\n\nyum 😋";
                break;
            case "cake":
                inventory["cake"]--;

                if (inventory["cake"] <= 0) {
                    delete inventory["cake"];
                }

                await setInventory(message.member, inventory);

                embed.setDescription("consuming cake...");
                laterDescription = "consuming cake...\n\nyum 😋";
                break;
            case "teddy":
                embed.setDescription("you cuddle your teddy bear");
                embed.setImage("https://c.tenor.com/QGoHlSF2cSAAAAAM/hug-milk-and-mocha.gif");
                break;

            default:
                return send({ embeds: [new ErrorEmbed("you cannot use this item")] });
        }
    }

    const msg = await send({ embeds: [embed] });

    if (!laterDescription) return;

    setTimeout(() => {
        embed.setDescription(laterDescription);
        edit({ embeds: [embed] }, msg);
    }, 2000);
}

cmd.setRun(run);

module.exports = cmd;
