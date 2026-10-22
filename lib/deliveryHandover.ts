import type { Order } from "@/types/order";

export function validateOrderForHandover(order: Order | undefined, orderId: string) {
  if (!order) throw new Error("Order no longer exists.");
  if (order.status !== "packed") {
    throw new Error(`Order ${order.orderNumber || order.id || orderId} is no longer packed and cannot be handed over.`);
  }
  return order;
}

function isUncertainHandoverError(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") return true;
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return false;
  const code = error.code.split("/").at(-1);
  return ["aborted", "cancelled", "deadline-exceeded", "network-request-failed", "unavailable", "unknown"].includes(code ?? "");
}

export async function runHandoverWithOutcomeCheck<T>(
  commit: Promise<T>,
  isCommitted: () => Promise<boolean>,
): Promise<T | undefined> {
  try {
    return await commit;
  } catch (error) {
    if (!isUncertainHandoverError(error)) throw error;
    try {
      if (await isCommitted()) return undefined;
    } catch (verificationError) {
      throw new Error(
        "The handover outcome could not be confirmed. Refresh Delivery Operations before trying again.",
        { cause: verificationError },
      );
    }
    throw error;
  }
}
