import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendRescheduleRequest } from '../config/email';

const router = Router();

const DEFAULT_DAILY_CAPACITY = 100;
const AVAILABILITY_LOOKAHEAD_DAYS = 21;
const AVAILABILITY_SLOT_LIMIT = 8;

type QuayWithCapacity = {
  id: string;
  name: string;
  locationId: string;
  capacity: {
    maxParcelsPerDay: number;
    maxPalletsPerDay: number;
  } | null;
};

const getDayBounds = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const getDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getQuayCapacityForType = (quay: QuayWithCapacity, deliveryType: 'PARCEL' | 'PALLET') => {
  if (deliveryType === 'PARCEL') {
    return quay.capacity?.maxParcelsPerDay ?? DEFAULT_DAILY_CAPACITY;
  }
  return quay.capacity?.maxPalletsPerDay ?? DEFAULT_DAILY_CAPACITY;
};

const getUsedVolumesByQuayAndDay = async (
  quayIds: string[],
  start: Date,
  end: Date,
  deliveryType?: 'PARCEL' | 'PALLET'
) => {
  const appointments = await prisma.appointment.findMany({
    where: {
      quayId: { in: quayIds },
      scheduledDate: {
        gte: start,
        lt: end,
      },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(deliveryType ? { deliveryType } : {}),
    },
    select: {
      quayId: true,
      scheduledDate: true,
      volume: true,
      deliveryType: true,
    },
  });

  const usedMap = new Map<string, number>();
  const countMap = new Map<string, number>();

  appointments.forEach((appointment) => {
    if (!appointment.quayId) return;
    const dayKey = getDayKey(appointment.scheduledDate);
    const volumeKey = `${appointment.quayId}|${dayKey}|${appointment.deliveryType}`;
    const countKey = `${appointment.quayId}|${dayKey}`;

    usedMap.set(volumeKey, (usedMap.get(volumeKey) || 0) + appointment.volume);
    countMap.set(countKey, (countMap.get(countKey) || 0) + 1);
  });

  return { usedMap, countMap };
};

// Create appointment (supplier or admin)
router.post('/', authMiddleware, requireRole('SUPPLIER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { orderNumber, volume, deliveryType, locationId, supplierId } = req.body;
    const requestedVolume = Number(volume);
    const parsedDate = new Date(req.body.scheduledDate);
    let quayId: string | null = req.body.quayId || null;

    if (!orderNumber || !locationId || !parsedDate || Number.isNaN(parsedDate.getTime()) || requestedVolume <= 0 || !['PARCEL', 'PALLET'].includes(deliveryType)) {
      return res.status(400).json({ error: 'Invalid appointment payload' });
    }

    if (quayId) {
      const quay = await prisma.quay.findUnique({
        where: { id: quayId },
        include: { capacity: true },
      });

      if (!quay || quay.locationId !== locationId) {
        return res.status(400).json({ error: 'Invalid quay for selected location' });
      }

      const { start, end } = getDayBounds(parsedDate);
      const used = await prisma.appointment.aggregate({
        _sum: { volume: true },
        where: {
          quayId,
          deliveryType,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          scheduledDate: {
            gte: start,
            lt: end,
          },
        },
      });

      const dailyCapacity = deliveryType === 'PARCEL'
        ? quay.capacity?.maxParcelsPerDay ?? DEFAULT_DAILY_CAPACITY
        : quay.capacity?.maxPalletsPerDay ?? DEFAULT_DAILY_CAPACITY;

      const usedVolume = used._sum.volume ?? 0;
      if (usedVolume + requestedVolume > dailyCapacity) {
        return res.status(409).json({ error: 'Selected quay has no remaining capacity for that day' });
      }
    } else if (req.user?.role === 'SUPPLIER') {
      // Supplier bookings should consume a real quay capacity; auto-pick one for the chosen day.
      const quays = await prisma.quay.findMany({
        where: { locationId },
        include: { capacity: true },
      });

      if (quays.length === 0) {
        return res.status(400).json({ error: 'No quay available for selected location' });
      }

      const { start, end } = getDayBounds(parsedDate);
      const { usedMap } = await getUsedVolumesByQuayAndDay(
        quays.map((q) => q.id),
        start,
        end,
        deliveryType
      );

      const dayKey = getDayKey(parsedDate);
      const selected = quays
        .map((q) => {
          const capacity = getQuayCapacityForType(q as QuayWithCapacity, deliveryType);
          const used = usedMap.get(`${q.id}|${dayKey}|${deliveryType}`) || 0;
          return {
            quayId: q.id,
            remaining: capacity - used,
          };
        })
        .filter((q) => q.remaining >= requestedVolume)
        .sort((a, b) => b.remaining - a.remaining)[0];

      if (!selected) {
        return res.status(409).json({ error: 'No remaining capacity for selected day at this location' });
      }

      quayId = selected.quayId;
    }

    const appointment = await prisma.appointment.create({
      data: {
        supplierId: req.user!.role === 'ADMIN' ? supplierId : req.user!.id,
        orderNumber,
        volume: requestedVolume,
        deliveryType,
        scheduledDate: parsedDate,
        locationId,
        quayId,
      },
      include: { location: true, supplier: true, quay: true },
    });

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Get next available slots for supplier booking
router.get('/available-slots', authMiddleware, requireRole('SUPPLIER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const locationId = String(req.query.locationId || '');
    const deliveryType = String(req.query.deliveryType || '').toUpperCase() as 'PARCEL' | 'PALLET';
    const volume = Number(req.query.volume || 0);

    if (!locationId || !['PARCEL', 'PALLET'].includes(deliveryType) || !Number.isFinite(volume) || volume <= 0) {
      return res.status(400).json({ error: 'locationId, deliveryType and volume are required' });
    }

    const location = await prisma.deliveryLocation.findUnique({
      where: { id: locationId },
      include: {
        quays: {
          include: { capacity: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (location.quays.length === 0) {
      return res.json([]);
    }

    const searchStart = new Date();
    searchStart.setHours(0, 0, 0, 0);
    const searchEnd = new Date(searchStart);
    searchEnd.setDate(searchEnd.getDate() + AVAILABILITY_LOOKAHEAD_DAYS);

    const { usedMap, countMap } = await getUsedVolumesByQuayAndDay(
      location.quays.map((q) => q.id),
      searchStart,
      searchEnd
    );

    const slots: Array<{
      scheduledDate: string;
      dateLabel: string;
      quayId: string;
      quayName: string;
      locationId: string;
      locationName: string;
      remainingCapacity: number;
    }> = [];

    for (let offset = 0; offset < AVAILABILITY_LOOKAHEAD_DAYS && slots.length < AVAILABILITY_SLOT_LIMIT; offset += 1) {
      const day = new Date(searchStart);
      day.setDate(searchStart.getDate() + offset);
      const dayKey = getDayKey(day);

      for (const quay of location.quays as QuayWithCapacity[]) {
        const dailyCapacity = getQuayCapacityForType(quay, deliveryType);
        const used = usedMap.get(`${quay.id}|${dayKey}|${deliveryType}`) || 0;
        const remaining = dailyCapacity - used;

        if (remaining >= volume) {
          const dayCount = countMap.get(`${quay.id}|${dayKey}`) || 0;
          const slotDate = new Date(day);
          slotDate.setHours(8 + Math.min(dayCount, 8), 0, 0, 0);

          slots.push({
            scheduledDate: slotDate.toISOString(),
            dateLabel: slotDate.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
            quayId: quay.id,
            quayName: quay.name,
            locationId: location.id,
            locationName: location.name,
            remainingCapacity: remaining,
          });

          if (slots.length >= AVAILABILITY_SLOT_LIMIT) break;
        }
      }
    }

    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available slots' });
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
