import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

const upsertQuayCapacity = (quayId: string, maxParcelsPerDay: number, maxPalletsPerDay: number) => {
  return prisma.quayDailyCapacity.upsert({
    where: { quayId },
    update: {
      maxParcelsPerDay,
      maxPalletsPerDay,
    },
    create: {
      quayId,
      maxParcelsPerDay,
      maxPalletsPerDay,
    },
  });
};

const ensureQuayCapacityTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "quay_daily_capacities" (
      "quayId" TEXT PRIMARY KEY,
      "maxParcelsPerDay" INTEGER NOT NULL DEFAULT 100,
      "maxPalletsPerDay" INTEGER NOT NULL DEFAULT 100,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "quay_daily_capacities_quayId_fkey"
        FOREIGN KEY ("quayId") REFERENCES "quays"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
};

// ============ SUPPLIERS ============

// Create supplier
router.post('/suppliers', authMiddleware, requireRole('ADMIN'), [
  body('name').notEmpty(),
  body('email').notEmpty(),
  body('password').isLength({ min: 6 }),
  body('phone').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const supplier = await prisma.supplier.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        password: hashedPassword,
        phone: req.body.phone,
        address: req.body.address,
        postalCode: req.body.postalCode,
        city: req.body.city,
        contact: req.body.contact,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        postalCode: true,
        city: true,
        contact: true,
      },
    });

    res.status(201).json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// Update supplier
router.put('/suppliers/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const data: any = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      postalCode: req.body.postalCode,
      city: req.body.city,
      contact: req.body.contact,
    };
    if (req.body.password && req.body.password.length >= 6) {
      data.password = await bcrypt.hash(req.body.password, 10);
    }

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        postalCode: true,
        city: true,
        contact: true,
      },
    });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// Delete supplier
router.delete('/suppliers/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// ============ INTERNAL USERS ============

// List internal users
router.get('/users', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const users = await prisma.internalUser.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        locationId: true,
        assignedQuays: { select: { quayId: true } },
      },
      orderBy: { firstName: 'asc' },
    });
    res.json(users.map((u) => ({ ...u, assignedQuayIds: u.assignedQuays.map((aq) => aq.quayId), assignedQuays: undefined })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create internal user
router.post('/users', authMiddleware, requireRole('ADMIN'), [
  body('email').notEmpty(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = await prisma.internalUser.create({
      data: {
        email: req.body.email,
        password: hashedPassword,
        firstName: req.body.firstName,
        lastName: req.body.lastName || '',
        role: req.body.role || 'EMPLOYEE',
        locationId: req.body.locationId || null,
      },
    });

    const quayIds: string[] = Array.isArray(req.body.quayIds) ? req.body.quayIds : [];
    if (quayIds.length > 0) {
      await prisma.userQuayAccess.createMany({
        data: quayIds.map((quayId) => ({ userId: user.id, quayId })),
        skipDuplicates: true,
      });
    }

    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update internal user
router.put('/users/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const data: any = {
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      role: req.body.role,
      locationId: req.body.locationId || null,
    };
    if (req.body.password && req.body.password.length >= 6) {
      data.password = await bcrypt.hash(req.body.password, 10);
    }
    const user = await prisma.internalUser.update({
      where: { id: req.params.id },
      data,
    });
    // Update quay access
    const quayIds: string[] = Array.isArray(req.body.quayIds) ? req.body.quayIds : [];
    await prisma.userQuayAccess.deleteMany({ where: { userId: req.params.id } });
    if (quayIds.length > 0) {
      await prisma.userQuayAccess.createMany({
        data: quayIds.map((quayId) => ({ userId: req.params.id, quayId })),
        skipDuplicates: true,
      });
    }
    res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, locationId: user.locationId, assignedQuayIds: quayIds });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete internal user
router.delete('/users/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.internalUser.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============ DELIVERY LOCATIONS ============

// Create location
router.post('/locations', authMiddleware, requireRole('ADMIN'), [
  body('name').notEmpty(),
  body('address').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const location = await prisma.deliveryLocation.create({
      data: {
        name: req.body.name,
        address: req.body.address,
        city: req.body.city,
        postalCode: req.body.postalCode,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// Update location
router.put('/locations/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const location = await prisma.deliveryLocation.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        address: req.body.address,
        city: req.body.city,
        postalCode: req.body.postalCode,
      },
    });
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Delete location
router.delete('/locations/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.deliveryLocation.delete({ where: { id: req.params.id } });
    res.json({ message: 'Location deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ============ QUAYS ============

// Create quay
router.post('/quays', authMiddleware, requireRole('ADMIN'), [
  body('name').notEmpty(),
  body('locationId').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const quay = await prisma.quay.create({
      data: {
        name: req.body.name,
        locationId: req.body.locationId,
      },
      include: { location: true },
    });

    res.status(201).json(quay);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create quay' });
  }
});

// Update quay daily capacities
router.put('/quays/:id/capacity', authMiddleware, requireRole('ADMIN'), [
  body('maxParcelsPerDay').isInt({ min: 0 }).withMessage('Le nombre de colis doit etre un entier >= 0').toInt(),
  body('maxPalletsPerDay').isInt({ min: 0 }).withMessage('Le nombre de palettes doit etre un entier >= 0').toInt(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstMessage = errors.array()[0]?.msg || 'Validation failed';
    return res.status(400).json({ error: firstMessage, errors: errors.array() });
  }

  try {
    const maxParcelsPerDay = Number(req.body.maxParcelsPerDay);
    const maxPalletsPerDay = Number(req.body.maxPalletsPerDay);
    const capacity = await upsertQuayCapacity(req.params.id, maxParcelsPerDay, maxPalletsPerDay);

    res.json(capacity);
  } catch (error: any) {
    if (error?.code === 'P2021') {
      try {
        await ensureQuayCapacityTable();
        const recovered = await upsertQuayCapacity(
          req.params.id,
          Number(req.body.maxParcelsPerDay),
          Number(req.body.maxPalletsPerDay)
        );
        return res.json(recovered);
      } catch {
        return res.status(500).json({
          error: 'Table de capacite absente en base. Executez prisma db push sur Railway.',
        });
      }
    }

    if (error?.code === 'P2003') {
        return res.status(500).json({
          error: 'Quai introuvable ou relation invalide.',
        });
    }

    res.status(500).json({ error: 'Failed to update quay capacity' });
  }
});

// Delete quay
router.delete('/quays/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.quay.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete quay' });
  }
});

// ============ QUAY ASSIGNMENTS ============

// Assign quay to supplier
router.post('/quay-assignments', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const assignment = await prisma.quayAssignment.create({
      data: {
        supplierId: req.body.supplierId,
        quayId: req.body.quayId,
      },
      include: { supplier: true, quay: true },
    });

    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign quay' });
  }
});

export default router;
