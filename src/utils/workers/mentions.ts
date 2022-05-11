import { Worker, isMainThread, parentPort, workerData } from "worker_threads"

declare function require(name: string)

export default function doCollection(array: Array<string>): Promise<Array<string>> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: [array],
        })
        worker.on("message", resolve)
        worker.on("error", reject)
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
        })
    })
}

if (!isMainThread) {
    const db = require("better-sqlite3")("./out/data/storage.db")
    const { encrypt } = require("../functions/string")
    const insertMention = db.prepare(
        "INSERT INTO mentions (guild_id, target_id, date, user_tag, url, content) VALUES (?, ?, ?, ?, ?, ?)"
    )
    const fetchMentions = db.prepare("SELECT url FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC")
    const getTier = db.prepare("SELECT level FROM premium WHERE level > 0 AND id = ?")
    const collection = workerData[0]

    const members = collection.members

    let content = collection.message.content

    if (content.length > 100) {
        content = content.substr(0, 97) + "..."
    }

    content = content.replace(/(\r\n|\n|\r)/gm, " ")

    content = encrypt(content)

    let channelMembers = collection.channelMembers

    const a = Array.from(members.keys())

    const interval = setInterval(() => {
        const memberID = a.shift()

        const member = members.get(memberID)

        if (!member) return
        if (member.user.bot) return
        if (member.user.id == collection.message.author.id) return

        try {
            if (!channelMembers.has(memberID)) return
        } catch {
            channelMembers = channelMembers.cache
            if (!channelMembers.has(memberID)) return
        }

        insertMention.run(
            collection.guild.id,
            member.user.id,
            Math.floor(collection.message.createdTimestamp / 1000),
            `${collection.message.author.username}#${collection.message.author.discriminator}`,
            collection.url,
            content
        )
        const mentions = fetchMentions.all(collection.guild.id, member.user.id)

        let limit = 6

        const tier = getTier.run(member.user.id)

        if (tier) {
            limit += tier * 2
        }

        if (mentions.length > limit) {
            mentions.splice(0, limit)

            const deleteMention = db.prepare("DELETE FROM mentions WHERE url = ?")

            for (const mention of mentions) {
                deleteMention.run(mention.url)
            }
        }

        if (a.length == 0) {
            clearInterval(interval)
            db.close()
            parentPort.postMessage(0)
        }
    }, 75)
}
