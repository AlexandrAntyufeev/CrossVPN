import { env } from "../../config/env";
import { Order, OrderStatus, PaymentProvider as PaymentProviderEnum } from "@prisma/client";
import { prisma } from "../../infra/db/prisma";
import { createIdempotencyKey } from "../../shared/utils/ids";

export class OrderService {
  async createPendingOrder(userId: string, planId: string, amountRub: number): Promise<Order> {
    return prisma.order.create({
      data: {
        userId,
        planId,
        amountRub,
        paymentProvider:
          env.PAYMENT_PROVIDER === "manual" ? PaymentProviderEnum.MANUAL : PaymentProviderEnum.YOOKASSA,
        idempotencyKey: createIdempotencyKey("order"),
        status: OrderStatus.PENDING,
      },
    });
  }

  async markPaid(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
      },
    });
  }

  async markFulfilled(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.FULFILLED,
        fulfilledAt: new Date(),
      },
    });
  }

  async markCancelled(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });
  }

  async getById(orderId: string) {
    return prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        user: true,
        plan: true,
        payment: true,
      },
    });
  }

  async findLatestPendingByUser(userId: string) {
    return prisma.order.findFirst({
      where: {
        userId,
        status: OrderStatus.PENDING,
      },
      include: {
        plan: true,
        payment: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findPendingById(orderId: string) {
    return prisma.order.findFirst({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      include: {
        user: true,
        plan: true,
        payment: true,
      },
    });
  }
}
