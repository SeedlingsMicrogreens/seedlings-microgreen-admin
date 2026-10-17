import { postAdminApi } from "@/lib/adminApiClient";
import { normalizeIndianMobileNumber } from "@/lib/deliveryIdentity";
import type { DeliveryUser, DeliveryUserStatus } from "@/types/delivery";

export type DeliveryUserFormData = Pick<DeliveryUser, "name" | "email" | "vehicleType" | "vehicleNumber"> & {
  mobileNumber: string;
};

export async function saveDeliveryUser(data: DeliveryUserFormData, deliveryUserId?: string) {
  return postAdminApi<{ id: string; authUid: string; mobileNumber: string }>("/api/admin/delivery-users", {
    operation: "save",
    deliveryUserId,
    ...data,
    mobileNumber: normalizeIndianMobileNumber(data.mobileNumber),
  });
}

export async function updateDeliveryUserStatus(deliveryUserId: string, status: DeliveryUserStatus) {
  return postAdminApi<{ success: true }>("/api/admin/delivery-users", {
    operation: "status",
    deliveryUserId,
    status,
  });
}
