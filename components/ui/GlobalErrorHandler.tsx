"use client";

import { useEffect } from "react";
import Swal from "sweetalert2";
import { errorMessage } from "@/lib/alerts";

export function GlobalErrorHandler() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      void Swal.fire({
        icon: "error",
        title: "Unexpected error",
        text: errorMessage(event.reason, "An unexpected operation failed. Please try again."),
        confirmButtonText: "OK"
      });
    };

    const onError = (event: ErrorEvent) => {
      void Swal.fire({
        icon: "error",
        title: "Unexpected error",
        text: errorMessage(event.error, event.message || "An unexpected error occurred."),
        confirmButtonText: "OK"
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
