import { PrismaClient } from '@prisma/client'
import { neon } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Use Neon's serverless driver for Vercel edge/serverless compatibility
  if (process.env.POSTGRES_PRISMA_URL) {
    const sql = neon(process.env.POSTGRES_PRISMA_URL)
    const adapter = new PrismaNeon(sql)
    return new PrismaClient({ adapter })
  }
  // Fallback for local development
  return new PrismaClient()
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
