import { prisma } from '../config/database';

export const ensurePerformanceIndexes = async () => {
  const indexes: Array<{ name: string; sql: string }> = [
    {
      name: 'appointments_quayId_scheduledDate_idx',
      sql: `CREATE INDEX IF NOT EXISTS "appointments_quayId_scheduledDate_idx" ON "appointments" ("quayId", "scheduledDate")`,
    },
    {
      name: 'appointments_status_scheduledDate_idx',
      sql: `CREATE INDEX IF NOT EXISTS "appointments_status_scheduledDate_idx" ON "appointments" ("status", "scheduledDate")`,
    },
  ];

  for (const index of indexes) {
    try {
      await prisma.$executeRawUnsafe(index.sql);
    } catch (error) {
      console.error(`[indexes] Echec creation index ${index.name}:`, error);
    }
  }
};
