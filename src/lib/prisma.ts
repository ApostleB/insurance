import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Prisma 클라이언트 싱글턴.
 * tsx watch 개발 모드에서 핫 리로드 시 커넥션이 누적되는 것을 막기 위해 global에 캐싱한다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (env.isDevelopment) {
  globalForPrisma.prisma = prisma;
}
