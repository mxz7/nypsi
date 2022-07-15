/**
 * CONVERT SQLITE DATA TO POSTGRES DATA
 */

const { PrismaClient } = require("@prisma/client");
const Database = require("better-sqlite3");

const db = new Database("./out/data/storage.db");

const prisma = new PrismaClient();

async function createUser(id, karma, lastCommand, tracking, lastKnownTag, lastfmUsername) {
    await prisma.user.create({
        data: {
            id: id,
            karma: karma,
            lastCommand: lastCommand,
            tracking: tracking,
            lastKnownTag: lastKnownTag,
            lastfmUsername: lastfmUsername,
        },
    });
}

const economy = db.prepare("SELECT * FROM economy").all();
const economyGuild = db.prepare("select * from economy_guild").all();
const economyGuildMembers = db.prepare("select * from economy_guild_members").all();
const economyStats = db.prepare("select * from economy_stats").all();
const premium = db.prepare("select * from premium").all();
const karmatable = db.prepare("select * from karma where karma").all();
const lastfm = db.prepare("select * from lastfm").all();
const usernames = db.prepare("select * from usernames").all();
const usernamesOptOut = db.prepare("select * from usernames_optout").all();
const wordlestats = db.prepare("select * from wordle_stats").all();
const lotterytickets = db.prepare("select * from lottery_tickets").all();

const guilds = db.prepare("select * from guilds").all();
const guildcounters = db.prepare("select * from guilds_counters").all();
const guildchristmas = db.prepare("select * from guilds_christmas").all();
const moderation = db.prepare("select * from moderation").all();
const moderationcases = db.prepare("select * from moderation_cases").all();
const moderationmutes = db.prepare("select * from moderation_mutes").all();
const moderationbans = db.prepare("select * from moderation_bans").all();
const chatreaction = db.prepare("select * from chat_reaction").all();
const chatreactionstats = db.prepare("select * from chat_reaction_stats").all();

const wholesome = db.prepare("select * from wholesome").all();
const wholesomesuggestions = db.prepare("select * from wholesome_suggestions").all();

async function createUsers() {
    let count = 0;
    for (const user of karmatable) {
        const id = user.id;

        let lastKnownTag = db.prepare("select last_known_tag from economy_guild_members where user_id = ?").get(id);

        if (lastKnownTag) {
            lastKnownTag = lastKnownTag.last_known_tag;
        }

        const q = db.prepare("select karma, last_command from karma where id = ?").get(id);

        let karma;
        let lastcommand;

        if (q) {
            karma = q.karma;
            lastcommand = new Date(q.last_command);
        }

        let tracking = db.prepare("select tracking from usernames_optout where id = ?").get(id);

        if (tracking === 0) {
            tracking = false;
        } else {
            tracking = true;
        }

        let lastfmusername = db.prepare("select username from lastfm where id = ?").get(id);

        if (lastfmusername) {
            lastfmusername = lastfmusername.username;
        }

        await prisma.user.create({
            data: {
                id: id,
                lastKnownTag: lastKnownTag || "",
                karma: karma || 1,
                lastCommand: lastcommand || new Date(0),
                tracking: tracking,
                lastfmUsername: lastfmusername,
            },
        });
        count++;
        if (count % 50 == 0) {
            console.log(`creating users.. ${count}/${karmatable.length}`);
        }
    }
}

async function createEconomy() {
    let count = 0;
    for (const user of economy) {
        const workers = {};
        for (let w of Array.from(Object.keys(JSON.parse(user.workers)))) {
            w = JSON.parse(user.workers)[w];
            workers[w.id] = {
                id: w.id,
                stored: w.stored,
                level: w.level,
            };
        }
        await prisma.economy
            .create({
                data: {
                    userId: user.id,
                    money: user.money,
                    bank: user.bank,
                    xp: user.xp,
                    prestige: user.prestige,
                    padlock: user.padlock == 1 ? true : false,
                    dms: true,
                    lastVote: new Date(user.last_vote),
                    inventory: JSON.parse(user.inventory),
                    workers: workers,
                },
            })
            .catch(async () => {
                if (user.prestige > 0) {
                    await prisma.user.create({
                        data: {
                            id: user.id,
                            lastKnownTag: "",
                            lastCommand: new Date(0),
                        },
                    });
                    await prisma.economy.create({
                        data: {
                            userId: user.id,
                            money: user.money,
                            bank: user.bank,
                            xp: user.xp,
                            prestige: user.prestige,
                            padlock: user.padlock == 1 ? true : false,
                            dms: true,
                            lastVote: new Date(user.last_vote),
                            inventory: JSON.parse(user.inventory),
                            workers: workers,
                        },
                    });
                }
            });

        count++;
        if (count % 50 == 0) {
            console.log(`creating economy.. ${count}/${economy.length}`);
        }
    }
}

async function createEconomyGuilds() {
    let count = 0;
    for (const g of economyGuild) {
        await prisma.economyGuild.create({
            data: {
                guildName: g.guild_name,
                createdAt: new Date(g.created_at),
                balance: g.balance,
                xp: g.xp,
                level: g.level,
                motd: g.motd,
                ownerId: g.owner,
            },
        });
        count++;
        if (count % 50 == 0) {
            console.log(`creating economy guilds ${count}/${economyGuild.length}`);
        }
    }
}

async function createEconomyGuildMembers() {
    let count = 0;
    for (const gm of economyGuildMembers) {
        await prisma.economyGuildMember.create({
            data: {
                userId: gm.user_id,
                guildName: gm.guild_id,
                joinedAt: new Date(gm.joined_at),
                contributedMoney: gm.contributed_money,
                contributedXp: gm.contributed_xp,
            },
        });
        count++;
        if (count % 50 == 0) {
            console.log(`creating economy guild members ${count}/${economyGuildMembers.length}`);
        }
    }
}

async function createPremium() {
    let count = 0;
    for (const p of premium) {
        await prisma.premium.create({
            data: {
                userId: p.id,
                level: p.level,
                embedColor: p.embed_color,
                lastDaily: new Date(p.last_daily),
                lastWeekly: new Date(p.last_weekly),
                status: p.status,
                startDate: new Date(p.start_date),
                expireDate: new Date(p.expire_date),
            },
        });
        count++;
        if (count % 50 == 0) {
            console.log(`creating premium ${count}/${premium.length}`);
        }
    }
}

async function createUsernames() {
    let count = 0;
    for (const u of usernames) {
        await prisma.username
            .create({
                data: {
                    userId: u.id,
                    type: u.type,
                    value: u.value,
                    date: new Date(u.date),
                },
            })
            .catch(() => {});
        count++;
        if (count % 1000 == 0) {
            console.log(`creating usernames.. ${count}/${usernames.length}`);
        }
    }
}

async function createWordle() {
    let count = 0;
    for (const w of wordlestats) {
        const history = [];

        if (w.history) {
            for (const h of w.history.split("#@|@#")) {
                history.push(parseInt(h));
            }
        }

        await prisma.wordleStats
            .create({
                data: {
                    userId: w.user,
                    win1: w.win1,
                    win2: w.win2,
                    win3: w.win3,
                    win4: w.win4,
                    win5: w.win5,
                    win6: w.win6,
                    lose: w.lose,
                    history: history,
                },
            })
            .catch(async (e) => {
                await prisma.user.create({
                    data: {
                        id: w.user,
                        lastKnownTag: "",
                        lastCommand: new Date(0),
                    },
                });
                await prisma.wordleStats.create({
                    data: {
                        userId: w.user,
                        win1: w.win1,
                        win2: w.win2,
                        win3: w.win3,
                        win4: w.win4,
                        win5: w.win5,
                        win6: w.win6,
                        lose: w.lose,
                        history: history,
                    },
                });
            });
        count++;
        if (count % 50 == 0) {
            console.log(`creating wordle.. ${count}/${wordlestats.length}`);
        }
    }
}

async function createEconomyStats() {
    let count = 0;
    for (const s of economyStats) {
        await prisma.economyStats
            .create({
                data: {
                    economyUserId: s.id,
                    type: s.type,
                    win: s.win,
                    lose: s.lose,
                    gamble: s.gamble == 1 ? true : false,
                },
            })
            .catch((e) => {});
        count++;
        if (count % 50 == 0) {
            console.log(`creating economy stats.. ${count}/${economyStats.length}`);
        }
    }
}

async function createLotteryTickets() {
    let count = 0;
    for (const ticket of lotterytickets) {
        await prisma.lotteryTicket
            .create({
                data: {
                    userId: ticket.user_id,
                },
            })
            .catch(() => {
                console.log(`miss: ${ticket.user_id}`);
            });
        count++;
        if (count % 50 == 0) {
            console.log(`creating lottery tickets.. ${count}/${lotterytickets.length}`);
        }
    }
}

async function createGuilds() {
    let count = 0;
    for (const g of guilds) {
        const disabledCommands = [];

        if (g.disabled_commands) {
            for (const x of g.disabled_commands.split("#@|@#")) {
                disabledCommands.push(x);
            }
        }

        const snipeFilter = [];

        if (g.snipe_filter) {
            for (const x of g.snipe_filter.split("#@|@#")) {
                snipeFilter.push(x);
            }
        }

        const chatfilter = [];

        if (g.chat_filter) {
            for (const x of g.chat_filter.split("#@|@#")) {
                chatfilter.push(x);
            }
        }

        await prisma.guild
            .create({
                data: {
                    id: g.id,
                    peak: g.peak,
                    disabledCommands: disabledCommands,
                    snipeFilter: snipeFilter,
                    chatFilter: chatfilter,
                    prefix: g.prefix,
                },
            })
            .catch(() => {
                console.log(`g skip: ${g.id}`);
            });
        count++;

        if (count % 50 == 0) {
            console.log(`creating guilds ${count}/${guilds.length}`);
        }
    }
}

async function createGuildCountdowns() {
    for (const g of guilds) {
        if (Object.keys(JSON.parse(g.countdowns)).length > 0) {
            for (let x of Array.from(Object.keys(JSON.parse(g.countdowns)))) {
                x = JSON.parse(g.countdowns)[x];
                await prisma.guildCountdown
                    .create({
                        data: {
                            id: x.id.toString(),
                            guildId: g.id,
                            date: new Date(x.date),
                            format: x.format,
                            finalFormat: x.finalFormat,
                            channel: x.channel,
                        },
                    })
                    .catch(() => {
                        console.log(`countdown skip: ${g.id}`);
                    });
                console.log(`countdown: ${g.id} ${x.id}`);
            }
        }
    }
}

async function createGuildsCounters() {
    let count = 0;
    for (const counter of guildcounters) {
        if (counter.enabled == 0) continue;

        await prisma.guildCounter
            .create({
                data: {
                    guildId: counter.guild_id,
                    format: counter.format,
                    filterBots: counter.filterBots == 0 ? false : true,
                    enabled: true,
                    channel: counter.channel,
                },
            })
            .catch(() => {
                console.log(`skip: ${counter.guild_id}`);
            });

        count++;
        console.log(`guild counters: ${count}/${guildcounters.length}`);
    }
}

async function createGuildsChristmas() {
    let count = 0;
    for (const counter of guildchristmas) {
        if (counter.enabled == 0) continue;

        await prisma.guildChristmas
            .create({
                data: {
                    guildId: counter.guild_id,
                    format: counter.format,
                    enabled: true,
                    channel: counter.channel,
                },
            })
            .catch(() => {
                console.log(`skip: ${counter.guild_id}`);
            });

        count++;
        console.log(`guild counters: ${count}/${guildchristmas.length}`);
    }
}

async function createModeration() {
    let count = 0;
    for (const m of moderation) {
        await prisma.moderation
            .create({
                data: {
                    guildId: m.id,
                    caseCount: m.case_count,
                    muteRole: m.mute_role,
                    modlogs: m.modlogs,
                },
            })
            .catch(() => {
                console.log(`mod skip: ${m.id}`);
            });

        count++;
        if (count % 50 == 0) {
            console.log(`moderation: ${count}/${moderation.length}`);
        }
    }
}

async function createModerationMutes() {
    let count = 0;
    for (const m of moderationmutes) {
        await prisma.moderationMute
            .create({
                data: {
                    userId: m.user,
                    guildId: m.guild_id,
                    expire: new Date(m.unmute_time),
                },
            })
            .catch(() => {
                console.log(`mute skip: ${m.id}`);
            });

        count++;
        if (count % 5 == 0) {
            console.log(`mute: ${count}/${moderation.length}`);
        }
    }
}

async function createModerationBans() {
    let count = 0;
    for (const m of moderationbans) {
        await prisma.moderationBan
            .create({
                data: {
                    userId: m.user,
                    guildId: m.guild_id,
                    expire: new Date(m.unban_time),
                },
            })
            .catch(() => {
                console.log(`ban skip: ${m.id}`);
            });

        count++;
        if (count % 5 == 0) {
            console.log(`ban: ${count}/${moderation.length}`);
        }
    }
}

async function createModerationCases() {
    let count = 0;
    for (const c of moderationcases) {
        await prisma.moderationCase
            .create({
                data: {
                    guildId: c.guild_id,
                    caseId: c.case_id,
                    type: c.type,
                    user: c.user,
                    moderator: c.moderator,
                    command: c.command,
                    time: new Date(c.time),
                    deleted: c.deleted == 1 ? true : false,
                },
            })
            .catch(() => {
                console.log(`case skip: ${c.guild_id} ${c.case_id}`);
            });

        count++;
        if (count % 50 == 0) {
            console.log(`cases: ${count}/${moderationcases.length}`);
        }
    }
}

async function createChatReaction() {
    let count = 0;
    for (const c of chatreaction) {
        if (c.random_start == 0) continue;

        const wordlist = [];

        if (c.word_list) {
            for (const x of c.word_list.split("#@|@#")) {
                wordlist.push(x);
            }
        }

        const randomchannels = [];

        if (c.random_channels) {
            for (const x of c.random_channels.split("#@|@#")) {
                randomchannels.push(x);
            }
        }

        const blacklisted = [];

        if (c.blacklisted) {
            for (const x of c.blacklisted.split("#@|@#")) {
                blacklisted.push(x);
            }
        }

        await prisma.chatReaction
            .create({
                data: {
                    guildId: c.id,
                    wordList: wordlist,
                    randomStart: true,
                    randomChannels: randomchannels,
                    betweenEvents: c.between_events,
                    randomModifier: c.random_modifier,
                    timeout: c.timeout,
                    blacklisted: blacklisted,
                },
            })
            .catch(() => {
                console.log(`chat reaction skip: ${c.id}`);
            });

        count++;
        console.log(`chat reaction: ${count}/${chatreaction.length}`);
    }
}

async function createChatReactionStats() {
    let count = 0;
    for (const c of chatreactionstats) {
        await prisma.chatReactionStats
            .create({
                data: {
                    chatReactionGuildId: c.guild_id,
                    userId: c.user_id,
                    wins: c.wins,
                    second: c.second,
                    third: c.third,
                },
            })
            .catch(() => {});

        count++;
        if (count % 50 == 0) {
            console.log(`chat reaction stats ${count}/${chatreactionstats.length}`);
        }
    }
}

async function wholesomeD() {
    let count = 0;
    for (const w of wholesome) {
        await prisma.wholesomeImage
            .create({
                data: {
                    image: w.image,
                    submitter: w.submitter,
                    submitterId: w.submitter_id,
                    uploadDate: new Date(w.upload),
                    accepterId: w.accepter,
                },
            })
            .catch(() => {
                console.log(`skip wholesome: ${w.image}`);
            });

        count++;
        console.log(`wholesome image ${count}/${wholesome.length}`);
    }
}

async function run() {
    wholesomeD();

    await createUsers();

    createUsernames();
    createWordle();

    await createEconomy();

    createEconomyStats();
    createLotteryTickets();

    await createEconomyGuilds();

    await createEconomyGuildMembers();

    await createPremium();

    await createGuilds();
    await createGuildCountdowns();
    await createGuildsCounters();
    await createGuildsChristmas();
    await createModeration();
    await createModerationBans();
    await createModerationMutes();
    createModerationCases();
    await createChatReaction();
    await createChatReactionStats();
}

run();
