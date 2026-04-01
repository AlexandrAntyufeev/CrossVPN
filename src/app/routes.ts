import { AppContainer } from "./container";

export async function registerRoutes(app: any, container: AppContainer) {
  app.post("/webhooks/yookassa", async (request: any, reply: any) => {
    const result = await container.paymentService.handleWebhook(request.body);

    if (result.orderId && result.status === "SUCCEEDED") {
      await container.subscriptionService.fulfillOrder(result.orderId);
    }

    return reply.send({ ok: true });
  });
}
