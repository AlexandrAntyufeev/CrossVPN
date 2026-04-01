import dayjs from "dayjs";

export function addDays(date: Date, days: number): Date {
  return dayjs(date).add(days, "day").toDate();
}

export function isSameOrBefore(left: Date, right: Date): boolean {
  return dayjs(left).isSame(right) || dayjs(left).isBefore(right);
}
