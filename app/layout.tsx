import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SFERIS TCO - Tableau de Contrôle Optique",
  description: "Tableau de Contrôle Optique — SFERIS Rail",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="text-on-surface h-screen flex flex-col">{children}</body>
    </html>
  );
}
