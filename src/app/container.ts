import { AdminService } from "../modules/admin/admin.service";
import { QrService } from "../infra/qr/qr.service";
import { NotificationService } from "../modules/notifications/notification.service";
import { OrderService } from "../modules/orders/order.service";
import { PaymentService } from "../modules/payments/payment.service";
import { PlanService } from "../modules/plans/plan.service";
import { SubscriptionService } from "../modules/subscriptions/subscription.service";
import { UserService } from "../modules/users/user.service";
import { YooKassaPaymentProvider } from "../providers/payments/yookassa.provider";
import { ThreeXUiVpnProvider } from "../providers/vpn/three-x-ui.provider";

export function createContainer() {
  const planService = new PlanService();
  const userService = new UserService();
  const orderService = new OrderService();
  const notificationService = new NotificationService();
  const qrService = new QrService();
  const vpnProvider = new ThreeXUiVpnProvider();
  const paymentProvider = new YooKassaPaymentProvider();
  const paymentService = new PaymentService(paymentProvider, orderService);
  const adminService = new AdminService();
  const subscriptionService = new SubscriptionService(
    vpnProvider,
    orderService,
    notificationService,
    qrService,
  );

  return {
    planService,
    userService,
    orderService,
    paymentService,
    adminService,
    subscriptionService,
    notificationService,
    qrService,
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
