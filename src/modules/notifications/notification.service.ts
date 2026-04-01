import { NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../infra/db/prisma";

export class NotificationService {
  async log(userId: string, type: NotificationType, payload?: Record<string, unknown>) {
    return prisma.notificationLog.create({
      data: {
        userId,
        type,
        status: NotificationStatus.SENT,
        payloadJson: payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async wasSentBetween(userId: string, type: NotificationType, from: Date, to: Date) {
    const existing = await prisma.notificationLog.findFirst({
      where: {
        userId,
        type,
        status: NotificationStatus.SENT,
        sentAt: {
          gte: from,
          lt: to,
        },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }
}
