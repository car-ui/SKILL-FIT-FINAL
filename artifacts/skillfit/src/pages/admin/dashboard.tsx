import { useGetDashboardStats, useGetStatsByTrade, useGetStatsByDistrict, useGetRecentActivity } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CLASSIFICATION_LABELS } from "@/lib/constants";
import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAdminLanguage } from "@/hooks/use-admin-language";
import { Briefcase, CheckCircle, CheckSquare, Clock, RefreshCw, Users } from "lucide-react";

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";

const CATEGORY_COLORS: Record<string, string> = {
  job_ready: "#16a34a",
  requires_training: "#d97706",
  manual_verification: "#2563eb",
  poor_quality: "#6b7280",
  suspected_duplicate: "#dc2626",
};

interface ReviewQueueItem {
  candidateId: number;
  candidateName: string;
  phone: string;
  trade: string;
  district: string;
  category: string;
  avgScore: number;
  reasoning: string;
  priority: "high" | "medium" | "low";
  interviewId?: number;
  completedAt?: string | null;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [adminLanguage] = useAdminLanguage();
  const { t } = useTranslation(adminLanguage);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: byTrade } = useGetStatsByTrade();
  const { data: byDistrict } = useGetStatsByDistrict();
  const { data: activity } = useGetRecentActivity({ limit: 8 });

  // Fetch review queue
  useEffect(() => {
    const fetchReviewQueue = async () => {
      try {
        const res = await fetch(`${apiBase}/api/stats/review-queue?limit=10`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setReviewQueue(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch review queue", err);
      } finally {
        setReviewLoading(false);
      }
    };
    fetchReviewQueue();
  }, []);

  const classificationData = stats
    ? [
        { name: "Job Ready", value: stats.jobReadyCount, key: "job_ready" },
        { name: "Training", value: stats.requiresTrainingCount, key: "requires_training" },
        { name: "Manual", value: stats.manualVerificationCount, key: "manual_verification" },
        { name: "Poor", value: stats.poorQualityCount, key: "poor_quality" },
        { name: "Duplicate", value: stats.suspectedDuplicateCount, key: "suspected_duplicate" },
      ]
    : [];

  const classificationTotal = classificationData.reduce((sum, item) => sum + item.value, 0);

  const districtRows = [...(byDistrict ?? [])]
    .sort((a: any, b: any) => Number(b.total ?? b.count ?? 0) - Number(a.total ?? a.count ?? 0))
    .slice(0, 8);

  async function quickAction(item: ReviewQueueItem, action: "shortlist" | "request_reinterview") {
    if (action === "request_reinterview") {
      const ok = window.confirm("This will reset the interview and all responses. Are you sure?");
      if (!ok) return;
    }

    await fetch(`${apiBase}/api/admin/actions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: item.candidateId,
        interviewId: item.interviewId ?? null,
        action,
      }),
    });
    setReviewQueue((current) => current.filter((row) => row.candidateId !== item.candidateId));
  }

  function timeAgo(ts: string) {
    if (!ts) return "";
    const time = new Date(ts).getTime();
    if (Number.isNaN(time)) return "";
    const diff = Date.now() - time;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("admin.dashboard")}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{t("admin.overview")}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: t("admin.totalCandidates"), value: stats?.totalCandidates ?? 0, color: "text-foreground", accent: "border-l-slate-500", Icon: Users },
          { label: t("admin.interviewsDone"), value: stats?.completedInterviews ?? 0, color: "text-blue-600", accent: "border-l-blue-500", Icon: CheckSquare },
          { label: t("admin.jobReady"), value: stats?.jobReadyCount ?? 0, color: "text-green-600", accent: "border-l-green-500", Icon: Briefcase },
          { label: t("admin.pendingReview"), value: stats?.pendingReviewCount ?? 0, color: "text-amber-600", accent: "border-l-amber-500", Icon: Clock },
        ].map(({ Icon, ...s }) => (
          <div key={s.label} className={`bg-card border border-l-4 border-card-border ${s.accent} rounded-xl p-3 md:p-4 shadow-sm`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground font-medium line-clamp-1">{s.label}</p>
              <Icon className={`h-4 w-4 ${s.color}`} />
            </div>
            {statsLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-16" />
            ) : (
              <p className={`text-2xl md:text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground mb-4">Pipeline</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
          {[
            ["Total Registered", stats?.totalCandidates ?? 0],
            ["Interviews Done", stats?.completedInterviews ?? 0],
            ["Job Ready", stats?.jobReadyCount ?? 0],
            ["Sent to Training", stats?.requiresTrainingCount ?? 0],
          ].map(([label, value], index) => (
            <>
              <div key={`${label}-box`} className="rounded-lg border border-border bg-muted/40 p-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{Number(value).toLocaleString()}</p>
              </div>
              {index < 3 && <div key={`${label}-arrow`} className="hidden text-center text-muted-foreground md:block">-&gt;</div>}
            </>
          ))}
        </div>
      </div>


      {/* Flagged cases — manual verification, poor quality, suspected duplicate */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("admin.reviewQueue")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("admin.reviewQueueDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin/candidates")}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t("admin.openAllCandidates")} -&gt;
          </button>
        </div>
        {reviewLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : reviewQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No flagged cases in the queue</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {reviewQueue.map((item) => {
              const cls = CLASSIFICATION_LABELS[item.category];
              const pri =
                item.priority === "high"
                  ? "bg-red-100 text-red-800 border-red-200"
                  : item.priority === "medium"
                    ? "bg-amber-100 text-amber-900 border-amber-200"
                    : "bg-[#fffaf2] text-[#68452f] border-[#d9c7ac]";
              return (
                <li key={`${item.candidateId}-${item.interviewId ?? item.completedAt}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/admin/candidates/${item.candidateId}`)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground truncate">{item.candidateName}</span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${pri}`}>
                          {item.priority} priority
                        </span>
                        {cls && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${cls.bg} ${cls.color}`}>
                            {cls.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.trade} · {item.district} · {item.phone}
                      </p>
                      <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{item.reasoning}</p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-foreground tabular-nums">{item.avgScore.toFixed(1)}</span>
                      <span className="text-[10px] text-muted-foreground">avg / 10</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        title="Shortlist"
                        onClick={(event) => {
                          event.stopPropagation();
                          void quickAction(item, "shortlist");
                        }}
                        className="rounded-md border border-green-200 bg-green-50 p-2 text-green-700 hover:bg-green-100"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Request re-interview"
                        onClick={(event) => {
                          event.stopPropagation();
                          void quickAction(item, "request_reinterview");
                        }}
                        className="rounded-md border border-blue-200 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classification breakdown */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("admin.classificationBreakdown")}</h2>
          {classificationTotal > 0 ? (
            <div className="space-y-4">
              <div className="flex h-5 overflow-hidden rounded-full bg-muted">
                {classificationData.map((entry) => (
                  <div
                    key={entry.key}
                    title={`${entry.name}: ${entry.value}`}
                    style={{
                      width: `${Math.max(4, (entry.value / classificationTotal) * 100)}%`,
                      backgroundColor: CATEGORY_COLORS[entry.key],
                    }}
                  />
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {classificationData.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[entry.key] }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>

        {/* By trade */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("admin.candidatesByTrade")}</h2>
          {byTrade && byTrade.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byTrade} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [v, n === "count" ? "Candidates" : "Avg Score"]} />
                <Bar dataKey="total" fill="#7b241c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("admin.recentActivity")}</h2>
          {activity && activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((a: any, i) => {
                const timestamp = a.timestamp ?? a.completedAt ?? a.createdAt;
                const type = a.type ?? (a.action ? "officer_action" : "interview_completed");
                return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    type === "interview_completed" ? "bg-green-500" :
                    type === "candidate_registered" ? "bg-blue-500" : "bg-amber-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.candidateName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.trade} -{" "}
                      {type === "interview_completed" ? `Interview completed - ${(a.classification ?? a.category) ? CLASSIFICATION_LABELS[a.classification ?? a.category]?.label ?? String(a.classification ?? a.category).replace(/_/g, " ") : "pending"}` :
                       type === "candidate_registered" ? "Registered" :
                       a.action ? `Action: ${String(a.action).replace(/_/g, " ")}` : "Activity recorded"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(timestamp)}</span>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No recent activity</p>
          )}
        </div>

        {/* By district */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("admin.topDistricts")}</h2>
          {districtRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-left font-semibold">District</th>
                    <th className="py-2 text-right font-semibold">Candidates</th>
                    <th className="py-2 text-right font-semibold">Avg Score</th>
                    <th className="py-2 text-right font-semibold">Job Ready %</th>
                  </tr>
                </thead>
                <tbody>
                  {districtRows.map((d: any) => {
                    const candidates = Number(d.total ?? d.count ?? 0);
                    const avgScore = Number(d.avgScore ?? d.averageScore ?? 0);
                    const jobReadyPct = Number(d.jobReadyPct ?? d.jobReadyPercent ?? 0);
                    return (
                      <tr key={d.district} className="border-b border-border/60 last:border-0">
                        <td className="py-2 text-foreground">{d.district}</td>
                        <td className="py-2 text-right font-semibold text-foreground">{candidates}</td>
                        <td className="py-2 text-right text-muted-foreground">{avgScore ? avgScore.toFixed(1) : "-"}</td>
                        <td className="py-2 text-right text-muted-foreground">{jobReadyPct ? `${jobReadyPct.toFixed(0)}%` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
