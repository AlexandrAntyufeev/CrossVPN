import { UserRole } from "@prisma/client";
import { prisma } from "../../infra/db/prisma";
import { AppError } from "../../shared/errors/app-error";

export class AdminService {
  async assertAdmin(telegramId: bigint) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new AppError("Admin access required", 403);
    }

    return user;
  }

  async getStats() {
    const [usersCount, activeSubscriptions, pendingOrders, fulfilledOrders] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "FULFILLED" } }),
    ]);

    return {
      usersCount,
      activeSubscriptions,
      pendingOrders,
      fulfilledOrders,
    };
  }

  async findUserWithAccessByTelegramId(telegramId: bigint) {
    return prisma.user.findUnique({
      where: { telegramId },
      include: {
        subscriptions: {
          orderBy: {
            expiresAt: "desc",
          },
          take: 1,
          include: {
            plan: true,
            vpnAccount: true,
          },
        },
      },
    });
  }

  async getPendingOrders() {
    return prisma.order.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        user: true,
        plan: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 20,
    });
  }
}
