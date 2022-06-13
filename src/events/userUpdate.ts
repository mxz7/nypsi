import { User } from "discord.js"
import { getGuildByUser, getPrestige, updateLastKnownTag, userExists } from "../utils/economy/utils"
import { uploadImageToImgur } from "../utils/functions/image"
import { isPremium } from "../utils/premium/utils"
import { addNewAvatar, addNewUsername, createUsernameProfile, isTracking, usernameProfileExists } from "../utils/users/utils"

const queue: User[] = []
let interval

export default async function userUpdate(oldUser: User, newUser: User) {
    if (oldUser.tag != newUser.tag) {
        if (getGuildByUser(newUser.id)) {
            updateLastKnownTag(newUser.id, newUser.tag)
        }

        if (!usernameProfileExists(newUser.id)) {
            createUsernameProfile(newUser, oldUser.tag)
            addNewUsername(newUser.id, newUser.tag)
        } else {
            if (!isTracking(newUser.id)) return
            addNewUsername(newUser.id, newUser.tag)
        }
    }

    if (oldUser.displayAvatarURL({ dynamic: true, size: 256 }) != newUser.displayAvatarURL({ dynamic: true, size: 256 })) {
        if (!(await userExists(newUser.id))) return
        if (!isPremium(newUser.id) && getPrestige(newUser.id) < 2) return

        if (!usernameProfileExists(newUser.id)) {
            const url = await uploadImageToImgur(newUser.displayAvatarURL({ format: "png", dynamic: true, size: 256 }))
            if (!url) return
            createUsernameProfile(newUser, newUser.tag, url)
        } else {
            if (!isTracking(newUser.id)) return

            queue.push(newUser)

            if (!interval) {
                interval = setInterval(doQueue, 60000)
            }
        }
    }
}

async function doQueue() {
    const user = queue.shift()

    if (!user) return

    const url = await uploadImageToImgur(user.displayAvatarURL({ format: "png", dynamic: true, size: 256 }))

    if (!url) return

    addNewAvatar(user.id, url)

    if (queue.length == 0) {
        clearInterval(interval)
        interval = undefined
    }
}
