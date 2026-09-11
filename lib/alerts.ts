"use client";

import Swal from "sweetalert2";

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function showSuccess(title: string, text?: string) {
  return Swal.fire({
    icon: "success",
    title,
    text,
    confirmButtonText: "OK",
    confirmButtonColor: "#78b82a"
  });
}

export async function showError(error: unknown, fallback?: string) {
  return Swal.fire({
    icon: "error",
    title: "Something went wrong",
    text: errorMessage(error, fallback),
    confirmButtonText: "OK"
  });
}

export async function showWarning(title: string, text?: string) {
  return Swal.fire({
    icon: "warning",
    title,
    text,
    confirmButtonText: "OK",
    confirmButtonColor: "#78b82a"
  });
}

export async function confirmAction(options: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "info";
}) {
  const result = await Swal.fire({
    icon: options.icon ?? "warning",
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Yes, continue",
    cancelButtonText: options.cancelText ?? "Cancel",
    confirmButtonColor: "#78b82a",
    reverseButtons: true,
    focusCancel: true
  });
  return result.isConfirmed;
}

export async function promptText(options: {
  title: string;
  text?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  confirmText?: string;
  defaultValue?: string;
}) {
  const result = await Swal.fire({
    icon: "question",
    title: options.title,
    text: options.text,
    input: "textarea",
    inputValue: options.defaultValue ?? "",
    inputLabel: options.inputLabel,
    inputPlaceholder: options.inputPlaceholder,
    inputAttributes: { "aria-label": options.inputLabel ?? "Input" },
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Continue",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#78b82a",
    reverseButtons: true,
    focusCancel: true
  });
  return result.isConfirmed ? String(result.value ?? "") : null;
}

export function showToast(message: string, icon: "success" | "error" | "warning" | "info" = "success") {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title: message,
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true
  });
}
