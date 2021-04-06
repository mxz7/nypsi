const workers = []

class Worker {
    /**
     * @returns {Worker}
     * @param {JSON} settings
     */
    constructor(settings) {
        this.maxStorage = settings.maxStorage
        this.perItem = settings.perItem
        this.perInterval = settings.perInterval
        this.cost = settings.cost
        this.prestige = settings.prestige
        this.name = settings.name
        this.id = settings.id
        this.itemName = settings.itemName

        this.level = 1
        this.stored = 0

        return this
    }

    /**
     * @returns {Number}
     */
    getUpgradeCost() {
        const base = this.getCost()
        const currentLevel = this.level

        return base + base * currentLevel
    }

    /**
     * 
     * @returns {Number}
     */
    getHourlyRate() {
        return this.perInterval * 12
    }
}

class PotatoFarmer extends Worker {
    /**
     * @returns {PotatoFarmer}
     */
    constructor() {
        super({
            maxStorage: 50000,
            perItem: 1,
            perInterval: 10,
            cost: 250000,
            prestige: 1,
            name: "potato farmer",
            id: 0,
            itemName: "🥔",
        })

        return this
    }
}

exports.PotatoFarmer = PotatoFarmer

workers.push(new PotatoFarmer())

/**
 * 
 * @returns {Array<Worker>}
 */
function getWorkers() {
    return workers
}

exports.getWorkers = getWorkers