"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import KoalaIcon from "./KoalaIcon";

export default function Footer() {
  const { t } = useLanguage();

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
              {t("footer.desc")}
            </p>
          </div>

          {/* Links sections */}
          <div className="mt-8 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">{t("footer.platform")}</h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link href="/skills" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.skills")}
                  </Link>
                </li>
                <li>
                  <Link href="/showcase" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.showcase")}
                  </Link>
                </li>
                <li>
                  <Link href="/forum" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.forum")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">{t("footer.resources")}</h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link href="/blog" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.blog")}
                  </Link>
                </li>
                <li>
                  <Link href="/agents" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.agents")}
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.privacy")}
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                    {t("footer.terms")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-card-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-text-secondary">
            &copy; {new Date().getFullYear()} vibetrends.dk. {t("footer.rights")}
          </p>
          <div className="flex space-x-6">
            <span className="text-xs text-text-secondary flex items-center" dangerouslySetInnerHTML={{ __html: t("footer.hosting") }} />
          </div>
        </div>
      </div>
    </footer>
  );
}
