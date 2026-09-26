import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { db, auth } from "./firebase";

/** Remove undefined values before sending data to Firestore.
 * Firestore rejects undefined object/array values; empty optional form fields
 * are intentionally omitted rather than written as undefined.
 */
export function sanitizeFirestoreData<T>(value: T): T {
  if (value === undefined) return undefined as T;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeFirestoreData(item))
      .filter(item => item !== undefined) as T;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const cleaned = sanitizeFirestoreData(item);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output as T;
}

async function writeAudit(action: string, entityType: string, entityId: string | undefined, summary: string) {
  try {
    const actor = auth.currentUser;
    if (!actor) return;
    await addDoc(collection(db, "auditEvents"), sanitizeFirestoreData({
      action, entityType, entityId: entityId || "", summary,
      actorUid: actor.uid, actorEmail: actor.email || "", createdAt: serverTimestamp()
    }));
  } catch {
    // Audit failure must never turn a successful business operation into a failure.
  }
}

export async function listCollection<T>(name: string, orderField = "updatedAt"): Promise<(T & { id: string })[]> {
  const snapshot = await getDocs(query(collection(db, name), orderBy(orderField, "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...(item.data() as T) }));
}

export async function listCollectionByField<T>(name: string, field: string, value: string): Promise<(T & { id: string })[]> {
  const snapshot = await getDocs(query(collection(db, name), where(field, "==", value), limit(100)));
  return snapshot.docs.map(item => ({ id: item.id, ...(item.data() as T) }));
}

export async function listAllCollectionByField<T>(name: string, field: string, value: string): Promise<(T & { id: string })[]> {
  const snapshot = await getDocs(query(collection(db, name), where(field, "==", value)));
  return snapshot.docs.map(item => ({ id: item.id, ...(item.data() as T) }));
}

export async function createRecord<T extends Record<string, unknown>>(name: string, data: T) {
  const cleaned = sanitizeFirestoreData(data);
  const ref = await addDoc(collection(db, name), { ...cleaned, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await writeAudit("create", name, ref.id, `Created ${name} record`);
  return ref;
}

export async function updateRecord<T extends Record<string, unknown>>(name: string, id: string, data: T) {
  const cleaned = sanitizeFirestoreData(data);
  const result = await updateDoc(doc(db, name, id), { ...cleaned, updatedAt: serverTimestamp() });
  await writeAudit("update", name, id, `Updated ${name} record`);
  return result;
}

export async function setRecord<T extends Record<string, unknown>>(name: string, id: string, data: T, merge = true) {
  const cleaned = sanitizeFirestoreData(data);
  const result = await setDoc(doc(db, name, id), { ...cleaned, updatedAt: serverTimestamp() }, { merge });
  await writeAudit("update", name, id, `Updated ${name} record`);
  return result;
}

export async function deleteRecord(name: string, id: string) {
  const result = await deleteDoc(doc(db, name, id));
  await writeAudit("delete", name, id, `Deleted ${name} record`);
  return result;
}

export async function auditEvent(action: string, entityType: string, entityId: string | undefined, summary: string) {
  await writeAudit(action, entityType, entityId, summary);
}
