export interface SnipedMessage {
    content: string;
    member: string;
    createdTimestamp: number;
    memberAvatar: string;
    channel: {
        id: string;
    };
}
