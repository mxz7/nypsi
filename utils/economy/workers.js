const workers = new Map()

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
        this.level = settings.level
        this.stored = settings.stored

        if (!this.level) {
            this.level = 1
        }

        if (!this.stored) {
            this.stored = 0
        }

        return this
    }

    /**
     * @returns {Number}
     */
    getUpgradeCost() {
        const base = this.cost
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

    upgrade() {
        this.level++
        this.perItem = this.perItem * 2
        this.maxStorage = Math.floor(this.maxStorage * 1.5)
    }

    /**
     * @returns {Worker}
     * @param {Worker} json
     */
    static fromJSON(json) {
        const a = new Worker({
            maxStorage: json.maxStorage,
            perItem: json.perItem,
            perInterval: json.perInterval,
            cost: json.cost,
            prestige: json.prestige,
            name: json.name,
            id: json.id,
            itemName: json.itemName,
            stored: json.stored,
            level: json.level
        })

        return a
    }
}

exports.Worker = Worker

class PotatoFarmer extends Worker {
    /**
     * @returns {PotatoFarmer}
     */
    constructor() {
        super({
            maxStorage: 30000,
            perItem: 1,
            perInterval: 7,
            cost: 75000,
            prestige: 1,
            name: "potato farmer",
            id: 0,
            itemName: "🥔",
        })

        return this
    }
}

exports.PotatoFarmer = PotatoFarmer

workers.set(0, new PotatoFarmer())

class Fisherman extends Worker {
    /**
     * @returns {Fisherman}
     */
    constructor() {
        super({
            maxStorage: 20000,
            perItem: 4,
            perInterval: 5,
            cost: 300000,
            prestige: 2,
            name: "fisherman",
            id: 1,
            itemName: "🐟",
        })

        return this
    }
}

exports.Fisherman = Fisherman

workers.set(1, new Fisherman())

class Miner extends Worker {
    /**
     * @returns {Miner}
     */
    constructor() {
        super({
            maxStorage: 15000,
            perItem: 5,
            perInterval: 7,
            cost: 400000,
            prestige: 2,
            name: "miner",
            id: 2,
            itemName: "⛏",
        })

        return this
    }
}

exports.Miner = Miner

workers.set(2, new Miner())

class LumberJack extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor() {
        super({
            maxStorage: 10000,
            perItem: 8,
            perInterval: 5,
            cost: 500000,
            prestige: 3,
            name: "lumberjack",
            id: 3,
            itemName: "🪓",
        })

        return this
    }
}

exports.LumberJack = LumberJack

workers.set(3, new LumberJack())

class Butcher extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor() {
        super({
            maxStorage: 10000,
            perItem: 10,
            perInterval: 6,
            cost: 600000,
            prestige: 3,
            name: "butcher",
            id: 4,
            itemName: "🥓",
        })

        return this
    }
}

exports.Butcher = Butcher

workers.set(4, new Butcher())

class Tailor extends Worker {
    /**
     * @returns {Tailor}
     */
    constructor() {
        super({
            maxStorage: 5000,
            perItem: 12,
            perInterval: 7,
            cost: 700000,
            prestige: 4,
            name: "tailor",
            id: 5,
            itemName: "👕",
        })

        return this
    }
}

exports.Tailor = Tailor

workers.set(5, new Tailor())

/**
 * 
 * @returns {Map<Number, Worker>}
 */
function getAllWorkers() {
    return workers
}

exports.getAllWorkers = getAllWorkers