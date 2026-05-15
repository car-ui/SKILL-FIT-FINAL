import { GoogleGenAI, Modality } from "@google/genai";

const replitBase = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
const replitKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
const standardKey =
  process.env["GEMINI_API_KEY"] ??
  process.env["GOOGLE_AI_API_KEY"] ??
  process.env["GOOGLE_API_KEY"];

function createClient(): GoogleGenAI {
  if (replitBase && replitKey) {
    return new GoogleGenAI({
      apiKey: replitKey,
      httpOptions: {
        apiVersion: "",
        baseUrl: replitBase,
      },
    });
  }
  if (standardKey) {
    return new GoogleGenAI({ apiKey: standardKey });
  }
  throw new Error(
    "Gemini is not configured. Set AI_INTEGRATIONS_GEMINI_BASE_URL + AI_INTEGRATIONS_GEMINI_API_KEY (Replit), or GEMINI_API_KEY / GOOGLE_AI_API_KEY for the Google AI Studio / Gemini API.",
  );
}

export const ai = createClient();

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
