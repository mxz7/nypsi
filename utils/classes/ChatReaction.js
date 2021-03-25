const fetch = require("node-fetch")

class ChatReactionProfile {
    /**
     * @param {Array<String>} phraseList
     * @param {Object} settings
     * @param {Object} stats
     * @param {Array<String>} blacklisted
     * @returns {ChatReactionProfile}
     */
    constructor(phraseList, settings, stats, blacklisted) {
        if (!phraseList) {
            this.wordList = []
        } else {
            this.wordList = phraseList
        }
        
        if (settings) {
            this.settings = settings
        } else {
            this.settings = {
                randomStart: false,
                randomChannels: [],
                timeBetweenEvents: 600,
                randomModifier: 300,
                timeout: 60
            }
        }

        if (stats) {
            this.stats = stats
        } else {
            this.stats = {}
        }

        if (blacklisted) {
            this.blacklisted = blacklisted
        } else {
            this.blacklisted = []
        }

        return this
    }

    async getDefaultWords() {
        const res = await fetch("https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt")
        const body = await res.text()

        let words = body.split("\n")

        return words
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