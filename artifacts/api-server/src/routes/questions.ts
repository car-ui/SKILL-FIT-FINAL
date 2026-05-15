import { Router, type IRouter } from "express";
import { z } from "zod";
import { followUpQuestionLimiter, questionPoolPublicLimiter } from "../middleware/rateLimits";
import { getPoolForTradeAndLanguage } from "../lib/question-bank";
import { generateGeminiJson } from "../lib/gemini";

const router: IRouter = Router();

async function generateFollowUpQuestions(
  trade: string,
  language: string,
  previousTranscript: string
): Promise<string[]> {
  const langMap: Record<string, string> = {
    kn: "Kannada",
    hi: "Hindi",
    en: "English",
  };

  try {
    const prompt = `Generate 2-3 follow-up questions for a ${trade} candidate in ${langMap[language] ?? "English"}.
Previous response: "${previousTranscript.slice(0, 100)}..."
Make follow-ups practical, probing skill depth, handling edge cases, or clarifying experience.
Return ONLY a JSON array of strings:
["Question 1", "Question 2", "Question 3"]`;

    const followUps = await generateGeminiJson<string[]>(prompt);
    return Array.isArray(followUps)
      ? followUps.filter((q) => typeof q === "string" && q.trim().length > 8).slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

/**
 * Public: stable first-N slice of the pool (legacy API, integrations, tooling).
 * Secure candidate flow still uses GET /interviews/:id/questions (random snapshot + server validation).
 */
router.get("/questions", questionPoolPublicLimiter, (req, res) => {
  const trade = req.query["trade"] as string | undefined;
  const language = req.query["language"] as string | undefined;
  const limit = Math.min(10, Math.max(1, parseInt(req.query["limit"] as string || "5", 10)));

  if (!trade || !language) {
    res.status(400).json({ error: "trade and language are required" });
    return;
  }

  const pool = getPoolForTradeAndLanguage(trade, language);
  res.json(
    pool.slice(0, limit).map((q) => ({
      id: q.id,
      text: q.text,
      trade: q.trade,
      language: q.language,
      category: q.category,
    }))
  );
});

router.post("/questions/follow-up", followUpQuestionLimiter, async (req, res) => {
  const schema = z.object({
    trade: z.string(),
    language: z.string(),
    previousTranscript: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  try {
    const followUps = await generateFollowUpQuestions(
      parsed.data.trade,
      parsed.data.language,
      parsed.data.previousTranscript
    );
    res.json({ followUpQuestions: followUps });
  } catch {
    res.status(500).json({ error: "Failed to generate follow-up questions" });
  }
});

export default router;
