import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function requireAdmin(request: Request): Promise<DecodedIdToken> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!token) throw new AdminApiError("Authentication is required.", 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Admin API Firebase ID token verification failed", error);
    throw new AdminApiError("Your admin session is invalid or has expired. Sign in again.", 401);
  }

  const profile = await adminDb.collection("userProfiles").doc(decoded.uid).get();
  if (!profile.exists || !["ADMIN", "SUPER_ADMIN", "OPERATIONS"].includes(profile.get("role")) || profile.get("status") !== "active") {
    throw new AdminApiError("This account is not authorized for the Seedlings Admin Portal.", 403);
  }
  return decoded;
}

export function apiErrorResponse(error: unknown, context: string) {
  if (error instanceof AdminApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(context, error);
  const message = error instanceof Error ? error.message : "";
  if (/could not load the default credentials|unable to detect a project id/i.test(message)) {
    return Response.json({
      error: "Firebase Admin cannot obtain Google Application Default Credentials. Configure ADC for local development or provide the hosting runtime's service account/workload identity. Public Firebase client settings do not grant Admin access.",
    }, { status: 503 });
  }
  return Response.json({ error: "Unable to complete the admin request." }, { status: 500 });
}
