import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useState } from "react";
import { useRegisterCandidate } from "@workspace/api-client-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KARNATAKA_DISTRICTS_I18N, TRADES_I18N, LANGUAGES } from "@/lib/constants";
import { getState, setState } from "@/lib/store";
import { useStartInterview } from "@workspace/api-client-react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  district: z.string().min(1, "Please select a district"),
  trade: z.string().min(1, "Please select a trade"),
});

type FormData = z.infer<typeof formSchema>;

const LABELS: Record<string, Record<string, string>> = {
  kn: {
    title: "ನಿಮ್ಮ ವಿವರ",
    name: "ಹೆಸರು",
    phone: "ಫೋನ್ ಸಂಖ್ಯೆ",
    district: "ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ",
    trade: "ವೃತ್ತಿ ಆಯ್ಕೆ ಮಾಡಿ",
    submit: "ಮುಂದೆ ಹೋಗಿ",
    back: "ಹಿಂದೆ",
    change_lang: "ಭಾಷೆ ಬದಲಾಯಿಸಿ",
  },
  hi: {
    title: "आपकी जानकारी",
    name: "नाम",
    phone: "फ़ोन नंबर",
    district: "जिला चुनें",
    trade: "व्यवसाय चुनें",
    submit: "आगे बढ़ें",
    back: "वापस",
    change_lang: "भाषा बदलें",
  },
  en: {
    title: "Your Details",
    name: "Full Name",
    phone: "Phone Number",
    district: "Select District",
    trade: "Select Trade",
    submit: "Continue",
    back: "Back",
    change_lang: "Change language",
  },
};

export default function Register() {
  const [, navigate] = useLocation();
  const state = getState();
  const lang = state.language || "en";
  const L = LABELS[lang];

  const registerMutation = useRegisterCandidate();
  const startInterviewMutation = useStartInterview();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: state.candidateName || "",
      phone: state.mobileNumber || "",
      district: state.district || "",
      trade: state.trade || "",
    },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      const candidate = await registerMutation.mutateAsync({
        data: {
          name: data.name,
          phone: data.phone,
          district: data.district,
          trade: data.trade,
          language: lang,
          deviceFingerprint: navigator.userAgent.slice(0, 100),
        },
      });
      setState({
        candidateId: candidate.id,
        candidateName: candidate.name,
        trade: candidate.trade,
        district: candidate.district,
      });

      // Start interview
      const interview = await startInterviewMutation.mutateAsync({
        data: { candidateId: candidate.id },
      });
      setState({ interviewId: interview.id });
      navigate("/interview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          data-testid="btn-back"
          onClick={() => navigate("/")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">{L.title}</h1>
          <p className="text-xs text-muted-foreground">AI SkillFit</p>
        </div>
        <div className="ml-auto">
          <Select value={lang} onValueChange={(v) => { setState({ language: v as "kn" | "hi" | "en" }); window.location.reload(); }}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex gap-1 mb-6">
        <div className="h-1.5 flex-1 bg-primary rounded-full" />
        <div className="h-1.5 flex-1 bg-muted rounded-full" />
        <div className="h-1.5 flex-1 bg-muted rounded-full" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 flex-1">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{L.name}</FormLabel>
                <FormControl>
                  <Input data-testid="input-name" placeholder={L.name} {...field} className="h-12 text-base" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{L.phone}</FormLabel>
                <FormControl>
                  <Input
                    data-testid="input-phone"
                    placeholder="9876543210"
                    type="tel"
                    maxLength={10}
                    {...field}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      field.onChange(val);
                    }}
                    className="h-12 text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="district"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{L.district}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-district" className="h-12 text-base">
                      <SelectValue placeholder={L.district} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {KARNATAKA_DISTRICTS_I18N["en"].map((d, i) => (
                      <SelectItem key={d} value={d}>
                        {(KARNATAKA_DISTRICTS_I18N[lang] ?? KARNATAKA_DISTRICTS_I18N["en"])[i]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="trade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{L.trade}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-trade" className="h-12 text-base">
                      <SelectValue placeholder={L.trade} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TRADES_I18N["en"].map((t, i) => (
                      <SelectItem key={t} value={t}>
                        {(TRADES_I18N[lang] ?? TRADES_I18N["en"])[i]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          <div className="pt-4">
            <button
              data-testid="btn-submit"
              type="submit"
              disabled={registerMutation.isPending || startInterviewMutation.isPending}
              className="w-full bg-primary text-white font-semibold py-4 rounded-lg text-base hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
            >
              {(registerMutation.isPending || startInterviewMutation.isPending) ? "Please wait..." : L.submit}
            </button>
          </div>
        </form>
      </Form>
    </div>
  );
}
