"use client";

import { useEffect } from "react";
import { errorMessage } from "@/lib/alerts";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Seedlings Admin global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-light">
        <main className="container py-5">
          <div className="card shadow-sm mx-auto" style={{ maxWidth: 560 }}>
            <div className="card-body text-center p-5">
              <div className="text-danger mb-3"><i className="bi bi-exclamation-triangle-fill fs-1" /></div>
              <h1 className="h4">Something went wrong</h1>
              <p className="text-muted">{errorMessage(error, "The application encountered an unexpected error. Please try again.")}</p>
              <button className="btn btn-success" onClick={() => reset()}>Try Again</button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
