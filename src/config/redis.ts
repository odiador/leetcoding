import { pino } from "pino";
import { createClient } from "redis";
import { RedisService } from "../services/redis.service.js";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT, REDIS_TOKEN, REDIS_URL } from "./env.js";

// Variables de entorno
const redisUrl = REDIS_URL;
const redisHost = REDIS_HOST || "redis"; // default para docker
const redisPort = Number(REDIS_PORT || 6379);
const redisPassword = REDIS_PASSWORD;

let redisClient: ReturnType<typeof createClient> | null = null;

export async function initRedis(logger: pino.Logger) {
    if (redisClient) return redisClient;

    // If REDIS_URL is provided, prefer embedding credentials in the URL when a token is available
    let effectiveUrl = redisUrl;
    if (redisUrl) {
        try {
            const parsed = new URL(redisUrl);
            // If URL lacks username/password and we have a token, inject it (common for Upstash: username 'default')
            if (!parsed.username && !parsed.password && (redisPassword || REDIS_TOKEN)) {
                parsed.username = 'default';
                parsed.password = redisPassword || REDIS_TOKEN || '';
                effectiveUrl = parsed.toString();
            }
        } catch (err) {
            // If URL parsing fails, fall back to raw redisUrl
            logger && logger.warn && logger.warn('Invalid REDIS_URL format, using as-is');
            effectiveUrl = redisUrl;
        }
    }

    const client = effectiveUrl
        ? createClient({
            url: effectiveUrl,
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