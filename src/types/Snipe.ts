export interface SnipedMessage {
  id: string;
  content: string;
  user: {
    username: string;
    avatar: string;
  };
  createdAt: number;
  channelId: string;
}
