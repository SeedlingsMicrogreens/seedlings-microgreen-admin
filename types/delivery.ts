export type DeliveryUserStatus = "active" | "inactive";

export type DeliveryUser = {
  id: string;
  authUid: string;
  name: string;
  mobileNumber: string;
  email?: string;
  status: DeliveryUserStatus;
  vehicleType?: string;
  vehicleNumber?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type DeliveryAssignmentStatus = "assigned" | "accepted" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled";

export type DeliveryAssignment = {
  id: string;
  orderId: string;
  orderNumber?: string;
  deliveryUserId: string;
  deliveryUserAuthUid: string;
  deliveryUserName: string;
  deliveryUserMobile?: string;
  status: DeliveryAssignmentStatus;
  assignedByUid: string;
  assignedByEmail?: string;
  assignedAt?: unknown;
  updatedAt?: unknown;
};
