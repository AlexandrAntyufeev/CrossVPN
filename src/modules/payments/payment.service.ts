import {
  OrderStatus,
  PaymentProvider as PaymentProviderEnum,
  PaymentStatus,
} from "@prisma/client";
import { prisma } from "../../infra/db/prisma";
import { logger } from "../../infra/logger";
import { PaymentProvider } from "../../providers/payments/payment-provider";
import { OrderService } from "../orders/order.service";

export class PaymentService {
  constructor(
    private readonly paymentProvider: PaymentProvider,
    private readonly orderService: OrderService,
  ) {}

  async createCheckout(orderId: string, amountRub: number, description: string, idempotencyKey: string) {
    const result = await this.paymentProvider.createPayment({
      orderId,
      amountRub,
      description,
      idempotencyKey,
    });

    await prisma.payment.upsert({
      where: { providerPaymentId: result.providerPaymentId },
      update: {
        status:
          result.status === "WAITING_FOR_CAPTURE" ? PaymentStatus.WAITING_FOR_CAPTURE : PaymentStatus.PENDING,
        rawPayloadJson: result.raw as object,
      },
      create: {
        orderId,
        provider: PaymentProviderEnum.YOOKASSA,
        providerPaymentId: result.providerPaymentId,
        amountRub,
        currency: "RUB",
        status:
          result.status === "WAITING_FOR_CAPTURE" ? PaymentStatus.WAITING_FOR_CAPTURE : PaymentStatus.PENDING,
        rawPayloadJson: result.raw as object,
      },
    });

    return result;
  }

  async handleWebhook(payload: unknown): Promise<{ orderId: string | null; status: string }> {
    const event = this.paymentProvider.parseWebhook(payload);
    const metadataOrderId = (payload as any)?.object?.metadata?.orderId as string | undefined;

    const payment = await prisma.payment.findUnique({
      where: { providerPaymentId: event.providerPaymentId },
      include: { order: true },
    });

    const orderId = payment?.orderId ?? metadataOrderId ?? null;

    if (!orderId) {
      logger.warn({ payload }, "Payment webhook without resolvable orderId");
      return { orderId: null, status: event.status };
    }

    await prisma.payment.upsert({
      where: { providerPaymentId: event.providerPaymentId },
      update: {
        status: this.mapStatus(event.status),
        rawPayloadJson: event.raw as object,
      },
      create: {
        orderId,
        provider: PaymentProviderEnum.YOOKASSA,
        providerPaymentId: event.providerPaymentId,
        amountRub: event.amountRub,
        currency: "RUB",
        status: this.mapStatus(event.status),
        rawPayloadJson: event.raw as object,
      },
    });

    if (event.status === "SUCCEEDED") {
      const order = await this.orderService.getById(orderId);

      if (order.status === OrderStatus.PENDING) {
        await this.orderService.markPaid(orderId);
      }
    }

    return { orderId, status: event.status };
  }

  async markOrderPaidManually(orderId: string) {
    const order = await this.orderService.getById(orderId);

    await prisma.payment.upsert({
      where: { orderId },
      update: {
        provider: PaymentProviderEnum.MANUAL,
        providerPaymentId: `manual:${orderId}`,
        amountRub: order.amountRub,
        currency: "RUB",
        status: PaymentStatus.SUCCEEDED,
        rawPayloadJson: {
          source: "admin_manual_confirm",
          orderId,
          confirmedAt: new Date().toISOString(),
        },
      },
      create: {
        orderId,
        provider: PaymentProviderEnum.MANUAL,
        providerPaymentId: `manual:${orderId}`,
        amountRub: order.amountRub,
        currency: "RUB",
        status: PaymentStatus.SUCCEEDED,
        rawPayloadJson: {
          source: "admin_manual_confirm",
          orderId,
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    if (order.status === OrderStatus.PENDING) {
      await this.orderService.markPaid(orderId);
    }

    return this.orderService.getById(orderId);
  }

  private mapStatus(status: string): PaymentStatus {
    switch (status) {
      case "SUCCEEDED":
        return PaymentStatus.SUCCEEDED;
      case "CANCELED":
        return PaymentStatus.CANCELED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
