import axios from "axios";

// WhatsApp Business API configuration
const WHATSAPP_API_URL = process.env["WHATSAPP_API_URL"] ?? "https://graph.facebook.com/v18.0";
const WHATSAPP_ACCESS_TOKEN = process.env["WHATSAPP_ACCESS_TOKEN"];
const WHATSAPP_PHONE_NUMBER_ID = process.env["WHATSAPP_PHONE_NUMBER_ID"];

export interface WhatsAppMessage {
  to: string;
  body: string;
  language?: string;
}

export class WhatsAppService {
  private axiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: WHATSAPP_API_URL,
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  }

  async sendMessage(message: WhatsAppMessage): Promise<boolean> {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn("WhatsApp not configured, skipping message send");
      return false;
    }

    try {
      const payload = {
        messaging_product: "whatsapp",
        to: message.to,
        type: "text",
        text: {
          body: message.body,
          preview_url: false,
        },
      };

      const response = await this.axiosInstance.post(
        `/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        payload
      );

      return response.status === 200;
    } catch (error) {
      console.error("Failed to send WhatsApp message:", error);
      return false;
    }
  }

  async sendInterviewLink(phoneNumber: string, interviewUrl: string, language: string = "en"): Promise<boolean> {
    const messages = {
      en: `Welcome to AI SkillFit! Click here to start your interview: ${interviewUrl}`,
      kn: `AI SkillFit ಗೆ ಸ್ವಾಗತ! ನಿಮ್ಮ ಸಂದರ್ಶನವನ್ನು ಪ್ರಾರಂಭಿಸಲು ಇಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ: ${interviewUrl}`,
      hi: `AI SkillFit में आपका स्वागत है! अपना साक्षात्कार शुरू करने के लिए यहां क्लिक करें: ${interviewUrl}`,
    };

    const body = messages[language as keyof typeof messages] || messages.en;

    return this.sendMessage({
      to: phoneNumber,
      body,
      language,
    });
  }

  async sendResults(phoneNumber: string, category: string, avgScore: number, language: string = "en"): Promise<boolean> {
    const messages = {
      en: `Your interview is complete! Category: ${category}, Score: ${avgScore.toFixed(1)}/10`,
      kn: `ನಿಮ್ಮ ಸಂದರ್ಶನವು ಪೂರ್ಣಗೊಂಡಿದೆ! ವರ್ಗ: ${category}, ಅಂಕ: ${avgScore.toFixed(1)}/10`,
      hi: `आपका साक्षात्कार पूरा हो गया है! श्रेणी: ${category}, स्कोर: ${avgScore.toFixed(1)}/10`,
    };

    const body = messages[language as keyof typeof messages] || messages.en;

    return this.sendMessage({
      to: phoneNumber,
      body,
      language,
    });
  }
}

export const whatsAppService = new WhatsAppService();