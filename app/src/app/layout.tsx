import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pact Protocol — Dashboard",
  description: "Programmable Letters of Credit on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-navy-900 antialiased">
        {children}
      </body>
    </html>
  );
}
