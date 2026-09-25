import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import { createSubscriptionDeliveryAtHandoverInTransaction, updateSubscriptionDeliveryStatusInTransaction } from "./subscriptionDeliveryService";
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
  const fulfilmentSnapshot = await getDocs(query(collection(db, "fulfilments"), where("orderId", "==", order.id)));

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("Order no longer exists.");

    const current = { id: snapshot.id, ...(snapshot.data() as Omit<Order, "id">) } as Order;
    if (current.status !== "packed") {
      throw new Error(`Order ${current.orderNumber || current.id} is no longer packed and cannot be handed over.`);
    }

    const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
    const nextStatus: OrderStatus = "out_for_delivery";

    // Read/create the subscription delivery before any other transaction writes.
    await createSubscriptionDeliveryAtHandoverInTransaction(transaction, order, adminUid, adminEmail);

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

    for (const fulfilmentDoc of fulfilmentSnapshot.docs) {
      transaction.update(fulfilmentDoc.ref, {
        status: "out_for_delivery",
        updatedAt: serverTimestamp(),
        deliveryUserId: deliveryUser.id,
        deliveryUserName: deliveryUser.name,
      });
    }

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

  const assignmentSnapshot = await getDoc(assignmentRef);
  if (!assignmentSnapshot.exists()) throw new Error("Delivery assignment not found.");
  const assignmentData = assignmentSnapshot.data() as DeliveryAssignment;
  const fulfilmentSnapshot = await getDocs(query(collection(db, "fulfilments"), where("orderId", "==", assignmentData.orderId)));

  const orderStatusByDeliveryStatus: Record<DeliveryAssignment["status"], OrderStatus> = {
    assigned: "out_for_delivery",
    accepted: "out_for_delivery",
    picked_up: "out_for_delivery",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    failed: "out_for_delivery",
    cancelled: "cancelled"
  };

  let subscriptionDeliveryStatus: import("@/types/subscriptionDelivery").SubscriptionDeliveryStatus = "out_for_delivery";

  const subscriptionStatusByDeliveryStatus: Record<DeliveryAssignment["status"], import("@/types/subscriptionDelivery").SubscriptionDeliveryStatus> = {
    assigned: "out_for_delivery",
    accepted: "out_for_delivery",
    picked_up: "out_for_delivery",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    failed: "failed",
    cancelled: "cancelled",
  };
  subscriptionDeliveryStatus = subscriptionStatusByDeliveryStatus[status];

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

    // Update the subscription delivery before transaction writes, keeping all reads
    // at the beginning of the Firestore transaction.
    await updateSubscriptionDeliveryStatusInTransaction(
      transaction,
      { id: assignment.orderId, ...(orderSnap.data() as Omit<Order, "id">) } as Order,
      subscriptionDeliveryStatus,
      adminUid,
      adminEmail,
    );

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

    if (status === "out_for_delivery" || status === "delivered") {
      for (const fulfilmentDoc of fulfilmentSnapshot.docs) {
        transaction.update(fulfilmentDoc.ref, {
          status,
          updatedAt: serverTimestamp(),
        });
      }
    }

  });
  await auditEvent("update", "deliveryAssignments", assignmentId, `Delivery assignment status changed to ${status}`);
}
