const { GuildMember } = require("discord.js")
const fs = require("fs")
const { info, types } = require("../utils/logger")
let users = JSON.parse(fs.readFileSync("./utils/socials/users.json"))

let timer = 0
let timerCheck = true
setInterval(() => {
    const users1 = JSON.parse(fs.readFileSync("./utils/socials/users.json"))

    if (JSON.stringify(users) != JSON.stringify(users1)) {
        fs.writeFile("./utils/socials/users.json", JSON.stringify(users), (err) => {
            if (err) {
                return console.log(err)
            }
            info("socials data saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        users = JSON.parse(fs.readFileSync("./utils/socials/users.json"))
        info("socials data refreshed", types.DATA)
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        users = JSON.parse(fs.readFileSync("./utils/socials/users.json"))
        info("socials data refreshed", types.DATA)
        timer = 0
    }
}, 60000)

module.exports = {
    /**
     *
     * @param {GuildMember} member member to check
     * @returns {Boolean}
     */
    profileExists: function (member) {
        if (users[member.user.id]) {
            return true
        } else {
            return false
        }
    },

    /**
     *
     * @param {String} id member id to check
     * @returns {Boolean}
     */
    profileExistsID: function (id) {
        if (users[id]) {
            return true
        } else {
            return false
        }
    },

    /**
     *
     * @param {GuildMember} member member to create profile for
     */
    createProfile: function (member) {
        users[member.user.id] = {
            youtube: [],
            twitter: [],
            instagram: [],
            snapchat: [],
            email: [],
        }
    },

    /**
     *
     * @param {GuildMember} member member to get profile of
     * @returns {JSON}
     */
    getProfile: function (member) {
        return users[member.user.id]
    },

    /**
     *
     * @param {String} id member id to get profile of
     * @returns {JSON}
     */
    getProfileID: function (id) {
        return users[id]
    },

    /**
     *
     * @param {GuildMember} member member of profile to update
     * @param {JSON} profile new profile
     */
    updateProfile: function (member, profile) {
        users[member.user.id] = profile
    },
}
