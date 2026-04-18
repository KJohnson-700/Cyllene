import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onaudiostart: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognitionLike, ev: Event & { error?: string }) => void) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function useSpeechInput() {
  const [supported]          = useState(() => !!getSpeechRecognition());
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError]    = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Accumulates all finalized phrases across multiple onresult events.
  // Reset on each new start() call. Kept in a ref so the handler always
  // reads the latest value without needing to be recreated.
  const accumulatedRef = useRef<string>("");

  useEffect(() => {
    if (!supported) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = navigator.language || "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // event.resultIndex only covers new results since the last event.
      // Append newly finalized phrases to the session accumulator, then
      // combine with the current interim phrase for the live preview.
      let newFinal = "";
      let interim  = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result     = event.results[i];
        const transcript = (result[0]?.transcript ?? "").trim();
        if (!transcript) continue;
        if (result.isFinal) {
          newFinal = newFinal ? `${newFinal} ${transcript}` : transcript;
        } else {
          interim  = interim  ? `${interim} ${transcript}`  : transcript;
        }
      }

      if (newFinal) {
        accumulatedRef.current = accumulatedRef.current
          ? `${accumulatedRef.current} ${newFinal}`
          : newFinal;
      }

      const combined = accumulatedRef.current
        ? interim ? `${accumulatedRef.current} ${interim}` : accumulatedRef.current
        : interim;

      setInterimTranscript(combined);
    };

    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";
      if (code === "no-speech") {
        setError("No speech detected");
      } else if (code === "not-allowed") {
        setError("Microphone permission denied");
      } else if (code === "audio-capture") {
        setError("No microphone available");
      } else if (code === "aborted") {
        // deliberate stop() — not an error
      } else {
        setError("Voice input failed");
      }
    };

    recognition.onend = () => {
      setListening(false);
      // intentionally NOT clearing interimTranscript here so the
      // ChatPage auto-send logic can read the last value after onend.
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [supported]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return false;
    accumulatedRef.current = "";    // fresh session
    setError(null);
    setInterimTranscript("");
    try {
      recognition.start();
      setListening(true);
      return true;
    } catch {
      setError("Voice input unavailable");
      setListening(false);
      return false;
    }
  }, [listening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    // onend fires asynchronously and sets listening=false
  }, []);

  return { supported, listening, interimTranscript, error, start, stop };
}
