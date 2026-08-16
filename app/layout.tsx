import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyPlate+",
  description: "Capacity, care, and connection—without carrying the whole table alone.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
