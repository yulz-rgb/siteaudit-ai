import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteAudit AI",
  description: "Fix your website. Increase conversions instantly."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
      </body>
    </html>
  );
}
