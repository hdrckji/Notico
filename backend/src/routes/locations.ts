import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// Get all locations (anyone authenticated)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locations = await prisma.deliveryLocation.findMany({
      include: { quays: { include: { capacity: true } } },
    });
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch locations' });
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
