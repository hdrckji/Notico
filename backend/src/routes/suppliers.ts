import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// Get all suppliers (admin and employees)
router.get('/', authMiddleware, requireRole('ADMIN', 'EMPLOYEE'), async (req: Request, res: Response) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        postalCode: true,
        city: true,
        contact: true,
        assignedQuays: { include: { quay: true } },
      },
    });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Get supplier by ID (self or admin)
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role === 'SUPPLIER' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        postalCode: true,
        city: true,
        contact: true,
        assignedQuays: { include: { quay: true } },
        appointments: { orderBy: { scheduledDate: 'desc' } },
      },
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

export default router;
