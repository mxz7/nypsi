import dayjs = require("dayjs")
import { getDatabase } from "../database/database"
import { MStoTime } from "../functions/date"
import { logger } from "../logger"

const db = getDatabase()

export default function purgeUsernames() {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    const purge = () => {
        const old = dayjs().subtract(180, "days").toDate().getTime()

        const d = db.prepare("DELETE FROM usernames WHERE type = 'username' AND date < ?").run(old)

        logger.log("auto", `${d.changes.toLocaleString()} old usernames deleted from database`)
    }

    setTimeout(async () => {
        setInterval(() => {
            purge()
        }, 86400000)
        purge()
    }, needed.getTime() - now.getTime())

    logger.log({
        level: "auto",
        message: `old usernames will be purged in ${MStoTime(needed.getTime() - now.getTime())}`,
    })
}
