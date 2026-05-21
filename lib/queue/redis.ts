import IORedis from "ioredis";
const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
export const redis = new IORedis(url, { maxRetriesPerRequest: null });
export const redisConnection = { connection: redis };
export async function pingRedis() { return (await redis.ping()) === "PONG"; }
