import { REST } from "@discordjs/rest";
import { PermissionFlagsBits, Routes } from "discord-api-types/v9";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GuildMember,
    Interaction,
    Message,
    MessageActionRowComponentBuilder,
    WebhookClient,
} from "discord.js";
import * as fs from "fs";
import { getBorderCharacters, table } from "table";
import { getXp, isEcoBanned, updateXp, userExists } from "./economy/utils";
import { createCaptcha, isLockedOut, toggleLock } from "./functions/captcha";
import { formatDate, MStoTime } from "./functions/date";
import { getNews } from "./functions/news";
import { createGuild, getChatFilter, getDisabledCommands, getPrefix, hasGuild } from "./guilds/utils";
import { addKarma, getKarma, updateLastCommand } from "./karma/utils";
import { getTimestamp, logger } from "./logger";
import { Command, NypsiCommandInteraction } from "./models/Command";
import { CustomEmbed, ErrorEmbed } from "./models/EmbedBuilders";
import { addUse, getCommand } from "./premium/utils";
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../package.json";
import redis from "./database/redis";
import { NypsiClient } from "./models/Client";
import { createProfile, hasProfile, updateLastKnowntag } from "./users/utils";

const commands: Map<string, Command> = new Map();
const aliases: Map<string, string> = new Map();
const noLifers: Map<string, number> = new Map();
const commandUses: Map<string, number> = new Map();
const handcuffs: Map<string, Date> = new Map();
const captchaFails: Map<string, number> = new Map();
const captchaPasses: Map<string, number> = new Map();

const karmaCooldown: Set<string> = new Set();
const xpCooldown: Set<string> = new Set();
const cooldown: Set<string> = new Set();

const beingChecked: string[] = [];

let commandsSize = 0;
let aliasesSize = 0;

export { commandsSize, aliasesSize };

let restarting = false;

export function loadCommands() {
    const commandFiles = fs.readdirSync("./dist/commands/").filter((file) => file.endsWith(".js"));
    const failedTable = [];

    if (commands.size > 0) {
        for (const command of commands.keys()) {
            delete require.cache[require.resolve(`../commands/${command}.js`)];
        }
        commands.clear();
        aliases.clear();
    }

    for (const file of commandFiles) {
        let command;

        try {
            command = require(`../commands/${file}`);

            let enabled = true;

            if (!command.name || !command.description || !command.run || !command.category) {
                enabled = false;
            }

            if (enabled) {
                commands.set(command.name, command);
                if (command.aliases) {
                    for (const a of command.aliases) {
                        if (aliases.has(a)) {
                            logger.warn(
                                `duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${command.name}] - not overwriting`
                            );
                        } else {
                            aliases.set(a, command.name);
                        }
                    }
                }
            } else {
                failedTable.push([file, "❌"]);
                logger.error(file + " missing name, description, category or run");
            }
        } catch (e) {
            failedTable.push([file, "❌"]);
            logger.error(e);
        }
    }
    aliasesSize = aliases.size;
    commandsSize = commands.size;

    if (failedTable.length != 0) {
        console.log(table(failedTable, { border: getBorderCharacters("ramac") }));
        if (process.env.GITHUB_ACTION) process.exit(1);
    }

    logger.info(`${commands.size.toLocaleString()} commands loaded`);
    logger.info(`${aliases.size.toLocaleString()} aliases loaded`);
}

export function reloadCommand(commandsArray: string[]) {
    const reloadTable = [];

    for (const cmd of commandsArray) {
        try {
            commands.delete(cmd);
            try {
                delete require.cache[require.resolve(`../commands/${cmd}`)];
            } catch (e) {
                logger.error("error deleting from cache");
                return;
            }

            let commandData: Command | number = 0;

            commandData = require(`../commands/${cmd}`);

            let enabled = true;

            if (!(commandData instanceof Command)) enabled = false;

            if (enabled && commandData instanceof Command) {
                commands.set(commandData.name, commandData);
                if (commandData.aliases) {
                    for (const a of commandData.aliases) {
                        if (aliases.has(a) && aliases.get(a) != commandData.name) {
                            logger.error(
                                `duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${
                                    commandData.name
                                }] - not overwriting`
                            );
                        } else {
                            aliases.set(a, commandData.name);
                        }
                    }
                }
                reloadTable.push([commandData.name, "✅"]);
                commandsSize = commands.size;
            } else {
                reloadTable.push([cmd, "❌"]);
                commandsSize = commands.size;
            }
        } catch (e) {
            reloadTable.push([cmd, "❌"]);
            logger.error(e);
        }
    }
    aliasesSize = aliases.size;
    commandsSize = commands.size;
    console.log(table(reloadTable, { border: getBorderCharacters("ramac") }));
    return table(reloadTable, { border: getBorderCharacters("ramac") });
}

async function helpCmd(message: Message, args: string[]) {
    logCommand(message, args);

    const helpCategories = new Map();

    const prefix = await getPrefix(message.guild);

    for (const cmd of commands.keys()) {
        const category = getCmdCategory(cmd);

        if (category == "none") continue;

        if (helpCategories.has(category)) {
            const current = helpCategories.get(category);
            const lastPage = current.get(current.size);

            if (lastPage.length == 10) {
                const newPage = [];

                newPage.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`);
                current.set(current.size + 1, newPage);
            } else {
                const page = current.get(current.size);
                page.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`);
                current.set(current.size, page);
            }

            helpCategories.set(category, current);
        } else {
            const pages = new Map();

            pages.set(1, [`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`]);

            helpCategories.set(category, pages);
        }
    }

    const embed = new CustomEmbed(message.member).setFooter({ text: `v${version}` });

    /**
     * FINDING WHAT THE USER REQUESTED
     */

    let pageSystemNeeded = false;

    if (args.length == 0) {
        const categories = Array.from(helpCategories.keys()).sort();

        let categoriesMsg = "";

        for (const category of categories) {
            categoriesMsg += `» ${prefix}help **${category}**\n`;
        }

        const news = getNews();

        const lastSet = formatDate(news.date);

        embed.setTitle("help menu");
        embed.setDescription(
            "invite nypsi to your server: [invite.nypsi.xyz](http://invite.nypsi.xyz)\n\n" +
                "if you need support, want to report a bug or suggest a feature, you can join the nypsi server: https://discord.gg/hJTDNST\n\n" +
                `my prefix for this server is \`${prefix}\``
        );
        embed.addField("command categories", categoriesMsg, true);
        embed.setThumbnail(message.client.user.displayAvatarURL({ size: 128 }));

        if (news.text != "") {
            embed.addField("news", `${news.text} - *${lastSet}*`);
        }
    } else {
        if (args[0].toLowerCase() == "mod") args[0] = "moderation";
        if (args[0].toLowerCase() == "util") args[0] = "utility";
        if (args[0].toLowerCase() == "pictures") args[0] = "animals";
        if (args[0].toLowerCase() == "eco") args[0] = "money";
        if (args[0].toLowerCase() == "economy") args[0] = "money";
        if (args[0].toLowerCase() == "gamble") args[0] = "money";
        if (args[0].toLowerCase() == "gambling") args[0] = "money";

        if (helpCategories.has(args[0].toLowerCase())) {
            const pages = helpCategories.get(args[0].toLowerCase());

            if (pages.size > 1) {
                pageSystemNeeded = true;
            }

            embed.setTitle(`${args[0].toLowerCase()} commands`);
            embed.setDescription(pages.get(1).join("\n"));
            embed.setFooter({ text: `page 1/${pages.size} | v${version}` });
        } else if (commands.has(args[0].toLowerCase()) || aliases.has(args[0].toLowerCase())) {
            let cmd: Command;

            if (aliases.has(args[0].toLowerCase())) {
                cmd = commands.get(aliases.get(args[0].toLowerCase()));
            } else {
                cmd = commands.get(args[0].toLowerCase());
            }

            let desc =
                "**name** " + cmd.name + "\n" + "**description** " + cmd.description + "\n" + "**category** " + cmd.category;

            if (cmd.permissions) {
                desc = desc + "\n**permission(s) required** `" + cmd.permissions.join("`, `") + "`";
            }

            if (cmd.aliases) {
                desc = desc + "\n**aliases** `" + prefix + cmd.aliases.join("`, `" + prefix) + "`";
            }

            if (cmd.docs) {
                desc += `\n**docs** ${cmd.docs}`;
            }

            embed.setTitle(`${cmd.name} command`);
            embed.setDescription(desc);
        } else if (await getCommand(args[0].toLowerCase())) {
            const owner = (await getCommand(args[0].toLowerCase())).owner;
            const member = message.guild.members.cache.find((m) => m.id == owner);
            embed.setTitle("custom command");
            embed.setDescription(
                `this is a custom command${
                    member ? ` owned by ${member.toString()}` : ""
                }\n\nto disable custom commands in your server you can do:\n${prefix}disablecmd + customcommand`
            );
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("unknown command")] });
        }
    }

    let msg: Message;

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (pageSystemNeeded) {
        msg = await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    } else {
        return await message.channel.send({ embeds: [embed] });
    }

    const pages = helpCategories.get(args[0].toLowerCase());

    let currentPage = 1;
    const lastPage = pages.size;

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager = async (): Promise<void> => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
            })
            .catch(async () => {
                await msg.edit({ components: [] }).catch(() => {});
            });

        if (!reaction) return;

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager();
            } else {
                currentPage--;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: `page ${currentPage}/${lastPage} | v${version}` });
                if (currentPage == 1) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false)
                    );
                } else {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager();
            } else {
                currentPage++;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: `page ${currentPage}/${lastPage} | v${version}` });
                if (currentPage == lastPage) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
                    );
                } else {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        }
    };

    return pageManager();
}

export async function runCommand(
    cmd: string,
    message: Message | (NypsiCommandInteraction & CommandInteraction),
    args: string[]
) {
    if (!(await hasGuild(message.guild))) await createGuild(message.guild);

    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (!message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.SendMessages)) {
        return message.member
            .send(
                "❌ i don't have permission to send messages in that channel - please contact server staff if this is an error"
            )
            .catch(() => {});
    }

    if (!message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.EmbedLinks)) {
        return message.channel.send({
            content:
                "❌ i don't have the `embed links` permission\n\nto fix this go to: server settings -> roles -> find my role and enable `embed links`\n" +
                "if this error still shows, check channel specific permissions",
        });
    }

    if (!message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.ManageMessages)) {
        return message.channel.send(
            "❌ i don't have the `manage messages` permission, this is a required permission for nypsi to work\n\n" +
                "to fix this go to: server settings -> roles -> find my role and enable `manage messages`\n" +
                "if this error still shows, check channel specific permissions"
        );
    }

    if (!message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.AddReactions)) {
        return message.channel.send({
            content:
                "❌ i don't have the `add reactions` permission, this is a required permission for nypsi to work\n\n" +
                "to fix this go to: server settings -> roles -> find my role and enable `add reactions`\n" +
                "if this error still shows, check channel specific permissions",
        });
    }

    if (cmd == "help" && message instanceof Message) {
        return helpCmd(message, args);
    }

    if (!(await hasProfile(message.member))) {
        await createProfile(message.member.user);
    } else {
        updateLastKnowntag(message.author.id, message.author.tag);
    }

    let alias = false;
    if (!commandExists(cmd) && message instanceof Message) {
        if (!aliases.has(cmd)) {
            if (isLockedOut(message.author.id)) return;
            const customCommand = await getCommand(cmd);

            if (!customCommand) {
                return;
            }

            const content = customCommand.content;

            if (cooldown.has(message.author.id)) return;

            cooldown.add(message.author.id);

            setTimeout(() => {
                cooldown.delete(message.author.id);
            }, 1500);

            if ((await getDisabledCommands(message.guild)).indexOf("customcommand") != -1) {
                return message.channel.send({
                    embeds: [new ErrorEmbed("custom commands have been disabled in this server")],
                });
            }

            const filter = await getChatFilter(message.guild);

            let contentToCheck: string | string[] = content.toLowerCase().normalize("NFD");

            contentToCheck = contentToCheck.replace(/[^A-z0-9\s]/g, "");

            contentToCheck = contentToCheck.split(" ");

            for (const word of filter) {
                if (contentToCheck.indexOf(word.toLowerCase()) != -1) {
                    return message.channel.send({
                        embeds: [new ErrorEmbed("this custom command is not allowed in this server")],
                    });
                }
            }

            message.content += ` [custom cmd - ${customCommand.owner}]`;

            addUse(customCommand.owner);
            logCommand(message, ["", "", ""]);

            const embed = new CustomEmbed(message.member, content).setFooter({
                text: `${customCommand.uses.toLocaleString()} use${customCommand.uses == 1 ? "" : "s"}`,
            });

            return message.channel.send({ embeds: [embed] });
        } else {
            alias = true;
        }
    }

    if (cooldown.has(message.author.id)) return;

    cooldown.add(message.author.id);

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 500);

    // captcha check

    if (isLockedOut(message.author.id)) {
        if (beingChecked.indexOf(message.author.id) != -1) return;

        const captcha = createCaptcha();

        const embed = new CustomEmbed(message.member).setTitle("you have been locked");

        embed.setDescription(
            `please note that using macros / auto typers is not allowed with nypsi\n\ntype: \`${captcha.display}\` to be unlocked`
        );

        beingChecked.push(message.author.id);

        await message.channel.send({ embeds: [embed] });

        logger.info(`sent captcha (${message.author.id}) - awaiting reply`);

        const filter = (m: Message) => m.author.id == message.author.id;

        let fail = false;

        const response = await message.channel
            .awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                return collected.first();
            })
            .catch(() => {
                fail = true;
                logger.info(`captcha (${message.author.id}) failed`);
                failedCaptcha(message.member);
                return message.channel.send({
                    content:
                        message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
                });
            });

        beingChecked.splice(beingChecked.indexOf(message.author.id), 1);

        if (fail) {
            return;
        }

        if (response.content.toLowerCase() == captcha.answer) {
            logger.info(`captcha (${message.author.id}) passed`);
            passedCaptcha(message.member);
            toggleLock(message.author.id);
            return response.react("✅");
        } else {
            logger.info(`captcha (${message.author.id}) failed`);
            failedCaptcha(message.member);
            return message.channel.send({
                content: message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
            });
        }
    }

    if (restarting) {
        if (message.author.id == "672793821850894347" && message instanceof Message) {
            message.react("💀");
        } else {
            logCommand(message, args);
            if (message instanceof Message) {
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")],
                });
            } else {
                return message.reply({
                    embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")],
                });
            }
        }
    }

    logCommand(message, args);

    if (alias) {
        if (commands.get(aliases.get(cmd)).category == "money") {
            if (await isEcoBanned(message.author.id)) {
                return;
            }
        }

        if (commands.get(aliases.get(cmd)).category == "money" && handcuffs.has(message.author.id)) {
            const init = handcuffs.get(message.member.user.id);
            const curr = new Date().getTime();
            const diff = Math.round((curr - init.getTime()) / 1000);
            const time = 60 - diff;

            const minutes = Math.floor(time / 60);
            const seconds = time - minutes * 60;

            let remaining: string;

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`;
            } else {
                remaining = `${seconds}s`;
            }

            if (message instanceof Message) {
                return message.channel.send({
                    embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
                });
            } else {
                return message.reply({
                    embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
                });
            }
        } else if (
            commands.get(aliases.get(cmd)).category == "money" &&
            (await redis.exists(`economy:crates:block:${message.author.id}`))
        ) {
            if (message instanceof Message) {
                return message.channel.send({ embeds: [new ErrorEmbed("wait until you've finished opening crates")] });
            } else {
                return message.reply({ embeds: [new ErrorEmbed("wait until you've finished opening crates")] });
            }
        }

        updateCommandUses(message.member);

        if ((await getDisabledCommands(message.guild)).indexOf(aliases.get(cmd)) != -1) {
            if (message instanceof Message) {
                return message.channel.send({ embeds: [new ErrorEmbed("that command has been disabled")] });
            } else {
                return message.reply({ embeds: [new ErrorEmbed("that command has been disabled")] });
            }
        }
        commands.get(aliases.get(cmd)).run(message, args);
        await updateLastCommand(message.member);
    } else {
        if (commands.get(cmd).category == "money") {
            if (await isEcoBanned(message.author.id)) {
                return;
            }
        }

        if (commands.get(cmd).category == "money" && handcuffs.has(message.author.id)) {
            const init = handcuffs.get(message.member.user.id);
            const curr = new Date().getTime();
            const diff = Math.round((curr - init.getTime()) / 1000);
            const time = 120 - diff;

            const minutes = Math.floor(time / 60);
            const seconds = time - minutes * 60;

            let remaining: string;

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`;
            } else {
                remaining = `${seconds}s`;
            }

            if (message instanceof Message) {
                return message.channel.send({
                    embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
                });
            } else {
                return message.reply({
                    embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
                });
            }
        }

        updateCommandUses(message.member);

        if ((await getDisabledCommands(message.guild)).indexOf(cmd) != -1) {
            if (message instanceof Message) {
                return message.channel.send({ embeds: [new ErrorEmbed("that command has been disabled")] });
            } else {
                return message.reply({ embeds: [new ErrorEmbed("that command has been disabled")] });
            }
        }
        commands.get(cmd).run(message, args);
        await updateLastCommand(message.member);
    }

    let cmdName = cmd;

    if (alias) {
        cmdName = aliases.get(cmd);
    }

    if (getCmdCategory(cmdName) == "money") {
        if (!message.member) return;

        setTimeout(async () => {
            if (!(await userExists(message.member))) return;
            try {
                if (!xpCooldown.has(message.author.id)) {
                    await updateXp(message.member, (await getXp(message.member)) + 1);

                    xpCooldown.add(message.author.id);

                    setTimeout(() => {
                        try {
                            xpCooldown.delete(message.author.id);
                        } catch {
                            /* */
                        }
                    }, 60000);
                }
            } catch {
                /* */
            }
        }, 30000);
    }
}

export function commandExists(cmd: string) {
    if (commands.has(cmd)) {
        return true;
    } else {
        return false;
    }
}

function getCmdName(cmd: string): string {
    return commands.get(cmd).name;
}

function getCmdDesc(cmd: string): string {
    return commands.get(cmd).description;
}

function getCmdCategory(cmd: string): string {
    return commands.get(cmd).category;
}

export function getRandomCommand(): Command {
    const a: Command[] = [];

    commands.forEach((d) => {
        if (d.category != "none" && d.category != "nsfw") {
            a.push(d);
        }
    });

    const choice = a[Math.floor(Math.random() * a.length)];

    return choice;
}

export function logCommand(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    args.shift();

    let msg: string;

    if (!(message instanceof Message)) {
        msg = `${message.guild.id} - ${message.author.tag}: [/]${message.commandName} ${args.join(" ")}`;
    } else {
        let content = message.content;

        if (content.length > 100) {
            content = content.substr(0, 75) + "...";
        }

        msg = `${message.guild.id} - ${message.author.tag}: ${content}`;
    }

    logger.log({
        level: "cmd",
        message: msg,
    });
}

function updateCommandUses(member: GuildMember) {
    if (noLifers.has(member.user.tag)) {
        noLifers.set(member.user.tag, noLifers.get(member.user.tag) + 1);
    } else {
        noLifers.set(member.user.tag, 1);
    }

    if (karmaCooldown.has(member.user.id)) return;

    if (commandUses.has(member.user.id)) {
        commandUses.set(member.user.id, commandUses.get(member.user.id) + 1);
    } else {
        commandUses.set(member.user.id, 1);
    }

    karmaCooldown.add(member.user.id);

    setTimeout(() => {
        try {
            karmaCooldown.delete(member.user.id);
        } catch {
            karmaCooldown.clear();
        }
    }, 90000);
}

export function runCommandUseTimers(client: NypsiClient) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const postCommandUsers = async () => {
        const hook = new WebhookClient({
            url: process.env.ANTICHEAT_HOOK,
        });

        for (const user of noLifers.keys()) {
            const uses = noLifers.get(user);

            const tag = client.users.cache.find((u) => u.id == user).tag;

            if (uses > 50) {
                // TODO: CHANGE THIS TO ADJUST LATER
                await hook.send(
                    `[${getTimestamp()}] **${tag}** (${user}) performed more than **${uses}** commands in an hour`
                );

                if (uses > 200) {
                    // TODO: CHANGE THIS TO ADJUST LATER
                    toggleLock(user);
                    logger.info(`${tag} (${user}) has been given a captcha`);
                    await hook.send(`[${getTimestamp()}] **${tag}** (${user}) has been given a captcha`);
                }
            }
        }
        noLifers.clear();
        return;
    };

    const updateKarma = async () => {
        for (const user of commandUses.keys()) {
            let modifier = 2;

            if ((await getKarma(user)) > 200) modifier = 3;
            if ((await getKarma(user)) > 400) modifier = 4;
            if ((await getKarma(user)) > 500) modifier = 5;

            const amount = Math.floor(commandUses.get(user) / modifier);

            if (amount > 0) {
                await addKarma(user, amount);
            }
        }

        commandUses.clear();
    };

    setTimeout(async () => {
        setInterval(async () => {
            await postCommandUsers();
            setTimeout(updateKarma, 60000);
        }, 3600000);
        await postCommandUsers();
        setTimeout(updateKarma, 60000);
    }, 3600000);

    logger.log({
        level: "auto",
        message: `popular commands will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}

async function failedCaptcha(member: GuildMember) {
    const hook = new WebhookClient({
        url: process.env.ANTICHEAT_HOOK,
    });

    if (captchaFails.has(member.user.id)) {
        captchaFails.set(member.user.id, captchaFails.get(member.user.id) + 1);
    } else {
        captchaFails.set(member.user.id, 1);
    }

    await hook.send(
        `[${getTimestamp()}] **${member.user.tag}** (${member.user.id}) has failed a captcha (${captchaFails.get(
            member.user.id
        )})`
    );
}

async function passedCaptcha(member: GuildMember) {
    const hook = new WebhookClient({
        url: process.env.ANTICHEAT_HOOK,
    });

    if (captchaPasses.has(member.user.id)) {
        captchaPasses.set(member.user.id, captchaPasses.get(member.user.id) + 1);
    } else {
        captchaPasses.set(member.user.id, 1);
    }

    await hook.send(
        `[${getTimestamp()}] **${member.user.tag}** (${member.user.id}) has passed a captcha (${captchaPasses.get(
            member.user.id
        )})`
    );
}

export function isHandcuffed(id: string): boolean {
    return handcuffs.has(id);
}

export function addHandcuffs(id: string) {
    handcuffs.set(id, new Date());

    setTimeout(() => {
        handcuffs.delete(id);
    }, 60000);
}

export function startRestart() {
    restarting = true;
}

export async function uploadGuildCommands(guildID: string, clientID: string) {
    logger.info("started refresh of [/] commands...");
    const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

    const slashData = [];

    for (const cmd of Array.from(commands.values())) {
        if (!cmd.slashEnabled) continue;
        slashData.push(cmd.slashData.toJSON());
    }

    try {
        logger.info(`uploading ${slashData.length} [/] commands`);
        await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: slashData });

        logger.info("finished refresh of [/] commands");
    } catch (error) {
        logger.error("failed refresh of [/] commands");
        logger.error(error);
    }
}

export async function uploadGuildCommandsGlobal(clientID: string) {
    logger.info("started refresh of global [/] commands...");
    const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

    const slashData = [];

    for (const cmd of Array.from(commands.values())) {
        if (!cmd.slashEnabled) continue;
        slashData.push(cmd.slashData.toJSON());
    }

    try {
        logger.info(`uploading ${slashData.length} [/] commands`);
        await rest.put(Routes.applicationCommands(clientID), { body: slashData });

        logger.info("finished refresh of global [/] commands");
    } catch (error) {
        logger.error("failed refresh of global [/] commands");
        logger.error(error);
    }
}
