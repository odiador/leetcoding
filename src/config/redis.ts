import { pino } from 'pino'
import { createClient } from 'redis'
import { REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from './env.js'

let redisClient: ReturnType<typeof createClient> | null = null
// Redis setup - use validated REDIS_URL if provided, otherwise explicit host/port/password
const redisUrl = REDIS_URL
const redisHost = REDIS_HOST ?? 'localhost'
const redisPort = Number(REDIS_PORT ?? 6379)
const redisPassword = REDIS_PASSWORD ?? REDIS_URL?.match(/redis:\/\:?([^@]+)@/)?.[1]

export async function initRedis(logger: pino.Logger): Promise<ReturnType<typeof createClient>> {
    if (redisClient) return redisClient
    const client = redisUrl
        ? createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries: number) => Math.min(retries * 50, 2000),
                connectTimeout: 5000
            }
        })
        : createClient({
            socket: {
                host: redisHost,
                port: redisPort,
                reconnectStrategy: (retries: number) => Math.min(retries * 50, 2000),
                connectTimeout: 5000
            },
            password: redisPassword
        })
    client.on('error', (err) => logger.error({ err }, 'Redis error'))
    try {
        await client.connect()
        logger.info(`Connected to Redis at ${redisUrl ? redisUrl : `${redisHost}:${redisPort}`}`)
        redisClient = client
        return client
    } catch (err) {
        logger.error({ err }, 'Failed to connect to Redis')
        throw err
    }
}