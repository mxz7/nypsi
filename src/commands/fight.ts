import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GuildMember,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageOptions,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { addGamble, createUser, getInventory, getStats, setInventory, userExists } from "../utils/economy/utils";
import { getMember } from "../utils/functions/member";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("fight", "challenge another member to a fight", Categories.FUN);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
    option.setName("member").setDescription("member you want to fight").setRequired(true)
);

const waiting = new Set<string>();

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) {
        await createUser(message.member);
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

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

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member).setHeader("fight", message.author.avatarURL());

        embed.setDescription(`${prefix}**fight <member>** *challenge another member to a fight*`);

        const stats = (await getStats(message.member)).gamble["fight"];

        if (stats) {
            embed.setFooter({ text: `you are ${stats.wins}-${stats.lose}` });
        }

        return send({ embeds: [embed] });
    }

    if (waiting.has(message.author.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("please wait until your game has been accepted or denied")],
        });
    }

    let target: GuildMember;

    if (!message.mentions.members.first()) {
        target = await getMember(message.guild, args.join(" "));
    } else {
        target = message.mentions.members.first();
    }

    if (!target) {
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    await addCooldown(cmd.name, message.member, 60);

    waiting.add(message.author.id);

    const embed = new CustomEmbed(message.member).setHeader("fight invitation", message.author.avatarURL());

    embed.setDescription(`${message.author.tag} has challenged you to a fight. do you accept?`);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger)
    );

    const m = await send({
        embeds: [embed],
        components: [row],
        content: `${target.user.toString()} you have been challenged to a fight`,
    });

    const filter = (i: Interaction) => i.user.id == target.id;
    let fail = false;

    const response = await m
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            await m.delete();
            waiting.delete(message.author.id);
            return collected.customId;
        })
        .catch(async () => {
            fail = true;
            waiting.delete(message.author.id);
            return message.channel.send({ content: message.author.toString() + " fight request expired" });
        });

    if (fail) return;

    if (typeof response != "string") return;

    if (response != "y") {
        embed.setDescription("fight request denied");
        return await m.edit({ embeds: [embed] });
    }

    const countdownEmbed = new CustomEmbed(message.member).setHeader(
        `${message.author.username} vs ${target.user.username}`
    );

    countdownEmbed.setDescription("fight starting in 3 seconds...");

    const msg = await message.channel.send({ embeds: [countdownEmbed] });

    await wait(2);

    countdownEmbed.setDescription("fight starting in 2 seconds...");

    await msg.edit({ embeds: [countdownEmbed] });

    await wait(2);

    countdownEmbed.setDescription("fight starting in 1 second...");

    await msg.edit({ embeds: [countdownEmbed] });

    await wait(2);

    const fightRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("a").setLabel("attack").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("h").setLabel("heal").setStyle(ButtonStyle.Success)
    );

    const fight = new Fight(message.member, target);

    const fightEmbed = fight.renderEmbed();

    await msg.edit({ embeds: [fightEmbed], components: [fightRow] });

    const fightMessageFilter = (interaction: Interaction) =>
        interaction.user.id == message.author.id || interaction.user.id == target.user.id;

    const collector = msg.createMessageComponentCollector({ filter: fightMessageFilter });

    let lastUpdate = Date.now();

    collector.on("collect", async (i) => {
        await i.deferUpdate();

        if (i.customId == "a") {
            if (i.user.id == message.author.id) {
                fight.homeHit();
            } else {
                fight.awayHit();
            }
        } else {
            if (i.user.id == message.author.id) {
                const res = fight.homeHeal();

                if (!res) {
                    await i.followUp({
                        embeds: [new CustomEmbed(message.member, "you have no more heals left")],
                        ephemeral: true,
                    });
                }
            } else {
                const res = fight.awayHeal();

                if (!res) {
                    await i.followUp({ embeds: [new CustomEmbed(target, "you have no more heals left")], ephemeral: true });
                }
            }
        }

        const health = fight.getHealth();

        if (health.home < 0 || health.away < 0) {
            const embed = await fight.end();

            await msg.edit({ embeds: [embed], components: [] });
            collector.stop();
            return;
        }

        if (lastUpdate < Date.now() - 1500) {
            const embed = fight.renderEmbed();

            embed.disableFooter();

            await msg.edit({ embeds: [embed] });

            lastUpdate = Date.now();
            return;
        }
    });
}

cmd.setRun(run);

module.exports = cmd;

class Fight {
    private person1: FightCharacter;
    private person2: FightCharacter;
    private log: string[];
    private logCount: number;

    private home: GuildMember;
    private away: GuildMember;

    constructor(home: GuildMember, away: GuildMember) {
        this.person1 = new FightCharacter();
        this.person2 = new FightCharacter();

        this.home = home;
        this.away = away;

        this.log = [];
        this.logCount = 0;
    }

    public homeHit() {
        const damage = this.person1.hit();
        this.person2.takeHit(damage);

        this.updateLog(`${this.home.user.username} hits ${this.away.user.username} for ${damage}hp`);
    }

    public homeHeal() {
        if (this.person1.heals <= 0) {
            return false;
        }
        this.person1.heal();

        this.updateLog(`${this.home.user.username} heals25hp`);
        return true;
    }

    public awayHit() {
        const damage = this.person2.hit();
        this.person1.takeHit(damage);

        this.updateLog(`${this.away.user.username} hits ${this.home.user.username} for ${damage}hp`);
    }

    public awayHeal() {
        if (this.person2.heals <= 0) {
            return false;
        }
        this.person2.heal();

        this.updateLog(`${this.away.user.username} heals 25hp`);
        return true;
    }

    private updateLog(text: string) {
        this.logCount++;
        this.log.push(`${this.logCount}. ${text}`);

        if (this.log.length >= 5) {
            this.log.shift();
        }
    }

    public renderEmbed() {
        const embed = new CustomEmbed(this.home);

        embed.setHeader(`${this.home.user.username} vs ${this.away.user.username}`);

        if (this.log.length > 0) {
            embed.setDescription(`\`\`\`${this.log.join("\n")}\`\`\``);
        }

        embed.addField(
            this.home.user.username,
            `health: **${this.person1.health}**hp\nheals left: **${this.person1.heals}**/3`
        );
        embed.addField(
            this.away.user.username,
            `health: **${this.person2.health}**hp\nheals left: **${this.person2.heals}**/3`
        );

        return embed;
    }

    public async end() {
        const embed = new CustomEmbed(this.home);

        const winner: { member: GuildMember; stats: FightCharacter } = {
            member: undefined,
            stats: undefined,
        };

        let loser: GuildMember;

        if (this.person1.health <= 0) {
            winner.member = this.away;
            winner.stats = this.person2;

            loser = this.home;
        }
        if (this.person2.health <= 0) {
            winner.member = this.home;
            winner.stats = this.person1;

            loser = this.away;
        }

        if (await userExists(winner.member.user.id)) {
            const inventory = await getInventory(winner.member.user.id);

            if (inventory["cookie"]) {
                inventory["cookie"]++;
            } else {
                inventory["cookie"] = 1;
            }

            await setInventory(winner.member.user.id, inventory);

            await addGamble(winner.member, "fight", true);

            embed.setFooter({ text: "well done. enjoy this cookie 🍪" });
        }

        if (await userExists(loser.user.id)) {
            await addGamble(loser, "fight", false);
        }

        embed.setHeader(`${this.home.user.username} vs ${this.away.user.username}`);
        embed.setDescription(
            `\`\`\`${this.log.join("\n")}\`\`\`\n\n**${winner.member.user.username} has won this fight**\ndamage given: ${
                winner.stats.damageGiven
            }hp\ndamage received: ${winner.stats.damageReceived}hp`
        );

        return embed;
    }

    public getHealth() {
        return { home: this.person1.health, away: this.person2.health };
    }
}

class FightCharacter {
    public health: number;
    public heals: number;
    public damageGiven: number;
    public damageReceived: number;

    constructor() {
        this.health = 100;
        this.heals = 3;
        this.damageGiven = 0;
        this.damageReceived = 0;
    }

    public hit() {
        const damage = Math.floor(Math.random() * 10) + 3;

        this.damageGiven += damage;

        return damage;
    }

    public takeHit(damage: number) {
        this.damageReceived += damage;
        this.health -= damage;
    }

    public heal() {
        this.heals -= 1;

        this.health += 25;
    }
}

async function wait(seconds: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(0);
        }, seconds * 1000);
    });
}
