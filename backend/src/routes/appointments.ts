import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendRescheduleRequest } from '../config/email';

const router = Router();

// Create appointment (supplier only)
router.post('/', authMiddleware, requireRole('SUPPLIER'), async (req: Request, res: Response) => {
  try {
    const { orderNumber, volume, deliveryType, locationId } = req.body;

    const appointment = await prisma.appointment.create({
      data: {
        supplierId: req.user!.id,
        orderNumber,
        volume,
        deliveryType,
        scheduledDate: new Date(req.body.scheduledDate),
        locationId,
      },
      include: { location: true },
    });

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Get appointments (filtered by role)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    let appointments;

    if (req.user?.role === 'SUPPLIER') {
      appointments = await prisma.appointment.findMany({
        where: { supplierId: req.user.id },
        include: { location: true, quay: true },
        orderBy: { scheduledDate: 'desc' },
      });
    } else if (req.user?.role === 'EMPLOYEE') {
      // If employee has a locationId, filter by location; else show all
      const where = req.user.locationId ? { locationId: req.user.locationId } : {};
      appointments = await prisma.appointment.findMany({
        where,
        include: { supplier: true, location: true, quay: true },
        orderBy: { scheduledDate: 'desc' },
      });
    } else {
      appointments = await prisma.appointment.findMany({
        include: { supplier: true, location: true, quay: true },
        orderBy: { scheduledDate: 'desc' },
      });
    }

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Update appointment status (employee/admin)
router.patch('/:id/status', authMiddleware, requireRole('EMPLOYEE', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
      include: { supplier: true },
    });

    // Send email if marked as NO_SHOW
    if (status === 'NO_SHOW') {
      await sendRescheduleRequest(
        appointment.supplier.email,
        appointment.supplier.name,
        appointment.scheduledDate,
        appointment.orderNumber
      );
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Reschedule appointment (supplier or admin)
router.patch('/:id/reschedule', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { scheduledDate } = req.body;
    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (req.user?.role === 'SUPPLIER' && appointment.supplierId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { scheduledDate: new Date(scheduledDate), status: 'RESCHEDULED' },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
});

export default router;
