import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import kn from "@/locales/kn.json";

export type LanguageCode = "en" | "hi" | "kn";

type TranslationMessages = {
  [key: string]: string | TranslationMessages;
};

const STATIC_TRANSLATIONS: Record<LanguageCode, TranslationMessages> = {
  en,
  hi,
  kn,
};

function normalizeLanguage(lang: string): LanguageCode {
  return lang === "hi" || lang === "kn" ? lang : "en";
}

function readPath(messages: TranslationMessages, key: string): string | undefined {
  let current: string | TranslationMessages | undefined = messages;
  for (const part of key.split(".")) {
    if (!current || typeof current === "string") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function applyPlaceholders(
  value: string,
  placeholders?: Record<string, string | number>,
) {
  if (!placeholders) return value;
  return Object.entries(placeholders).reduce(
    (next, [key, replacement]) =>
      next.replace(new RegExp(`{${key}}`, "g"), String(replacement)),
    value,
  );
}

export function translate(
  lang: string,
  key: string,
  placeholders?: Record<string, string | number>,
) {
  const language = normalizeLanguage(lang);
  const value =
    readPath(STATIC_TRANSLATIONS[language], key) ??
    readPath(STATIC_TRANSLATIONS.en, key) ??
    key;
  return applyPlaceholders(value, placeholders);
}

export function useTranslation(lang: string) {
  const language = normalizeLanguage(lang);
  return {
    language,
    t: (key: string, placeholders?: Record<string, string | number>) =>
      translate(language, key, placeholders),
  };
}

export const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    start_over: "Start Over",
    session_expired: "Session expired. Please start again.",
    candidate_camera: "Candidate camera",
    make_sure_face_visible: "Make sure your full face is visible before continuing.",
    face_visible: "Face visible",
    face_not_visible: "Face not visible",
    visibility: "visibility",
    checks: "checks",
    questions: "questions",
    live_ai_interviewer: "Live AI interviewer",
    preparing_next_question: "Preparing your next question...",
    captured_answer: "Captured answer",
    paste_disabled: "Paste disabled",
    speak_placeholder: "Speak your answer. If nothing is captured, you can still continue to the next question.",
    listening_recording: "Listening and recording...",
    stop_recording: "Stop Recording",
    start_speaking: "Start Speaking",
    save_and_continue: "Save and Continue",
    submit_interview: "Submit Interview",
    saving: "Saving...",
    camera_too_poor: "Camera visibility is too low. The interview will end if you continue.",
    camera_permission_req: "Camera permission is required for this video assessment.",
    unable_load_next: "Unable to load the next question",
    speech_unavailable: "Speech recognition is unavailable in this browser. Record your video answer and continue.",
    paste_disabled_msg: "Paste is disabled for interview integrity. Please answer in your own voice.",
    could_not_save: "Could not save this response. Please try again.",
    no_clear_response: "No clear response captured.",
    finalising_assessment: "Finalising assessment...",
    saving_response: "Saving response...",
    question_of: "Question {n} of {t}",
  },
  hi: {
    start_over: "फिर से शुरू करें",
    session_expired: "सत्र समाप्त हो गया। कृपया फिर से शुरू करें।",
    candidate_camera: "उम्मीदवार कैमरा",
    make_sure_face_visible: "आगे बढ़ने से पहले सुनिश्चित करें कि आपका पूरा चेहरा दिखाई दे रहा है।",
    face_visible: "चेहरा दिखाई दे रहा है",
    face_not_visible: "चेहरा दिखाई नहीं दे रहा है",
    visibility: "दृश्यता",
    checks: "जाँच",
    questions: "प्रश्न",
    live_ai_interviewer: "लाइव एआई साक्षात्कारकर्ता",
    preparing_next_question: "आपका अगला प्रश्न तैयार किया जा रहा है...",
    captured_answer: "कैप्चर किया गया उत्तर",
    paste_disabled: "पेस्ट अक्षम है",
    speak_placeholder: "अपना उत्तर बोलें। यदि कुछ भी कैप्चर नहीं होता है, तो आप अगले प्रश्न पर जा सकते हैं।",
    listening_recording: "सुन रहे हैं और रिकॉर्ड कर रहे हैं...",
    stop_recording: "रिकॉर्डिंग रोकें",
    start_speaking: "बोलना शुरू करें",
    save_and_continue: "सहेजें और जारी रखें",
    submit_interview: "साक्षात्कार जमा करें",
    saving: "सहेजा जा रहा है...",
    camera_too_poor: "कैमरा दृश्यता बहुत कम है। अगर आप जारी रखते हैं तो साक्षात्कार समाप्त हो जाएगा।",
    camera_permission_req: "इस वीडियो मूल्यांकन के लिए कैमरे की अनुमति आवश्यक है।",
    unable_load_next: "अगला प्रश्न लोड करने में असमर्थ",
    speech_unavailable: "इस ब्राउज़र में भाषण पहचान अनुपलब्ध है। अपना वीडियो उत्तर रिकॉर्ड करें और जारी रखें।",
    paste_disabled_msg: "साक्षात्कार की अखंडता के लिए पेस्ट अक्षम है। कृपया अपनी आवाज़ में उत्तर दें।",
    could_not_save: "यह उत्तर सहेजा नहीं जा सका। कृपया पुनः प्रयास करें।",
    no_clear_response: "कोई स्पष्ट प्रतिक्रिया कैप्चर नहीं की गई।",
    finalising_assessment: "मूल्यांकन को अंतिम रूप दिया जा रहा है...",
    saving_response: "उत्तर सहेजा जा रहा है...",
    question_of: "प्रश्न {n} में से {t}",
  },
  kn: {
    start_over: "ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ",
    session_expired: "ಸೆಷನ್ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ.",
    candidate_camera: "ಅಭ್ಯರ್ಥಿ ಕ್ಯಾಮೆರಾ",
    make_sure_face_visible: "ಮುಂದುವರೆಯುವ ಮುನ್ನ ನಿಮ್ಮ ಮುಖ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣುತ್ತಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.",
    face_visible: "ಮುಖ ಕಾಣುತ್ತಿದೆ",
    face_not_visible: "ಮುಖ ಕಾಣುತ್ತಿಲ್ಲ",
    visibility: "ಗೋಚರತೆ",
    checks: "ತಪಾಸಣೆಗಳು",
    questions: "ಪ್ರಶ್ನೆಗಳು",
    live_ai_interviewer: "ಲೈವ್ ಎಐ ಸಂದರ್ಶಕ",
    preparing_next_question: "ನಿಮ್ಮ ಮುಂದಿನ ಪ್ರಶ್ನೆಯನ್ನು ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...",
    captured_answer: "ಗ್ರಹಿಸಿದ ಉತ್ತರ",
    paste_disabled: "ಅಂಟಿಸುವುದನ್ನು ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ",
    speak_placeholder: "ನಿಮ್ಮ ಉತ್ತರವನ್ನು ಮಾತನಾಡಿ. ಏನೂ ದಾಖಲಾಗದಿದ್ದರೂ, ನೀವು ಮುಂದಿನ ಪ್ರಶ್ನೆಗೆ ಹೋಗಬಹುದು.",
    listening_recording: "ಆಲಿಸುತ್ತಿದೆ ಮತ್ತು ರೆಕಾರ್ಡ್ ಮಾಡುತ್ತಿದೆ...",
    stop_recording: "ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ",
    start_speaking: "ಮಾತನಾಡಲು ಪ್ರಾರಂಭಿಸಿ",
    save_and_continue: "ಉಳಿಸಿ ಮತ್ತು ಮುಂದುವರಿಸಿ",
    submit_interview: "ಸಂದರ್ಶನ ಸಲ್ಲಿಸಿ",
    saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ...",
    camera_too_poor: "ಕ್ಯಾಮೆರಾ ಗೋಚರತೆ ತುಂಬಾ ಕಡಿಮೆಯಾಗಿದೆ. ನೀವು ಮುಂದುವರೆಸಿದರೆ ಸಂದರ್ಶನ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ.",
    camera_permission_req: "ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ.",
    unable_load_next: "ಮುಂದಿನ ಪ್ರಶ್ನೆಯನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ",
    speech_unavailable: "ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಲಭ್ಯವಿಲ್ಲ. ವಿಡಿಯೋ ರೆಕಾರ್ಡ್ ಮಾಡಿ.",
    paste_disabled_msg: "ನಿಮ್ಮ ಸ್ವಂತ ಧ್ವನಿಯಲ್ಲಿ ಉತ್ತರಿಸಿ. ಅಂಟಿಸುವುದನ್ನು ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.",
    could_not_save: "ಉತ್ತರವನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    no_clear_response: "ಸ್ಪಷ್ಟವಾದ ಉತ್ತರ ದಾಖಲಾಗಿಲ್ಲ.",
    finalising_assessment: "ಮೌಲ್ಯಮಾಪನ ಅಂತಿಮಗೊಳಿಸಲಾಗುತ್ತಿದೆ...",
    saving_response: "ಉತ್ತರವನ್ನು ಉಳಿಸಲಾಗುತ್ತಿದೆ...",
    question_of: "ಪ್ರಶ್ನೆ {n} ರ {t}",
  }
};

export function getT(lang: string) {
  const l = TRANSLATIONS[lang] || TRANSLATIONS["en"];
  return (key: keyof typeof TRANSLATIONS["en"], placeholders?: Record<string, string | number>) => {
    let str = l[key] || TRANSLATIONS["en"][key] || key;
    if (placeholders) {
      Object.entries(placeholders).forEach(([k, v]) => {
        str = str.replace(new RegExp(`{${k}}`, "g"), String(v));
      });
    }
    return str as string;
  };
}
