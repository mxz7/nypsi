const fetch = require("node-fetch")

class ChatReactionProfile {
    /**
     * @param {Array<String>} phraseList
     * @param {Object} settings
     * @param {Object} stats
     * @returns {ChatReactionProfile}
     */
    constructor(phraseList, settings, stats) {
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

        return this
    }

    async getDefaultWords() {
        const res = await fetch("https://gist.githubusercontent.com/creikey/42d23d1eec6d764e8a1d9fe7e56915c6/raw/b07de0068850166378bc3b008f9b655ef169d354/top-1000-nouns.txt")
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