"use client";

import { useEffect } from "react";
import { errorMessage } from "@/lib/alerts";
import { showToastNotification } from "@/lib/toast";

export function GlobalErrorHandler() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      showToastNotification("error", {
        title: "Unexpected error",
        message: errorMessage(event.reason, "An unexpected operation failed. Please try again."),
      });
    };

    const onError = (event: ErrorEvent) => {
      showToastNotification("error", {
        title: "Unexpected error",
        message: errorMessage(event.error, event.message || "An unexpected error occurred."),
      });
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
