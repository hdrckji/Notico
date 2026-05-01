import { prisma } from '../config/database';

export const ensureSupplierGoldAccessTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "supplier_gold_access" (
      "supplierId" TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "supplier_gold_access_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
};

export const setSupplierGoldAccess = async (supplierId: string, isGold: boolean) => {
  await ensureSupplierGoldAccessTable();

  if (isGold) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "supplier_gold_access" ("supplierId") VALUES ($1) ON CONFLICT ("supplierId") DO NOTHING`,
      supplierId
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM "supplier_gold_access" WHERE "supplierId" = $1`,
    supplierId
  );
};

export const isSupplierGoldAccess = async (supplierId: string) => {
  await ensureSupplierGoldAccessTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ supplierId: string }>>(
    `SELECT "supplierId" FROM "supplier_gold_access" WHERE "supplierId" = $1 LIMIT 1`,
    supplierId
  );

  return rows.length > 0;
};

export const getSupplierGoldAccessMap = async (supplierIds: string[]) => {
  await ensureSupplierGoldAccessTable();

  const result: Record<string, boolean> = {};
  supplierIds.forEach((id) => {
    result[id] = false;
  });

  if (supplierIds.length === 0) {
    return result;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ supplierId: string }>>(
    `SELECT "supplierId" FROM "supplier_gold_access" WHERE "supplierId" = ANY($1::text[])`,
    supplierIds
  );

  rows.forEach((row) => {
    result[row.supplierId] = true;
  });

  return result;
};
