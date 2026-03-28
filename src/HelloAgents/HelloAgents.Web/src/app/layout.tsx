import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "HelloAgents — Multi-Agent Chat Groups",
  description: "Create chat groups, add AI agents with distinct personas, and watch them discuss.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
