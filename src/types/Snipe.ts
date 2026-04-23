export interface SnipedMessage {
  content: string;
  user: {
    username: string;
    avatar: string;
  };
  createdAt: number;
  channelId: string;
}
