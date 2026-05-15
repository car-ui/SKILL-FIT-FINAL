/**
 * Large, multilingual question pool. Candidates never receive a fixed slice:
 * the server picks a random subset per interview and stores it in question_snapshot.
 */

export interface Question {
  id: string;
  text: string;
  trade: string;
  language: string;
  category: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export function getQuestionDifficulty(question: Question): Difficulty {
  switch (question.category) {
    case "experience":
    case "career":
    case "safety":
      return "easy";
    case "skill":
      return "medium";
    default:
      return "hard";
  }
}

const CORE: Question[] = [
  // Welder — Kannada
  { id: "w-kn-1", trade: "Welder", language: "kn", category: "experience", text: "ನೀವು ಎಷ್ಟು ವರ್ಷಗಳಿಂದ ವೆಲ್ಡಿಂಗ್ ಮಾಡುತ್ತಿದ್ದೀರಿ ಮತ್ತು ಯಾವ ರೀತಿಯ ವೆಲ್ಡಿಂಗ್ ಮಾಡಿದ್ದೀರಿ?" },
  { id: "w-kn-2", trade: "Welder", language: "kn", category: "safety", text: "ವೆಲ್ಡಿಂಗ್ ಮಾಡುವಾಗ ಯಾವ ಸುರಕ್ಷತಾ ಸಾಧನಗಳನ್ನು ಬಳಸುತ್ತೀರಿ?" },
  { id: "w-kn-3", trade: "Welder", language: "kn", category: "skill", text: "ಮಿಗ್ ಮತ್ತು ಟಿಗ್ ವೆಲ್ಡಿಂಗ್ ನಡುವಿನ ವ್ಯತ್ಯಾಸ ಏನು?" },
  { id: "w-kn-4", trade: "Welder", language: "kn", category: "situation", text: "ವೆಲ್ಡ್ ಮಾಡಿದ ನಂತರ ಜಂಟಿ ದೋಷಪೂರಿತವಾಗಿದ್ದರೆ ಏನು ಮಾಡುತ್ತೀರಿ?" },
  { id: "w-kn-5", trade: "Welder", language: "kn", category: "career", text: "ನೀವು ಈ ಕೆಲಸ ಏಕೆ ಬಯಸುತ್ತಿದ್ದೀರಿ?" },
  { id: "w-kn-6", trade: "Welder", language: "kn", category: "skill", text: "ಸ್ಟೀಲ್ ಮತ್ತು ಅಲುಮಿನಿಯಂ ವೆಲ್ಡಿಂಗ್ ನಲ್ಲಿ ಯಾವ ವ್ಯತ್ಯಾಸ ಇದೆ?" },
  { id: "w-kn-7", trade: "Welder", language: "kn", category: "situation", text: "ಕಷ್ಟಕರ ವೆಲ್ಡಿಂಗ್ ಕೆಲಸಗಳನ್ನು ನಿಭಾಯಿಸುವುದು ಹೇಗೆ?" },
  { id: "w-hi-1", trade: "Welder", language: "hi", category: "experience", text: "आप कितने सालों से वेल्डिंग कर रहे हैं और किस प्रकार की वेल्डिंग की है?" },
  { id: "w-hi-2", trade: "Welder", language: "hi", category: "safety", text: "वेल्डिंग करते समय आप कौन से सुरक्षा उपकरण उपयोग करते हैं?" },
  { id: "w-hi-3", trade: "Welder", language: "hi", category: "skill", text: "MIG और TIG वेल्डिंग में क्या अंतर है?" },
  { id: "w-hi-4", trade: "Welder", language: "hi", category: "situation", text: "अगर वेल्ड जोड़ में दोष आ जाए तो आप क्या करेंगे?" },
  { id: "w-hi-5", trade: "Welder", language: "hi", category: "career", text: "आप यह नौकरी क्यों चाहते हैं?" },
  { id: "w-hi-6", trade: "Welder", language: "hi", category: "skill", text: "स्टील और एल्यूमीनियम वेल्डिंग में क्या अंतर है?" },
  { id: "w-hi-7", trade: "Welder", language: "hi", category: "situation", text: "मुश्किल वेल्डिंग कामों को कैसे संभालते हैं?" },
  { id: "w-en-1", trade: "Welder", language: "en", category: "experience", text: "How many years have you been welding and what types of welding have you done?" },
  { id: "w-en-2", trade: "Welder", language: "en", category: "safety", text: "What safety equipment do you use while welding?" },
  { id: "w-en-3", trade: "Welder", language: "en", category: "skill", text: "What is the difference between MIG and TIG welding?" },
  { id: "w-en-4", trade: "Welder", language: "en", category: "situation", text: "What do you do if a weld joint has defects?" },
  { id: "w-en-5", trade: "Welder", language: "en", category: "career", text: "Why do you want this job?" },
  { id: "w-en-6", trade: "Welder", language: "en", category: "skill", text: "What is the difference between steel and aluminum welding?" },
  { id: "w-en-7", trade: "Welder", language: "en", category: "situation", text: "How do you handle difficult welding tasks?" },
  { id: "e-kn-1", trade: "Electrician", language: "kn", category: "experience", text: "ನೀವು ಎಷ್ಟು ವರ್ಷಗಳಿಂದ ವಿದ್ಯುತ್ ಕೆಲಸ ಮಾಡುತ್ತಿದ್ದೀರಿ?" },
  { id: "e-kn-2", trade: "Electrician", language: "kn", category: "safety", text: "ವಿದ್ಯುತ್ ಕೆಲಸ ಮಾಡುವಾಗ ಯಾವ ಸುರಕ್ಷತಾ ನಿಯಮಗಳನ್ನು ಪಾಲಿಸುತ್ತೀರಿ?" },
  { id: "e-kn-3", trade: "Electrician", language: "kn", category: "skill", text: "MCB ಮತ್ತು ELCB ನಡುವಿನ ವ್ಯತ್ಯಾಸ ಏನು?" },
  { id: "e-kn-4", trade: "Electrician", language: "kn", category: "situation", text: "ವಿದ್ಯುತ್ ಶಾರ್ಟ್ ಸರ್ಕ್ಯೂಟ್ ಆದರೆ ಏನು ಮಾಡುತ್ತೀರಿ?" },
  { id: "e-kn-5", trade: "Electrician", language: "kn", category: "career", text: "ನೀವು ಯಾಕೆ ಈ ಕ್ಷೇತ್ರ ಆರಿಸಿಕೊಂಡಿರಿ?" },
  { id: "e-kn-6", trade: "Electrician", language: "kn", category: "skill", text: "AC ಮತ್ತು DC ವಿದ್ಯುತ್ ನಲ್ಲಿನ ಭೇದವೇನು?" },
  { id: "e-hi-1", trade: "Electrician", language: "hi", category: "experience", text: "आप कितने सालों से इलेक्ट्रिकल काम कर रहे हैं?" },
  { id: "e-hi-2", trade: "Electrician", language: "hi", category: "safety", text: "बिजली का काम करते समय आप कौन से सुरक्षा नियमों का पालन करते हैं?" },
  { id: "e-hi-3", trade: "Electrician", language: "hi", category: "skill", text: "MCB और ELCB में क्या अंतर है?" },
  { id: "e-hi-4", trade: "Electrician", language: "hi", category: "situation", text: "शॉर्ट सर्किट होने पर आप क्या करेंगे?" },
  { id: "e-hi-5", trade: "Electrician", language: "hi", category: "career", text: "आपने यह ट्रेड क्यों चुना?" },
  { id: "e-hi-6", trade: "Electrician", language: "hi", category: "skill", text: "AC और DC विद्युत में क्या अंतर है?" },
  { id: "e-en-1", trade: "Electrician", language: "en", category: "experience", text: "How many years of electrical work experience do you have?" },
  { id: "e-en-2", trade: "Electrician", language: "en", category: "safety", text: "What safety precautions do you follow while doing electrical work?" },
  { id: "e-en-3", trade: "Electrician", language: "en", category: "skill", text: "What is the difference between MCB and ELCB?" },
  { id: "e-en-4", trade: "Electrician", language: "en", category: "situation", text: "What would you do if a short circuit occurs?" },
  { id: "e-en-5", trade: "Electrician", language: "en", category: "career", text: "Why did you choose this trade?" },
  { id: "e-en-6", trade: "Electrician", language: "en", category: "skill", text: "What is the difference between AC and DC electricity?" },
  { id: "c-kn-1", trade: "Carpenter", language: "kn", category: "experience", text: "ನೀವು ಎಷ್ಟು ವರ್ಷಗಳಿಂದ ಮರಗೆಲಸ ಮಾಡುತ್ತಿದ್ದೀರಿ?" },
  { id: "c-kn-2", trade: "Carpenter", language: "kn", category: "skill", text: "ಯಾವ ರೀತಿಯ ಮರಗಳನ್ನು ನೀವು ಬಳಸಿದ್ದೀರಿ?" },
  { id: "c-kn-3", trade: "Carpenter", language: "kn", category: "safety", text: "ಮರಗೆಲಸ ಮಾಡುವಾಗ ಯಾವ ಸುರಕ್ಷತಾ ಕ್ರಮಗಳನ್ನು ಅನುಸರಿಸುತ್ತೀರಿ?" },
  { id: "c-kn-4", trade: "Carpenter", language: "kn", category: "situation", text: "ಗ್ರಾಹಕರು ಕೆಲಸ ತೃಪ್ತಿಯಾಗಿಲ್ಲ ಎಂದರೆ ಏನು ಮಾಡುತ್ತೀರಿ?" },
  { id: "c-kn-5", trade: "Carpenter", language: "kn", category: "career", text: "ನೀವು ಮರಗೆಲಸ ಏಕೆ ಆಯ್ಕೆ ಮಾಡಿಕೊಂಡಿರಿ?" },
  { id: "c-en-1", trade: "Carpenter", language: "en", category: "experience", text: "How many years of carpentry experience do you have?" },
  { id: "c-en-2", trade: "Carpenter", language: "en", category: "skill", text: "What types of wood and furniture have you worked on?" },
  { id: "c-en-3", trade: "Carpenter", language: "en", category: "safety", text: "What safety measures do you follow while doing carpentry work?" },
  { id: "c-en-4", trade: "Carpenter", language: "en", category: "situation", text: "How do you handle a dissatisfied customer?" },
  { id: "c-en-5", trade: "Carpenter", language: "en", category: "career", text: "Why did you choose carpentry as your trade?" },
  { id: "c-hi-1", trade: "Carpenter", language: "hi", category: "experience", text: "आप कितने सालों से बढ़ईगीरी का काम कर रहे हैं?" },
  { id: "c-hi-2", trade: "Carpenter", language: "hi", category: "skill", text: "आपने किस प्रकार की लकड़ी और फर्नीचर पर काम किया है?" },
  { id: "c-hi-3", trade: "Carpenter", language: "hi", category: "safety", text: "बढ़ईगीरी करते समय आप कौन से सुरक्षा उपाय करते हैं?" },
  { id: "c-hi-4", trade: "Carpenter", language: "hi", category: "situation", text: "अगर ग्राहक काम से खुश न हो तो आप क्या करते हैं?" },
  { id: "c-hi-5", trade: "Carpenter", language: "hi", category: "career", text: "आपने बढ़ईगीरी ट्रेड क्यों चुना?" },
  { id: "p-kn-1", trade: "Plumber", language: "kn", category: "experience", text: "ನೀವು ಎಷ್ಟು ವರ್ಷಗಳಿಂದ ಪ್ಲಂಬಿಂಗ್ ಕೆಲಸ ಮಾಡುತ್ತಿದ್ದೀರಿ?" },
  { id: "p-kn-2", trade: "Plumber", language: "kn", category: "skill", text: "ಯಾವ ರೀತಿಯ ಪೈಪ್‌ಗಳನ್ನು ಬಳಸಿದ್ದೀರಿ?" },
  { id: "p-kn-3", trade: "Plumber", language: "kn", category: "safety", text: "ಪ್ಲಂಬಿಂಗ್ ಕೆಲಸ ಮಾಡುವಾಗ ಯಾವ ಸುರಕ್ಷತಾ ಕ್ರಮಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಿ?" },
  { id: "p-kn-4", trade: "Plumber", language: "kn", category: "situation", text: "ತೀವ್ರ ನೀರಿನ ಸೋರಿಕೆ ತಡೆಯಲು ಮೊದಲು ಏನು ಮಾಡುತ್ತೀರಿ?" },
  { id: "p-kn-5", trade: "Plumber", language: "kn", category: "career", text: "ನೀವು ಪ್ಲಂಬಿಂಗ್ ಕ್ಷೇತ್ರ ಏಕೆ ಆಯ್ಕೆ ಮಾಡಿಕೊಂಡಿರಿ?" },
  { id: "p-en-1", trade: "Plumber", language: "en", category: "experience", text: "How many years of plumbing experience do you have?" },
  { id: "p-en-2", trade: "Plumber", language: "en", category: "skill", text: "What types of pipes and fittings have you worked with?" },
  { id: "p-en-3", trade: "Plumber", language: "en", category: "safety", text: "What safety precautions do you take during plumbing work?" },
  { id: "p-en-4", trade: "Plumber", language: "en", category: "situation", text: "What is the first thing you do when there is a major water leak?" },
  { id: "p-en-5", trade: "Plumber", language: "en", category: "career", text: "Why did you choose plumbing as your trade?" },
  { id: "p-hi-1", trade: "Plumber", language: "hi", category: "experience", text: "आप कितने सालों से प्लंबिंग का काम कर रहे हैं?" },
  { id: "p-hi-2", trade: "Plumber", language: "hi", category: "skill", text: "आपने किस प्रकार की पाइप और फिटिंग पर काम किया है?" },
  { id: "p-hi-3", trade: "Plumber", language: "hi", category: "safety", text: "प्लंबिंग करते समय आप कौन से सुरक्षा उपाय करते हैं?" },
  { id: "p-hi-4", trade: "Plumber", language: "hi", category: "situation", text: "बड़े पानी के रिसाव पर आप सबसे पहले क्या करते हैं?" },
  { id: "p-hi-5", trade: "Plumber", language: "hi", category: "career", text: "आपने प्लंबिंग ट्रेड क्यों चुना?" },
];

/** Alternate phrasings — same skills, different wording, to reduce answer-sharing */
const EXTRA: Question[] = [
  { id: "w-kn-x1", trade: "Welder", language: "kn", category: "experience", text: "ವೆಲ್ಡರ್ ಕೆಲಸದಲ್ಲಿ ನಿಮ್ಮ ಪ್ರಾಯೋಗಿಕ ಅನುಭವವನ್ನು ಹೇಳಿ." },
  { id: "w-kn-x2", trade: "Welder", language: "kn", category: "safety", text: "ಉಷ್ಣ ಮತ್ತು ಕಣಗಳಿಂದ ರಕ್ಷಣೆಗೆ ಏನು ಧರಿಸುತ್ತೀರಿ?" },
  { id: "w-kn-x3", trade: "Welder", language: "kn", category: "skill", text: "ಆರ್ಕ್ ವೆಲ್ಡಿಂಗ್‌ನಲ್ಲಿ ಎಲೆಕ್ಟ್ರೋಡ್ ಆಯ್ಕೆ ಹೇಗೆ ಮಾಡುತ್ತೀರಿ?" },
  { id: "w-kn-x4", trade: "Welder", language: "kn", category: "situation", text: "ವೆಲ್ಡ್ ಪೊರೆ ಕೆಟ್ಟಿದ್ದರೆ ಮರುಪ್ರಯತ್ನದ ಹಂತಗಳೇನು?" },
  { id: "w-hi-x1", trade: "Welder", language: "hi", category: "experience", text: "वेल्डिंग में आपका व्यावहारिक अनुभव कैसा रहा है?" },
  { id: "w-hi-x2", trade: "Welder", language: "hi", category: "safety", text: "धुएँ और चिंगारी से बचाव के लिए आप क्या करते हैं?" },
  { id: "w-hi-x3", trade: "Welder", language: "hi", category: "skill", text: "आर्क वेल्डिंग में इलेक्ट्रोड चुनने का तरीका बताएँ।" },
  { id: "w-hi-x4", trade: "Welder", language: "hi", category: "situation", text: "खराब वेल्ड सीम को ठीक करने की प्रक्रिया क्या है?" },
  { id: "w-en-x1", trade: "Welder", language: "en", category: "experience", text: "Describe hands-on projects you have welded in the last few years." },
  { id: "w-en-x2", trade: "Welder", language: "en", category: "safety", text: "How do you protect your eyes and lungs during welding?" },
  { id: "w-en-x3", trade: "Welder", language: "en", category: "skill", text: "When would you choose stick welding over MIG?" },
  { id: "w-en-x4", trade: "Welder", language: "en", category: "situation", text: "Walk through how you inspect a finished weld." },
  { id: "e-kn-x1", trade: "Electrician", language: "kn", category: "experience", text: "ಮನೆ ಮತ್ತು ಔದ್ಯೋಗಿಕ ವೈರಿಂಗ್ ನಡುವೆ ಏನು ಬದಲಾವಣೆ?" },
  { id: "e-kn-x2", trade: "Electrician", language: "kn", category: "safety", text: "ಲೈವ್ ವೈರ್ ಮೇಲೆ ಕೆಲಸ ಮಾಡುವ ಮೊದಲು ಏನು ಪರಿಶೀಲಿಸುತ್ತೀರಿ?" },
  { id: "e-kn-x3", trade: "Electrician", language: "kn", category: "skill", text: "ಅರ್ಥಿಂಗ್ ಏಕೆ ಮುಖ್ಯ?" },
  { id: "e-kn-x4", trade: "Electrician", language: "kn", category: "situation", text: "ಸರ್ಕ್ಯೂಟ್ ಓವರ್ಲೋಡ್ ಆದಾಗ ಏನು ಮಾಡುತ್ತೀರಿ?" },
  { id: "e-hi-x1", trade: "Electrician", language: "hi", category: "experience", text: "घरेलू और औद्योगिक वायरिंग में क्या अंतर है?" },
  { id: "e-hi-x2", trade: "Electrician", language: "hi", category: "safety", text: "लाइव वायर पर काम से पहले क्या जाँच करते हैं?" },
  { id: "e-hi-x3", trade: "Electrician", language: "hi", category: "skill", text: "अर्थिंग क्यों ज़रूरी है?" },
  { id: "e-hi-x4", trade: "Electrician", language: "hi", category: "situation", text: "सर्किट ओवरलोड हो तो आपका कदम क्या होगा?" },
  { id: "e-en-x1", trade: "Electrician", language: "en", category: "experience", text: "What kinds of panels and loads have you wired?" },
  { id: "e-en-x2", trade: "Electrician", language: "en", category: "safety", text: "How do you verify a circuit is dead before touching conductors?" },
  { id: "e-en-x3", trade: "Electrician", language: "en", category: "skill", text: "Explain single-phase vs three-phase in simple terms." },
  { id: "e-en-x4", trade: "Electrician", language: "en", category: "situation", text: "A breaker trips repeatedly—how do you troubleshoot?" },
  { id: "c-kn-x1", trade: "Carpenter", language: "kn", category: "experience", text: "ದ್ವಾರ, ಕಿಟಕಿ, ಅಲಮಾರಿ — ಯಾವುದರಲ್ಲಿ ಹೆಚ್ಚು ಅನುಭವ?" },
  { id: "c-kn-x2", trade: "Carpenter", language: "kn", category: "skill", text: "ಮರದ ತೇವಾಂಶ ಪರಿಶೀಲಿಸುವುದು ಹೇಗೆ?" },
  { id: "c-kn-x3", trade: "Carpenter", language: "kn", category: "safety", text: "ವಿದ್ಯುತ್ ಸಾಧನಗಳನ್ನು ಮರಗೆಲಸದಲ್ಲಿ ಬಳಸುವಾಗ ಏನು ಎಚ್ಚರಿಕೆ?" },
  { id: "c-kn-x4", trade: "Carpenter", language: "kn", category: "situation", text: "ಕೊಳವೆ ಅಳತೆ ತಪ್ಪಾದರೆ ಹೇಗೆ ಸರಿಪಡಿಸುತ್ತೀರಿ?" },
  { id: "c-hi-x1", trade: "Carpenter", language: "hi", category: "experience", text: "दरवाज़े, खिड़कियाँ, अलमारी — किस पर ज़्यादा काम किया?" },
  { id: "c-hi-x2", trade: "Carpenter", language: "hi", category: "skill", text: "लकड़ी की नमी कैसे जाँचते हैं?" },
  { id: "c-hi-x3", trade: "Carpenter", language: "hi", category: "safety", text: "बिजली के औजारों से बढ़ईगीरी में क्या सावधानी?" },
  { id: "c-hi-x4", trade: "Carpenter", language: "hi", category: "situation", text: "गलत नाप पर कटिंग हो जाए तो क्या करेंगे?" },
  { id: "c-en-x1", trade: "Carpenter", language: "en", category: "experience", text: "Which joinery techniques do you use most often?" },
  { id: "c-en-x2", trade: "Carpenter", language: "en", category: "skill", text: "How do you choose fasteners for outdoor woodwork?" },
  { id: "c-en-x3", trade: "Carpenter", language: "en", category: "safety", text: "What PPE do you use with power saws?" },
  { id: "c-en-x4", trade: "Carpenter", language: "en", category: "situation", text: "A frame is out of square—how do you correct it?" },
  { id: "p-kn-x1", trade: "Plumber", language: "kn", category: "experience", text: "PVC ಮತ್ತು CPVC ನಡುವಿನ ಉಪಯೋಗದ ಭೇದ?" },
  { id: "p-kn-x2", trade: "Plumber", language: "kn", category: "skill", text: "ನೀರಿನ ಒತ್ತಡ ಕಡಿಮೆಯಾದಾಗ ಏನು ಪರಿಶೀಲಿಸುತ್ತೀರಿ?" },
  { id: "p-kn-x3", trade: "Plumber", language: "kn", category: "safety", text: "ಅಡಿಚರಂಡಿಯಲ್ಲಿ ವಾಸನೆ ಬಂದರೆ ಮೊದಲು ಏನು?" },
  { id: "p-kn-x4", trade: "Plumber", language: "kn", category: "situation", text: "ಅಡಗಿಸಿದ ಪೈಪ್ ಸೋರಿಕೆ ಹೇಗೆ ಪತ್ತೆ?" },
  { id: "p-hi-x1", trade: "Plumber", language: "hi", category: "experience", text: "PVC और CPVC के उपयोग में क्या अंतर है?" },
  { id: "p-hi-x2", trade: "Plumber", language: "hi", category: "skill", text: "पानी का दबाव कम हो तो क्या जाँचेंगे?" },
  { id: "p-hi-x3", trade: "Plumber", language: "hi", category: "safety", text: "ड्रेनेज से गंध आए तो पहला कदम?" },
  { id: "p-hi-x4", trade: "Plumber", language: "hi", category: "situation", text: "छिपी पाइप लीक कैसे ढूँढते हैं?" },
  { id: "p-en-x1", trade: "Plumber", language: "en", category: "experience", text: "What drain-cleaning methods have you used?" },
  { id: "p-en-x2", trade: "Plumber", language: "en", category: "skill", text: "How do you solder copper safely?" },
  { id: "p-en-x3", trade: "Plumber", language: "en", category: "safety", text: "How do you ventilate when working on sewer lines?" },
  { id: "p-en-x4", trade: "Plumber", language: "en", category: "situation", text: "Low water pressure at one fixture only—what do you check?" },
];

/** Fallback pool for trades without a dedicated bank — remapped to candidate trade at selection time */
const GENERIC: Question[] = [
  { id: "g-kn-1", trade: "__generic__", language: "kn", category: "experience", text: "ಈ ಕೆಲಸದಲ್ಲಿ ನಿಮ್ಮ ಅನುಭವದ ಸಂಕ್ಷಿಪ್ತ ವಿವರಣೆ ನೀಡಿ." },
  { id: "g-kn-2", trade: "__generic__", language: "kn", category: "safety", text: "ಕೆಲಸದ ಸ್ಥಳದಲ್ಲಿ ಸುರಕ್ಷತೆಗೆ ನೀವು ಮಾಡುವ ಕ್ರಮಗಳೇನು?" },
  { id: "g-kn-3", trade: "__generic__", language: "kn", category: "skill", text: "ನಿಮ್ಮ ವೃತ್ತಿಯಲ್ಲಿ ಬಳಸುವ ಮುಖ್ಯ ಉಪಕರಣಗಳು ಯಾವುವು?" },
  { id: "g-kn-4", trade: "__generic__", language: "kn", category: "situation", text: "ಅನಿರೀಕ್ಷಿತ ಸಮಸ್ಯೆ ಬಂದಾಗ ನೀವು ಹೇಗೆ ಸಮಸ್ಯೆಯನ್ನು ಬಗೆಹರಿಸುತ್ತೀರಿ?" },
  { id: "g-kn-5", trade: "__generic__", language: "kn", category: "career", text: "ಈ ಉದ್ಯೋಗವನ್ನು ಏಕೆ ಬಯಸುತ್ತೀರಿ?" },
  { id: "g-kn-6", trade: "__generic__", language: "kn", category: "skill", text: "ಗುಣಮಟ್ಟ ಪರಿಶೀಲನೆ ಹೇಗೆ ಮಾಡುತ್ತೀರಿ?" },
  { id: "g-hi-1", trade: "__generic__", language: "hi", category: "experience", text: "इस काम में आपका अनुभव संक्षेप में बताएँ।" },
  { id: "g-hi-2", trade: "__generic__", language: "hi", category: "safety", text: "साइट पर सुरक्षा के लिए आप क्या करते हैं?" },
  { id: "g-hi-3", trade: "__generic__", language: "hi", category: "skill", text: "आप अपने ट्रेड में कौन से मुख्य औज़ार इस्तेमाल करते हैं?" },
  { id: "g-hi-4", trade: "__generic__", language: "hi", category: "situation", text: "अचानक समस्या आए तो आप कैसे काम करते हैं?" },
  { id: "g-hi-5", trade: "__generic__", language: "hi", category: "career", text: "यह नौकरी आप क्यों चाहते हैं?" },
  { id: "g-hi-6", trade: "__generic__", language: "hi", category: "skill", text: "गुणवत्ता जाँच कैसे करते हैं?" },
  { id: "g-en-1", trade: "__generic__", language: "en", category: "experience", text: "Summarize your hands-on experience in this trade." },
  { id: "g-en-2", trade: "__generic__", language: "en", category: "safety", text: "What safety steps do you take before starting a job?" },
  { id: "g-en-3", trade: "__generic__", language: "en", category: "skill", text: "Which tools or machines do you use most in this role?" },
  { id: "g-en-4", trade: "__generic__", language: "en", category: "situation", text: "Describe how you troubleshoot when something goes wrong on site." },
  { id: "g-en-5", trade: "__generic__", language: "en", category: "career", text: "What motivates you to work in this field?" },
  { id: "g-en-6", trade: "__generic__", language: "en", category: "skill", text: "How do you check your own work quality before handover?" },
];

export const ALL_QUESTIONS: Question[] = [...CORE, ...EXTRA, ...GENERIC];

export const GENERIC_TRADE = "__generic__";

export function getPoolForTradeAndLanguage(trade: string, language: string): Question[] {
  const t = trade.trim();
  const lang = language === "kn" || language === "hi" ? language : "en";

  let pool = ALL_QUESTIONS.filter((q) => q.trade === t && q.language === lang);
  if (pool.length < 8) {
    pool = ALL_QUESTIONS.filter((q) => q.trade === t && q.language === "en");
  }
  if (pool.length < 6) {
    const g = ALL_QUESTIONS.filter((q) => q.trade === GENERIC_TRADE && (q.language === lang || q.language === "en"));
    const langPool = g.filter((q) => q.language === lang);
    const use = langPool.length >= 6 ? langPool : g.filter((q) => q.language === "en");
    pool = use.map((q) => ({
      ...q,
      trade: t,
      id: `gen-${t.replace(/\s+/g, "-").slice(0, 40)}-${q.id}-${lang}`,
    }));
  }
  return pool;
}
