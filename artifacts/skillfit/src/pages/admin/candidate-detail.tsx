import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCandidateActionsQueryKey,
  getGetCandidateQueryKey,
  useCreateOfficerAction,
  useGetCandidate,
  useGetCandidateActions,
} from "@workspace/api-client-react";
import type { OfficerActionBodyAction } from "@workspace/api-client-react";
import { CLASSIFICATION_LABELS, LANG_LABELS } from "@/lib/constants";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Download,
  FileText,
  GraduationCap,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";

type TabId = "interview" | "portfolio" | "integrity" | "actions";

type AdminFullCandidate = {
  id: number;
  name: string;
  phone: string;
  district: string;
  trade: string;
  language: string;
  interviews: Array<any>;
  officerActions: Array<any>;
  userProfile: any | null;
  userDocuments: Array<any>;
};

const actions: Array<{
  key: OfficerActionBodyAction;
  label: string;
  icon: typeof CheckCircle;
  className: string;
}> = [
  { key: "shortlist", label: "Shortlist", icon: CheckCircle, className: "bg-green-600 hover:bg-green-700" },
  { key: "send_to_training", label: "Send to Training", icon: GraduationCap, className: "bg-amber-600 hover:bg-amber-700" },
  { key: "request_reinterview", label: "Request Re-interview", icon: RefreshCw, className: "bg-blue-600 hover:bg-blue-700" },
  { key: "escalate", label: "Escalate", icon: AlertTriangle, className: "bg-red-600 hover:bg-red-700" },
];

function hashColor(value: string) {
  const colors = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-indigo-600"];
  const hash = value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? colors[0];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function displayDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.max(0, Math.min(1, score / 10));
  const color = score >= 7 ? "#16a34a" : score >= 5 ? "#d97706" : "#dc2626";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent)}
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">
        <span className="text-sm font-bold text-foreground">{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

function FaceGauge({ value }: { value: number | null | undefined }) {
  const pct = value == null ? 0 : value > 1 ? value : value * 100;
  return (
    <div className="flex items-center gap-4">
      <ScoreRing score={pct / 10} size={88} />
      <div>
        <p className="text-2xl font-bold text-foreground">{Math.round(pct)}%</p>
        <p className="text-sm text-muted-foreground">Face present</p>
      </div>
    </div>
  );
}

export default function CandidateDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/candidates/:id");
  const routeParams = params as { id?: string } | null;
  const id = Number.parseInt(routeParams?.id ?? "0", 10);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("interview");
  const [notes, setNotes] = useState("");
  const [activeResponse, setActiveResponse] = useState<number | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [fullCandidate, setFullCandidate] = useState<AdminFullCandidate | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [adminComments, setAdminComments] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  const { data: candidate, isLoading } = useGetCandidate(id, {
    query: { queryKey: getGetCandidateQueryKey(id) },
  });
  const { data: auditActions } = useGetCandidateActions(id, {
    query: { queryKey: getGetCandidateActionsQueryKey(id) },
  });
  const actionMutation = useCreateOfficerAction();

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;
    void fetch(`${apiBase}/api/admin/candidate/${id}/full`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setFullCandidate(data))
      .catch(() => setFullCandidate(null));
  }, [id]);

  useEffect(() => {
    const classification = (candidate as any)?.classification;
    if (!classification) return;
    setFeedbackDraft(classification.adminFeedback || classification.aiFeedback || classification.reasoning || "");
    setAdminComments(classification.adminComments || "");
    setRecommendations(classification.recommendations || "");
  }, [(candidate as any)?.classification]);

  const latestInterview = fullCandidate?.interviews?.[0] ?? (candidate as any)?.interview ?? null;
  const classification = latestInterview?.classification ?? (candidate as any)?.classification ?? null;
  const integrity = latestInterview?.integrity ?? (candidate as any)?.integrityCheck ?? null;
  const responses = latestInterview?.responses ?? (candidate as any)?.interview?.responses ?? [];
  const officerActions = fullCandidate?.officerActions ?? auditActions ?? [];
  const cls = classification?.category ? CLASSIFICATION_LABELS[classification.category] : null;
  const workImages = (fullCandidate?.userDocuments ?? []).filter((doc) => doc.category === "work_image");
  const documents = (fullCandidate?.userDocuments ?? []).filter((doc) => doc.category !== "work_image");

  const flags = useMemo(() => {
    const raw = integrity?.flags;
    return Array.isArray(raw) ? raw : [];
  }, [integrity]);

  async function refreshData() {
    await queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getGetCandidateActionsQueryKey(id) });
    const response = await fetch(`${apiBase}/api/admin/candidate/${id}/full`, { credentials: "include" });
    if (response.ok) setFullCandidate(await response.json());
  }

  async function doAction(action: OfficerActionBodyAction) {
    if (action === "request_reinterview") {
      const ok = window.confirm("This will reset the interview and all responses. Are you sure?");
      if (!ok) return;
    }

    await actionMutation.mutateAsync({
      data: {
        candidateId: id,
        interviewId: latestInterview?.id ?? null,
        action,
        notes: notes || null,
      },
    });
    setNotes("");
    await refreshData();
    window.alert("Action recorded successfully.");
  }

  async function generateFeedback() {
    if (!latestInterview?.id) return;
    setIsGeneratingFeedback(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/interviews/${latestInterview.id}/feedback/generate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate feedback");
      setFeedbackDraft(data.feedback || "");
      setAdminComments(data.comments || "");
      setRecommendations(data.recommendations || "");
      setFeedbackStatus("AI feedback generated. Review and save it.");
      await refreshData();
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : "Could not generate feedback");
    } finally {
      setIsGeneratingFeedback(false);
    }
  }

  async function saveFeedback() {
    if (!latestInterview?.id) return;
    setIsSavingFeedback(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/interviews/${latestInterview.id}/feedback`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminFeedback: feedbackDraft, adminComments, recommendations }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save feedback");
      setFeedbackStatus("Final feedback saved.");
      await refreshData();
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : "Could not save feedback");
    } finally {
      setIsSavingFeedback(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!candidate) {
    return <div className="p-6 text-sm text-muted-foreground">Candidate not found.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <button
        type="button"
        onClick={() => navigate("/admin/candidates")}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to candidates
      </button>

      <header className="rounded-lg border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${hashColor((candidate as any).name)}`}>
              {initials((candidate as any).name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">{(candidate as any).name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {(candidate as any).trade}
                </span>
                {cls && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cls.bg} ${cls.color}`}>
                    {cls.label}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {(candidate as any).phone} · {(candidate as any).district} · {LANG_LABELS[(candidate as any).language] || (candidate as any).language}
              </p>
            </div>
          </div>
          {classification?.avgScore != null && <ScoreRing score={classification.avgScore} />}
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-border">
        {[
          ["interview", "Interview"],
          ["portfolio", "Portfolio"],
          ["integrity", "Integrity"],
          ["actions", "Actions"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as TabId)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "interview" && (
        <section className="space-y-4">
          {classification?.reasoning && (
            <blockquote className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm italic text-foreground">
              {classification.reasoning}
            </blockquote>
          )}
          {responses.length === 0 ? (
            <div className="rounded-lg border border-card-border bg-card p-8 text-center text-sm text-muted-foreground">
              No responses recorded for this interview.
            </div>
          ) : (
            responses.map((response: any, index: number) => (
              <article key={response.id} className="rounded-lg border border-card-border bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveResponse(activeResponse === response.id ? null : response.id)}
                  className="flex w-full items-start justify-between gap-4 p-4 text-left"
                >
                  <div>
                    <p className="text-xs font-semibold text-primary">Question {index + 1}</p>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">{response.questionText}</h2>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{activeResponse === response.id ? "Collapse" : "Expand"}</span>
                </button>
                {activeResponse === response.id && (
                  <div className="space-y-3 border-t border-border p-4">
                    <div className="rounded-lg bg-muted p-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Answer transcript</p>
                      <p className="text-sm text-foreground">{response.transcript || "No transcript available."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["Relevance", response.relevanceScore],
                        ["Clarity", response.clarityScore],
                        ["Confidence", response.confidenceScore],
                      ].map(([label, value]) => (
                        <span key={label as string} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground">
                          {label}: {typeof value === "number" ? value.toFixed(1) : "-"} / 10
                        </span>
                      ))}
                    </div>
                    {response.geminiReasoning && <p className="text-sm italic text-muted-foreground">{response.geminiReasoning}</p>}
                    {response.videoUrl && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setActiveVideo(activeVideo === response.videoUrl ? null : response.videoUrl)}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-muted"
                        >
                          <Play className="h-4 w-4" />
                          {activeVideo === response.videoUrl ? "Hide video" : "Play video"}
                        </button>
                        {activeVideo === response.videoUrl && <video src={response.videoUrl} controls className="mt-3 max-h-80 w-full rounded-lg" />}
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      )}

      {tab === "portfolio" && (
        <section className="space-y-5">
          {fullCandidate?.userProfile ? (
            <div className="rounded-lg border border-card-border bg-card p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Linked User Profile</p>
              <p className="mt-1 text-lg font-bold text-foreground">{fullCandidate.userProfile.fullName}</p>
              <p className="text-sm text-muted-foreground">{fullCandidate.userProfile.aadhaarMasked}</p>
            </div>
          ) : null}

          {workImages.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Work Photos</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {workImages.map((doc) => (
                  <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-card-border bg-card">
                    <img src={doc.fileUrl} alt={doc.fileName} className="h-44 w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Certificates and Work Proof</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-card-border bg-card p-4 hover:bg-muted/40"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{doc.fileName}</span>
                        <span className="text-xs text-muted-foreground">
                          {doc.category.replace("_", " ")} · {displayDate(doc.createdAt)}
                        </span>
                      </span>
                    </span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!workImages.length && !documents.length && (
            <div className="rounded-lg border border-card-border bg-card p-8 text-center text-sm text-muted-foreground">
              No portfolio documents uploaded yet
            </div>
          )}
        </section>
      )}

      {tab === "integrity" && (
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-card-border bg-card p-5">
              <FaceGauge value={integrity?.facePresentPct} />
            </div>
            <div className="rounded-lg border border-card-border bg-card p-5">
              <p className="mb-3 text-sm font-semibold text-foreground">Liveness</p>
              <div className="flex items-center gap-3">
                {integrity?.livenessPass ? <CheckCircle className="h-8 w-8 text-green-600" /> : <XCircle className="h-8 w-8 text-red-600" />}
                <span className="text-lg font-bold text-foreground">
                  {integrity?.livenessPass == null ? "Not checked" : integrity.livenessPass ? "Pass" : "Fail"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-card-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Flags</h2>
            {flags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {flags.map((flag: string) => (
                  <span key={flag} className="rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                    {flag.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No integrity flags found.</p>
            )}
          </div>

          {integrity?.duplicateCandidateId && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Possible duplicate of candidate{" "}
              <button type="button" onClick={() => navigate(`/admin/candidates/${integrity.duplicateCandidateId}`)} className="font-bold underline">
                #{integrity.duplicateCandidateId}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "actions" && (
        <section className="space-y-5">
          <div className="rounded-lg border border-card-border bg-card p-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-foreground">Officer notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm"
                placeholder="Add notes before recording an action"
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {actions.map(({ key, label, icon: Icon, className }) => (
                <button
                  key={key}
                  type="button"
                  disabled={actionMutation.isPending}
                  onClick={() => void doAction(key)}
                  className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${className}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-card-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Audit Log</h2>
            {officerActions.length > 0 ? (
              <div className="space-y-4 border-l-2 border-border pl-5">
                {officerActions.map((entry: any) => (
                  <div key={entry.id} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold capitalize text-foreground">{entry.action.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">By {entry.officerUsername}</p>
                        {entry.notes && <p className="mt-1 text-sm text-foreground">{entry.notes}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">{displayDate(entry.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-card-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Feedback</h2>
              <button
                type="button"
                onClick={() => void generateFeedback()}
                disabled={isGeneratingFeedback || !latestInterview?.id || !classification}
                className="rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {isGeneratingFeedback ? "Generating..." : "Generate AI Feedback"}
              </button>
            </div>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Final Feedback</span>
                <textarea value={feedbackDraft} onChange={(event) => setFeedbackDraft(event.target.value)} className="h-28 w-full resize-none rounded-md border border-input bg-background p-3 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Admin Comments</span>
                <textarea value={adminComments} onChange={(event) => setAdminComments(event.target.value)} className="h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Recommendations</span>
                <textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} className="h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm" />
              </label>
            </div>
            {feedbackStatus && <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{feedbackStatus}</p>}
            <button
              type="button"
              onClick={() => void saveFeedback()}
              disabled={isSavingFeedback || !latestInterview?.id || !classification}
              className="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSavingFeedback ? "Saving..." : "Save Feedback"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
