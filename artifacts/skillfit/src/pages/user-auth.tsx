import { ArrowLeft, CheckCircle2, Languages, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { LANGUAGES } from "@/lib/constants";
import { getState, setState } from "@/lib/store";
import { useTranslation, type LanguageCode } from "@/lib/i18n";

type OtpResponse = {
  aadhaarMasked: string;
  maskedMobile: string;
  demoOtp: string;
};

type UserProfile = {
  id: number;
  fullName: string;
  aadhaarMasked: string;
  gender: string | null;
  dob: string | null;
  district: string | null;
  state: string;
  mobileNumber: string | null;
  language: LanguageCode;
};

type VerifyResponse = {
  profile: UserProfile;
  isNewUser: boolean;
};

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL ?? "";

function formatAadhaar(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 12)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data as T;
}

export default function UserAuth() {
  const [, navigate] = useLocation();
  const current = getState();
  const [lang, setLang] = useState<LanguageCode>(current.language || "kn");
  const { t } = useTranslation(lang);
  const [step, setStep] = useState<"aadhaar" | "otp" | "verified">("aadhaar");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpMeta, setOtpMeta] = useState<OtpResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLanguage(next: LanguageCode) {
    setLang(next);
    setState({ language: next });
  }

  async function requestOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await postJson<OtpResponse>("/user/auth/request-otp", {
        aadhaarNumber,
        language: lang,
      });
      setOtpMeta(response);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await postJson<VerifyResponse>("/user/auth/verify-otp", { otp });
      setProfile(response.profile);
      setState({
        userProfileId: response.profile.id,
        candidateName: response.profile.fullName,
        district: response.profile.district || "",
        language: response.profile.language,
        aadhaarMasked: response.profile.aadhaarMasked,
        mobileNumber: response.profile.mobileNumber || "",
      });
      setLang(response.profile.language);
      setStep("verified");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify OTP");
    } finally {
      setIsSubmitting(false);
    }
  }

  function continueAfterVerification() {
    navigate("/user/dashboard");
  }

  const canRequestOtp = aadhaarNumber.replace(/\D/g, "").length === 12;
  const canVerifyOtp = /^\d{6}$/.test(otp);

  return (
    <div className="min-h-screen bg-[#f7f3ec] px-4 py-5 text-[#24150f]">
      <main className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[#d9c7ac] pb-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-[#7b241c] hover:bg-[#fff4df]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("auth.back")}
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
              {t("auth.appTitle")}
            </p>
            <p className="text-sm font-bold text-[#24150f]">{t("auth.secureBadge")}</p>
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold text-[#7b241c] sm:flex">
            <Languages className="h-4 w-4" aria-hidden="true" />
            {t("auth.languageLabel")}
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c7ac] bg-white px-3 py-1 text-xs font-semibold text-[#7b241c] shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("auth.secureBadge")}
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-[#24150f]">
              {step === "verified" ? t("auth.verifiedTitle") : step === "otp" ? t("auth.otpTitle") : t("auth.aadhaarTitle")}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#68452f]">
              {step === "verified"
                ? t("auth.verifiedDescription")
                : step === "otp" && otpMeta
                  ? t("auth.otpDescription", { mobile: otpMeta.maskedMobile })
                  : t("auth.aadhaarDescription")}
            </p>
            <p className="mt-5 rounded-lg border border-[#d9c7ac] bg-white p-3 text-xs leading-relaxed text-[#68452f]">
              {t("auth.safeNote")}
            </p>
          </div>

          <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 grid grid-cols-3 gap-2 rounded-lg border border-[#d9c7ac] bg-[#fffaf2] p-1">
              {LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  data-testid={`user-auth-lang-${language.code}`}
                  onClick={() => handleLanguage(language.code)}
                  className={`rounded-md px-2 py-2 text-sm font-semibold transition-colors ${
                    lang === language.code
                      ? "bg-[#7b241c] text-white"
                      : "text-[#4a2a18] hover:bg-[#fff4df]"
                  }`}
                >
                  {language.label}
                </button>
              ))}
            </div>

            {step === "aadhaar" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2a18]">
                    {t("auth.aadhaarLabel")}
                  </span>
                  <input
                    data-testid="input-aadhaar"
                    value={aadhaarNumber}
                    onChange={(event) => setAadhaarNumber(formatAadhaar(event.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("auth.aadhaarPlaceholder")}
                    className="h-12 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 text-base font-semibold tracking-normal outline-none focus:border-[#7b241c] focus:ring-2 focus:ring-[#7b241c]/15"
                  />
                </label>
                {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <button
                  type="button"
                  data-testid="btn-request-otp"
                  onClick={() => void requestOtp()}
                  disabled={!canRequestOtp || isSubmitting}
                  className="w-full rounded-md bg-[#7b241c] px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#641c16] disabled:opacity-50"
                >
                  {isSubmitting ? t("auth.sendingOtp") : t("auth.sendOtp")}
                </button>
              </div>
            )}

            {step === "otp" && otpMeta && (
              <div className="space-y-4">
                <div className="rounded-md border border-[#d9c7ac] bg-[#fffaf2] p-3 text-sm text-[#4a2a18]">
                  <p className="font-semibold">{otpMeta.aadhaarMasked}</p>
                  <p className="mt-1 text-xs text-[#68452f]">
                    {t("auth.demoOtp", { otp: otpMeta.demoOtp })}
                  </p>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2a18]">
                    {t("auth.otpLabel")}
                  </span>
                  <input
                    data-testid="input-otp"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="h-12 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 text-center text-lg font-bold tracking-normal outline-none focus:border-[#7b241c] focus:ring-2 focus:ring-[#7b241c]/15"
                  />
                </label>
                {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("aadhaar");
                      setOtp("");
                      setError(null);
                    }}
                    className="rounded-md border border-[#7b241c] px-4 py-3 text-base font-semibold text-[#7b241c] transition-colors hover:bg-[#fff4df]"
                  >
                    {t("auth.changeAadhaar")}
                  </button>
                  <button
                    type="button"
                    data-testid="btn-verify-otp"
                    onClick={() => void verifyOtp()}
                    disabled={!canVerifyOtp || isSubmitting}
                    className="rounded-md bg-[#7b241c] px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#641c16] disabled:opacity-50"
                  >
                    {isSubmitting ? t("auth.verifyingOtp") : t("auth.verifyOtp")}
                  </button>
                </div>
              </div>
            )}

            {step === "verified" && profile && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <p className="text-sm font-semibold">{t("auth.verifiedDescription")}</p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    [t("auth.profileName"), profile.fullName],
                    [t("auth.profileAadhaar"), profile.aadhaarMasked],
                    [t("auth.profileDistrict"), profile.district || "-"],
                    [t("auth.profileMobile"), profile.mobileNumber || "-"],
                    [t("auth.profileDob"), profile.dob || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md bg-[#fffaf2] p-3">
                      <dt className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
                        {label}
                      </dt>
                      <dd className="mt-1 font-semibold text-[#24150f]">{value}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  data-testid="btn-auth-continue"
                  onClick={continueAfterVerification}
                  className="w-full rounded-md bg-[#7b241c] px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#641c16]"
                >
                  {t("auth.continue")}
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
