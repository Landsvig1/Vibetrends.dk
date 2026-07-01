import type { NextConfig } from "next";
import { getAllowedImageHostnames } from "./src/lib/allowedImageHosts";

const isProd = process.env.NODE_ENV === 'production';

// Browser-side Supabase calls (magic-link sign-in, session refresh) hit the
// project origin directly, so it must be allowed in connect-src.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseWs = supabaseUrl.replace(/^https:/, 'wss:');
const allowedImageHostnames = getAllowedImageHostnames();

// 'unsafe-inline' is required by Next.js App Router hydration scripts (no nonce
// in static/PPR mode). 'unsafe-eval' is only needed for dev tooling/HMR, so it
// is dropped in production.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  'https://va.vercel-scripts.com',
  ...(isProd ? [] : ["'unsafe-eval'"]),
].join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' blob: data: ${allowedImageHostnames.map((h) => `https://${h}`).join(' ')}`.trimEnd(),
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://vitals.vercel-insights.com ${supabaseUrl} ${supabaseWs}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  // Legacy header; with a modern CSP it can introduce bugs, so disable it.
  {
    key: 'X-XSS-Protection',
    value: '0'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: csp
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
  }
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    viewTransition: true,
    instantNavigationDevToolsToggle: true,
  },
  images: {
    remotePatterns: allowedImageHostnames.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
