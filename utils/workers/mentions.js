const { Worker, isMainThread, parentPort, workerData } = require("worker_threads")

if (isMainThread) {
    /**
     *
     * @param {Array<String>} array
     * @param {Map<String, Number>} members
     * @returns {Array<String>}
     */
    module.exports = (array, members) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: [array, members],
            })
            worker.on("message", resolve)
            worker.on("error", reject)
            worker.on("exit", (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
            })
        })
    }
} else {
    const db = require("better-sqlite3")("./utils/database/storage.db")
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

    let channelMembers = collection.channelMembers

    for (const memberID of Array.from(members.keys())) {
        const member = members.get(memberID)

        members.delete(memberID)

        if (member.user.bot) continue
        if (member.user.id == collection.message.author.id) continue

        try {
            if (!channelMembers.has(memberID)) continue
        } catch {
            channelMembers = channelMembers.cache
            if (!channelMembers.has(memberID)) continue
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
    }
    db.close()
    parentPort.postMessage(0)
}
