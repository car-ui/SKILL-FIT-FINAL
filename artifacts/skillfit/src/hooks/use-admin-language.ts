import { useEffect, useState } from "react";
import type { LanguageCode } from "@/lib/i18n";

const STORAGE_KEY = "skillfit_admin_language";
const EVENT_NAME = "skillfit-admin-language-change";

function readLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "hi" || saved === "kn" ? saved : "en";
}

export function useAdminLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>(readLanguage);

  useEffect(() => {
    function handleLanguageChange() {
      setLanguageState(readLanguage());
    }
    window.addEventListener(EVENT_NAME, handleLanguageChange);
    window.addEventListener("storage", handleLanguageChange);
    return () => {
      window.removeEventListener(EVENT_NAME, handleLanguageChange);
      window.removeEventListener("storage", handleLanguageChange);
    };
  }, []);

  function setLanguage(next: LanguageCode) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }

  return [language, setLanguage] as const;
}
