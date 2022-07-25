export interface Item {
    id: string;
    name: string;
    emoji: string;
    description: string;
    worth?: number;
    role?: string;
    aliases?: string[];
    speed?: number;
    rarity?: number;
    boobies?: string;
    ingot?: string;
    stackable?: boolean;
    max?: number;
    boosterEffect?: {
        boosts: string;
        effect: number;
        time: number;
    };
}

export interface LotteryTicket {
    userId: string;
    id: number;
}

export interface GuildUpgradeRequirements {
    money: number;
    xp: number;
}

export interface Booster {
    boosterId: string;
    expire: number;
    id: string;
}
