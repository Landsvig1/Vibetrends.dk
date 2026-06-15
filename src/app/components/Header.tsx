"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Terminal, Sparkles, Briefcase, Layers, MessageSquare, BookOpen, Cpu, Menu, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("./LoginModal"), { ssr: false });

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { name: "Skills", href: "/skills", icon: Briefcase },
    { name: "Showcase", href: "/showcase", icon: Layers },
    { name: "Forum", href: "/forum", icon: MessageSquare },
    { name: "Blog", href: "/blog", icon: BookOpen },
    { name: "Agents & MCP", href: "/agents", icon: Cpu },
  ];

  return (
    <header style={{ viewTransitionName: "site-header" }} className="sticky top-0 z-50 w-full glass-panel border-b border-card-border backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" transitionTypes={["nav-back"]} className="flex items-center space-x-2.5 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-lg blur opacity-25 group-hover:opacity-60 transition duration-500 animate-pulse"></div>
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-white/10 text-white transition-all duration-300">
                  <Terminal className="h-5 w-5" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-foreground transition-all duration-300 leading-tight">
                  vibetrends<span className="text-accent-primary font-extrabold font-mono">.dk</span>
                </span>
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-[0.2em] -mt-0.5 opacity-60">AI Hub & Marketplace</span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              const activeIdx = navItems.findIndex((ni) => pathname.startsWith(ni.href));
              const directionType = idx > activeIdx ? "nav-forward" : "nav-back";
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  transitionTypes={[directionType]}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-accent-primary bg-background border-b-2 border-accent-primary"
                      : "text-text-secondary hover:text-foreground hover:bg-card-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Action button */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/showcase"
              transitionTypes={["nav-forward"]}
              className="btn-primary flex items-center gap-1.5 text-sm"
              style={{ padding: '8px 16px' }}
            >
              <Sparkles className="h-4 w-4" />
              Showcase Project
            </Link>

            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-xs text-text-secondary">@{user.username}</span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-lg border border-card-border text-xs font-semibold text-text-secondary hover:text-foreground hover:bg-background cursor-pointer"
                >
                  Log ud
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="btn-secondary text-xs"
                style={{ padding: '8px 16px' }}
              >
                Log ind
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-card-border hover:text-foreground focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-card-border bg-card-bg px-4 py-3 space-y-1">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            const activeIdx = navItems.findIndex((ni) => pathname.startsWith(ni.href));
            const directionType = idx > activeIdx ? "nav-forward" : "nav-back";
            return (
              <Link
                key={item.name}
                href={item.href}
                transitionTypes={[directionType]}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-all ${
                  isActive
                    ? "bg-accent-light text-accent-primary border-l-4 border-accent-primary"
                    : "text-text-secondary hover:text-foreground hover:bg-card-border"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
          {user ? (
            <div className="pt-4 pb-2 border-t border-card-border flex items-center justify-between px-3">
              <span className="text-sm text-text-secondary">@{user.username}</span>
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="px-3 py-1 text-xs rounded border border-card-border text-text-secondary hover:text-foreground"
              >
                Log ud
              </button>
            </div>
          ) : (
            <div className="pt-4 pb-2 border-t border-card-border">
              <button
                onClick={() => {
                  setLoginModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2.5 rounded-lg border border-card-border text-foreground text-sm font-semibold hover:bg-card-border cursor-pointer"
              >
                Log ind
              </button>
            </div>
          )}
        </div>
      )}
      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </header>
  );
}
