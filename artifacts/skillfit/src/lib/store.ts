// Simple state management via React Context + sessionStorage
// No external state library needed

export interface InterviewState {
  candidateId: number | null;
  userProfileId: number | null;
  candidateName: string;
  language: "kn" | "hi" | "en";
  trade: string;
  district: string;
  interviewId: number | null;
  classification: string | null;
  avgScore: number | null;
  aadhaarMasked?: string;
  mobileNumber?: string;
}

const STORAGE_KEY = "skillfit_state";

export function getState(): InterviewState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InterviewState;
  } catch {}
  return {
    candidateId: null,
    userProfileId: null,
    candidateName: "",
    language: "kn",
    trade: "",
    district: "",
    interviewId: null,
    classification: null,
    avgScore: null,
  };
}

export function setState(partial: Partial<InterviewState>) {
  const current = getState();
  const next = { ...current, ...partial };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearState() {
  sessionStorage.removeItem(STORAGE_KEY);
}
