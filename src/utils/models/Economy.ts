export interface Item {
    id: string;
    name: string;
    emoji: string;
    description: string;
    worth?: number;
    role?: string;
    aliases?: Array<string>;
    speed?: number;
    rarity?: number;
    boobies?: string;
    ingot?: string;
}

export interface LotteryTicket {
    user_id: string;
    id: number;
}
