import { createClient } from 'redis'
import { initRedis } from '../config/redis'
import { pino } from 'pino'

export class RedisService {
  private client: ReturnType<typeof createClient> | null = null
  private logger: pino.Logger

  constructor(logger: pino.Logger) {
    this.logger = logger
  }

  async getClient(): Promise<ReturnType<typeof createClient>> {
    if (!this.client) {
      this.client = await initRedis(this.logger)
    }
    return this.client
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const client = await this.getClient()
      if (ttl) {
        await client.setEx(key, ttl, value)
      } else {
        await client.set(key, value)
      }
    } catch (error) {
      this.logger.error({ error }, `Failed to set Redis key: ${key}`)
      throw error
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient()
      return await client.get(key)
    } catch (error) {
      this.logger.error({ error }, `Failed to get Redis key: ${key}`)
      throw error
    }
  }

  async del(key: string): Promise<number> {
    try {
      const client = await this.getClient()
      return await client.del(key)
    } catch (error) {
      this.logger.error({ error }, `Failed to delete Redis key: ${key}`)
      throw error
    }
  }

  async exists(key: string): Promise<number> {
    try {
      const client = await this.getClient()
      return await client.exists(key)
    } catch (error) {
      this.logger.error({ error }, `Failed to check Redis key existence: ${key}`)
      throw error
    }
  }

  async ping(): Promise<string> {
    try {
      const client = await this.getClient()
      return await client.ping()
    } catch (error) {
      this.logger.error({ error }, 'Redis ping failed')
      throw error
    }
  }
}
