import dayjs = require("dayjs");
import requestDM from "../functions/requestdm";
import { logger } from "../logger";
import { NypsiClient } from "./Client";

export class PremUser {
    public id: string;
    public level: number;
    public embedColor: string;
    public lastDaily: Date;
    public lastWeekly: Date;
    public status: number;
    public revokeReason: string;
    public startDate: Date;
    public expireDate: Date;
    constructor(id: string, level: number) {
        this.id = id;
        this.level = level;
        this.embedColor = "default"; // for custom embed color on all messages
        this.lastDaily = new Date(0);
        this.lastWeekly = new Date(0);
        this.status = status.ACTIVE;
        this.revokeReason = "none";
        this.startDate = new Date();
        this.expireDate = new Date(new Date().setDate(new Date().getDate() + 35));

        return this;
    }

    setLevel(level: number): PremUser {
        this.level = level;

        return this;
    }

    setEmbedColor(color: string): PremUser {
        this.embedColor = color;

        return this;
    }

    setLastDaily(date: Date): PremUser {
        if (date instanceof Date) {
            this.lastDaily = date;
        } else {
            this.lastDaily = date;
        }

        return this;
    }

    setLastWeekly(date: Date): PremUser {
        if (date instanceof Date) {
            this.lastWeekly = date;
        } else {
            this.lastWeekly = date;
        }

        return this;
    }

    setStatus(status: number): PremUser {
        this.status = status;

        return this;
    }

    setReason(reason: string): PremUser {
        this.revokeReason = reason;

        return this;
    }

    setStartDate(date: Date): PremUser {
        if (date instanceof Date) {
            this.startDate = date;
        } else {
            this.startDate = date;
        }

        return this;
    }

    setExpireDate(date: Date): PremUser {
        if (date instanceof Date) {
            this.expireDate = date;
        } else {
            this.expireDate = date;
        }

        return this;
    }

    getLevelString(): string {
        switch (this.level) {
            case 0:
                return "none";
            case 1:
                return "BRONZE";
            case 2:
                return "SILVER";
            case 3:
                return "GOLD";
            case 4:
                return "PLATINUM";
        }
    }

    static getLevelString(number: number): string {
        switch (number) {
            case 0:
                return "none";
            case 1:
                return "BRONZE";
            case 2:
                return "SILVER";
            case 3:
                return "GOLD";
            case 4:
                return "PLATINUM";
        }
    }

    renew() {
        if (Math.abs(dayjs().diff(dayjs(this.expireDate), "days")) < 10) {
            this.expireDate = dayjs().add(35, "days").toDate();
        } else {
            this.expireDate = dayjs(this.expireDate).add(35, "days").toDate();
        }
    }

    async expire(client: NypsiClient): Promise<PremUser | string> {
        let roleID;

        switch (this.level) {
            case 1:
                roleID = "819870590718181391";
                break;
            case 2:
                roleID = "819870727834566696";
                break;
            case 3:
                roleID = "819870846536646666";
                break;
            case 4:
                roleID = "819870959325413387";
                break;
        }

        const e = await requestRemoveRole(this.id, roleID, client).catch((e: any) => {
            logger.error(`error removing role (premium) ${this.id}`);
            logger.error(e);
        });

        if (e == "boost") {
            return "boost";
        }

        await requestDM({
            memberId: this.id,
            client: client,
            content: `your **${this.getLevelString()}** membership has expired, join the support server if this is an error ($support)`,
        }).catch(() => {});

        this.status = status.INACTIVE;
        this.level = 0;

        return;
    }

    static fromData(object: any): PremUser {
        const a = new PremUser(object.id, object.level);
        a.setEmbedColor(object.embedColor);
        a.setLastDaily(object.lastDaily);
        a.setLastWeekly(object.lastWeekly);
        a.setStatus(object.status);
        a.setReason(object.revokeReason);
        a.setStartDate(object.startDate);
        a.setExpireDate(object.expireDate);

        return a;
    }
}

export enum status {
    INACTIVE = 0,
    ACTIVE = 1,
    REVOKED = 2,
}

async function requestRemoveRole(id: string, roleID: string, client: NypsiClient) {
    const res = await client.shard.broadcastEval(
        async (c, { guildId, memberId, roleId }) => {
            const guild = await client.guilds.fetch(guildId).catch(() => {});

            if (!guild) return;

            const user = await guild.members.fetch(memberId).catch(() => {});

            if (!user) return;

            await guild.roles.fetch();

            if (roleId == "819870727834566696") {
                if (
                    user.roles.cache.find((r) => r.id == "747066190530347089") &&
                    !user.roles.cache.find((r) => r.id == "819870727834566696")
                ) {
                    return "boost";
                }
            }

            return await user.roles.remove(roleId);
        },
        {
            context: { guildId: "747056029795221513", memberId: id, roleId: roleID },
        }
    );

    for (const r of res) {
        if (r == "boost") return "boost";
    }
}
