import assert from "node:assert/strict";
import test from "node:test";

import "./support/firebaseClientTestEnv";

import { addCalendarDays, calendarDayOfWeek, localCalendarDate, nextCalendarDateOnDay } from "../lib/calendarDate";
import { prepareSubscriptionDeliveryAtHandoverInTransaction } from "../lib/subscriptionDeliveryService";
import { addWeeks, calculateSubscriptionEndDate, createSubscriptionPayload, subscriptionDeliveryDates } from "../lib/subscriptionService";
import { SUBSCRIPTION_DELIVERY_DAY, nextDeliveryOnDay, nextScheduledDeliveryDate } from "../types/subscription";
import type { Order } from "../types/order";

const SATURDAY = SUBSCRIPTION_DELIVERY_DAY;
// IST is ahead of UTC (the zone that exposed the bug); the others cover behind-UTC and UTC itself.
const TIME_ZONES = ["Asia/Kolkata", "America/Los_Angeles", "UTC"];

function inEachTimeZone(run: (timeZone: string) => void) {
  const original = process.env.TZ;
  try {
    for (const timeZone of TIME_ZONES) {
      process.env.TZ = timeZone;
      run(timeZone);
    }
  } finally {
    process.env.TZ = original;
  }
}

test("weekly Saturday deliveries advance exactly seven days from the previous scheduled date", () => {
  inEachTimeZone(timeZone => {
    const second = addWeeks("2026-10-24", 1);
    const third = addWeeks(second, 1);
    assert.deepEqual([second, third], ["2026-10-31", "2026-11-07"], timeZone);
  });
});

test("Saturday sequences stay on Saturday across month and year boundaries", () => {
  inEachTimeZone(timeZone => {
    const dates = subscriptionDeliveryDates("2026-12-01", "quarterly", SATURDAY);
    assert.equal(dates.length, 12);
    assert.deepEqual(dates.slice(0, 6), ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26", "2027-01-02", "2027-01-09"], timeZone);
    assert.ok(dates.every(date => calendarDayOfWeek(date) === SATURDAY), timeZone);
    assert.equal(addCalendarDays("2028-02-26", 7), "2028-03-04", "leap-year February");
    assert.equal(addCalendarDays("2027-02-27", 7), "2027-03-06", "non-leap February");
  });
});

test("the first delivery is the next Saturday strictly after the start date", () => {
  inEachTimeZone(timeZone => {
    assert.equal(nextDeliveryOnDay(new Date("2026-10-20T00:00:00"), SATURDAY), "2026-10-24", timeZone);
    assert.equal(nextDeliveryOnDay(new Date("2026-10-23T23:59:00"), SATURDAY), "2026-10-24", timeZone);
    // A start on the delivery day itself moves to the following week, as before.
    assert.equal(nextDeliveryOnDay(new Date("2026-10-24T00:00:00"), SATURDAY), "2026-10-31", timeZone);
    assert.equal(nextCalendarDateOnDay("2026-12-27", SATURDAY), "2027-01-02", timeZone);
  });
});

test("fixed-length subscriptions keep their delivery count and end on the last Saturday", () => {
  inEachTimeZone(timeZone => {
    assert.deepEqual(subscriptionDeliveryDates("2026-10-20", "monthly", SATURDAY), ["2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14"], timeZone);
    assert.equal(calculateSubscriptionEndDate("2026-10-20", "yearly", SATURDAY), "2027-10-16", timeZone);
    assert.deepEqual(subscriptionDeliveryDates("2026-10-20", "weekly", SATURDAY), ["2026-10-24"], timeZone);
  });
});

test("local calendar date reads the date in the runtime zone, not UTC", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "Asia/Kolkata";
    // 02:00 IST on 24 October is still 23 October in UTC.
    assert.equal(localCalendarDate(new Date("2026-10-24T02:00:00")), "2026-10-24");
  } finally {
    process.env.TZ = original;
  }
});

test("invalid calendar dates are rejected instead of silently rolling over", () => {
  assert.throws(() => addCalendarDays("2026-02-30", 7), /Invalid calendar date/);
  assert.throws(() => addCalendarDays("24/10/2026", 7), /Invalid calendar date/);
});

test("handover persists this delivery's date and the next Saturday on the subscription", async () => {
  const subscription = {
    customerId: "customer-1",
    customerName: "Customer",
    productId: "product-1",
    frequency: "monthly",
    totalDeliveries: 4,
    deliveriesGenerated: 1,
    deliveryDay: SATURDAY,
    nextDeliveryDate: "2026-10-31",
  };
  const transaction = {
    get: async (ref: { path: string }) => ({
      id: ref.path.split("/").at(-1),
      exists: () => ref.path === "subscriptions/sub-1",
      data: () => subscription,
    }),
  };
  const order = {
    id: "order-2",
    orderNumber: "ORD-2",
    orderType: "subscription",
    sourceSubscriptionId: "sub-1",
    sourceSubscriptionDeliveryNumber: 2,
    scheduledDeliveryDate: "2026-10-31",
    items: [],
  } as unknown as Order;

  const original = process.env.TZ;
  try {
    process.env.TZ = "Asia/Kolkata";
    const plan = await prepareSubscriptionDeliveryAtHandoverInTransaction(transaction as never, order);
    assert.ok(plan);
    assert.equal(plan.deliveryData.deliveryDate, "2026-10-31");
    assert.equal(plan.subscriptionUpdate.lastDeliveryDate, "2026-10-31");
    assert.equal(plan.subscriptionUpdate.nextDeliveryDate, "2026-11-07");

    const finalPlan = await prepareSubscriptionDeliveryAtHandoverInTransaction(
      transaction as never,
      { ...order, id: "order-4", sourceSubscriptionDeliveryNumber: 4, scheduledDeliveryDate: "2026-11-14" } as Order,
    );
    assert.equal(finalPlan?.subscriptionUpdate.nextDeliveryDate, "", "no next date after the last delivery");

    const fridayPlan = await prepareSubscriptionDeliveryAtHandoverInTransaction(
      transaction as never,
      { ...order, id: "order-3", sourceSubscriptionDeliveryNumber: 3, scheduledDeliveryDate: "2026-11-06" } as Order,
    );
    assert.equal(fridayPlan?.deliveryData.deliveryDate, "2026-11-06", "a stored date is persisted as-is");
    assert.equal(fridayPlan?.subscriptionUpdate.nextDeliveryDate, "2026-11-07", "the next delivery is back on Saturday");
  } finally {
    process.env.TZ = original;
  }
});

test("the next scheduled delivery is the following Saturday", () => {
  inEachTimeZone(timeZone => {
    let date = "2026-10-24";
    const sequence = [date];
    for (let i = 0; i < 10; i += 1) sequence.push(date = nextScheduledDeliveryDate(date));
    assert.deepEqual(sequence.slice(0, 3), ["2026-10-24", "2026-10-31", "2026-11-07"], timeZone);
    assert.ok(sequence.every(d => calendarDayOfWeek(d) === SATURDAY), timeZone);
    assert.equal(nextScheduledDeliveryDate("2026-12-26"), "2027-01-02", timeZone);
    // A previously stored Friday is not moved, but the delivery after it returns to Saturday.
    assert.equal(nextScheduledDeliveryDate("2026-10-30"), "2026-10-31", timeZone);
    assert.equal(nextScheduledDeliveryDate("2026-11-05"), "2026-11-07", timeZone);
  });
});

test("new subscriptions always store Saturday and a Saturday first delivery", () => {
  const product = { id: "p", name: "Sunflower", sellingOptions: [{ id: "o", active: true, weightGrams: 100, price: 120 }] };
  inEachTimeZone(timeZone => {
    for (const startDate of ["2026-10-19", "2026-10-23", "2026-10-24", "2026-12-31"]) {
      const payload = createSubscriptionPayload({
        customer: { id: "c", name: "Customer" } as never,
        product: product as never,
        sellingOptionId: "o",
        quantity: 1,
        frequency: "monthly",
        startDate,
      });
      assert.equal(payload.deliveryDay, SATURDAY);
      assert.equal(calendarDayOfWeek(payload.nextDeliveryDate), SATURDAY, `${timeZone} ${startDate}`);
      assert.equal(calendarDayOfWeek(payload.endDate), SATURDAY, `${timeZone} ${startDate}`);
    }
  });
});
