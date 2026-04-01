export type CreatePaymentInput = {
  orderId: string;
  amountRub: number;
  description: string;
  idempotencyKey: string;
};

export type CreatePaymentResult = {
  provider: "YOOKASSA" | "MANUAL";
  providerPaymentId: string;
  confirmationUrl?: string;
  status: "PENDING" | "WAITING_FOR_CAPTURE";
  raw: unknown;
};

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  parseWebhook(payload: unknown): {
    providerPaymentId: string;
    status: "SUCCEEDED" | "CANCELED" | "PENDING";
    amountRub: number;
    raw: unknown;
  };
}
