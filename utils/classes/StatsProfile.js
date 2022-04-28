class StatsProfile {
    /**
     * 
     * @param {Array<{id: string, type: string, win: number, lose: number, gamble: number}>} data 
     */
    constructor(data) {
        this.gamble = {}
        this.items = {}
        this.rob = {
            wins: 0,
            lose: 0
        }

        if (data) {
            this.setData(data)
        }

        return this
    }

    setData(data) {
        for (const d of data) {
            if (d.gamble) {
                this.gamble[d.type] = {
                    wins: 0,
                    lose: 0
                }
                this.gamble[d.type].wins = d.win
                this.gamble[d.type].lose = d.lose
            } else {
                if (d.type == "rob") {
                    this.rob.wins = d.win
                    this.rob.lose = d.lose
                } else {
                    this.items[d.type] = d.win
                }
            }
        }
    }
}

exports.StatsProfile = StatsProfile