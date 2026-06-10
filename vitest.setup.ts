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
  return {
    prisma: {
      student: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      class: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      school: {
        findUnique: vi.fn(),
      }
    }
  }
})

// Mock NextAuth
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid-1234'
}))
