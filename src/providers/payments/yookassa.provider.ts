import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from "./payment-provider";

export class YooKassaPaymentProvider implements PaymentProvider {
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY || !env.YOOKASSA_RETURN_URL) {
      throw new AppError("YooKassa credentials are not configured", 500);
    }

    const response = await axios.post(
      "https://api.yookassa.ru/v3/payments",
      {
        amount: {
          value: input.amountRub.toFixed(2),
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: env.YOOKASSA_RETURN_URL,
        },
        description: input.description,
        metadata: {
          orderId: input.orderId,
        },
      },
      {
        auth: {
          username: env.YOOKASSA_SHOP_ID,
          password: env.YOOKASSA_SECRET_KEY,
        },
        headers: {
          "Idempotence-Key": input.idempotencyKey,
        },
      },
    );

    return {
      provider: "YOOKASSA",
      providerPaymentId: response.data.id,
      confirmationUrl: response.data.confirmation?.confirmation_url,
      status: response.data.status === "waiting_for_capture" ? "WAITING_FOR_CAPTURE" : "PENDING",
      raw: response.data,
    };
  }

  parseWebhook(payload: unknown): {
    providerPaymentId: string;
    status: "SUCCEEDED" | "CANCELED" | "PENDING";
    amountRub: number;
    raw: unknown;
  } {
    const event = payload as Record<string, any>;
    const object = event.object ?? {};
    const status = object.status as string;

    return {
      providerPaymentId: object.id ?? crypto.randomUUID(),
      status:
        status === "succeeded" ? "SUCCEEDED" : status === "canceled" ? "CANCELED" : "PENDING",
      amountRub: Number(object.amount?.value ?? 0),
      raw: payload,
    };
  }
}
