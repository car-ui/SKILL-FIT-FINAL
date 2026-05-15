import { Award, BriefcaseBusiness, FileImage, FileText, History, Languages, LogOut, UserRound, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LANGUAGES } from "@/lib/constants";
import { setState } from "@/lib/store";
import { useTranslation, type LanguageCode } from "@/lib/i18n";

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL ?? "";

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

type UserDocument = {
  id: number;
  category: "work_image" | "certificate" | "work_proof";
  fileName: string;
  fileUrl: string;
  contentType: string | null;
  createdAt: string;
};

type InterviewSummary = {
  interviewId: number;
  candidateId: number;
  trade: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  classification: string | null;
  avgScore: number | null;
};

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DOCUMENT_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]);

async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(`${apiBase}/api${path}`, {
    credentials: "include",
    headers: isFormData
      ? options?.headers
      : {
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
        },
    ...options,
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

function displayDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function documentHref(fileUrl: string) {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${apiBase}${fileUrl}`;
}

export default function UserDashboard() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState<"profile" | "portfolio" | "jobs" | "history">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [form, setForm] = useState({ district: "", state: "Karnataka", mobileNumber: "", language: "en" as LanguageCode });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<UserDocument["category"] | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lang = form.language || profile?.language || "en";
  const { t } = useTranslation(lang);

  const documentLabels = useMemo(() => ({
    work_image: t("userDashboard.workImage"),
    certificate: t("userDashboard.certificate"),
    work_proof: t("userDashboard.workProof"),
  }), [t]);

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);
    try {
      const me = await apiJson<{ profile: UserProfile; documents: UserDocument[] }>("/user/me");
      const history = await apiJson<{ interviews: InterviewSummary[] }>("/user/interviews");
      setProfile(me.profile);
      setDocuments(me.documents ?? []);
      setInterviews(history.interviews ?? []);
      setForm({
        district: me.profile.district || "",
        state: me.profile.state || "Karnataka",
        mobileNumber: me.profile.mobileNumber || "",
        language: me.profile.language,
      });
      setState({
        userProfileId: me.profile.id,
        candidateName: me.profile.fullName,
        district: me.profile.district || "",
        language: me.profile.language,
        aadhaarMasked: me.profile.aadhaarMasked,
        mobileNumber: me.profile.mobileNumber || "",
      });
    } catch (err) {
      if (err instanceof Error && /unauthorized/i.test(err.message)) {
        navigate("/user/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function saveProfile() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await apiJson<{ profile: UserProfile }>("/user/profile", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setProfile(response.profile);
      setState({
        district: response.profile.district || "",
        language: response.profile.language,
        mobileNumber: response.profile.mobileNumber || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpload(category: UserDocument["category"], file: File | null) {
    if (!profile || !file) return;
    setError(null);
    setUploadSuccess(null);

    const acceptedTypes = category === "work_image" ? IMAGE_TYPES : DOCUMENT_TYPES;
    if (!acceptedTypes.has(file.type)) {
      setError(category === "work_image" ? "Please upload a JPG, PNG, WEBP, or GIF image." : "Please upload a PDF, JPG, PNG, WEBP, or GIF file.");
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setError("File must be 10 MB or smaller.");
      return;
    }

    setUploadingCategory(category);
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("file", file);

      const response = await apiJson<{ document: UserDocument }>("/user/documents", {
        method: "POST",
        body,
      });
      setUploadSuccess(`${response.document.fileName} uploaded successfully.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload document");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function deleteDocument(id: number) {
    setError(null);
    try {
      await apiJson(`/user/documents/${id}`, { method: "DELETE" });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function startInterview(trade: "Electrician" | "CNC Operator") {
    if (!profile) return;
    setIsStarting(trade);
    setError(null);
    try {
      const response = await apiJson<{
        candidate: { id: number; name: string; district: string; trade: string; language: LanguageCode };
        interview: { id: number };
      }>("/user/jobs/start-interview", {
        method: "POST",
        body: JSON.stringify({
          trade,
          language: form.language,
          deviceFingerprint: navigator.userAgent.slice(0, 100),
        }),
      });
      setState({
        userProfileId: profile.id,
        candidateId: response.candidate.id,
        candidateName: response.candidate.name,
        trade: response.candidate.trade,
        district: response.candidate.district,
        language: response.candidate.language,
        interviewId: response.interview.id,
        classification: null,
        avgScore: null,
      });
      navigate("/interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start interview");
    } finally {
      setIsStarting(null);
    }
  }

  async function logout() {
    await apiJson("/user/logout", { method: "POST", body: "{}" }).catch(() => null);
    navigate("/");
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f3ec] text-sm text-[#68452f]">
        {t("userDashboard.loading")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f3ec] p-4 text-sm text-red-700">
        {error || "Profile not available"}
      </div>
    );
  }

  const tabs = [
    { key: "profile" as const, label: t("userDashboard.profile"), Icon: UserRound },
    { key: "portfolio" as const, label: "Portfolio", Icon: FileImage },
    { key: "jobs" as const, label: t("userDashboard.applyJobs"), Icon: BriefcaseBusiness },
    { key: "history" as const, label: t("userDashboard.previousInterviews"), Icon: History },
  ];

  const jobs = [
    {
      trade: "Electrician" as const,
      title: t("userDashboard.electrician"),
      description: t("userDashboard.electricianDesc"),
      Icon: Zap,
    },
    {
      trade: "CNC Operator" as const,
      title: t("userDashboard.cnc"),
      description: t("userDashboard.cncDesc"),
      Icon: Award,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#24150f]">
      <header className="border-b border-[#d9c7ac] bg-[#7b241c] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-white/75">AI SkillFit</p>
            <h1 className="text-xl font-bold">{t("userDashboard.title")}</h1>
            <p className="text-sm text-white/75">{t("userDashboard.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("userDashboard.logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <nav className="grid gap-2 sm:grid-cols-4">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                active === key
                  ? "border-[#7b241c] bg-white text-[#7b241c] shadow-sm"
                  : "border-[#d9c7ac] bg-[#fffaf2] text-[#4a2a18] hover:bg-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {uploadSuccess && <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{uploadSuccess}</div>}

        {active === "profile" && (
          <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  [t("userDashboard.fullName"), profile.fullName],
                  [t("userDashboard.aadhaar"), profile.aadhaarMasked],
                  [t("userDashboard.gender"), profile.gender || "-"],
                  [t("userDashboard.dob"), profile.dob || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-[#fffaf2] p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{label}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">{t("userDashboard.district")}</span>
                  <input
                    value={form.district}
                    onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))}
                    className="h-11 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 outline-none focus:border-[#7b241c]"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">{t("userDashboard.state")}</span>
                  <input
                    value={form.state}
                    onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                    className="h-11 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 outline-none focus:border-[#7b241c]"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">{t("userDashboard.mobile")}</span>
                  <input
                    value={form.mobileNumber}
                    onChange={(event) => setForm((current) => ({ ...current, mobileNumber: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    className="h-11 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 outline-none focus:border-[#7b241c]"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Languages className="h-4 w-4" aria-hidden="true" />
                    {t("userDashboard.language")}
                  </span>
                  <select
                    value={form.language}
                    onChange={(event) => setForm((current) => ({ ...current, language: event.target.value as LanguageCode }))}
                    className="h-11 w-full rounded-md border border-[#d9c7ac] bg-[#fffaf2] px-3 outline-none focus:border-[#7b241c]"
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>{language.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={isSaving}
                className="mt-5 rounded-md bg-[#7b241c] px-4 py-3 text-sm font-semibold text-white hover:bg-[#641c16] disabled:opacity-50"
              >
                {isSaving ? t("userDashboard.saving") : t("userDashboard.save")}
              </button>
            </div>

            <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-bold">{t("userDashboard.documents")}</h2>
              <div className="grid gap-3">
                {(["work_image", "certificate", "work_proof"] as const).map((category) => (
                  <label key={category} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[#d9c7ac] bg-[#fffaf2] p-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      {category === "work_image" ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      {documentLabels[category]}
                    </span>
                    <span className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-[#7b241c]">
                      {uploadingCategory === category ? "Uploading..." : t("userDashboard.upload")}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept={category === "work_image" ? "image/*" : "image/*,.pdf"}
                      disabled={uploadingCategory !== null}
                      onChange={(event) => {
                        void handleUpload(category, event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 space-y-2">
                {documents.length === 0 ? (
                  <p className="rounded-md bg-[#fffaf2] p-3 text-sm text-[#68452f]">{t("userDashboard.noDocuments")}</p>
                ) : (
                  documents.map((document) => (
                    <a
                      key={document.id}
                      href={documentHref(document.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border border-[#d9c7ac] p-3 text-sm hover:bg-[#fffaf2]"
                    >
                      <span className="font-semibold">{document.fileName}</span>
                      <span className="ml-2 text-xs text-[#68452f]">{documentLabels[document.category]}</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {active === "portfolio" && (
          <section className="mt-5 space-y-4">
            <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm text-[#68452f]">Your portfolio is visible to placement officers reviewing your interview results.</p>
              
              {/* Work Photos */}
              <div className="mb-6">
                <h3 className="mb-3 font-semibold text-[#24150f]">Work Photos ({documents.filter(d => d.category === "work_image").length}/6)</h3>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {documents.filter(d => d.category === "work_image").map((doc) => (
                    <div key={doc.id} className="relative group rounded-lg overflow-hidden border border-[#d9c7ac] bg-[#fffaf2]">
                      <img src={documentHref(doc.fileUrl)} alt={doc.fileName} className="w-full h-40 object-cover" />
                      <button
                        onClick={async () => {
                          try {
                            await deleteDocument(doc.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to delete");
                          }
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#d9c7ac] bg-[#fffaf2] p-6 text-sm font-semibold text-[#7b241c] hover:bg-white">
                  <FileImage className="h-5 w-5" />
                  {uploadingCategory === "work_image" ? "Uploading..." : "Upload Photo"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    disabled={documents.filter(d => d.category === "work_image").length >= 6 || uploadingCategory !== null}
                    onChange={(event) => {
                      void handleUpload("work_image", event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {/* Certificates */}
              <div className="mb-6">
                <h3 className="mb-3 font-semibold text-[#24150f]">Certificates ({documents.filter(d => d.category === "certificate").length}/3)</h3>
                <div className="mb-4 space-y-2">
                  {documents.filter(d => d.category === "certificate").map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-[#fffaf2] rounded-lg border border-[#d9c7ac]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-semibold text-sm">{doc.fileName}</p>
                          <p className="text-xs text-[#68452f]">{displayDate(doc.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={documentHref(doc.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-[#7b241c] hover:underline">View</a>
                        <button
                          onClick={async () => {
                            try {
                              await deleteDocument(doc.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to delete");
                            }
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#d9c7ac] bg-[#fffaf2] p-4 text-sm font-semibold text-[#7b241c] hover:bg-white">
                  <FileText className="h-5 w-5" />
                  {uploadingCategory === "certificate" ? "Uploading..." : "Upload Certificate"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                    disabled={documents.filter(d => d.category === "certificate").length >= 3 || uploadingCategory !== null}
                    onChange={(event) => {
                      void handleUpload("certificate", event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {/* Work Proof */}
              <div>
                <h3 className="mb-3 font-semibold text-[#24150f]">Proof of Employment ({documents.filter(d => d.category === "work_proof").length}/3)</h3>
                <div className="mb-4 space-y-2">
                  {documents.filter(d => d.category === "work_proof").map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-[#fffaf2] rounded-lg border border-[#d9c7ac]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-semibold text-sm">{doc.fileName}</p>
                          <p className="text-xs text-[#68452f]">{displayDate(doc.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={documentHref(doc.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-[#7b241c] hover:underline">View</a>
                        <button
                          onClick={async () => {
                            try {
                              await deleteDocument(doc.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to delete");
                            }
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#d9c7ac] bg-[#fffaf2] p-4 text-sm font-semibold text-[#7b241c] hover:bg-white">
                  <FileText className="h-5 w-5" />
                  {uploadingCategory === "work_proof" ? "Uploading..." : "Upload Proof"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                    disabled={documents.filter(d => d.category === "work_proof").length >= 3 || uploadingCategory !== null}
                    onChange={(event) => {
                      void handleUpload("work_proof", event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </section>
        )}

        {active === "jobs" && (
          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            {jobs.map(({ trade, title, description, Icon }) => (
              <button
                key={trade}
                type="button"
                onClick={() => void startInterview(trade)}
                disabled={isStarting !== null}
                className="aspect-square rounded-lg border border-[#d9c7ac] bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#7b241c] hover:shadow-md disabled:opacity-60"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fff4df] text-[#7b241c]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="mt-5 block text-2xl font-bold">{title}</span>
                <span className="mt-3 block text-sm leading-relaxed text-[#68452f]">{description}</span>
                <span className="mt-6 block text-sm font-semibold text-[#7b241c]">
                  {isStarting === trade ? t("userDashboard.starting") : t("userDashboard.startInterview")}
                </span>
              </button>
            ))}
          </section>
        )}

        {active === "history" && (
          <section className="mt-5 rounded-lg border border-[#d9c7ac] bg-white shadow-sm">
            {interviews.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#68452f]">{t("userDashboard.noInterviews")}</p>
            ) : (
              <div className="divide-y divide-[#eadfce]">
                {interviews.map((interview) => (
                  <button
                    key={interview.interviewId}
                    type="button"
                    onClick={() => navigate(`/user/interviews/${interview.interviewId}`)}
                    className="grid w-full gap-2 p-4 text-left transition-colors hover:bg-[#fffaf2] md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("userDashboard.trade")}</p>
                      <p className="font-semibold">{interview.trade}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("userDashboard.score")}</p>
                      <p className="font-semibold">{interview.avgScore != null ? `${interview.avgScore.toFixed(1)} / 10` : "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("userDashboard.classification")}</p>
                      <p className="font-semibold">{interview.classification || interview.status}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("userDashboard.date")}</p>
                      <p className="font-semibold">{displayDate(interview.completedAt || interview.createdAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#7b241c]">{t("userDashboard.viewDetails")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
