import type { Metadata, Viewport } from "next";
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
  description: "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret af hvad folk bygger — og vis dit eget.",
  metadataBase: new URL("https://vibetrends.dk"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "vibetrends.dk - Hub for danske AI-byggere & Vibe Coders",
    description: "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret — og vis hvad du har bygget.",
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
    description: "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret og vis hvad du har bygget.",
    images: ["/images/og-default.jpg"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FAF9F6",
};

import { Suspense } from "react";
import RouteTransitionProvider from "./components/RouteTransitionProvider";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "./components/AuthProvider";
import { cookies } from "next/headers";
import { LanguageProvider } from "./components/LanguageProvider";
import { Language } from "@/lib/translations";
import { jsonLdScript } from "@/lib/jsonLd";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="da"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="agent-permissions" href="/agent-permissions.json" />
        <link rel="ara-manifest" href="/ara.json" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "vibetrends.dk",
              "url": "https://vibetrends.dk/",
              "description": "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret — og vis hvad du har bygget."
            })
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-accent-light selection:text-text-primary">
        <Suspense fallback={
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 animate-pulse">
            <div className="h-10 bg-card-border/20 rounded w-1/4 mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-card-border/20 rounded w-3/4"></div>
              <div className="h-4 bg-card-border/20 rounded w-1/2"></div>
            </div>
          </main>
        }>
          <RootLayoutInner>{children}</RootLayoutInner>
        </Suspense>
        <Analytics />
      </body>
    </html>
  );
}

async function RootLayoutInner({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  return (
    <LanguageProvider initialLanguage={lang}>
      <AuthProvider>
        <NuqsAdapter>
          <Header />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
            <RouteTransitionProvider>{children}</RouteTransitionProvider>
          </main>
          <Footer />
        </NuqsAdapter>
      </AuthProvider>
    </LanguageProvider>
  );
}

