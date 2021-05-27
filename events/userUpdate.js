const { User } = require("discord.js")
const { usernameProfileExists, createUsernameProfile, addNewUsername, addNewAvatar } = require("../utils/users/utils")

/**
 * 
 * @param {User} oldUser 
 * @param {User} newUser 
 */
module.exports = async (oldUser, newUser) => {
    console.log(oldUser.tag == newUser.tag)
    console.log(
        oldUser.displayAvatarURL({ dynamic: true, size: 256 }) ==
            newUser.displayAvatarURL({ dynamic: true, size: 256 })
    )

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
        if (!usernameProfileExists(newUser.id)) {
            createUsernameProfile(newUser.id, newUser.tag)
        } else {
            addNewAvatar(newUser.id, newUser.displayAvatarURL({ dynamic: true, size: 256 }))
        }
    }
}