import {
  NotificationType,
  OrderStatus,
  SubscriptionStatus,
  VpnAccountStatus,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../infra/db/prisma";
import { logger } from "../../infra/logger";
import { QrService } from "../../infra/qr/qr.service";
import { VpnProvider } from "../../providers/vpn/vpn-provider";
import { AppError } from "../../shared/errors/app-error";
import { gigabytesToBytes } from "../../shared/utils/bytes";
import { addDays, isSameOrBefore } from "../../shared/utils/dates";
import { NotificationService } from "../notifications/notification.service";
import { OrderService } from "../orders/order.service";

export class SubscriptionService {
  constructor(
    private readonly vpnProvider: VpnProvider,
    private readonly orderService: OrderService,
    private readonly notificationService: NotificationService,
    private readonly qrService: QrService,
  ) {}

  async fulfillOrder(orderId: string) {
    const order = await this.orderService.getById(orderId);

    if (order.status === OrderStatus.FULFILLED) {
      return this.getAccessPackage(order.userId);
    }

    if (order.status !== OrderStatus.PAID) {
      throw new AppError("Order is not paid yet", 409);
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        userId: order.userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        vpnAccount: true,
      },
      orderBy: {
        expiresAt: "desc",
      },
    });

    if (!activeSubscription || !activeSubscription.vpnAccount) {
      const startedAt = new Date();
      const expiresAt = addDays(startedAt, order.plan.durationDays);
      const vpnClient = await this.vpnProvider.createClient({
        userId: order.userId,
        telegramId: order.user.telegramId,
        telegramUsername: order.user.username,
        inboundId: env.THREE_X_UI_INBOUND_ID,
        expiresAt,
        trafficLimitGb: order.plan.trafficLimitGb,
      });

      const vpnAccount = await prisma.vpnAccount.create({
        data: {
          userId: order.userId,
          provider: vpnClient.provider,
          inboundId: vpnClient.inboundId,
          providerClientId: vpnClient.providerClientId,
          clientEmail: vpnClient.clientEmail,
          clientUuid: vpnClient.clientUuid,
          subId: vpnClient.subId,
          subscriptionUrl: vpnClient.subscriptionUrl,
          status: VpnAccountStatus.ACTIVE,
          rawProviderJson: vpnClient.raw as object,
        },
      });

      await prisma.subscription.create({
        data: {
          userId: order.userId,
          planId: order.planId,
          status: SubscriptionStatus.ACTIVE,
          startedAt,
          expiresAt,
          trafficLimitBytes: gigabytesToBytes(order.plan.trafficLimitGb),
          vpnAccountId: vpnAccount.id,
        },
      });
    } else {
      const nextExpiryBase = isSameOrBefore(activeSubscription.expiresAt, new Date())
        ? new Date()
        : activeSubscription.expiresAt;
      const nextExpiry = addDays(nextExpiryBase, order.plan.durationDays);
      const accumulatedTrafficLimit =
        activeSubscription.trafficLimitBytes + gigabytesToBytes(order.plan.trafficLimitGb);

      await this.vpnProvider.updateClientExpiryAndTraffic(
        activeSubscription.vpnAccount.providerClientId,
        activeSubscription.vpnAccount.inboundId,
        nextExpiry,
        Number(accumulatedTrafficLimit / 1024n / 1024n / 1024n),
      );

      await prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: {
          expiresAt: nextExpiry,
          trafficLimitBytes: accumulatedTrafficLimit,
          status: SubscriptionStatus.ACTIVE,
        },
      });
    }

    await this.orderService.markFulfilled(orderId);
    await this.notificationService.log(order.userId, NotificationType.ACCESS_ISSUED, { orderId });

    return this.getAccessPackage(order.userId);
  }

  async getAccessPackage(userId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        vpnAccount: true,
        plan: true,
      },
      orderBy: {
        expiresAt: "desc",
      },
    });

    if (!subscription?.vpnAccount) {
      return null;
    }

    const subscriptionUrl = subscription.vpnAccount.subscriptionUrl;
    const qrCodeBuffer = subscriptionUrl ? await this.qrService.toBuffer(subscriptionUrl) : null;

    return {
      subscriptionId: subscription.id,
      planName: subscription.plan.name,
      expiresAt: subscription.expiresAt,
      trafficLimitBytes: subscription.trafficLimitBytes,
      trafficUsedBytes: subscription.trafficUsedBytesCache,
      subscriptionUrl,
      qrCodeBuffer,
      instructions: [
        "1. Установите Hiddify из App Store или TestFlight.",
        "2. Нажмите плюс в приложении.",
        "3. Откройте subscription link или отсканируйте QR-код.",
      ],
    };
  }

  async syncUsage() {
    const subscriptions = await prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      include: { vpnAccount: true },
    });

    for (const subscription of subscriptions) {
      if (!subscription.vpnAccount) {
        continue;
      }

      try {
        const usage = await this.vpnProvider.getUsage(
          subscription.vpnAccount.providerClientId,
          subscription.vpnAccount.clientEmail,
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            trafficUsedBytesCache: usage.usedBytes,
            lastTrafficSyncAt: new Date(),
          },
        });
      } catch (error) {
        logger.error({ err: error, subscriptionId: subscription.id }, "Failed to sync usage");
      }
    }
  }

  async expireDueSubscriptions() {
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      include: { vpnAccount: true },
    });

    for (const subscription of expiredSubscriptions) {
      try {
        if (subscription.vpnAccount) {
          await this.vpnProvider.disableClient(
            subscription.vpnAccount.providerClientId,
            subscription.vpnAccount.inboundId,
          );

          await prisma.vpnAccount.update({
            where: { id: subscription.vpnAccount.id },
            data: {
              status: VpnAccountStatus.DISABLED,
              lastSyncAt: new Date(),
            },
          });
        }

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.EXPIRED },
        });
      } catch (error) {
        logger.error({ err: error, subscriptionId: subscription.id }, "Failed to expire subscription");
      }
    }
  }

  async getUsersForReminder(daysBeforeExpiry: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = addDays(start, daysBeforeExpiry + 1);
    const from = addDays(start, daysBeforeExpiry);

    return prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiresAt: {
          gte: from,
          lt: end,
        },
      },
      include: {
        user: true,
        plan: true,
      },
    });
  }
}
