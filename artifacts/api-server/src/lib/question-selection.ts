import { randomInt } from "node:crypto";
import type { Question, Difficulty } from "./question-bank";
import { getPoolForTradeAndLanguage, getQuestionDifficulty } from "./question-bank";

export type SnapshotQuestion = Pick<Question, "id" | "text" | "category" | "trade" | "language"> & {
  difficulty: Difficulty;
  stage?: string;
};

function shuffleInPlace<T>(items: T[]): T[] {
  const a = items;
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Cryptographically random subset; order also random (reduces “question 1 is always X”). */
export function buildInterviewQuestionSnapshot(
  trade: string,
  language: string,
  count: number
): SnapshotQuestion[] {
  const pool = getPoolForTradeAndLanguage(trade, language);
  const n = Math.min(Math.max(1, count), pool.length);
  const shuffled = shuffleInPlace([...pool]);
  return shuffled.slice(0, n).map((q) => ({
    id: q.id,
    text: q.text,
    category: q.category,
    trade: q.trade,
    language: q.language,
    difficulty: getQuestionDifficulty(q),
  }));
}

function computeResponsePerformance(transcript: string | null | undefined): "strong" | "average" | "weak" {
  if (!transcript || transcript.trim().length === 0) return "weak";
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 18) return "strong";
  if (words >= 8) return "average";
  return "weak";
}

function nextDifficulty(current: Difficulty, performance: "strong" | "average" | "weak"): Difficulty {
  if (current === "easy") {
    return performance === "strong" ? "medium" : "easy";
  }
  if (current === "medium") {
    if (performance === "strong") return "hard";
    if (performance === "weak") return "easy";
    return "medium";
  }
  if (current === "hard") {
    return performance === "weak" ? "medium" : "hard";
  }
  return "medium";
}

function toSnapshotQuestion(q: Question): SnapshotQuestion {
  return {
    id: q.id,
    text: q.text,
    category: q.category,
    trade: q.trade,
    language: q.language,
    difficulty: getQuestionDifficulty(q),
  };
}

export function selectNextInterviewQuestion(
  trade: string,
  language: string,
  usedQuestionIds: Set<string>,
  lastTranscript: string | null | undefined,
  lastQuestionId?: string,
): SnapshotQuestion | null {
  const pool = getPoolForTradeAndLanguage(trade, language);
  const remaining = pool.filter((q) => !usedQuestionIds.has(q.id));
  if (remaining.length === 0) return null;

  const performance = computeResponsePerformance(lastTranscript);
  let desired: Difficulty = "easy";

  if (lastQuestionId) {
    const lastQuestion = pool.find((q) => q.id === lastQuestionId);
    const lastDifficulty = lastQuestion ? getQuestionDifficulty(lastQuestion) : "medium";
    desired = nextDifficulty(lastDifficulty, performance);
  }

  const byDifficulty = remaining.filter((q) => getQuestionDifficulty(q) === desired);
  if (byDifficulty.length > 0) {
    return toSnapshotQuestion(shuffleInPlace(byDifficulty)[0]);
  }

  const fallbackPool = remaining.filter((q) => getQuestionDifficulty(q) !== desired);
  if (fallbackPool.length > 0) {
    return toSnapshotQuestion(shuffleInPlace(fallbackPool)[0]);
  }

  return toSnapshotQuestion(shuffleInPlace(remaining)[0]);
}

export function selectNextInterviewQuestionFromSnapshot(
  snapshot: SnapshotQuestion[],
  usedQuestionIds: Set<string>,
  lastTranscript: string | null | undefined,
  lastQuestionId?: string,
): SnapshotQuestion | null {
  const remaining = snapshot.filter((q) => !usedQuestionIds.has(q.id));
  if (remaining.length === 0) return null;

  const performance = computeResponsePerformance(lastTranscript);
  let desired: Difficulty = "easy";

  if (lastQuestionId) {
    const lastQuestion = snapshot.find((q) => q.id === lastQuestionId);
    const lastDifficulty = lastQuestion ? lastQuestion.difficulty : "medium";
    desired = nextDifficulty(lastDifficulty, performance);
  }

  const byDifficulty = remaining.filter((q) => q.difficulty === desired);
  if (byDifficulty.length > 0) {
    return shuffleInPlace(byDifficulty)[0];
  }

  const fallbackPool = remaining.filter((q) => q.difficulty !== desired);
  if (fallbackPool.length > 0) {
    return shuffleInPlace(fallbackPool)[0];
  }

  return shuffleInPlace(remaining)[0];
}

export function parseQuestionSnapshot(json: string | null | undefined): SnapshotQuestion[] | null {
  if (!json || json.trim() === "") return null;
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return null;
    return data as SnapshotQuestion[];
  } catch {
    return null;
  }
}

export function snapshotContainsQuestionId(snapshot: SnapshotQuestion[], questionId: string): SnapshotQuestion | null {
  return snapshot.find((q) => q.id === questionId) ?? null;
}
