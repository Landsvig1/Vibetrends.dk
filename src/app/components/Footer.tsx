"use client";

import Link from "next/link";
import KoalaIcon from "./KoalaIcon";

export default function Footer() {
  return (
    <footer style={{ viewTransitionName: "site-footer" }} className="mt-auto border-t border-card-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-background border border-card-border text-accent-primary transition duration-300">
                <KoalaIcon className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-foreground">
                vibetrends<span className="text-accent-primary font-mono">.dk</span>
              </span>
            </div>
            <p className="text-sm text-text-secondary max-w-xs">
              AI-tools og viden, udvalgt til Danmark. For mennesker og agenter.
            </p>
          </div>

          {/* Links sections */}
          <div className="mt-8 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">Platform</h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link href="/skills" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Skills-biblioteket
                  </Link>
                </li>
                <li>
                  <Link href="/vibes" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Vibes
                  </Link>
                </li>
                <li>
                  <Link href="/forum" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Forum
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">Ressourcer</h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link href="/blog" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Blog & Guides
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Om vibetrends.dk
                  </Link>
                </li>
                <li>
                  <Link href="/agent-guide" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Agent Guide
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Privatlivspolitik
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    Brugervilkår
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}
