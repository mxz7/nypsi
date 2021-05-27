const { User } = require("discord.js")
const { userExists, getPrestige } = require("../utils/economy/utils")
const { isPremium } = require("../utils/premium/utils")
const {
    usernameProfileExists,
    createUsernameProfile,
    addNewUsername,
    addNewAvatar,
    isTracking,
} = require("../utils/users/utils")
const { uploadImage } = require("../utils/utils")

/**
 *
 * @param {User} oldUser
 * @param {User} newUser
 */
module.exports = async (oldUser, newUser) => {
    if (oldUser.tag != newUser.tag) {
        if (!usernameProfileExists(newUser.id)) {
            createUsernameProfile(newUser.id, newUser.tag)
        } else {
            if (!isTracking(newUser.id)) return
            addNewUsername(newUser.id, newUser.tag)
        }
    }

    if (
        oldUser.displayAvatarURL({ dynamic: true, size: 256 }) !=
        newUser.displayAvatarURL({ dynamic: true, size: 256 })
    ) {
        if (!isPremium(newUser.id) && userExists(newUser.id) && getPrestige(newUser.id) < 5) return
        if (!usernameProfileExists(newUser.id)) {
            const url = await uploadImage(
                newUser.displayAvatarURL({ format: "png", dynamic: "true", size: 256 })
            )
            if (!url) return
            createUsernameProfile(newUser.id, newUser.tag, url)
        } else {
            if (!isTracking(newUser.id)) return

            const url = await uploadImage(
                newUser.displayAvatarURL({ format: "png", dynamic: "true", size: 256 })
            )
            addNewAvatar(newUser.id, url)
        }
    }
}
