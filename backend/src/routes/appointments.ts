import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendRescheduleRequest } from '../config/email';

const router = Router();

// Create appointment (supplier or admin)
router.post('/', authMiddleware, requireRole('SUPPLIER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { orderNumber, volume, deliveryType, locationId, supplierId } = req.body;

    const appointment = await prisma.appointment.create({
      data: {
        supplierId: req.user!.role === 'ADMIN' ? supplierId : req.user!.id,
        orderNumber,
        volume: Number(volume),
        deliveryType,
        scheduledDate: new Date(req.body.scheduledDate),
        locationId,
      },
      include: { location: true, supplier: true },
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
      // Filter by assigned quays if any, else by location, else show all
      const userAccess = await prisma.userQuayAccess.findMany({
        where: { userId: req.user.id },
        select: { quayId: true },
      });
      let where: any = {};
      if (userAccess.length > 0) {
        where = { quayId: { in: userAccess.map((ua) => ua.quayId) } };
      } else if (req.user.locationId) {
        where = { locationId: req.user.locationId };
      }
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

// Update full appointment (admin only)
router.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { orderNumber, volume, deliveryType, scheduledDate, locationId, supplierId, status } = req.body;
    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        orderNumber,
        volume: Number(volume),
        deliveryType,
        scheduledDate: new Date(scheduledDate),
        locationId,
        supplierId,
        status,
      },
      include: { supplier: true, location: true, quay: true },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment (admin only)
router.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.appointment.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

export default router;
