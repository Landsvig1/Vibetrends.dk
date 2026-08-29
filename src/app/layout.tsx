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
    // No `images` here on purpose: app/opengraph-image.tsx is the source of
    // truth for the card, and an explicit entry would win over it.
  },
  twitter: {
    card: "summary_large_image",
    title: "vibetrends.dk: AI-tools til dig og dine agenter",
    description: "AI-tools og viden, udvalgt til Danmark. Også læsbar for agenter.",
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

async function RootLayoutInner({ children }: { children: React.ReactNode }) {
  // This await gates `children` and the footer, not just the header. That is a
  // deliberate second choice, not an oversight.
  //
  // Giving the header its own <Suspense> was tried and reverted: whatever the
  // fallback renders lands in the prerendered shell, so a fallback <Header />
  // put href="/forum" and href="/blog" straight into index.html (verified —
  // two occurrences each instead of one), which is exactly the markup this
  // feature exists to remove. A fallback that hides them instead just moves the
  // flash to the reveal.
  //
  // Gating is affordable because the counts are 'use cache' with
  // cacheLife('max') and are invalidated only by thread/post creation and
  // deletion (HUB_EMPTINESS_TAG in lib/db.ts) — not by upvotes or replies. On a
  // Static or PPR route this resolves at build time, so the gate costs nothing
  // per request; a miss is limited to the first request after someone creates
  // or deletes a thread or post.
  const hiddenHrefs = await hiddenNavHrefs();

  return (
    <AuthProvider>
      <NuqsAdapter>
        {/* First stop in the tab order. Without it a keyboard user crossed ten
            header controls, on every page, before reaching the content. */}
        <a
          href="#indhold"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-accent-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Spring til indhold
        </a>
        <Header hiddenHrefs={hiddenHrefs} />
        <main id="indhold" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <RouteTransitionProvider>{children}</RouteTransitionProvider>
        </main>
        <Footer />
      </NuqsAdapter>
    </AuthProvider>
  );
}

