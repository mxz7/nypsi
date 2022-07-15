const workers: Map<number, Constructor<Worker>> = new Map();

interface Settings {
    maxStorage: number;
    perItem: number;
    perInterval: number;
    cost: number;
    prestige: number;
    name: string;
    itemName: string;
    level: number;
    stored: number;
    id: number;
}

export interface WorkerStorageData {
    stored: number;
    level: number;
    id: number;
}

export class Worker {
    public maxStorage: number;
    public perItem: number;
    public perInterval: number;
    public cost: number;
    public prestige: number;
    public name: string;
    public id: number;
    public itemName: string;
    public level: number;
    public stored: number;
    /**
     * @returns {Worker}
     * @param {JSON} settings
     */
    constructor(settings: Settings) {
        this.maxStorage = settings.maxStorage;
        this.perItem = settings.perItem;
        this.perInterval = settings.perInterval;
        this.cost = settings.cost;
        this.prestige = settings.prestige;
        this.name = settings.name;
        this.id = settings.id;
        this.itemName = settings.itemName;
        this.level = settings.level;
        this.stored = settings.stored;

        if (!this.level) {
            this.level = 1;
        }

        if (!this.stored) {
            this.stored = 0;
        }

        return this;
    }

    /**
     * @returns {Number}
     */
    getUpgradeCost(): number {
        const base = this.cost;
        const currentLevel = this.level;

        return base + base * currentLevel;
    }

    /**
     *
     * @returns {Number}
     */
    getHourlyRate(): number {
        return this.perInterval * 12;
    }

    upgrade() {
        this.level++;
        this.perItem = this.perItem * 2;
        this.maxStorage = Math.floor(this.maxStorage * 1.5);
    }

    toStorage() {
        return {
            id: this.id,
            level: this.level,
            stored: this.stored,
        };
    }

    /**
     * @returns {Worker}
     * @param {Worker} json
     */
    static fromStorage(json: WorkerStorageData): Worker {
        const worker = workers.get(json.id);

        return new worker(json.level, json.stored);
    }
}

export class PotatoFarmer extends Worker {
    /**
     * @returns {PotatoFarmer}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 4;
        let maxStorage = 600;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 17,
            cost: 100000,
            prestige: 1,
            name: "potato farmer",
            id: 0,
            itemName: "🥔",
            stored: stored,
            level: level,
        });

        return this;
    }
}

workers.set(0, PotatoFarmer);

export class Fisherman extends Worker {
    /**
     * @returns {Fisherman}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 15;
        let maxStorage = 350;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 10,
            cost: 250000,
            prestige: 2,
            name: "fisherman",
            id: 1,
            itemName: "🐟",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(1, Fisherman);

export class Miner extends Worker {
    /**
     * @returns {Miner}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 22;
        let maxStorage = 400;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 14,
            cost: 400000,
            prestige: 2,
            name: "miner",
            id: 2,
            itemName: "⛏",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(2, Miner);

export class LumberJack extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 35;
        let maxStorage = 350;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 10,
            cost: 500000,
            prestige: 3,
            name: "lumberjack",
            id: 3,
            itemName: "🪓",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(3, LumberJack);

export class Butcher extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 17;
        let maxStorage = 600;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 25,
            cost: 600000,
            prestige: 4,
            name: "butcher",
            id: 4,
            itemName: "🥓",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(4, Butcher);

export class Tailor extends Worker {
    /**
     * @returns {Tailor}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 20;
        let maxStorage = 750;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 30,
            cost: 700000,
            prestige: 5,
            name: "tailor",
            id: 5,
            itemName: "👕",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(5, Tailor);

export class SpaceX extends Worker {
    /**
     * @returns {Tailor}
     */
    constructor(level = 1, stored = 0) {
        let perItem = 50;
        let maxStorage = 85;

        for (let i = 1; i < level; i++) {
            perItem = perItem * 2;
            maxStorage = Math.floor(maxStorage * 1.5);
        }

        super({
            maxStorage: maxStorage,
            perItem: perItem,
            perInterval: 1,
            cost: 1500000,
            prestige: 7,
            name: "spacex",
            id: 6,
            itemName: "🚀",
            level: level,
            stored: stored,
        });

        return this;
    }
}

workers.set(6, SpaceX);

export type Constructor<T> = new (level?: number, stored?: number) => T;

/**
 *
 * @returns {Map<Number, Worker>}
 */
export function getAllWorkers(): Map<number, Constructor<Worker>> {
    return workers;
}
