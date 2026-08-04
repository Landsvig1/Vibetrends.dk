import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "vibetrends.dk: AI-tools til dig og dine agenter",
    template: "%s | vibetrends.dk",
  },
  description: "Kuraterede AI-skills, MCP-servere og tools, udvalgt til Danmark. Mennesker er velkomne. Agenter også.",
  metadataBase: new URL("https://vibetrends.dk"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "vibetrends.dk: AI-tools til dig og dine agenter",
    description: "AI-tools og viden, udvalgt til Danmark. Også læsbar for agenter.",
    url: "https://vibetrends.dk",
    siteName: "vibetrends.dk",
    locale: "da_DK",
    type: "website",
    images: [
      {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "vibetrends.dk: AI tools for you and your agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "vibetrends.dk: AI-tools til dig og dine agenter",
    description: "AI-tools og viden, udvalgt til Danmark. Også læsbar for agenter.",
    images: ["/images/og-default.jpg"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FAF9F6",
};

import { Suspense } from "react";
import Script from "next/script";
import RouteTransitionProvider from "./components/RouteTransitionProvider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from "./components/AuthProvider";
import { jsonLdScript } from "@/lib/jsonLd";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { hiddenNavHrefs } from "@/lib/hubContent";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="da"
      className={`${instrumentSerif.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        <link rel="agent-permissions" href="/agent-permissions.json" />
        <link rel="ara-manifest" href="/ara.json" />
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="CPNdamSkIs1Veg2zV/8HUg"
          strategy="afterInteractive"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "vibetrends.dk",
              "url": "https://vibetrends.dk/",
              "description": "AI-tools og viden, udvalgt til Danmark. Også læsbar for agenter."
            })
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-accent-light selection:text-foreground">
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
        <SpeedInsights />
      </body>
    </html>
  );
}

function RootLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NuqsAdapter>
        {/*
          The nav's hub counts are their own async read, so they get their own
          boundary. Awaiting them out here would gate `children` and the footer
          as well, and the fallback above is a bare <main> skeleton with no
          chrome — so a single slow count read would blank the whole page frame
          rather than just the nav.

          The fallback renders the header with nothing hidden. That matches how
          hiddenNavHrefs degrades when it can't read the counts (fail open, see
          lib/hubContent.ts): if we're going to show something before the answer
          arrives, it should be the same something we'd show if the answer never
          arrived.
        */}
        <Suspense fallback={<Header />}>
          <HeaderWithHubNav />
        </Suspense>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <RouteTransitionProvider>{children}</RouteTransitionProvider>
        </main>
        <Footer />
      </NuqsAdapter>
    </AuthProvider>
  );
}

// Both counts are 'use cache' with cacheLife('max') and are only invalidated by
// thread/post creation and deletion (HUB_EMPTINESS_TAG in lib/db.ts), so on a
// Static or PPR route this resolves at build time and costs nothing per request.
async function HeaderWithHubNav() {
  return <Header hiddenHrefs={await hiddenNavHrefs()} />;
}

