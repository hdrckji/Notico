import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

const ensureLocationOrderPrefixRulesTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "location_order_prefix_rules" (
      "id" TEXT PRIMARY KEY,
      "locationId" TEXT NOT NULL UNIQUE,
      "orderPrefix" TEXT NOT NULL UNIQUE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "location_order_prefix_rules_locationId_fkey"
        FOREIGN KEY ("locationId") REFERENCES "delivery_locations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
};

const withOrderPrefixes = async <T extends { id: string }>(locations: T[]) => {
  await ensureLocationOrderPrefixRulesTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ locationId: string; orderPrefix: string }>>(
    'SELECT "locationId", "orderPrefix" FROM "location_order_prefix_rules"'
  );
  const prefixByLocationId = new Map(rows.map((row) => [row.locationId, row.orderPrefix]));

  return locations.map((location) => ({
    ...location,
    orderPrefix: prefixByLocationId.get(location.id) || null,
  }));
};

// Get all locations (anyone authenticated)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locations = await prisma.deliveryLocation.findMany({
      include: { quays: { include: { capacity: true } } },
    });

    const hydrated = await withOrderPrefixes(locations);
    res.json(hydrated);
  } catch (error: any) {
    try {
      const fallbackLocations = await prisma.deliveryLocation.findMany({
        include: { quays: true },
      });

      const normalized = fallbackLocations.map((location) => ({
        ...location,
        quays: location.quays.map((quay) => ({ ...quay, capacity: null })),
      }));

      const hydratedFallback = await withOrderPrefixes(normalized);
      return res.json(hydratedFallback);
    } catch (fallbackError: any) {
      if (error?.code === 'P2021' || fallbackError?.code === 'P2021') {
        return res.status(500).json({
          error: 'Table de capacite absente en base. Executez prisma db push sur Railway.',
        });
      }

      return res.status(500).json({
        error: fallbackError?.message || error?.message || 'Failed to fetch locations',
      });
    }
  }
});

// Get location by ID with appointments
router.get('/:id/appointments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    const appointments = await prisma.appointment.findMany({
      where: {
        locationId: req.params.id,
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { supplier: true, quay: true },
      orderBy: { scheduledDate: 'asc' },
    });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

export default router;
