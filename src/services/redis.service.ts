import { createClient } from 'redis'
import { initRedis } from '../config/redis.js'
import { logger } from '../utils/logger.js'

export class RedisService {
  private client: ReturnType<typeof createClient> | null

  constructor() {
    this.client = null
  }

  async connect() {
    if (!this.client) {
      this.client = await initRedis(logger)
    }
    return this.client
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const client = await this.connect()
    if (ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds })
    } else {
      await client.set(key, value)
    }
  }

  async get(key: string) {
    const client = await this.connect()
    return client.get(key)
  }

  async del(key: string) {
    const client = await this.connect()
    return client.del(key)
  }

  async exists(key: string) {
    const client = await this.connect()
    return client.exists(key)
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
  }
}
