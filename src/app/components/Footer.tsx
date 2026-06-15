import Link from "next/link";
import { Terminal, Globe, ArrowUpRight } from "lucide-react";

export default function Footer() {
  return (
    <footer style={{ viewTransitionName: "site-footer" }} className="mt-auto border-t border-white/5 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-md shadow-violet-500/10">
                <Terminal className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-white">
                vibetrends<span className="text-cyan-400 font-mono">.dk</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs">
              The premier hub for Danish AI developers, builders, and vibe coders to share prompts, templates, and agent tools.
            </p>
          </div>

          {/* Links sections */}
          <div className="mt-8 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Platform</h3>
                <ul className="mt-4 space-y-2">
                  <li>
                    <Link href="/skills" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Skills Marketplace
                    </Link>
                  </li>
                  <li>
                    <Link href="/showcase" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Project Showcase
                    </Link>
                  </li>
                  <li>
                    <Link href="/forum" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Developer Forum
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="mt-8 md:mt-0">
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Resources</h3>
                <ul className="mt-4 space-y-2">
                  <li>
                    <Link href="/blog" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Blog & Guides
                    </Link>
                  </li>
                  <li>
                    <Link href="/agents" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Agent & MCP Registry
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Privatlivspolitik
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-sm text-slate-400 hover:text-white transition-colors">
                      Brugervilkår
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Brands sections */}
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Sponsored by</h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <a
                    href="https://aiauto.dk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center space-x-1 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                  >
                    <span>aiauto.dk</span>
                    <span className="text-xs text-slate-500 group-hover:text-emerald-400 transition-colors">(AI Automation Agency)</span>
                    <ArrowUpRight className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://landsvig.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center space-x-1 text-sm text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    <span>landsvig.com</span>
                    <span className="text-xs text-slate-500 group-hover:text-violet-400 transition-colors">(Personal Portal)</span>
                    <ArrowUpRight className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} vibetrends.dk. All rights reserved. Made in Brøndby, Denmark.
          </p>
          <div className="flex space-x-6">
            <span className="text-xs text-slate-600 flex items-center">
              <Globe className="h-3 w-3 mr-1" />
              Hosting via Vercel &middot; DNS via Simply.com
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
