import { pino } from "pino";
import { createClient } from "redis";
import { RedisService } from "../services/redis.service.js";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT, REDIS_URL } from "./env.js";

// Variables de entorno
const redisUrl = REDIS_URL;
const redisHost = REDIS_HOST || "redis"; // default para docker
const redisPort = Number(REDIS_PORT || 6379);
const redisPassword = REDIS_PASSWORD;

let redisClient: ReturnType<typeof createClient> | null = null;

export async function initRedis(logger: pino.Logger) {
    if (redisClient) return redisClient;

    const client = redisUrl
        ? createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
                connectTimeout: 5000,
            },
        })
        : createClient({
            socket: {
                host: redisHost,
                port: redisPort,
                reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
                connectTimeout: 5000,
            },
            password: redisPassword,
        });

    client.on("error", (err) => logger.error({ err }, "Redis error"));

    try {
        await client.connect();
        logger.info(
            `✅ Connected to Redis at ${redisUrl || `${redisHost}:${redisPort}`
            }`
        );
        redisClient = client;
        return client;
    } catch (err) {
        logger.error({ err }, "❌ Failed to connect to Redis");
        throw err;
    }
}

export const redisService = new RedisService();