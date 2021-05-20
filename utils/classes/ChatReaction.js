const fetch = require("node-fetch")

class ChatReactionProfile {
    /**
     * @param {Array<String>} phraseList
     * @param {Object} settings
     * @param {Array<String>} blacklisted
     * @returns {ChatReactionProfile}
     */
    constructor(phraseList, settings, blacklisted) {
        if (!phraseList) {
            this.wordList = []
        } else {
            this.wordList = phraseList
        }

        if (settings) {
            this.randomStart = settings.randomStart
            this.randomChannels = settings.randomChannels
            this.timeBetweenEvents = settings.timeBetweenEvents
            this.randomModifier = settings.randomModifier
            this.timeout = settings.timeout
        } else {
            this.randomStart = false
            this.randomChannels = []
            this.timeBetweenEvents = 600
            this.randomModifier = 300
            this.timeout = 60
        }

        if (blacklisted) {
            this.blacklisted = blacklisted
        } else {
            this.blacklisted = []
        }

        return this
    }

    static from(object) {
        return new ChatReactionProfile(object.wordList, object.settings, object.stats)
    }
}

exports.ChatReactionProfile = ChatReactionProfile

class StatsProfile {
    constructor(wins, secondPlace, thirdPlace) {
        if (wins) {
            this.wins = wins
        } else {
            this.wins = 0
        }

        if (secondPlace) {
            this.secondPlace = secondPlace
        } else {
            this.secondPlace = 0
        }

        if (thirdPlace) {
            this.thirdPlace = thirdPlace
        } else {
            this.thirdPlace = 0
        }
    }
}

exports.StatsProfile = StatsProfile

function getZeroWidth() {
    return "​"
}

exports.getZeroWidth = getZeroWidth
