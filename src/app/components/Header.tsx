"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Briefcase, Layers, MessageSquare, BookOpen, Cpu, TerminalSquare, Menu, X, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";
import dynamic from "next/dynamic";
import KoalaIcon from "./KoalaIcon";

const LoginModal = dynamic(() => import("./LoginModal"), { ssr: false });

interface NavSubItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavItem {
  name: string;
  href?: string;
  icon: LucideIcon;
  isDropdown?: boolean;
  items?: NavSubItem[];
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const isItemActive = (item: NavItem) => {
    if (item.isDropdown) {
      return item.items?.some((subItem) => pathname === subItem.href || pathname.startsWith(subItem.href)) ?? false;
    }
    return item.href ? (pathname === item.href || pathname.startsWith(item.href)) : false;
  };

  const navItems: NavItem[] = [
    { name: t("nav.forum"), href: "/forum", icon: MessageSquare },
    { name: t("nav.showcase"), href: "/vibes", icon: Layers },
    {
      name: t("nav.tools"),
      icon: Cpu,
      isDropdown: true,
      items: [
        { name: t("nav.mcp"), href: "/mcp", icon: Cpu },
        { name: t("nav.cli"), href: "/cli", icon: TerminalSquare },
        { name: t("nav.skills"), href: "/skills", icon: Briefcase },
      ],
    },
    { name: t("nav.blog"), href: "/blog", icon: BookOpen },
  ];

  return (
    <>
      <header style={{ viewTransitionName: "site-header" }} className="sticky top-0 z-50 w-full bg-card-bg/85 border-b border-card-border backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Every Link in this header has prefetch={false}: they're rendered on
            every page, so their background prefetches compete with any
            in-flight router.refresh() (e.g. the language toggle) — the
            browser can abort the real refresh's request in favor of a
            redundant prefetch, silently dropping the update. */}
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" prefetch={false} transitionTypes={["nav-back"]} className="flex items-center space-x-2.5 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-lg blur opacity-25 group-hover:opacity-60 transition duration-500 animate-pulse"></div>
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-card-border text-accent-primary transition duration-300">
                  <KoalaIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-foreground transition duration-300 leading-tight">
                  vibetrends<span className="text-accent-primary font-extrabold font-mono">.dk</span>
                </span>
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-[0.2em] -mt-0.5 opacity-60">{t("header.logo_subtitle")}</span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item, idx) => {
              const isActive = isItemActive(item);
              const activeIdx = navItems.findIndex((ni) => isItemActive(ni));
              const directionType = idx > activeIdx ? "nav-forward" : "nav-back";
              const Icon = item.icon;

              if (item.isDropdown) {
                return (
                  <div key={item.name} className="relative group py-2">
                    <button
                      aria-haspopup="true"
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition duration-200 cursor-pointer ${
                        isActive
                          ? "text-accent-primary bg-accent-light"
                          : "text-text-secondary hover:text-foreground hover:bg-card-border"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.name}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60 group-hover:rotate-180 transition-transform duration-200" aria-hidden="true" />
                    </button>

                    {/* Dropdown Menu — opens on hover and on keyboard focus */}
                    <div className="absolute left-0 mt-1 w-44 rounded-lg glass-card bg-card-bg border border-card-border shadow-lg py-1.5 hidden group-hover:block group-focus-within:block animate-in fade-in slide-in-from-top-2 duration-150 z-50 before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:content-['']">
                      {item.items?.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const isSubActive = pathname === subItem.href || pathname.startsWith(subItem.href);
                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            prefetch={false}
                            transitionTypes={[directionType]}
                            className={`flex items-center space-x-2 px-4 py-2 text-sm transition-colors ${
                              isSubActive
                                ? "text-accent-primary bg-accent-light font-semibold"
                                : "text-text-secondary hover:text-foreground hover:bg-card-border"
                            }`}
                          >
                            <SubIcon className="h-4 w-4" />
                            <span>{subItem.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href!}
                  href={item.href!}
                  prefetch={false}
                  transitionTypes={[directionType]}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition duration-200 ${
                    isActive
                      ? "text-accent-primary bg-accent-light"
                      : "text-text-secondary hover:text-foreground hover:bg-card-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Action button & Mini language toggle */}
          <div className="hidden lg:flex items-center space-x-4">
            {/* MINI LANGUAGE TOGGLE */}
            <div role="group" aria-label="Sprog / Language" className="flex items-center space-x-1 bg-background border border-card-border rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setLanguage("da")}
                aria-pressed={language === "da"}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  language === "da"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-foreground"
                }`}
              >
                DA
              </button>
              <button
                onClick={() => setLanguage("en")}
                aria-pressed={language === "en"}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  language === "en"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-foreground"
                }`}
              >
                EN
              </button>
            </div>

            <Link
              href="/vibes"
              prefetch={false}
              transitionTypes={["nav-forward"]}
              className="btn-primary flex items-center gap-1.5 text-sm"
              style={{ padding: '8px 16px' }}
            >
              <Sparkles className="h-4 w-4" />
              {t("btn.showcase_project")}
            </Link>

            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-xs text-text-secondary">@{user.username}</span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-lg border border-card-border text-xs font-semibold text-text-secondary hover:text-foreground hover:bg-card-border cursor-pointer"
                >
                  {t("btn.logout")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="btn-secondary text-xs"
                style={{ padding: '8px 16px' }}
              >
                {t("btn.login")}
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-card-border hover:text-foreground"
            >
              <span className="sr-only">{t("header.sr_menu")}</span>
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
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-card-border bg-card-bg px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto"
          >
          {navItems.map((item, idx) => {
            const isActive = isItemActive(item);
            const activeIdx = navItems.findIndex((ni) => isItemActive(ni));
            const directionType = idx > activeIdx ? "nav-forward" : "nav-back";
            const Icon = item.icon;

            if (item.isDropdown) {
              return (
                <div key={item.name} className="space-y-1 py-1">
                  <div className="flex items-center space-x-2 px-3 py-1.5 text-xs font-bold text-text-secondary/60 uppercase tracking-widest">
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </div>
                  <div className="pl-4 space-y-1 border-l border-card-border ml-4">
                    {item.items?.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = pathname === subItem.href || pathname.startsWith(subItem.href);
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          prefetch={false}
                          transitionTypes={[directionType]}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm transition ${
                            isSubActive
                              ? "bg-accent-light text-accent-primary font-semibold border-l-2 border-accent-primary"
                              : "text-text-secondary hover:text-foreground hover:bg-card-border"
                          }`}
                        >
                          <SubIcon className="h-4 w-4" />
                          <span>{subItem.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href!}
                href={item.href!}
                prefetch={false}
                transitionTypes={[directionType]}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition ${
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

          {/* Mobile Primary CTA */}
          <div className="pt-2 pb-1">
            <Link
              href="/vibes"
              prefetch={false}
              transitionTypes={["nav-forward"]}
              onClick={() => setMobileMenuOpen(false)}
              className="btn-primary flex items-center justify-center gap-1.5 text-sm w-full py-2.5"
            >
              <Sparkles className="h-4 w-4" />
              {t("btn.showcase_project")}
            </Link>
          </div>

          {/* Mobile Language Toggle */}
          <div className="pt-3 pb-2 border-t border-card-border flex items-center justify-between px-3">
            <span id="mobile-lang-label" className="text-xs font-semibold text-text-secondary">Sprog / Language</span>
            <div role="group" aria-labelledby="mobile-lang-label" className="flex items-center space-x-1 bg-background border border-card-border rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => { setLanguage("da"); setMobileMenuOpen(false); }}
                aria-pressed={language === "da"}
                className={`px-3.5 py-2 rounded cursor-pointer transition ${
                  language === "da"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-foreground"
                }`}
              >
                DA
              </button>
              <button
                onClick={() => { setLanguage("en"); setMobileMenuOpen(false); }}
                aria-pressed={language === "en"}
                className={`px-3.5 py-2 rounded cursor-pointer transition ${
                  language === "en"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-foreground"
                }`}
              >
                EN
              </button>
            </div>
          </div>

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
                {t("btn.logout")}
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
                {t("btn.login")}
              </button>
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
      </header>
      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </>
  );
}
