import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  if (process.env.POSTGRES_PRISMA_URL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require('@neondatabase/serverless')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } = require('@prisma/adapter-neon')
    const sql = neon(process.env.POSTGRES_PRISMA_URL)
    const adapter = new PrismaNeon(sql)
    return new PrismaClient({ adapter })
  }
  // No DB configured — return client that will throw on first query
  // (caught by try/catch in each API route, returning empty data)
  return new PrismaClient()
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
