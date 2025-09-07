import { initRedis, getRedisMode } from '../config/redis.js'
import { logger } from '../utils/logger.js'

export class RedisService {
  private client: any | null = null

  private async connect() {
    if (!this.client) {
      this.client = await initRedis(logger)
    }
    return this.client
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const client = await this.connect()
    const mode = getRedisMode()

    if (mode === 'tcp') {
      if (ttlSeconds) {
        await client.set(key, value, { EX: ttlSeconds })
      } else {
        await client.set(key, value)
      }
    } else if (mode === 'rest') {
      if (ttlSeconds) {
        await client.set(key, value, { ex: ttlSeconds })
      } else {
        await client.set(key, value)
      }
    }
  }

  async get(key: string) {
    const client = await this.connect()
    return await client.get(key)
  }

  async del(key: string) {
    const client = await this.connect()
    return await client.del(key)
  }

  async exists(key: string) {
    const client = await this.connect()
    return await client.exists(key)
  }

  async disconnect() {
    if (this.client && getRedisMode() === 'tcp') {
      await this.client.quit()
    }
    this.client = null
  }
}

export const redisService = new RedisService()
