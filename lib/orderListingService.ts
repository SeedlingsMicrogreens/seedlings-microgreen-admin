import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { DeliveryAssignment } from "@/types/delivery";
import type { Order } from "@/types/order";
import {
  ACTIVE_ORDER_STATUSES,
  deliveredDateBounds,
  isActiveOrder,
  orderTimestampToDate,
  type DeliveredOrder,
} from "./orderListing";

const ORDER_ID_QUERY_SIZE = 30;

export async function listActiveOrders(): Promise<Order[]> {
  const snapshot = await getDocs(query(
    collection(db, "orders"),
    where("status", "in", [...ACTIVE_ORDER_STATUSES]),
  ));

  return snapshot.docs
    .map(item => ({ id: item.id, ...(item.data() as Omit<Order, "id">) }))
    .filter(isActiveOrder)
    .sort((left, right) =>
      (orderTimestampToDate(right.createdAt)?.getTime() ?? 0)
      - (orderTimestampToDate(left.createdAt)?.getTime() ?? 0)
    );
}

export async function listDeliveredOrders(startDate: string, endDate: string): Promise<DeliveredOrder[]> {
  const { start, endExclusive } = deliveredDateBounds(startDate, endDate);
  const assignmentSnapshot = await getDocs(query(
    collection(db, "deliveryAssignments"),
    where("updatedAt", ">=", Timestamp.fromDate(start)),
    where("updatedAt", "<", Timestamp.fromDate(endExclusive)),
  ));

  const deliveredAtByOrderId = new Map<string, Date>();
  for (const item of assignmentSnapshot.docs) {
    const assignment = item.data() as DeliveryAssignment;
    if (assignment.status !== "delivered" || !assignment.orderId) continue;
    const deliveredAt = orderTimestampToDate(assignment.updatedAt);
    if (!deliveredAt) continue;

    const previous = deliveredAtByOrderId.get(assignment.orderId);
    if (!previous || deliveredAt > previous) deliveredAtByOrderId.set(assignment.orderId, deliveredAt);
  }

  const orderIds = [...deliveredAtByOrderId.keys()];
  const deliveredOrders: DeliveredOrder[] = [];
  for (let index = 0; index < orderIds.length; index += ORDER_ID_QUERY_SIZE) {
    const orderSnapshot = await getDocs(query(
      collection(db, "orders"),
      where(documentId(), "in", orderIds.slice(index, index + ORDER_ID_QUERY_SIZE)),
    ));
    for (const item of orderSnapshot.docs) {
      const order = { id: item.id, ...(item.data() as Omit<Order, "id">) } as Order;
      const deliveredAt = deliveredAtByOrderId.get(order.id);
      if (order.status === "delivered" && deliveredAt) deliveredOrders.push({ order, deliveredAt });
    }
  }

  return deliveredOrders.sort((left, right) => right.deliveredAt.getTime() - left.deliveredAt.getTime());
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const snapshot = await getDoc(doc(db, "orders", orderId));
  return snapshot.exists()
    ? { id: snapshot.id, ...(snapshot.data() as Omit<Order, "id">) } as Order
    : null;
}
