import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "vibetrends.dk - Hub for danske AI-byggere & Vibe Coders",
    template: "%s | vibetrends.dk",
  },
  description: "Dansk markedsplads og community for AI-udviklere, prompt engineers og vibe coders. Se projekter, find ydelser og konfigurer agenter.",
  metadataBase: new URL("https://vibetrends.dk"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "vibetrends.dk - Hub for danske AI-byggere & Vibe Coders",
    description: "Det førende danske community og markedsplads for vibe-kodede projekter og AI-kompetencer.",
    url: "https://vibetrends.dk",
    siteName: "vibetrends.dk",
    locale: "da_DK",
    type: "website",
    images: [
      {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "vibetrends.dk - Hub for Vibe Coders",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "vibetrends.dk - Hub for danske AI-byggere & Vibe Coders",
    description: "Dansk community og markedsplads for vibe coding og AI agenter.",
    images: ["/images/og-default.jpg"],
  },
};

import RouteTransitionProvider from "./components/RouteTransitionProvider";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "./components/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="agent-permissions" href="/agent-permissions.json" />
        <link rel="ara-manifest" href="/ara.json" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-accent-light selection:text-text-primary">
        <AuthProvider>
          <Header />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
            <RouteTransitionProvider>{children}</RouteTransitionProvider>
          </main>
          <Footer />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
