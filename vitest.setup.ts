import { vi } from 'vitest'

// Mock Env variables before modules load
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-key'

// Mock Supabase to avoid network calls
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
    }
  },
  uploadWithRetry: vi.fn(),
  getPublicUrl: vi.fn(),
  ensureStorageBucket: vi.fn(),
}))

// Mock Prisma
vi.mock('@/lib/prisma', () => {
  const prisma = {
    student: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    class: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    school: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    template: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    printBatch: {
      findFirst: vi.fn(),
    },
    rateLimit: {
      deleteMany: vi.fn(),
    },
    systemEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ max: 0 }]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  }

  return {
    prisma,
    batchExecute: vi.fn().mockResolvedValue({ results: [], errors: [] })
  }
})

// Mock NextAuth
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/jobs/enqueue', () => ({
  enqueueJob: vi.fn().mockResolvedValue({ id: 'mock-job-id', status: 'PENDING' }),
  kickJobWorker: vi.fn().mockResolvedValue(undefined),
}))

// Mock crypto.randomUUID; keep createHash for duplicate fingerprint tests
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    randomUUID: () => 'mock-uuid-1234',
  }
})
