import { useRoute, useLocation } from "wouter";
import {
  useGetCandidate,
  useCreateOfficerAction,
  useGetCandidateActions,
  getGetCandidateQueryKey,
  getGetCandidateActionsQueryKey,
} from "@workspace/api-client-react";
import type { OfficerActionBodyAction } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CLASSIFICATION_LABELS, LANG_LABELS } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n";
import { useAdminLanguage } from "@/hooks/use-admin-language";
import { ArrowLeft, CheckCircle, GraduationCap, RefreshCw, AlertTriangle, FileText, Image as ImageIcon, Download } from "lucide-react";

const ACTIONS = [
  { key: "shortlist", label: "Shortlist", icon: CheckCircle, color: "bg-green-600 hover:bg-green-700" },
  { key: "send_to_training", label: "Send to Training", icon: GraduationCap, color: "bg-amber-600 hover:bg-amber-700" },
  { key: "request_reinterview", label: "Request Re-interview", icon: RefreshCw, color: "bg-blue-600 hover:bg-blue-700" },
  { key: "escalate", label: "Escalate", icon: AlertTriangle, color: "bg-red-600 hover:bg-red-700" },
] as const;

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL ?? "";

function getInitialColor(name: string): string {
  const colors = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500", "bg-emerald-500", "bg-orange-500", "bg-rose-500", "bg-indigo-500"];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length] || "bg-blue-500";
}

function ScoreRing({ score }: { score: number }) {
  const percent = (score / 10) * 100;
  const circumference = 2 * Math.PI * 30;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 70 ? "#16a34a" : percent >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="flex items-center justify-center">
      <div className="relative w-24 h-24">
        <svg className="transform -rotate-90 w-full h-full">
          <circle cx="48" cy="48" r="30" fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle
            cx="48"
            cy="48"
            r="30"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{score.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">/10</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CandidateDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/candidates/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"interview" | "portfolio" | "integrity" | "actions">("interview");
  const [notes, setNotes] = useState("");
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reinterviewConfirm, setReinterviewConfirm] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [adminComments, setAdminComments] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [fullCandidate, setFullCandidate] = useState<any>(null);
  const [loadingFullDetail, setLoadingFullDetail] = useState(false);
  const [adminLanguage] = useAdminLanguage();
  const { t } = useTranslation(adminLanguage);

  const { data: candidate, isLoading } = useGetCandidate(id, {
    query: { queryKey: getGetCandidateQueryKey(id) },
  });
  const { data: actions } = useGetCandidateActions(id, {
    query: { queryKey: getGetCandidateActionsQueryKey(id) },
  });
  const actionMutation = useCreateOfficerAction();

  useEffect(() => {
    // Fetch full candidate detail with portfolio
    const fetchFullDetail = async () => {
      setLoadingFullDetail(true);
      try {
        const res = await fetch(`${apiBase}/api/admin/candidate/${id}/full`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setFullCandidate(data);
        }
      } catch (err) {
        console.error("Failed to load full candidate detail", err);
      } finally {
        setLoadingFullDetail(false);
      }
    };
    fetchFullDetail();
  }, [id]);

  useEffect(() => {
    const classification = candidate?.classification as
      | {
          aiFeedback?: string | null;
          adminFeedback?: string | null;
          adminComments?: string | null;
          recommendations?: string | null;
          reasoning?: string | null;
        }
      | undefined;
    if (!classification) return;
    setFeedbackDraft(classification.adminFeedback || classification.aiFeedback || classification.reasoning || "");
    setAdminComments(classification.adminComments || "");
    setRecommendations(classification.recommendations || "");
  }, [candidate?.classification]);

  async function doAction(action: OfficerActionBodyAction) {
    if (action === "request_reinterview" && !reinterviewConfirm) {
      setReinterviewConfirm(true);
      return;
    }
    setReinterviewConfirm(false);
    try {
      await actionMutation.mutateAsync({
        data: {
          candidateId: id,
          interviewId: candidate?.interview?.id ?? null,
          action,
          notes: notes || null,
        },
      });
      setActionSuccess(action);
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: getGetCandidateActionsQueryKey(id) });
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {}
  }

  async function generateFeedback() {
    if (!candidate?.interview?.id) return;
    setIsGeneratingFeedback(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/interviews/${candidate.interview.id}/feedback/generate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate feedback");
      setFeedbackDraft(data.feedback || "");
      setAdminComments(data.comments || "");
      setRecommendations(data.recommendations || "");
      setFeedbackStatus("AI feedback generated. Review and save to approve.");
      await queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
    } catch (err) {
      setFeedbackStatus(err instanceof Error ? err.message : "Could not generate feedback");
    } finally {
      setIsGeneratingFeedback(false);
    }
  }

  async function saveFeedback() {
    if (!candidate?.interview?.id) return;
    setIsSavingFeedback(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/interviews/${candidate.interview.id}/feedback`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFeedback: feedbackDraft,
          adminComments,
          recommendations,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save feedback");
      setFeedbackStatus("Final feedback saved for user.");
      await queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
    } catch (err) {
      setFeedbackStatus(err instanceof Error ? err.message : "Could not save feedback");
    } finally {
      setIsSavingFeedback(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-6 text-center text-muted-foreground">Candidate not found.</div>
    );
  }

  const cls = candidate.classification ? CLASSIFICATION_LABELS[candidate.classification.category] : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate("/admin/candidates")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to candidates
      </button>

      {/* Header Section */}
      <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-full ${getInitialColor(candidate.name)} flex items-center justify-center text-white text-2xl font-bold flex-shrink-0`}>
              {candidate.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{candidate.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {cls && (
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${cls.bg} ${cls.color}`}>
                    {cls.label}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">{candidate.trade}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {candidate.phone} • {candidate.district} • {LANG_LABELS[candidate.language] || candidate.language}
              </div>
            </div>
          </div>
          {candidate.classification && (
            <ScoreRing score={candidate.classification.avgScore} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {[
          { id: "interview", label: "Interview" },
          { id: "portfolio", label: "Portfolio" },
          { id: "integrity", label: "Integrity" },
          { id: "actions", label: "Actions" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {/* Interview Tab */}
        {activeTab === "interview" && (
          <div className="space-y-5">
            {/* Classification */}
            {candidate.classification && (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground mb-4">Assessment Result</h2>
                <div className="mb-4 p-4 bg-muted rounded-lg border border-border">
                  <p className="text-sm text-foreground italic">{candidate.classification.reasoning}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{candidate.classification.avgScore.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">Average Score</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{candidate.interview?.responses?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Responses</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{candidate.interview?.status}</p>
                    <p className="text-xs text-muted-foreground">Status</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{cls?.label || "—"}</p>
                    <p className="text-xs text-muted-foreground">Classification</p>
                  </div>
                </div>
              </div>
            )}

            {/* Interview responses */}
            {candidate.interview?.responses && candidate.interview.responses.length > 0 && (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground mb-4">Interview Responses</h2>
                <div className="space-y-4">
                  {candidate.interview.responses.map((r, i) => (
                    <div key={r.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-xs font-medium text-primary mb-1">Question {i + 1}</p>
                          <p className="text-sm font-medium text-foreground">{r.questionText}</p>
                        </div>
                      </div>
                      <div className="bg-muted rounded-lg p-3 mb-3">
                        <p className="text-xs text-muted-foreground mb-1">Transcript</p>
                        <p className="text-sm text-foreground">{r.transcript || "No transcript"}</p>
                      </div>
                      {(r.relevanceScore !== null || r.clarityScore !== null || r.confidenceScore !== null) && (
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {[
                            { label: "Relevance", value: r.relevanceScore },
                            { label: "Clarity", value: r.clarityScore },
                            { label: "Confidence", value: r.confidenceScore },
                          ].map((score) => (
                            <div key={score.label} className="text-center p-2 bg-accent rounded-lg">
                              <p className="text-lg font-bold text-primary">{score.value?.toFixed(1) ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{score.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.geminiReasoning && (
                        <p className="text-xs text-muted-foreground italic mb-2">AI Note: {r.geminiReasoning}</p>
                      )}
                      {r.videoUrl && (
                        <button
                          onClick={() => setActiveVideo(r.videoUrl === activeVideo ? null : (r.videoUrl ?? null))}
                          className="text-xs text-primary hover:underline"
                        >
                          {activeVideo === r.videoUrl ? "Hide video" : "Play video"}
                        </button>
                      )}
                      {activeVideo === r.videoUrl && r.videoUrl && (
                        <video src={r.videoUrl} controls className="mt-2 w-full rounded-lg max-h-48" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Portfolio Tab */}
        {activeTab === "portfolio" && (
          <div className="space-y-5">
            {fullCandidate?.userProfile ? (
              <>
                <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Linked User Profile</p>
                  <p className="text-lg font-semibold text-foreground">{fullCandidate.userProfile.fullName}</p>
                  <p className="text-sm text-muted-foreground">{fullCandidate.userProfile.aadhaarMasked}</p>
                </div>

                {/* Work Images */}
                {fullCandidate.userDocuments?.filter((d: any) => d.category === "work_image").length > 0 ? (
                  <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Work Photos</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {fullCandidate.userDocuments
                        .filter((d: any) => d.category === "work_image")
                        .map((doc: any) => (
                          <div key={doc.id} className="rounded-lg overflow-hidden border border-border bg-muted">
                            <img src={doc.fileUrl} alt={doc.fileName} className="w-full h-40 object-cover" />
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                {/* Certificates & Work Proof */}
                {fullCandidate.userDocuments?.filter((d: any) => d.category !== "work_image").length > 0 ? (
                  <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Documents</h2>
                    <div className="space-y-2">
                      {fullCandidate.userDocuments
                        .filter((d: any) => d.category !== "work_image")
                        .map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                            <div className="flex items-center gap-3">
                              {doc.category === "certificate" ? (
                                <FileText className="w-4 h-4 text-amber-600" />
                              ) : (
                                <Download className="w-4 h-4 text-blue-600" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-foreground">{doc.fileName}</p>
                                <p className="text-xs text-muted-foreground capitalize">{doc.category.replace("_", " ")}</p>
                              </div>
                            </div>
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                              View
                            </a>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm text-center">
                <p className="text-muted-foreground">No portfolio documents uploaded yet</p>
              </div>
            )}
          </div>
        )}

        {/* Integrity Tab */}
        {activeTab === "integrity" && (
          <div className="space-y-5">
            {candidate.integrityCheck ? (
              <>
                <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Integrity Checks</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground">
                        {candidate.integrityCheck.facePresentPct !== null
                          ? `${Math.round((candidate.integrityCheck.facePresentPct ?? 0) * 100)}%`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Face Present</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className={`text-2xl font-bold ${
                        candidate.integrityCheck.livenessPass === null ? "text-muted-foreground" :
                        candidate.integrityCheck.livenessPass ? "text-green-600" : "text-red-600"
                      }`}>
                        {candidate.integrityCheck.livenessPass === null ? "—" :
                         candidate.integrityCheck.livenessPass ? "✓" : "✗"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Liveness</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-lg font-bold text-foreground">{(candidate.integrityCheck as any).phoneReuse ? "⚠" : "✓"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Phone Reuse</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-lg font-bold text-foreground">{(candidate.integrityCheck as any).deviceReuse ? "⚠" : "✓"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Device Reuse</p>
                    </div>
                  </div>
                  {candidate.integrityCheck.flags?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {candidate.integrityCheck.flags.map((f) => (
                        <span key={f} className="px-2.5 py-1 bg-destructive/10 text-destructive text-xs rounded-full border border-destructive/20 font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {(candidate.integrityCheck as any).duplicateCandidateId && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-900 font-medium mb-2">⚠ Duplicate Detection</p>
                      <p className="text-sm text-amber-800">
                        This candidate may be a duplicate of{" "}
                        <button
                          onClick={() => navigate(`/admin/candidates/${(candidate.integrityCheck as any).duplicateCandidateId}`)}
                          className="text-primary hover:underline font-medium"
                        >
                          Candidate #{(candidate.integrityCheck as any).duplicateCandidateId}
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm text-center">
                <p className="text-muted-foreground">No integrity check data available</p>
              </div>
            )}
          </div>
        )}

        {/* Actions Tab */}
        {activeTab === "actions" && (
          <div className="space-y-5">
            {/* Officer Actions */}
            <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4">Officer Actions</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes for this action..."
                className="w-full text-sm border border-input rounded-lg p-3 bg-background resize-none h-24 mb-4"
              />
              {actionSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
                  ✓ Action recorded successfully
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.key}
                      onClick={() => {
                        if (a.key === "request_reinterview" && !reinterviewConfirm) {
                          doAction(a.key);
                        } else if (reinterviewConfirm && a.key === "request_reinterview") {
                          doAction(a.key);
                        } else if (a.key !== "request_reinterview") {
                          doAction(a.key);
                        }
                      }}
                      disabled={actionMutation.isPending}
                      className={`flex items-center justify-center gap-2 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 ${a.color}`}
                    >
                      <Icon className="w-4 h-4" />
                      {a.label}
                    </button>
                  );
                })}
              </div>

              {reinterviewConfirm && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium mb-3">
                    ⚠ This will reset the interview and clear all responses. Are you sure?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => doAction("request_reinterview")}
                      disabled={actionMutation.isPending}
                      className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      Yes, Reset Interview
                    </button>
                    <button
                      onClick={() => setReinterviewConfirm(false)}
                      className="px-3 py-2 bg-blue-100 text-blue-900 text-sm font-medium rounded-lg hover:bg-blue-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Feedback Section */}
            <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4">Feedback & Review</h2>
              <button
                type="button"
                onClick={() => void generateFeedback()}
                disabled={isGeneratingFeedback || !candidate.interview?.id || !candidate.classification}
                className="w-full mb-4 rounded-lg border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {isGeneratingFeedback ? "Generating..." : "Generate AI Feedback"}
              </button>

              <div className="space-y-3 mb-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">Final Feedback</span>
                  <textarea
                    value={feedbackDraft}
                    onChange={(e) => setFeedbackDraft(e.target.value)}
                    placeholder="Feedback visible to candidate..."
                    className="h-24 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">Admin Comments</span>
                  <textarea
                    value={adminComments}
                    onChange={(e) => setAdminComments(e.target.value)}
                    placeholder="Internal comments..."
                    className="h-20 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">Recommendations</span>
                  <textarea
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    placeholder="Training or next-step recommendations..."
                    className="h-20 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm"
                  />
                </label>
              </div>

              {feedbackStatus && (
                <div className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{feedbackStatus}</div>
              )}
              <button
                type="button"
                onClick={() => void saveFeedback()}
                disabled={isSavingFeedback || !candidate.interview?.id || !candidate.classification}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {isSavingFeedback ? "Saving..." : "Save Final Feedback"}
              </button>
            </div>

            {/* Audit Log */}
            <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4">Audit Log</h2>
              {actions && actions.length > 0 ? (
                <div className="space-y-3 border-l-2 border-border pl-4">
                  {actions.map((a, idx) => (
                    <div key={a.id} className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary" />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground capitalize">
                            {a.action.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">By {a.officerUsername}</p>
                          {a.notes && <p className="text-xs text-foreground mt-1 italic">{a.notes}</p>}
                        </div>
                        <p className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(a.createdAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No actions recorded yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
