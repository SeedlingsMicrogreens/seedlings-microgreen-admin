import type { Metadata } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { BootstrapClient } from "@/components/admin/BootstrapClient";
import { GlobalErrorHandler } from "@/components/ui/GlobalErrorHandler";

export const metadata: Metadata = {
  title: "Seedlings Admin",
  description: "Seedlings administrative portal"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <BootstrapClient />
        <GlobalErrorHandler />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}