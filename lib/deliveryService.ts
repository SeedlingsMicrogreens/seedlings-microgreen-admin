import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import type { DeliveryUser, DeliveryAssignment } from "@/types/delivery";
import type { Order, OrderStatus } from "@/types/order";

export async function assignOrderToDelivery(
  order: Order,
  deliveryUser: DeliveryUser,
  adminUid: string,
  adminEmail?: string
) {
  if (deliveryUser.status !== "active") {
    throw new Error("Only active delivery users can receive assignments.");
  }
  if (["delivered", "cancelled"].includes(order.status)) {
    throw new Error("Delivered or cancelled orders cannot be handed over for delivery.");
  }

  const orderRef = doc(db, "orders", order.id);
  const assignmentRef = doc(collection(db, "deliveryAssignments"));

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("Order no longer exists.");

    const current = snapshot.data() as Order;
    if (["delivered", "cancelled"].includes(current.status)) {
      throw new Error("Order status changed. Refresh and retry.");
    }

    const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
    const nextStatus: OrderStatus = "out_for_delivery";

    transaction.update(orderRef, {
      status: nextStatus,
      deliveryUserId: deliveryUser.id,
      deliveryUserAuthUid: deliveryUser.authUid,
      deliveryUserName: deliveryUser.name,
      statusHistory: [
        ...history,
        {
          status: nextStatus,
          changedByUid: adminUid,
          changedByEmail: adminEmail ?? "",
          note: `Assigned to ${deliveryUser.name}`,
          changedAt: new Date()
        }
      ],
      updatedAt: serverTimestamp()
    });

    transaction.set(assignmentRef, {
      orderId: order.id,
      orderNumber: order.orderNumber ?? order.id,
      deliveryUserId: deliveryUser.id,
      deliveryUserAuthUid: deliveryUser.authUid,
      deliveryUserName: deliveryUser.name,
      deliveryUserMobile: deliveryUser.mobileNumber,
      status: "out_for_delivery",
      assignedByUid: adminUid,
      assignedByEmail: adminEmail ?? "",
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await auditEvent("create", "deliveryAssignments", assignmentRef.id, `Assigned ${order.orderNumber || order.id} to ${deliveryUser.name}`);
}

export async function updateDeliveryAssignmentStatus(
  assignmentId: string,
  status: DeliveryAssignment["status"],
  adminUid: string,
  adminEmail?: string
) {
  const assignmentRef = doc(db, "deliveryAssignments", assignmentId);

  const orderStatusByDeliveryStatus: Record<DeliveryAssignment["status"], OrderStatus> = {
    assigned: "handed_to_delivery",
    accepted: "handed_to_delivery",
    picked_up: "handed_to_delivery",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    failed: "handed_to_delivery",
    cancelled: "cancelled"
  };

  await runTransaction(db, async (transaction) => {
    const assignmentSnap = await transaction.get(assignmentRef);
    if (!assignmentSnap.exists()) throw new Error("Delivery assignment not found.");

    const assignment = assignmentSnap.data() as DeliveryAssignment;
    const orderRef = doc(db, "orders", assignment.orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Assigned order no longer exists.");

    const order = orderSnap.data() as Order;
    const nextOrderStatus = orderStatusByDeliveryStatus[status];
    const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];

    transaction.update(assignmentRef, {
      status,
      lastUpdatedByUid: adminUid,
      lastUpdatedByEmail: adminEmail ?? "",
      updatedAt: serverTimestamp()
    });

    if (order.status !== nextOrderStatus) {
      transaction.update(orderRef, {
        status: nextOrderStatus,
        statusHistory: [
          ...history,
          {
            status: nextOrderStatus,
            changedByUid: adminUid,
            changedByEmail: adminEmail ?? "",
            note: `Delivery status updated to ${status.replaceAll("_", " ")}`,
            changedAt: new Date()
          }
        ],
        updatedAt: serverTimestamp()
      });
    }
  });
  await auditEvent("update", "deliveryAssignments", assignmentId, `Delivery assignment status changed to ${status}`);
}
