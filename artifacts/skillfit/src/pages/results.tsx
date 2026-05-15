import { useLocation } from "wouter";
import { CLASSIFICATION_LABELS } from "@/lib/constants";
import { clearState, getState, setState } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";

const ICONS: Record<string, string> = {
  job_ready: "OK",
  requires_training: "*",
  manual_verification: "i",
  poor_quality: "!",
  suspected_duplicate: "!",
};

export default function Results() {
  const [, navigate] = useLocation();
  const state = getState();
  const lang = state.language || "en";
  const { t } = useTranslation(lang);
  const category = state.classification || "manual_verification";
  const avgScore = state.avgScore;

  const textMap = {
    heading: t(`result.${category}.heading`),
    message: t(`result.${category}.message`),
  };
  const classInfo = CLASSIFICATION_LABELS[category] || {
    label: category,
    color: "text-muted-foreground",
    bg: "bg-muted",
  };

  function handleDone() {
    if (state.userProfileId) {
      setState({
        candidateId: null,
        trade: "",
        interviewId: null,
        classification: null,
        avgScore: null,
      });
      navigate("/user/dashboard");
      return;
    }
    clearState();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 overflow-hidden rounded-2xl border border-card-border bg-card shadow-md">
          <div className="bg-primary px-6 py-8 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
              <span className="text-2xl font-bold text-white">{ICONS[category] || "OK"}</span>
            </div>
            <h1 className="mb-1 text-2xl font-bold text-white">{textMap.heading}</h1>
            <p className="text-sm text-white/80">{t("result.assessmentComplete")}</p>
          </div>

          <div className="p-6">
            <div className={`mb-4 inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${classInfo.bg} ${classInfo.color}`}>
              {classInfo.label}
            </div>

            {avgScore !== null && (
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("result.overallScore")}</span>
                  <span className="text-sm font-bold text-foreground">{avgScore.toFixed(1)} / 10</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000"
                    style={{ width: `${(avgScore / 10) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <p className="mb-4 text-sm leading-relaxed text-foreground">{textMap.message}</p>

            <div className="space-y-1 rounded-lg bg-muted p-3">
              {[
                [t("result.name"), state.candidateName],
                [t("result.trade"), state.trade],
                [t("result.district"), state.district],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-xl bg-accent p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("result.note")}</p>
        </div>

        <button
          data-testid="btn-done"
          onClick={handleDone}
          className="w-full rounded-xl bg-primary py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          {t("result.done")}
        </button>
      </div>
    </div>
  );
}
