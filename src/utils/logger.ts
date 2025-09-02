import { pino } from 'pino'

export const createLogger = (level: string = 'info') => {
  return pino({
    level,
    formatters: {
      level: (label) => {
        return { level: label }
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  })
}

export const logger = createLogger(process.env.LOG_LEVEL || 'info')
