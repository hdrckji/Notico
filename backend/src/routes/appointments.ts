import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendRescheduleRequest } from '../config/email';
import { isSupplierGoldAccess } from '../services/supplierGoldAccess';

const router = Router();

const DEFAULT_DAILY_CAPACITY = 100;
const AVAILABILITY_LOOKAHEAD_DAYS = 21;
const AVAILABILITY_SLOT_LIMIT = 8;

const ORDER_PREFIX_REGEX = /^\d{5}$/;

type QuayWithCapacity = {
  id: string;
  name: string;
  locationId: string;
  capacity: {
    maxParcelsPerDay: number;
    maxPalletsPerDay: number;
  } | null;
};

const APPOINTMENT_STATUS_VALUES = ['SCHEDULED', 'DELIVERED', 'RESCHEDULED', 'NO_SHOW'] as const;
type AppointmentStatusValue = (typeof APPOINTMENT_STATUS_VALUES)[number];

const appointmentWithHistoryInclude = {
  location: true,
  supplier: true,
  quay: true,
  statusHistory: {
    orderBy: { changedAt: 'desc' as const },
    include: {
      changedByUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
  },
};

const isAppointmentStatus = (value: string): value is AppointmentStatusValue => {
  return APPOINTMENT_STATUS_VALUES.includes(value as AppointmentStatusValue);
};

const parseOptionalNonNegativeInt = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const MAX_DELIVERY_NOTE_BASE64_LENGTH = 7_000_000;

const auditStatusChange = async (
  tx: any,
  appointmentId: string,
  fromStatus: AppointmentStatusValue | null,
  toStatus: AppointmentStatusValue,
  changedByRole: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER',
  changedByUserId?: string | null
) => {
  await tx.appointmentStatusHistory.create({
    data: {
      appointmentId,
      fromStatus,
      toStatus,
      changedByRole,
      changedByUserId: changedByRole === 'SUPPLIER' ? null : (changedByUserId || null),
    },
  });
};

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

const getOrderPrefix = (orderNumber: string) => orderNumber.trim().slice(0, 5);

const resolveLocationIdByOrderNumber = async (orderNumber: string) => {
  const orderPrefix = getOrderPrefix(orderNumber);
  if (!ORDER_PREFIX_REGEX.test(orderPrefix)) {
    return null;
  }

  await ensureLocationOrderPrefixRulesTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ locationId: string }>>(
    'SELECT "locationId" FROM "location_order_prefix_rules" WHERE "orderPrefix" = $1 LIMIT 1',
    orderPrefix
  );
  return rows[0]?.locationId || null;
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

// Create appointment (supplier, admin or employee)
router.post('/', authMiddleware, requireRole('SUPPLIER', 'ADMIN', 'EMPLOYEE'), async (req: Request, res: Response) => {
  try {
    const { orderNumber, volume, deliveryType, supplierId } = req.body;
    const requestedVolume = Number(volume);
    const parsedDate = new Date(req.body.scheduledDate);
    const providedLocationId = req.body.locationId;
    const mappedLocationId = orderNumber ? await resolveLocationIdByOrderNumber(String(orderNumber)) : null;
    const locationId = req.user?.role === 'SUPPLIER' ? mappedLocationId : (mappedLocationId || providedLocationId);
    let quayId: string | null = req.body.quayId || null;
    const supplierIsGold = req.user?.role === 'SUPPLIER'
      ? await isSupplierGoldAccess(req.user.id)
      : false;

    if (!orderNumber || !locationId || !parsedDate || Number.isNaN(parsedDate.getTime()) || requestedVolume <= 0 || !['PARCEL', 'PALLET'].includes(deliveryType)) {
      return res.status(400).json({ error: 'Invalid appointment payload' });
    }

    if (!mappedLocationId && req.user?.role === 'SUPPLIER') {
      return res.status(400).json({ error: 'Aucun site ne correspond aux 5 premiers chiffres de ce numero de commande.' });
    }

    if ((req.user?.role === 'ADMIN' || req.user?.role === 'EMPLOYEE') && !supplierId) {
      return res.status(400).json({ error: 'Le fournisseur est obligatoire.' });
    }

    if (req.user?.role === 'EMPLOYEE') {
      const userAccess = await prisma.userQuayAccess.findMany({
        where: { userId: req.user.id },
        select: { quayId: true },
      });

      const assignedQuayIds = userAccess.map((access) => access.quayId);
      if (assignedQuayIds.length > 0) {
        if (!quayId || !assignedQuayIds.includes(quayId)) {
          return res.status(403).json({ error: 'Vous ne pouvez creer une livraison que sur un quai qui vous est assigne.' });
        }
      } else if (req.user.locationId && locationId !== req.user.locationId) {
        return res.status(403).json({ error: 'Vous ne pouvez creer une livraison que sur votre site.' });
      }
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
      if (!supplierIsGold && usedVolume + requestedVolume > dailyCapacity) {
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
        .filter((q) => supplierIsGold || q.remaining >= requestedVolume)
        .sort((a, b) => b.remaining - a.remaining)[0];

      if (!selected) {
        return res.status(409).json({ error: 'No remaining capacity for selected day at this location' });
      }

      quayId = selected.quayId;
    }

    const isEmployeeCreation = req.user!.role === 'EMPLOYEE';
    const creationStatus = isEmployeeCreation ? 'DELIVERED' : 'SCHEDULED';
    const deliveryNoteNumber = isEmployeeCreation && typeof req.body.deliveryNoteNumber === 'string'
      ? req.body.deliveryNoteNumber.trim() || null
      : null;
    const palletsReceived = isEmployeeCreation ? (Number(req.body.palletsReceived) >= 0 ? Math.floor(Number(req.body.palletsReceived)) : null) : null;
    const palletsReturned = isEmployeeCreation ? (Number(req.body.palletsReturned) >= 0 ? Math.floor(Number(req.body.palletsReturned)) : null) : null;

    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          supplierId: req.user!.role === 'SUPPLIER' ? req.user!.id : supplierId,
          orderNumber,
          volume: requestedVolume,
          deliveryType,
          scheduledDate: parsedDate,
          locationId,
          quayId,
          createdByRole: req.user!.role,
          status: creationStatus,
          ...(isEmployeeCreation ? {
            deliveryNoteNumber,
            palletsReceived: palletsReceived ?? undefined,
            palletsReturned: palletsReturned ?? undefined,
          } : {}),
        },
      });

      await auditStatusChange(
        tx,
        created.id,
        null,
        creationStatus,
        req.user!.role,
        req.user!.id
      );

      return tx.appointment.findUnique({
        where: { id: created.id },
        include: appointmentWithHistoryInclude,
      });
    });

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Get next available slots for supplier booking
router.get('/available-slots', authMiddleware, requireRole('SUPPLIER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const orderNumber = String(req.query.orderNumber || '');
    const requestedLocationId = String(req.query.locationId || '');
    const mappedLocationId = orderNumber ? await resolveLocationIdByOrderNumber(orderNumber) : null;
    const locationId = mappedLocationId || requestedLocationId;
    const deliveryType = String(req.query.deliveryType || '').toUpperCase() as 'PARCEL' | 'PALLET';
    const volume = Number(req.query.volume || 0);
    const supplierIsGold = req.user?.role === 'SUPPLIER'
      ? await isSupplierGoldAccess(req.user.id)
      : false;

    if (!locationId || !['PARCEL', 'PALLET'].includes(deliveryType) || !Number.isFinite(volume) || volume <= 0) {
      return res.status(400).json({ error: 'orderNumber ou locationId, deliveryType et volume sont requis' });
    }

    if (orderNumber && !mappedLocationId) {
      return res.status(400).json({ error: 'Aucun site ne correspond aux 5 premiers chiffres de ce numero de commande.' });
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

    // Parse allowed delivery days (JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat)
    const allowedDays = (location.deliveryDays || '1,2,3,4,5')
      .split(',')
      .map((d: string) => parseInt(d.trim(), 10))
      .filter((d: number) => !Number.isNaN(d));

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

      // Skip days not allowed for this location
      if (!allowedDays.includes(day.getDay())) continue;

      const dayKey = getDayKey(day);

      for (const quay of location.quays as QuayWithCapacity[]) {
        const dailyCapacity = getQuayCapacityForType(quay, deliveryType);
        const used = usedMap.get(`${quay.id}|${dayKey}|${deliveryType}`) || 0;
        const remaining = dailyCapacity - used;

        if (remaining >= volume || supplierIsGold) {
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
        include: appointmentWithHistoryInclude,
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
        include: appointmentWithHistoryInclude,
        orderBy: { scheduledDate: 'desc' },
      });
    } else {
      appointments = await prisma.appointment.findMany({
        include: appointmentWithHistoryInclude,
        orderBy: { scheduledDate: 'desc' },
      });
    }

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Track pallet balance per supplier (employee/admin)
router.get('/pallet-balances', authMiddleware, requireRole('EMPLOYEE', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    let scope: any = {};

    if (req.user?.role === 'EMPLOYEE') {
      const userAccess = await prisma.userQuayAccess.findMany({
        where: { userId: req.user.id },
        select: { quayId: true },
      });

      if (userAccess.length > 0) {
        scope = { quayId: { in: userAccess.map((ua) => ua.quayId) } };
      } else if (req.user.locationId) {
        scope = { locationId: req.user.locationId };
      }
    }

    const deliveredAppointments = await prisma.appointment.findMany({
      where: {
        ...scope,
        status: 'DELIVERED',
      },
      select: {
        supplierId: true,
        palletsReceived: true,
        palletsReturned: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const balances = new Map<string, {
      supplierId: string;
      supplierName: string;
      palletsReceived: number;
      palletsReturned: number;
      balance: number;
    }>();

    deliveredAppointments.forEach((appointment) => {
      const supplierId = appointment.supplierId;
      const existing = balances.get(supplierId) || {
        supplierId,
        supplierName: appointment.supplier.name,
        palletsReceived: 0,
        palletsReturned: 0,
        balance: 0,
      };

      existing.palletsReceived += appointment.palletsReceived || 0;
      existing.palletsReturned += appointment.palletsReturned || 0;
      existing.balance = existing.palletsReceived - existing.palletsReturned;

      balances.set(supplierId, existing);
    });

    res.json(Array.from(balances.values()).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pallet balances' });
  }
});

// Attach delivery note file to an appointment
router.patch('/:id/delivery-note', authMiddleware, requireRole('SUPPLIER', 'ADMIN', 'EMPLOYEE'), async (req: Request, res: Response) => {
  try {
    const fileName = String(req.body.fileName || '').trim();
    const mimeType = String(req.body.mimeType || '').trim();
    const base64Content = String(req.body.base64Content || '').trim();

    if (!fileName || !mimeType || !base64Content) {
      return res.status(400).json({ error: 'Le nom de fichier, le type MIME et le contenu sont obligatoires.' });
    }

    if (base64Content.length > MAX_DELIVERY_NOTE_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Fichier trop volumineux. Limite: 5MB.' });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (req.user?.role === 'SUPPLIER' && appointment.supplierId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        deliveryNoteFileName: fileName,
        deliveryNoteFileMimeType: mimeType,
        deliveryNoteFileBase64: base64Content,
      },
      include: appointmentWithHistoryInclude,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload delivery note file' });
  }
});

// Update appointment status (employee/admin)
router.patch('/:id/status', authMiddleware, requireRole('EMPLOYEE', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const requestedStatus = String(req.body.status || '').toUpperCase();
    if (!isAppointmentStatus(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const deliveryNoteNumber = typeof req.body.deliveryNoteNumber === 'string'
      ? req.body.deliveryNoteNumber.trim()
      : '';
    const palletsReceived = parseOptionalNonNegativeInt(req.body.palletsReceived);
    const palletsReturned = parseOptionalNonNegativeInt(req.body.palletsReturned);

    if (palletsReceived === null || palletsReturned === null) {
      return res.status(400).json({ error: 'Les quantites de palettes doivent etre des nombres entiers positifs.' });
    }

    if (requestedStatus === 'DELIVERED') {
      if (palletsReceived === undefined || palletsReturned === undefined) {
        return res.status(400).json({ error: 'Les palettes recues et rendues sont obligatoires pour valider une livraison.' });
      }
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!current) {
        return null;
      }

      const updateData: any = { status: requestedStatus };
      if (requestedStatus === 'DELIVERED') {
        updateData.deliveryNoteNumber = deliveryNoteNumber || null;
        updateData.palletsReceived = palletsReceived;
        updateData.palletsReturned = palletsReturned;
      }

      const updated = await tx.appointment.update({
        where: { id: req.params.id },
        data: updateData,
      });

      if (current.status !== requestedStatus) {
        await auditStatusChange(
          tx,
          updated.id,
          current.status as AppointmentStatusValue,
          requestedStatus,
          req.user!.role,
          req.user!.id
        );
      }

      return tx.appointment.findUnique({
        where: { id: updated.id },
        include: appointmentWithHistoryInclude,
      });
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Send email if marked as NO_SHOW
    if (requestedStatus === 'NO_SHOW') {
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

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.appointment.update({
        where: { id: req.params.id },
        data: { scheduledDate: new Date(scheduledDate), status: 'RESCHEDULED' },
      });

      if (appointment.status !== 'RESCHEDULED') {
        await auditStatusChange(
          tx,
          next.id,
          appointment.status as AppointmentStatusValue,
          'RESCHEDULED',
          req.user!.role,
          req.user!.id
        );
      }

      return tx.appointment.findUnique({
        where: { id: next.id },
        include: appointmentWithHistoryInclude,
      });
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
    const requestedStatus = String(status || '').toUpperCase();
    if (!isAppointmentStatus(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!current) {
        return null;
      }

      const next = await tx.appointment.update({
        where: { id: req.params.id },
        data: {
          orderNumber,
          volume: Number(volume),
          deliveryType,
          scheduledDate: new Date(scheduledDate),
          locationId,
          supplierId,
          status: requestedStatus,
        },
      });

      if (current.status !== requestedStatus) {
        await auditStatusChange(
          tx,
          next.id,
          current.status as AppointmentStatusValue,
          requestedStatus,
          req.user!.role,
          req.user!.id
        );
      }

      return tx.appointment.findUnique({
        where: { id: next.id },
        include: appointmentWithHistoryInclude,
      });
    });

    if (!updated) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

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
