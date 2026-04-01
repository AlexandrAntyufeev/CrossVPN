import { Plan } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../infra/db/prisma";

export class PlanService {
  async ensureDefaultPlan(): Promise<Plan> {
    return prisma.plan.upsert({
      where: { code: env.DEFAULT_PLAN_CODE },
      update: {
        name: env.DEFAULT_PLAN_NAME,
        priceRub: env.DEFAULT_PLAN_PRICE_RUB,
        durationDays: env.DEFAULT_PLAN_DURATION_DAYS,
        trafficLimitGb: env.DEFAULT_PLAN_TRAFFIC_LIMIT_GB,
        isActive: true,
      },
      create: {
        code: env.DEFAULT_PLAN_CODE,
        name: env.DEFAULT_PLAN_NAME,
        priceRub: env.DEFAULT_PLAN_PRICE_RUB,
        durationDays: env.DEFAULT_PLAN_DURATION_DAYS,
        trafficLimitGb: env.DEFAULT_PLAN_TRAFFIC_LIMIT_GB,
      },
    });
  }

  async getDefaultPlan(): Promise<Plan> {
    return prisma.plan.findUniqueOrThrow({
      where: { code: env.DEFAULT_PLAN_CODE },
    });
  }
}
