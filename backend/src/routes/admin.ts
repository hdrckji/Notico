import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// ============ SUPPLIERS ============

// Create supplier
router.post('/suppliers', authMiddleware, requireRole('ADMIN'), [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('phone').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const supplier = await prisma.supplier.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        postalCode: req.body.postalCode,
        city: req.body.city,
        contact: req.body.contact,
        maxDailyVolume: req.body.maxDailyVolume || 100,
      },
    });

    res.status(201).json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// ============ INTERNAL USERS ============

// Create internal user
router.post('/users', authMiddleware, requireRole('ADMIN'), [
  body('email').isEmail(),
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
        locationId: req.body.locationId,
      },
    });

    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
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
