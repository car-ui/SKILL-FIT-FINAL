import { ArrowRight, Languages, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { LANGUAGES } from "@/lib/constants";
import { getState, setState } from "@/lib/store";
import { useTranslation, type LanguageCode } from "@/lib/i18n";

export default function Landing() {
  const [, navigate] = useLocation();
  const current = getState();
  const [lang, setLang] = useState<LanguageCode>(current.language || "kn");
  const { t } = useTranslation(lang);

  function handleAdmin() {
    setState({ language: lang });
    navigate("/admin/login");
  }

  function handleUser() {
    setState({ language: lang });
    navigate("/user/login");
  }

  const steps = [
    t("landing.stepOne"),
    t("landing.stepTwo"),
    t("landing.stepThree"),
  ];

  const roleCards = [
    {
      key: "admin",
      title: t("landing.adminTitle"),
      description: t("landing.adminDescription"),
      action: t("landing.adminAction"),
      Icon: ShieldCheck,
      onClick: handleAdmin,
      testId: "card-admin",
    },
    {
      key: "user",
      title: t("landing.userTitle"),
      description: t("landing.userDescription"),
      action: t("landing.userAction"),
      Icon: UserRound,
      onClick: handleUser,
      testId: "card-user",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f3ec] px-4 py-5 text-[#24150f] sm:px-6 lg:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col">
        <header className="flex flex-col gap-4 border-b border-[#d9c7ac] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#7b241c] text-base font-bold text-white shadow-sm">
              KA
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
                {t("landing.government")}
              </p>
              <h1 className="text-2xl font-bold leading-tight text-[#24150f]">
                {t("landing.appTitle")}
              </h1>
              <p className="mt-1 text-sm text-[#68452f]">{t("landing.subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
              <Languages className="h-4 w-4" aria-hidden="true" />
              {t("landing.languageLabel")}
            </label>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#d9c7ac] bg-white p-1 shadow-sm">
              {LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  data-testid={`lang-${language.code}`}
                  onClick={() => setLang(language.code)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    lang === language.code
                      ? "bg-[#7b241c] text-white"
                      : "text-[#4a2a18] hover:bg-[#fff4df]"
                  }`}
                >
                  {language.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c7ac] bg-white px-3 py-1 text-xs font-semibold text-[#7b241c] shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("landing.secureBadge")}
            </span>
            <h2 className="mt-5 max-w-xl text-3xl font-bold leading-tight text-[#24150f] sm:text-4xl">
              {t("landing.heading")}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[#68452f]">
              {t("landing.description")}
            </p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#68452f]">
              {t("landing.department")}
            </p>

            <div className="mt-8 grid gap-3">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7b241c] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium text-[#4a2a18]">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {roleCards.map(({ key, title, description, action, Icon, onClick, testId }) => (
              <button
                key={key}
                type="button"
                data-testid={testId}
                onClick={onClick}
                className="group flex min-h-64 flex-col rounded-lg border border-[#d9c7ac] bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#7b241c] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#7b241c] focus:ring-offset-2 focus:ring-offset-[#f7f3ec]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fff4df] text-[#7b241c]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="mt-6 text-2xl font-bold text-[#24150f]">{title}</span>
                <span className="mt-3 flex-1 text-sm leading-relaxed text-[#68452f]">
                  {description}
                </span>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#7b241c]">
                  {action}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <footer className="border-t border-[#d9c7ac] py-4 text-center text-xs text-[#68452f]">
          {t("landing.privacy")}
        </footer>
      </main>
    </div>
  );
}
