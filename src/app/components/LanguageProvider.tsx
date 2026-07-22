"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { translations, Language, TranslationKey } from "@/lib/translations";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
  language: "da",
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({
  children,
  initialLanguage = "da",
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [prevInitialLanguage, setPrevInitialLanguage] = useState<Language>(initialLanguage);

  // Keep state in sync if initialLanguage changes during render
  if (initialLanguage !== prevInitialLanguage) {
    setPrevInitialLanguage(initialLanguage);
    setLanguageState(initialLanguage);
  }

  // ⚡ Optimization: Memoize setLanguage to maintain referential stability
  // and prevent child components from re-rendering unnecessarily.
  const setLanguage = useCallback((lang: Language) => {
    // A redundant call (language already selected, e.g. a stray double-click)
    // would trigger a second reload while the first is already in flight.
    if (lang === language) return;

    setLanguageState(lang);

    // Set the cookie
    document.cookie = `vibe_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;

    // A full reload rather than router.refresh(): this app's pages render
    // many <Link>s that Next auto-prefetches, and those background prefetch
    // requests can win a race against router.refresh()'s own RSC fetch for
    // the same URL — the browser aborts our fetch, silently leaving the page
    // stuck on the old language. window.location.reload() can't be raced
    // that way.
    window.location.reload();
  }, [language]);

  // ⚡ Optimization: Memoize the translation function t to preserve referential stability
  // across renders. This ensures React.memo and useCallback optimizations in children
  // (which include translations in their dependencies) actually hold.
  const t = useCallback((key: TranslationKey): string => {
    const translationSet = translations[language] || translations.da;
    const typedSet = translationSet as unknown as Record<TranslationKey, string>;
    const defaultSet = translations.da as unknown as Record<TranslationKey, string>;
    return typedSet[key] || defaultSet[key] || key;
  }, [language]);

  // ⚡ Optimization: Memoize the context provider's value object. If language has
  // not changed, components consuming the language context will not be forced to re-render.
  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
