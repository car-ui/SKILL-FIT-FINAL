import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { CLASSIFICATION_LABELS } from "@/lib/constants";
import { getState } from "@/lib/store";
import { useTranslation, type LanguageCode } from "@/lib/i18n";

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL ?? "";

type ResponseRow = {
  id: number;
  questionText: string;
  transcript: string;
  relevanceScore: number | null;
  clarityScore: number | null;
  confidenceScore: number | null;
  geminiReasoning: string | null;
};

type InterviewDetail = {
  id: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  candidate: {
    trade: string;
    language: LanguageCode;
  };
  classification: {
    category: string;
    avgScore: number;
    reasoning: string;
    aiFeedback?: string | null;
    adminFeedback?: string | null;
    adminComments?: string | null;
    recommendations?: string | null;
  } | null;
  responses: ResponseRow[];
};

async function apiJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, { credentials: "include" });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export default function UserInterviewDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/user/interviews/:id");
  const state = getState();
  const lang = state.language || "en";
  const { t } = useTranslation(lang);
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    apiJson<InterviewDetail>(`/user/interviews/${id}?language=${lang}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load interview"));
  }, [params?.id, lang]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#f7f3ec] p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f3ec] text-sm text-[#68452f]">
        Loading...
      </div>
    );
  }

  const classification = detail.classification;
  const classInfo = classification ? CLASSIFICATION_LABELS[classification.category] : null;
  const finalFeedback =
    classification?.adminFeedback ||
    classification?.aiFeedback ||
    classification?.reasoning ||
    t("interviewDetail.pending");

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#24150f]">
      <header className="border-b border-[#d9c7ac] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => navigate("/user/dashboard")}
            className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-[#7b241c] hover:bg-[#fff4df]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("interviewDetail.back")}
          </button>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{detail.candidate.trade}</p>
            <h1 className="text-lg font-bold">{t("interviewDetail.title")}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-4">
          <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
              {t("interviewDetail.classification")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {classInfo && (
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${classInfo.bg} ${classInfo.color}`}>
                  {classInfo.label}
                </span>
              )}
              <span className="text-sm font-semibold">
                {t("interviewDetail.score")}: {classification?.avgScore != null ? `${classification.avgScore.toFixed(1)} / 10` : "-"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#7b241c]">{t("interviewDetail.aiEvaluation")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#4a2a18]">
              {classification?.reasoning || "-"}
            </p>
          </div>

          <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#7b241c]">{t("interviewDetail.adminFeedback")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#4a2a18]">{finalFeedback}</p>
            {classification?.adminComments && (
              <>
                <h3 className="mt-5 text-sm font-bold text-[#7b241c]">{t("interviewDetail.adminComments")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4a2a18]">{classification.adminComments}</p>
              </>
            )}
            {classification?.recommendations && (
              <>
                <h3 className="mt-5 text-sm font-bold text-[#7b241c]">{t("interviewDetail.recommendations")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4a2a18]">{classification.recommendations}</p>
              </>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#7b241c]">{t("interviewDetail.responses")}</h2>
          <div className="space-y-4">
            {detail.responses.map((response, index) => (
              <div key={response.id} className="rounded-md border border-[#eadfce] bg-[#fffaf2] p-4">
                <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">Q{index + 1}</p>
                <p className="mt-1 text-sm font-semibold">{response.questionText}</p>
                <p className="mt-3 text-sm text-[#4a2a18]">{response.transcript}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    response.relevanceScore,
                    response.clarityScore,
                    response.confidenceScore,
                  ].map((score, scoreIndex) => (
                    <div key={scoreIndex} className="rounded bg-white p-2 font-semibold">
                      {score != null ? score.toFixed(1) : "-"}
                    </div>
                  ))}
                </div>
                {response.geminiReasoning && (
                  <p className="mt-3 text-xs italic text-[#68452f]">{response.geminiReasoning}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
