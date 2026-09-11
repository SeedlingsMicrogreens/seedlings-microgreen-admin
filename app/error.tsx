"use client";

import { useEffect } from "react";
import { showError } from "@/lib/alerts";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void showError(error, "The page could not be loaded. Please try again.");
  }, [error]);

  return (
    <main className="container py-5">
      <div className="card shadow-sm">
        <div className="card-body text-center p-5">
          <h1 className="h4">Something went wrong</h1>
          <p className="text-muted">The page encountered an unexpected error.</p>
          <button className="btn btn-success" onClick={() => reset()}>Try Again</button>
        </div>
      </div>
    </main>
  );
}
