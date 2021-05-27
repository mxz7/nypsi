const { User } = require("discord.js")
const { usernameProfileExists, createUsernameProfile, addNewUsername, addNewAvatar } = require("../utils/users/utils")
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
            addNewUsername(newUser.id, newUser.tag)
        }
    }

    if (
        oldUser.displayAvatarURL({ dynamic: true, size: 256 }) !=
        newUser.displayAvatarURL({ dynamic: true, size: 256 })
    ) {
        const url = await uploadImage(newUser.displayAvatarURL({ format: "png", dynamic: "true", size: 256 }))
        if (!usernameProfileExists(newUser.id) && url) {
            createUsernameProfile(newUser.id, newUser.tag, url)
        } else {
            if (url) {
                addNewAvatar(newUser.id, url)
            }
        }
    }
}