import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useListCandidates, getListCandidatesQueryKey } from "@workspace/api-client-react";
import { CLASSIFICATION_LABELS, TRADES, KARNATAKA_DISTRICTS, LANGUAGES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import { useAdminLanguage } from "@/hooks/use-admin-language";
import { Download } from "lucide-react";

const apiBase =
  (import.meta as unknown as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";

function getInitialColor(name: string): string {
  const colors = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500", "bg-emerald-500", "bg-orange-500", "bg-rose-500", "bg-indigo-500"];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length] || "bg-blue-500";
}

function statusLabel(status?: string | null) {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Not Started";
}

function displayDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getPaginationRange(currentPage: number, pageCount: number) {
  const pages = new Set([1, pageCount]);
  for (let pageNumber = currentPage - 2; pageNumber <= currentPage + 2; pageNumber += 1) {
    if (pageNumber >= 1 && pageNumber <= pageCount) pages.add(pageNumber);
  }
  return [...pages].sort((a, b) => a - b);
}

export default function AdminCandidates() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [trade, setTrade] = useState("all");
  const [district, setDistrict] = useState("all");
  const [language, setLanguage] = useState("all");
  const [classification, setClassification] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adminLanguage] = useAdminLanguage();
  const { t } = useTranslation(adminLanguage);

  const params = {
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(trade !== "all" ? { trade } : {}),
    ...(district !== "all" ? { district } : {}),
    ...(language !== "all" ? { language } : {}),
    ...(classification !== "all" ? { classification } : {}),
  };

  const { data, isLoading, refetch } = useListCandidates(params, {
    query: { queryKey: getListCandidatesQueryKey(params) },
  });

  const activeFilters = [search, trade, district, language, classification].filter(f => f !== "all" && f !== "").length;
  const selectedRows = (data?.candidates ?? []).filter((candidate) => selected.has(candidate.id));

  const handleClearFilters = () => {
    setSearch("");
    setTrade("all");
    setDistrict("all");
    setLanguage("all");
    setClassification("all");
    setPage(1);
  };

  const handleSelectAll = () => {
    if (data?.candidates) {
      const newSelected = new Set(selected);
      if (newSelected.size === data.candidates.length) {
        newSelected.clear();
      } else {
        data.candidates.forEach(c => newSelected.add(c.id));
      }
      setSelected(newSelected);
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const shortlistSelected = async () => {
    try {
      const responses = await Promise.all(
        Array.from(selected).map((candidateId) =>
          fetch(`${apiBase}/api/admin/actions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId, interviewId: null, action: "shortlist", notes: null }),
          }),
        ),
      );

      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => null);
        throw new Error(body?.error || "Could not shortlist selected candidates");
      }

      setSelected(new Set());
      await refetch();
      window.alert("Selected candidates were shortlisted.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not shortlist selected candidates");
    }
  };

  const downloadCsv = (rows: typeof selectedRows, filePrefix: string) => {
    if (rows.length === 0) return;
    const headers = ["Name", "Phone", "Trade", "District", "Language", "Status", "Classification", "Score"];
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...rows.map((candidate) =>
        [
          candidate.name,
          candidate.phone,
          candidate.trade,
          candidate.district,
          candidate.language,
          statusLabel(candidate.interviewStatus),
          candidate.classification ?? "",
          candidate.avgScore ?? "",
        ].map(escapeCsv).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const pageCount = useMemo(() => {
    if (!data) return 0;
    return Math.ceil(data.total / data.limit);
  }, [data]);
  const paginationPages = useMemo(() => getPaginationRange(page, pageCount), [page, pageCount]);
  const canGoPrevious = page > 1;
  const canGoNext = page < pageCount;

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t("admin.candidates")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {data?.total ?? 0} total • {((data as any)?.completedInterviews ?? 0)} completed
          </p>
        </div>
        <button
          onClick={() => downloadCsv(data?.candidates ?? [], "skillfit-candidates")}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition flex items-center gap-2 text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-5 shadow-sm">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input
              placeholder={t("admin.searchPlaceholder")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-full"
            />
            <Select value={trade} onValueChange={(v) => { setTrade(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allTrades")}</SelectItem>
                {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classification} onValueChange={(v) => { setClassification(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allClassifications")}</SelectItem>
                {Object.entries(CLASSIFICATION_LABELS as Record<string, { label: string }>).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={language} onValueChange={(v) => { setLanguage(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allLanguages")}</SelectItem>
                {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={district} onValueChange={(v) => { setDistrict(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="District" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allDistricts")}</SelectItem>
                {KARNATAKA_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activeFilters > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{activeFilters} active filter{activeFilters !== 1 ? "s" : ""}</span>
              <button onClick={handleClearFilters} className="text-xs text-primary hover:underline">Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* Table/Cards Container */}
      <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && data?.candidates && selected.size === data.candidates.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Candidate</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trade</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Classification</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Score</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Last Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.candidates?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {t("admin.noCandidates")}
                  </td>
                </tr>
              ) : (
                data?.candidates?.map((c) => {
                  const cls = c.classification ? CLASSIFICATION_LABELS[c.classification] : null;
                  const lastAction = (c as any).lastAction;
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="w-4 h-4 rounded"
                        />
                      </td>
                      <td className="px-4 py-3" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${getInitialColor(c.trade)} flex items-center justify-center text-white text-xs font-bold`}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground" onClick={() => navigate(`/admin/candidates/${c.id}`)}>{c.trade}</td>
                      <td className="px-4 py-3 text-sm" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${c.interviewStatus === "completed" ? "bg-green-500" : c.interviewStatus === "in_progress" ? "bg-yellow-500" : "bg-gray-300"}`} />
                          <span className="text-xs text-muted-foreground">{statusLabel(c.interviewStatus)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                        {cls ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls.bg} ${cls.color}`}>
                            {cls.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                        {c.avgScore != null ? c.avgScore.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                        {lastAction ? lastAction.action.replace(/_/g, " ") : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-border">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            ))
          ) : data?.candidates?.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">
              {t("admin.noCandidates")}
            </div>
          ) : (
            data?.candidates?.map((c) => {
              const cls = c.classification ? CLASSIFICATION_LABELS[c.classification] : null;
              return (
                <div key={c.id} onClick={() => navigate(`/admin/candidates/${c.id}`)} className="p-4 hover:bg-muted/30 cursor-pointer active:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-10 h-10 rounded-full ${getInitialColor(c.trade)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.trade}</p>
                      </div>
                    </div>
                    {cls && <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium border flex-shrink-0 ${cls.bg} ${cls.color}`}>{cls.label}</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Score</p>
                      <p className="font-medium">{c.avgScore != null ? c.avgScore.toFixed(1) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Status</p>
                      <p className="font-medium">{statusLabel(c.interviewStatus)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Date</p>
                      <p className="font-medium">{displayDate(c.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {data && pageCount > 1 && (
          <div className="flex flex-col gap-3 px-4 py-3 border-t border-border sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
            </p>
            <div className="flex flex-wrap gap-1 items-center">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2.5 py-1.5 text-xs rounded border border-[#d9c7ac] text-[#4a2a18] hover:bg-[#fffaf2] disabled:opacity-40 transition"
              >
                First
              </button>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!canGoPrevious}
                className="px-2.5 py-1.5 text-xs rounded border border-[#d9c7ac] text-[#4a2a18] hover:bg-[#fffaf2] disabled:opacity-40 transition"
              >
                Previous
              </button>
              {paginationPages.map((pageNumber, index) => (
                <span key={pageNumber} className="contents">
                  {index > 0 && pageNumber - paginationPages[index - 1] > 1 && (
                    <span className="px-1 text-xs text-muted-foreground">...</span>
                  )}
                  <button
                    onClick={() => setPage(pageNumber)}
                    aria-current={pageNumber === page ? "page" : undefined}
                    className={`min-w-8 rounded border px-2.5 py-1.5 text-xs font-semibold transition ${
                      pageNumber === page
                        ? "border-[#7b241c] bg-[#7b241c] text-white"
                        : "border-[#d9c7ac] text-[#4a2a18] hover:bg-[#fffaf2]"
                    }`}
                  >
                    {pageNumber}
                  </button>
                </span>
              ))}
              <button
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={!canGoNext}
                className="px-2.5 py-1.5 text-xs rounded border border-[#d9c7ac] text-[#4a2a18] hover:bg-[#fffaf2] disabled:opacity-40 transition"
              >
                Next
              </button>
              <button
                onClick={() => setPage(pageCount)}
                disabled={page === pageCount}
                className="px-2.5 py-1.5 text-xs rounded border border-[#d9c7ac] text-[#4a2a18] hover:bg-[#fffaf2] disabled:opacity-40 transition"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 flex items-center justify-between shadow-lg">
          <p className="text-sm text-muted-foreground">{selected.size} selected</p>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-4 py-2 text-sm rounded border border-border hover:bg-muted transition">
              Clear
            </button>
            <button onClick={() => void shortlistSelected()} className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:opacity-90 transition">
              Shortlist All
            </button>
            <button onClick={() => downloadCsv(selectedRows, "skillfit-selected-candidates")} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:opacity-90 transition">
              Export Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
