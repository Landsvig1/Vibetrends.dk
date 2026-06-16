"use client";

import React, { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translations, Language, TranslationKey } from "@/lib/translations";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  isPending: boolean;
}

const LanguageContext = createContext<LanguageContextProps>({
  language: "da",
  setLanguage: () => {},
  t: (key) => key,
  isPending: false,
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Keep state in sync if initialLanguage changes during render
  if (initialLanguage !== prevInitialLanguage) {
    setPrevInitialLanguage(initialLanguage);
    setLanguageState(initialLanguage);
  }

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    
    // Set the cookie
    document.cookie = `vibe_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    
    // Trigger server components refresh
    startTransition(() => {
      router.refresh();
    });
  };

  const t = (key: TranslationKey): string => {
    const translationSet = translations[language] || translations.da;
    const typedSet = translationSet as unknown as Record<TranslationKey, string>;
    const defaultSet = translations.da as unknown as Record<TranslationKey, string>;
    return typedSet[key] || defaultSet[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isPending }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
