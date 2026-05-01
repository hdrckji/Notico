import { prisma } from '../config/database';

const DEFAULT_TIMEZONE = 'Europe/Brussels';
const DEFAULT_CANCEL_HOUR = 20;
const CHECK_INTERVAL_MS = 60 * 1000;

type ScheduledStatus = 'SCHEDULED' | 'RESCHEDULED';

type ZonedNow = {
  dayKey: string;
  hour: number;
  minute: number;
};

const parseHour = (raw: string | undefined) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return DEFAULT_CANCEL_HOUR;
  }
  return parsed;
};

const getZonedNow = (timeZone: string): ZonedNow => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = Number(getPart('hour'));
  const minute = Number(getPart('minute'));

  return {
    dayKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
};

const cancelUndeliveredAppointmentsForDay = async (timeZone: string, dayKey: string) => {
  const targets = await prisma.$queryRaw<Array<{ id: string; status: ScheduledStatus }>>`
    SELECT "id", "status"
    FROM "appointments"
    WHERE "status" IN ('SCHEDULED', 'RESCHEDULED')
      AND DATE("scheduledDate" AT TIME ZONE ${timeZone}) = ${dayKey}::date
  `;

  if (targets.length === 0) {
    return 0;
  }

  const appointmentIds = targets.map((target) => target.id);

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: { id: { in: appointmentIds } },
      data: { status: 'CANCELLED' },
    });

    await tx.appointmentStatusHistory.createMany({
      data: targets.map((target) => ({
        appointmentId: target.id,
        fromStatus: target.status,
        toStatus: 'CANCELLED',
        changedByRole: 'ADMIN',
        changedByUserId: null,
      })),
    });
  });

  return targets.length;
};

export const startAutoCancelUndeliveredJob = () => {
  const cancelHour = parseHour(process.env.AUTO_CANCEL_HOUR);
  const timeZone = process.env.AUTO_CANCEL_TIMEZONE || DEFAULT_TIMEZONE;

  let isRunning = false;
  let lastProcessedDay: string | null = null;

  const runIfNeeded = async () => {
    if (isRunning) {
      return;
    }

    const now = getZonedNow(timeZone);

    if (now.hour < cancelHour || lastProcessedDay === now.dayKey) {
      return;
    }

    isRunning = true;
    try {
      const cancelledCount = await cancelUndeliveredAppointmentsForDay(timeZone, now.dayKey);
      lastProcessedDay = now.dayKey;
      console.log(
        `[auto-cancel] ${cancelledCount} rendez-vous annule(s) pour ${now.dayKey} a partir de ${String(cancelHour).padStart(2, '0')}:00 (${timeZone}).`
      );
    } catch (error) {
      console.error('[auto-cancel] Echec de l annulation automatique des rendez-vous:', error);
    } finally {
      isRunning = false;
    }
  };

  const intervalId = setInterval(() => {
    void runIfNeeded();
  }, CHECK_INTERVAL_MS);

  void runIfNeeded();

  console.log(
    `[auto-cancel] Job active: annulation automatique a ${String(cancelHour).padStart(2, '0')}:00 (${timeZone}), verification chaque minute.`
  );

  return () => clearInterval(intervalId);
};
