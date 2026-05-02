import { prisma } from '../config/database';

export const normalizeCancelledStatusesToNoShow = async () => {
  const result = await prisma.$transaction(async (tx) => {
    const appointments = await tx.appointment.updateMany({
      where: { status: 'CANCELLED' },
      data: { status: 'NO_SHOW' },
    });

    const historyToStatus = await tx.appointmentStatusHistory.updateMany({
      where: { toStatus: 'CANCELLED' },
      data: { toStatus: 'NO_SHOW' },
    });

    const historyFromStatus = await tx.appointmentStatusHistory.updateMany({
      where: { fromStatus: 'CANCELLED' },
      data: { fromStatus: 'NO_SHOW' },
    });

    return {
      appointments: appointments.count,
      historyToStatus: historyToStatus.count,
      historyFromStatus: historyFromStatus.count,
    };
  });

  return result;
};
