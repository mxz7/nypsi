import Redis from "ioredis";
import { redisDeserialize, redisSerialize } from "./cache";

type RedisPubSubHandler<T> = (message: T) => void | Promise<void>;
type RedisPubSubMode = "idle" | "publisher" | "subscriber" | "closed";

export class RedisPubSub<T> {
  private readonly redis: Redis;
  private mode: RedisPubSubMode = "idle";
  private messageListener: ((channel: string, message: string) => void) | null = null;

  constructor(
    redis: Redis,
    private readonly channel: string,
  ) {
    this.redis = redis.duplicate();
  }

  publish(message: T): Promise<number> {
    if (this.mode === "subscriber" || this.mode === "closed") {
      throw new Error(`cannot publish while Redis pub/sub connection is ${this.mode}`);
    }

    this.mode = "publisher";
    return this.redis.publish(this.channel, redisSerialize(message));
  }

  async subscribe(handler: RedisPubSubHandler<T>): Promise<void> {
    if (this.mode !== "idle") {
      throw new Error(`cannot subscribe while Redis pub/sub connection is ${this.mode}`);
    }

    this.mode = "subscriber";
    this.messageListener = (channel, rawMessage) => {
      if (channel !== this.channel) return;

      let message: T;

      try {
        message = redisDeserialize<T>(rawMessage);
      } catch {
        return;
      }

      void Promise.resolve(handler(message)).catch(() => {});
    };
    this.redis.on("message", this.messageListener);

    try {
      await this.redis.subscribe(this.channel);
    } catch (error) {
      this.removeMessageListener();
      if (!this.isClosed()) this.mode = "idle";
      throw error;
    }
  }

  close(): void {
    if (this.mode === "closed") return;

    this.mode = "closed";
    this.removeMessageListener();
    this.redis.disconnect();
  }

  private removeMessageListener() {
    if (!this.messageListener) return;
    this.redis.off("message", this.messageListener);
    this.messageListener = null;
  }

  private isClosed() {
    return this.mode === "closed";
  }
}
