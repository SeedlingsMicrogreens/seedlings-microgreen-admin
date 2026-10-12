import {
  collection,
  deleteField,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent, deleteRecord } from "./firestore";
import { assertNoOfferDateOverlap, validateOfferDateRange } from "./offerDateValidation";
import { validateSubscriptionOffer } from "./subscriptionOffer";
import type { Offer, OfferType } from "@/types/offer";

export async function createOffer(input: Omit<Offer, "id" | "createdAt" | "updatedAt">) {
  validateOffer(input);
  const data: Omit<Offer, "id" | "createdAt" | "updatedAt"> = { ...input };
  if (input.type === "subscription") {
    data.subscriptionOffer = validateSubscriptionOffer(input.subscriptionOffer);
  } else {
    delete data.subscriptionOffer;
  }
  const range = validateOfferDateRange(input.startDate, input.endDate);
  const offerRef = doc(collection(db, "offers"));

  await runTransaction(db, async transaction => {
    const lockRef = offerTypeLockRef(input.type);
    const lockSnapshot = await transaction.get(lockRef);
    const existingOffers = await getDocs(collection(db, "offers"));
    const records = existingOffers.docs.map(snapshot => ({
      id: snapshot.id,
      ...(snapshot.data() as Omit<Offer, "id">),
    })) as Offer[];
    assertNoOfferDateOverlap({ ...data, ...range }, records);

    transaction.set(lockRef, {
      revision: Number(lockSnapshot.data()?.revision ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
    transaction.set(offerRef, {
      ...data,
      ...range,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("create", "offers", offerRef.id, `Created offer ${input.name}`);
  return offerRef;
}

export async function updateOffer(id: string, input: Partial<Offer>) {
  validateOffer(input, true);
  const offerRef = doc(db, "offers", id);
  let offerName = input.name?.trim() || "offer";

  await runTransaction(db, async transaction => {
    const offerSnapshot = await transaction.get(offerRef);
    if (!offerSnapshot.exists()) throw new Error("Offer no longer exists.");
    const existing = {
      id: offerSnapshot.id,
      ...(offerSnapshot.data() as Omit<Offer, "id">),
    } as Offer;
    const updated = { ...existing, ...input };
    offerName = updated.name;
    validateOffer(updated);
    const range = validateOfferDateRange(updated.startDate, updated.endDate);

    const lockTypes = [...new Set([existing.type, updated.type])].sort();
    const lockRefs = lockTypes.map(offerTypeLockRef);
    const lockSnapshots = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
    const existingOffers = await getDocs(collection(db, "offers"));
    const records = existingOffers.docs.map(snapshot => ({
      id: snapshot.id,
      ...(snapshot.data() as Omit<Offer, "id">),
    })) as Offer[];
    assertNoOfferDateOverlap({ ...updated, ...range }, records);

    lockRefs.forEach((lockRef, index) => {
      transaction.set(lockRef, {
        revision: Number(lockSnapshots[index].data()?.revision ?? 0) + 1,
        updatedAt: serverTimestamp(),
      });
    });
    const updateData: Record<string, unknown> = {
      ...input,
      ...range,
      updatedAt: serverTimestamp(),
    };
    if (updated.type === "subscription") {
      updateData.subscriptionOffer = validateSubscriptionOffer(updated.subscriptionOffer);
    } else {
      updateData.subscriptionOffer = deleteField();
    }
    transaction.update(offerRef, updateData);
  });

  await auditEvent("update", "offers", id, `Updated offer ${offerName}`);
}

export async function deleteOffer(id: string) {
  return deleteRecord("offers", id);
}

function offerTypeLockRef(type: OfferType): DocumentReference {
  return doc(db, "offerTypeLocks", type);
}

function validateOffer(input: Partial<Offer>, partial = false) {
  if (!partial || input.name !== undefined) {
    if (!input.name?.trim()) throw new Error("Offer name is required.");
  }

  if (!partial || input.locationType !== undefined) {
    if (input.locationType !== "all" && input.locationType !== "pincode") {
      throw new Error("Offer location is required.");
    }
  }

  if (!partial || input.startDate !== undefined || input.endDate !== undefined) {
    if (!input.startDate || !input.endDate) throw new Error("Offer start date and end date are required.");
    validateOfferDateRange(input.startDate, input.endDate);
  }

  if (!partial || input.type !== undefined) {
    if (input.type !== "price" && input.type !== "deliveryCharge" && input.type !== "quantity" && input.type !== "subscription") {
      throw new Error("Offer type is required.");
    }
  }

  if (input.type === "subscription" && (!partial || input.subscriptionOffer !== undefined)) {
    validateSubscriptionOffer(input.subscriptionOffer);
  }

  if (input.type === "price" || input.type === "deliveryCharge") {
    if (input.discountType !== "percentage" && input.discountType !== "flat") {
      throw new Error("Discount type is required.");
    }
    const value = Number(input.discountValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Discount value must be 0 or more.");
    }
    if (input.discountType === "percentage" && value > 100) {
      throw new Error("Percentage discount cannot exceed 100%.");
    }
  }

  if (input.type === "quantity" && input.quantityRule) {
    const rule = input.quantityRule;
    if (!rule.buyProductId || !rule.buyPackaging || !rule.getProductId || !rule.getPackaging) {
      throw new Error("Buy Product, Buy Packaging, Get Product and Get Packaging are required.");
    }
    if (Number(rule.buyPackaging) <= 0 || Number(rule.getPackaging) <= 0) {
      throw new Error("Packaging must be greater than 0.");
    }
  }
}
