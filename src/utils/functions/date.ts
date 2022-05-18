import dayjs = require("dayjs")

export function formatDate(date: Date | number | dayjs.Dayjs): string {
    return dayjs(date).format("MMM D YYYY").toLowerCase()
}

export function daysAgo(date: Date | number): number {
    date = new Date(date)
    const ms = Math.floor(Date.now() - date.getTime())

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

/**
 * @returns {String}
 */
export function daysUntilChristmas(): string {
    let date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear()}`))
    const current = new Date()

    if (current.getMonth() >= 11) {
        if (current.getDate() > 25) {
            date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear() + 1}`))
        } else if (current.getDate() == 25) {
            return "ITS CHRISTMAS"
        }
    }

    return (daysUntil(date) + 1).toString()
}

export function daysUntil(date: Date | number): number {
    date = new Date(date)
    const ms = Math.floor(date.getTime() - Date.now())

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

export function MStoTime(ms: number, long = false) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor(daysms / (60 * 60 * 1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor(hoursms / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor(minutesms / 1000)

    let output = ""

    if (days > 0) {
        output = output + days
        if (long) {
            output += " days "
        } else {
            output += "d "
        }
    }

    if (hours > 0) {
        output = output + hours
        if (long) {
            output += " hours "
        } else {
            output += "h "
        }
    }

    if (minutes > 0) {
        output = output + minutes
        if (long) {
            output += " minutes "
        } else {
            output += "m "
        }
    }

    if (sec > 0) {
        output = output + sec
        if (long) {
            output += " seconds "
        } else {
            output += "s "
        }
    }

    return output
}
