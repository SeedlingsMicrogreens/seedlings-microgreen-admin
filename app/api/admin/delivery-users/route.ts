import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { normalizeIndianMobileNumber, tryNormalizeIndianMobileNumber } from "@/lib/deliveryIdentity";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { AdminApiError, apiErrorResponse, requireAdmin } from "@/lib/server/adminAuthorization";
import type { DeliveryUserStatus } from "@/types/delivery";

export const runtime = "nodejs";

type SaveDeliveryUserRequest = {
  operation?: unknown;
  deliveryUserId?: unknown;
  name?: unknown;
  mobileNumber?: unknown;
  email?: unknown;
  vehicleType?: unknown;
  vehicleNumber?: unknown;
  status?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function authErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

async function getAuthUser(uid: string) {
  try {
    return await adminAuth.getUser(uid);
  } catch (error) {
    if (authErrorCode(error) === "auth/user-not-found") return undefined;
    throw error;
  }
}

async function createPhoneUidAuthUser(phoneNumber: string, name: string) {
  try {
    return await adminAuth.createUser({ uid: phoneNumber, phoneNumber, displayName: name });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "auth/uid-already-exists" || code === "auth/phone-number-already-exists") {
      throw new AdminApiError("This mobile number is already linked to a Firebase Authentication account. It was not reused.", 409);
    }
    throw error;
  }
}

function phoneIndexId(phoneNumber: string) {
  return phoneNumber.replace(/\D/g, "");
}

async function saveUser(body: SaveDeliveryUserRequest, actorUid: string, actorEmail: string) {
  const deliveryUserId = text(body.deliveryUserId);
  const name = text(body.name);
  const mobileNumber = normalizeIndianMobileNumber(text(body.mobileNumber));
  const email = text(body.email);
  const vehicleType = text(body.vehicleType);
  const vehicleNumber = text(body.vehicleNumber);
  if (!name) throw new AdminApiError("Name is required.", 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminApiError("Enter a valid email address.", 400);

  const usersCollection = adminDb.collection("deliveryUsers");
  const userRef = deliveryUserId ? usersCollection.doc(deliveryUserId) : usersCollection.doc();
  const phoneIndexCollection = adminDb.collection("deliveryUserPhoneIndex");
  const phoneIndexRef = phoneIndexCollection.doc(phoneIndexId(mobileNumber));
  const existingSnapshot = deliveryUserId ? await userRef.get() : undefined;
  if (deliveryUserId && !existingSnapshot?.exists) throw new AdminApiError("Delivery user no longer exists.", 404);

  const oldRecord = existingSnapshot?.data();
  if (deliveryUserId && text(oldRecord?.authUid) !== mobileNumber) {
    throw new AdminApiError("This existing Firebase Auth UID cannot be changed. The legacy account was left untouched; changing its mobile number requires a separate account migration.", 409);
  }
  if (deliveryUserId && tryNormalizeIndianMobileNumber(oldRecord?.normalizedMobileNumber ?? oldRecord?.mobileNumber) !== mobileNumber) {
    throw new AdminApiError("A delivery user's mobile number cannot be changed because Firebase Auth UIDs are immutable. The existing account was left untouched.", 409);
  }

  const phoneOwner = await phoneIndexRef.get();
  if (phoneOwner.exists && phoneOwner.get("deliveryUserId") !== (deliveryUserId || userRef.id)) {
    throw new AdminApiError("A delivery user already exists for this mobile number.", 409);
  }
  const legacyUsers = await usersCollection.get();
  const duplicateLegacyRecord = legacyUsers.docs.find(snapshot => {
    if (snapshot.id === userRef.id) return false;
    const existing = snapshot.data();
    return tryNormalizeIndianMobileNumber(existing.normalizedMobileNumber ?? existing.mobileNumber) === mobileNumber;
  });
  if (duplicateLegacyRecord) throw new AdminApiError("A delivery user already exists for this mobile number.", 409);

  let authUid: string;
  let createdAuthUser = false;
  if (deliveryUserId) {
    authUid = mobileNumber;
    const authUser = await getAuthUser(authUid);
    if (!authUser) {
      throw new AdminApiError("The linked Firebase Auth account no longer exists. Restore that account before editing this delivery user.", 409);
    }
    if (authUser.phoneNumber !== mobileNumber) {
      throw new AdminApiError("The Firebase Auth account does not match this delivery user's mobile number. The account was left untouched.", 409);
    }
  } else {
    const authUser = await getAuthUser(mobileNumber);
    if (authUser) {
      throw new AdminApiError("This mobile number is already linked to a Firebase Authentication account. It was not reused.", 409);
    }
    const phoneAccount = await adminAuth.getUserByPhoneNumber(mobileNumber).catch(error => {
      if (authErrorCode(error) === "auth/user-not-found") return undefined;
      throw error;
    });
    if (phoneAccount) {
      throw new AdminApiError("This mobile number is already linked to another Firebase Authentication account. It was not reused.", 409);
    }
    authUid = (await createPhoneUidAuthUser(mobileNumber, name)).uid;
    createdAuthUser = true;
  }

  const auditRef = adminDb.collection("auditEvents").doc();

  try {
    await adminDb.runTransaction(async transaction => {
      const reads = [
        transaction.get(phoneIndexRef),
        transaction.get(usersCollection),
        deliveryUserId ? transaction.get(userRef) : Promise.resolve(undefined),
      ] as const;
      const [indexSnapshot, usersSnapshot, currentSnapshot] = await Promise.all(reads);
      if (deliveryUserId) {
        if (!currentSnapshot?.exists) throw new AdminApiError("Delivery user no longer exists.", 404);
        if (text(currentSnapshot.get("authUid")) !== authUid) {
          throw new AdminApiError("The delivery user's linked account changed. Refresh and try again.", 409);
        }
        if (tryNormalizeIndianMobileNumber(currentSnapshot.get("normalizedMobileNumber") ?? currentSnapshot.get("mobileNumber")) !== mobileNumber) {
          throw new AdminApiError("The delivery user's mobile number changed. Refresh and try again.", 409);
        }
      }
      if (indexSnapshot.exists && indexSnapshot.get("deliveryUserId") !== userRef.id) {
        throw new AdminApiError("A delivery user already exists for this mobile number.", 409);
      }
      const duplicate = usersSnapshot.docs.find(snapshot => {
        if (snapshot.id === userRef.id) return false;
        const record = snapshot.data();
        return tryNormalizeIndianMobileNumber(record.normalizedMobileNumber ?? record.mobileNumber) === mobileNumber;
      });
      if (duplicate) throw new AdminApiError("A delivery user already exists for this mobile number.", 409);

      const status: DeliveryUserStatus = currentSnapshot?.get("status") === "inactive" ? "inactive" : "active";
      const updatedAt = FieldValue.serverTimestamp();
      const userData = {
        authUid,
        name,
        mobileNumber,
        normalizedMobileNumber: mobileNumber,
        email,
        vehicleType,
        vehicleNumber,
        status,
        updatedAt,
      };
      if (currentSnapshot) {
        transaction.update(userRef, userData);
      } else {
        transaction.set(userRef, { ...userData, createdAt: updatedAt });
      }
      transaction.set(phoneIndexRef, { deliveryUserId: userRef.id, normalizedMobileNumber: mobileNumber, updatedAt });
      transaction.set(auditRef, {
        action: deliveryUserId ? "update" : "create",
        entityType: "deliveryUsers",
        entityId: userRef.id,
        summary: `${deliveryUserId ? "Updated" : "Created"} delivery user ${name}`,
        actorUid,
        actorEmail,
        createdAt: updatedAt,
      });
    });
  } catch (error) {
    if (createdAuthUser) {
      try {
        const linkedUsers = await usersCollection.where("authUid", "==", authUid).limit(1).get();
        if (linkedUsers.empty) await adminAuth.deleteUser(authUid);
      } catch (cleanupError) {
        if (authErrorCode(cleanupError) !== "auth/user-not-found") {
          console.error("Unable to roll back unlinked delivery-user Auth account", cleanupError);
        }
      }
    }
    throw error;
  }
  return { id: userRef.id, authUid, mobileNumber };
}

async function updateStatus(body: SaveDeliveryUserRequest, actorUid: string, actorEmail: string) {
  const deliveryUserId = text(body.deliveryUserId);
  if (!deliveryUserId || (body.status !== "active" && body.status !== "inactive")) {
    throw new AdminApiError("A delivery user and valid status are required.", 400);
  }
  const userRef = adminDb.collection("deliveryUsers").doc(deliveryUserId);
  const auditRef = adminDb.collection("auditEvents").doc();
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) throw new AdminApiError("Delivery user no longer exists.", 404);
    transaction.update(userRef, { status: body.status, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(auditRef, {
      action: "update",
      entityType: "deliveryUsers",
      entityId: deliveryUserId,
      summary: `Changed delivery user status to ${body.status}`,
      actorUid,
      actorEmail,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { success: true as const };
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request);
    const body = await request.json() as SaveDeliveryUserRequest;
    const operation = text(body.operation);
    if (operation === "save") {
      const result = await saveUser(body, actor.uid, actor.email ?? "");
      return NextResponse.json(result);
    }
    if (operation === "status") {
      return NextResponse.json(await updateStatus(body, actor.uid, actor.email ?? ""));
    }
    throw new AdminApiError("Unsupported delivery-user operation.", 400);
  } catch (error) {
    return apiErrorResponse(error, "Delivery-user API failed");
  }
}
