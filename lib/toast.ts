import Swal, { type SweetAlertIcon, type SweetAlertOptions } from "sweetalert2";

export type ToastKind = "success" | "info" | "warning" | "error";

export const TOAST_DURATION_MS: Record<ToastKind, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 5000,
};

export type ToastOptions = { title?: string; message?: string; durationMs?: number };

export const SweetAlertToast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  showCloseButton: true,
  timerProgressBar: true,
  heightAuto: false,
  backdrop: false,
  didOpen: toast => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

export function buildToastFireOptions(kind: ToastKind, options: ToastOptions): SweetAlertOptions {
  return {
    icon: kind as SweetAlertIcon,
    title: options.title?.trim() || undefined,
    text: options.message?.trim() || undefined,
    timer: options.durationMs ?? TOAST_DURATION_MS[kind],
  };
}

/** Shows a SweetAlert2 built-in toast notification. */
export function showToastNotification(kind: ToastKind, options: ToastOptions) {
  const fireOptions = buildToastFireOptions(kind, options);
  if (!fireOptions.title && !fireOptions.text) return;
  void SweetAlertToast.fire(fireOptions);
}
