import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useClassifyInterview,
  useCompleteInterview,
  useSubmitResponse,
} from "@workspace/api-client-react";
import { SPEECH_LANG_MAP } from "@/lib/constants";
import { getState, setState } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { getT } from "@/lib/i18n";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognitionInstance };
    webkitSpeechRecognition: { new (): SpeechRecognitionInstance };
  }
}

type InterviewQuestion = {
  id: string;
  text: string;
  trade: string;
  language: string;
  category: string;
  difficulty?: "easy" | "medium" | "hard";
};

const TTS_LANG: Record<string, string> = {
  kn: "kn-IN",
  hi: "hi-IN",
  en: "en-IN",
};
const INTERVIEW_QUESTION_LIMIT = 5;

async function transcribeWithGroq(videoBlob: Blob, language: string): Promise<string | null> {
  try {
    const apiBase = (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";
    const formData = new FormData();
    formData.append("audio", videoBlob, "recording.webm");
    formData.append("language", language);

    const response = await fetch(`${apiBase}/api/transcribe`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) return null;
    const data = await response.json() as { transcript?: string };
    return data.transcript ?? null;
  } catch {
    return null;
  }
}

async function uploadVideo(videoBlob: Blob, interviewId: number, questionId: string): Promise<string | null> {
  try {
    const fileName = `${interviewId}/${questionId}-${Date.now()}.webm`;
    const { error } = await supabase.storage
      .from("videos")
      .upload(fileName, videoBlob, {
        contentType: "video/webm",
        upsert: false,
      });

    if (error) throw error;
    const { data } = supabase.storage.from("videos").getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export default function Interview() {
  const [, navigate] = useLocation();
  const state = getState();
  const lang = state.language || "en";
  const interviewId = state.interviewId;
  const t = getT(lang);

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(INTERVIEW_QUESTION_LIMIT);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("");
  const [notice, setNotice] = useState(t("make_sure_face_visible"));

  const [faceDetected, setFaceDetected] = useState(false);
  const [facePct, setFacePct] = useState(0);
  const [faceChecks, setFaceChecks] = useState({ with: 0, total: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submitResponseMutation = useSubmitResponse();
  const completeInterviewMutation = useCompleteInterview();
  const classifyMutation = useClassifyInterview();

  const currentQuestion = questions[currentIdx];
  const effectiveTotalQuestions = Math.min(totalQuestions, INTERVIEW_QUESTION_LIMIT);
  const isLast = currentIdx >= effectiveTotalQuestions - 1;
  const cameraTooPoor = !cameraError && faceChecks.total >= 3 && facePct < 35;

  const finishInterview = useCallback(async () => {
    if (!interviewId) return;
    setProcessingLabel(t("finalising_assessment"));
    await completeInterviewMutation.mutateAsync({ id: interviewId });
    const classification = await classifyMutation.mutateAsync({ interviewId });
    setState({ classification: classification.category, avgScore: classification.avgScore });
    navigate("/results");
  }, [classifyMutation, completeInterviewMutation, interviewId, navigate, t]);

  async function fetchNextQuestion(): Promise<boolean> {
    if (!interviewId || questions.length >= effectiveTotalQuestions) return false;
    setQuestionError(null);
    setIsLoadingQuestion(true);

    try {
      const apiBase = (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";
      const response = await fetch(`${apiBase}/api/interviews/${interviewId}/questions?next=true`, {
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        setQuestionError(data?.error || t("unable_load_next"));
        return false;
      }

      const data = await response.json() as {
        question: InterviewQuestion | null;
        totalQuestions: number;
        askedCount: number;
      };

      const cappedTotal = Math.min(data.totalQuestions || INTERVIEW_QUESTION_LIMIT, INTERVIEW_QUESTION_LIMIT);
      setTotalQuestions(cappedTotal);
      if (!data.question || data.askedCount > cappedTotal) return false;
      setQuestions((prev) => [...prev, data.question!]);
      return true;
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : t("unable_load_next"));
      return false;
    } finally {
      setIsLoadingQuestion(false);
    }
  }

  useEffect(() => {
    if (!interviewId || questions.length > 0) return;
    void fetchNextQuestion();
  }, [interviewId, questions.length]);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      } catch {
        setCameraError(t("camera_permission_req"));
      }
    }

    void setupCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cameraReady || !streamRef.current) return;
    faceIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const x = Math.floor(canvas.width * 0.25);
      const y = Math.floor(canvas.height * 0.18);
      const w = Math.floor(canvas.width * 0.5);
      const h = Math.floor(canvas.height * 0.58);
      const data = ctx.getImageData(x, y, w, h);

      let skinPixels = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i] ?? 0;
        const g = data.data[i + 1] ?? 0;
        const b = data.data[i + 2] ?? 0;
        if (r > 90 && g > 35 && b > 18 && r > g && r > b && r - g > 12) skinPixels++;
      }

      const detected = skinPixels / (data.data.length / 4) > 0.055;
      setFaceDetected(detected);
      setFaceChecks((prev) => {
        const next = { with: prev.with + (detected ? 1 : 0), total: prev.total + 1 };
        setFacePct(Math.round((next.with / next.total) * 100));
        return next;
      });
    }, 2500);

    return () => {
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, [cameraReady]);

// WITH THIS:
useEffect(() => {
  if (!currentQuestion?.text || typeof window === "undefined") return;

  const synth = window.speechSynthesis;
  synth.cancel();

  let cancelled = false;

  function speakWithVoice(voices: SpeechSynthesisVoice[]) {
    if (cancelled) return;
    const targetLang = TTS_LANG[lang] ?? "en-IN";
    const utter = new SpeechSynthesisUtterance(currentQuestion!.text);
    utter.lang = targetLang;
    utter.rate = 0.92;

    // Find the best available voice for the language
    const exactMatch = voices.find((v) => v.lang === targetLang);
    const partialMatch = voices.find((v) => v.lang.startsWith(lang));
    if (exactMatch) utter.voice = exactMatch;
    else if (partialMatch) utter.voice = partialMatch;
    // if neither found, browser will attempt online TTS with the lang tag set
    
    // Slight delay to ensure the browser doesn't block the audio
    setTimeout(() => {
      if (!cancelled) synth.speak(utter);
    }, 100);
  }

  const voices = synth.getVoices();
  if (voices.length > 0) {
    // Voices already loaded
    speakWithVoice(voices);
  } else {
    // Voices not loaded yet — wait for them
    synth.onvoiceschanged = () => {
      speakWithVoice(synth.getVoices());
      synth.onvoiceschanged = null;
    };
  }

  return () => {
    cancelled = true;
    synth.cancel();
  };
}, [currentIdx, currentQuestion?.text, lang]);

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    chunksRef.current = [];

    if (streamRef.current) {
      try {
        const recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
        setIsRecording(true);
      } catch {
        recorderRef.current = null;
      }
    }

    if (!SR) {
      setNotice(t("speech_unavailable"));
      setIsListening(true);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = SPEECH_LANG_MAP[lang] || "en-IN";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      if (finalText) setTranscript((prev) => `${prev}${finalText}`);
      setInterimTranscript(interim);
    };
    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }

  function stopListening(): Promise<Blob | null> {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimTranscript("");

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      return Promise.resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "video/webm" }) : null);
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        setIsRecording(false);
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "video/webm" }) : null);
      };
      recorder.stop();
    });
  }

  async function handleNext() {
    if (!interviewId || !currentQuestion) return;

    if (cameraError || cameraTooPoor) {
      setIsProcessing(true);
      setNotice(t("camera_too_poor"));
      try {
        await finishInterview();
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    setProcessingLabel(t("saving_response"));

    const q = currentQuestion;
    const rawTranscript = `${transcript} ${interimTranscript}`.trim();
    let finalTranscript = rawTranscript || t("no_clear_response");
    const videoBlob = await stopListening();

    try {
      if (videoBlob && videoBlob.size > 5000) {
        const groqTranscript = await transcribeWithGroq(videoBlob, lang);
        if (groqTranscript && groqTranscript.trim().length > 5) finalTranscript = groqTranscript.trim();
      }

      const videoUrl = videoBlob ? await uploadVideo(videoBlob, interviewId, q.id) : null;

      await submitResponseMutation.mutateAsync({
        id: interviewId,
        data: {
          questionId: q.id,
          questionText: q.text,
          transcript: finalTranscript,
          videoUrl,
          facePresentPct: facePct / 100,
          livenessPass: faceChecks.total > 0 ? faceChecks.with / faceChecks.total > 0.5 : null,
        },
      });

      setTranscript("");
      setInterimTranscript("");
      chunksRef.current = [];

      if (currentIdx + 1 >= effectiveTotalQuestions) {
        await finishInterview();
        return;
      }

      const more = await fetchNextQuestion();
      if (more) {
        setCurrentIdx((prev) => prev + 1);
      } else {
        await finishInterview();
      }
    } catch (error) {
      const apiError = typeof error === "object" && error !== null
        ? (error as { status?: number; data?: { error?: string }; message?: string })
        : null;
      const status = apiError?.status;
      const errorMessage = apiError?.data?.error ?? apiError?.message ?? "";
      const shouldFinishAfterConflict = status === 409 && (
        currentIdx + 1 >= effectiveTotalQuestions ||
        /5 responses|already completed/i.test(errorMessage)
      );
      if (shouldFinishAfterConflict) {
        await finishInterview();
        return;
      }
      setNotice(error instanceof Error ? error.message : t("could_not_save"));
    } finally {
      setIsProcessing(false);
      setProcessingLabel("");
    }
  }

  if (!interviewId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">{t("session_expired")}</p>
          <button onClick={() => navigate("/")} className="rounded-md bg-primary px-5 py-3 font-semibold text-white">
            {t("start_over")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-foreground">
      <header className="border-b border-[#d9c7ac] bg-[#7b241c] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-white/30 bg-white/10 text-sm font-bold">
              GoK
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-normal text-white/75">Government of Karnataka</p>
              <h1 className="text-base font-bold leading-tight">AI SkillFit Video Assessment</h1>
            </div>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">{state.trade}</p>
            <p className="text-white/75">{t("question_of", { n: Math.min(currentIdx + 1, effectiveTotalQuestions), t: effectiveTotalQuestions })}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-[#d9c7ac] bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("candidate_camera")}</p>
              <p className="text-xs text-muted-foreground">{t("make_sure_face_visible")}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              faceDetected ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
            }`}>
              {faceDetected ? t("face_visible") : t("face_not_visible")}
            </span>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-md bg-[#1f2933]">
            {cameraError ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white">
                {cameraError}
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
            {isRecording && <div className="absolute right-3 top-3 h-3 w-3 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.25)]" />}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-[#f7f3ec] p-2">
              <p className="font-bold text-[#7b241c]">{facePct}%</p>
              <p className="text-muted-foreground">{t("visibility")}</p>
            </div>
            <div className="rounded-md bg-[#f7f3ec] p-2">
              <p className="font-bold text-[#7b241c]">{faceChecks.total}</p>
              <p className="text-muted-foreground">{t("checks")}</p>
            </div>
            <div className="rounded-md bg-[#f7f3ec] p-2">
              <p className="font-bold text-[#7b241c]">{effectiveTotalQuestions}</p>
              <p className="text-muted-foreground">{t("questions")}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-[#d9c7ac] bg-white p-5 shadow-sm">
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#eadfce]">
              <div
                className="h-full rounded-full bg-[#d39b2a] transition-all"
                style={{ width: `${Math.min(100, ((currentIdx + 1) / effectiveTotalQuestions) * 100)}%` }}
              />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-[#7b241c]">
              {t("live_ai_interviewer")}
            </p>
            {isLoadingQuestion ? (
              <div className="h-20 animate-pulse rounded-md bg-muted" />
            ) : currentQuestion ? (
              <p className="text-lg font-semibold leading-relaxed text-[#24150f]">{currentQuestion.text}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{questionError || t("preparing_next_question")}</p>
            )}
          </div>

          <div className="rounded-lg border border-[#d9c7ac] bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-normal text-[#7b241c]">{t("captured_answer")}</p>
              <p className="text-xs text-muted-foreground">{t("paste_disabled")}</p>
            </div>
            <textarea
              data-testid="textarea-transcript"
              value={`${transcript}${interimTranscript}`}
              onChange={(event) => setTranscript(event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                setNotice(t("paste_disabled_msg"));
              }}
              onDrop={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
              placeholder={t("speak_placeholder")}
              className="h-36 w-full resize-none rounded-md border border-[#d9c7ac] bg-[#fffaf2] p-3 text-sm outline-none focus:border-[#7b241c]"
            />
            {isListening && <p className="mt-2 text-xs font-medium text-[#7b241c]">{t("listening_recording")}</p>}
          </div>

          <div className="rounded-lg border border-[#d9c7ac] bg-[#fffaf2] p-3 text-sm text-[#4a2a18]">
            {cameraTooPoor ? t("camera_too_poor") : notice}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              data-testid={isListening ? "btn-stop" : "btn-listen"}
              type="button"
              onClick={isListening ? () => void stopListening() : startListening}
              disabled={isProcessing || !!cameraError}
              className={`rounded-md px-4 py-4 text-base font-semibold transition-colors disabled:opacity-50 ${
                isListening
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border-2 border-[#7b241c] bg-white text-[#7b241c] hover:bg-[#fff4df]"
              }`}
            >
              {isListening ? t("stop_recording") : t("start_speaking")}
            </button>
            <button
              data-testid="btn-next"
              type="button"
              onClick={handleNext}
              disabled={isProcessing || !currentQuestion}
              className="rounded-md bg-[#7b241c] px-4 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#641c16] disabled:opacity-50"
            >
              {isProcessing ? processingLabel || t("saving") : isLast ? t("submit_interview") : t("save_and_continue")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}