import { Collection, GuildMember } from "discord.js"
import { Worker, isMainThread, parentPort, workerData } from "worker_threads"

export default function chooseMember(
    members: Collection<string, GuildMember>,
    targetName: string
): Promise<GuildMember | null> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: [members, targetName],
        })
        worker.on("message", resolve)
        worker.on("error", reject)
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
        })
    })
}

if (!isMainThread) {
    let target: GuildMember
    const possible = new Map()
    const members: Collection<string, GuildMember> = workerData[0]
    const memberName: string = workerData[1]

    for (const m of members.keys()) {
        const member = members.get(m)

        if (member.user.id == memberName) {
            target = member
            break
        } else if (member.user.tag.toLowerCase() == memberName.toLowerCase()) {
            target = member
            break
        } else if (member.user.username.toLowerCase() == memberName.toLowerCase()) {
            if (member.user.bot) {
                possible.set(3, member)
            } else {
                target = member
                break
            }
        } else if (member.displayName.toLowerCase() == memberName.toLowerCase()) {
            if (member.user.bot) {
                possible.set(4, member)
            } else {
                possible.set(1, member)
            }
        } else if (member.user.tag.toLowerCase().includes(memberName.toLowerCase())) {
            if (member.user.bot) {
                possible.set(5, member)
            } else {
                possible.set(2, member)
            }
        } else if (member.displayName.toLowerCase().includes(memberName.toLowerCase())) {
            if (member.user.bot) {
                possible.set(6, member)
            } else {
                possible.set(3, member)
            }
        }

        if (possible.size == 6) break
    }

    if (!target) {
        if (possible.get(1)) {
            target = possible.get(1)
        } else if (possible.get(2)) {
            target = possible.get(2)
        } else if (possible.get(3)) {
            target = possible.get(3)
        } else if (possible.get(4)) {
            target = possible.get(4)
        } else if (possible.get(5)) {
            target = possible.get(5)
        } else if (possible.get(6)) {
            target = possible.get(6)
        } else {
            target = null
        }
    }

    parentPort.postMessage(target)
}
