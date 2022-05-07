import { logger } from "../logger"

declare function require(name: string)

export class PremUser {
    public id: string
    public level: number
    public embedColor: string
    public lastDaily: number
    public lastWeekly: number
    public status: number
    public revokeReason: string
    public startDate: number
    public expireDate: number
    /**
     * @returns {PremUser}
     * @param {String} id user id
     * @param {Number} level tier level
     */
    constructor(id: string, level: number) {
        this.id = id
        this.level = level
        this.embedColor = "default" // for custom embed color on all messages
        this.lastDaily = 0
        this.lastWeekly = 0
        this.status = status.ACTIVE
        this.revokeReason = "none"
        this.startDate = new Date().getTime()
        this.expireDate = new Date().setDate(new Date().getDate() + 35)

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Number} level
     */
    setLevel(level: number): PremUser {
        this.level = level

        return this
    }

    /**
     * @returns {PremUser}
     * @param {String} color
     */
    setEmbedColor(color: string): PremUser {
        this.embedColor = color

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Date} date
     */
    setLastDaily(date: Date | number): PremUser {
        if (date instanceof Date) {
            this.lastDaily = date.getTime()
        } else {
            this.lastDaily = date
        }

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Date} date
     */
    setLastWeekly(date: Date | number): PremUser {
        if (date instanceof Date) {
            this.lastWeekly = date.getTime()
        } else {
            this.lastWeekly = date
        }

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Number} status
     */
    setStatus(status: number): PremUser {
        this.status = status

        return this
    }

    /**
     * @returns {PremUser}
     * @param {String} reason
     */
    setReason(reason: string): PremUser {
        this.revokeReason = reason

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Date} date
     */
    setStartDate(date: Date | number): PremUser {
        if (date instanceof Date) {
            this.startDate = date.getTime()
        } else {
            this.startDate = date
        }

        return this
    }

    /**
     * @returns {PremUser}
     * @param {Date} date
     */
    setExpireDate(date: Date | number): PremUser {
        if (date instanceof Date) {
            this.expireDate = date.getTime()
        } else {
            this.expireDate = date
        }

        return this
    }

    /**
     * @returns {String}
     */
    getLevelString(): string {
        switch (this.level) {
            case 0:
                return "none"
            case 1:
                return "BRONZE"
            case 2:
                return "SILVER"
            case 3:
                return "GOLD"
            case 4:
                return "PLATINUM"
        }
    }

    static getLevelString(number: number): string {
        switch (number) {
            case 0:
                return "none"
            case 1:
                return "BRONZE"
            case 2:
                return "SILVER"
            case 3:
                return "GOLD"
            case 4:
                return "PLATINUM"
        }
    }

    renew() {
        this.expireDate = new Date().setDate(new Date().getDate() + 35)
    }

    /**
     *
     * @returns {PremUser}
     */
    async expire(): Promise<PremUser | string> {
        const { requestDM, requestRemoveRole } = require("../../nypsi")

        let roleID

        switch (this.level) {
            case 1:
                roleID = "819870590718181391"
                break
            case 2:
                roleID = "819870727834566696"
                break
            case 3:
                roleID = "819870846536646666"
                break
            case 4:
                roleID = "819870959325413387"
                break
        }

        const e = await requestRemoveRole(this.id, roleID).catch((e) => {
            logger.error(`error removing role (premium) ${this.id}`)
            logger.error(e)
        })

        if (e == "boost") {
            return "boost"
        }

        await requestDM(
            this.id,
            `your **${this.getLevelString()}** membership has expired, join the support server if this is an error ($support)`
        ).catch(() => {})

        this.status = status.INACTIVE
        this.level = 0

        return
    }

    /**
     * @returns {PremUser}
     * @param {Object} object
     */
    static fromData(object: any): PremUser {
        const a = new PremUser(object.id, object.level)
        a.setEmbedColor(object.embedColor)
        a.setLastDaily(object.lastDaily)
        a.setLastWeekly(object.lastWeekly)
        a.setStatus(object.status)
        a.setReason(object.revokeReason)
        a.setStartDate(object.startDate)
        a.setExpireDate(object.expireDate)

        return a
    }
}

export enum status {
    INACTIVE = 0,
    ACTIVE = 1,
    REVOKED = 2,
}
