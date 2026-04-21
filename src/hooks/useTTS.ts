/**
 * TTS hook — MiniMax via /v1/tts proxy.
 *
 * Fetches MP3 audio, plays via <audio> element, and exposes a live
 * amplitude signal (0..1) via AnalyserNode for mouth-sync in MatrixFace.
 *
 * Falls back to Web Speech API if /v1/tts fails (no amplitude in that case).
 * Web Speech uses one pinned English voice so it does not drift between utterances.
 * If MiniMax and Web Speech both run intermittently, voices still differ — fix proxy/API reliability for a single engine.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPreference, savePreference } from "@/lib/telegram";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function ttsUrl() {
  return `${API_BASE}/v1/tts`;
}

/** Deterministic pick: same voice across utterances (avoids browser default drift). */
function pickStableWebSpeechVoice(): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : [...voices];
  pool.sort((a, b) => {
    const byUri = a.voiceURI.localeCompare(b.voiceURI);
    if (byUri !== 0) return byUri;
    return a.name.localeCompare(b.name);
  });
  return pool[0] ?? null;
}

export function useTTS() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);

  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const currentUrlRef = useRef<string | null>(null);
  /** Pinned once Web Speech voices load — avoids browser default flipping between utterances. */
  const webSpeechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const pickVoice = () => {
      webSpeechVoiceRef.current = pickStableWebSpeechVoice();
    };
    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      audioElRef.current?.pause();
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    loadPreference("cyllene:tts-enabled").then((value) => {
      if (value === "false") {
        setEnabled(false);
      }
    });
  }, []);

  useEffect(() => {
    savePreference("cyllene:tts-enabled", String(enabled));
  }, [enabled]);

  function ensureContext() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.7;
    }
    // iOS: context starts suspended until a user gesture
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }

  function pollAmplitude() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS amplitude on waveform data (0..128 around 128 = silence)
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setAmplitude(Math.min(1, rms * 3)); // boost for visibility
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  async function playViaMiniMax(text: string): Promise<boolean> {
    try {
      const res = await fetch(ttsUrl(), {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return false;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = url;

      ensureContext();
      const ctx = audioCtxRef.current!;
      const analyser = analyserRef.current!;

      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      audioElRef.current = audio;

      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);

      return new Promise<boolean>((resolve) => {
        audio.onended = () => {
          setAmplitude(0);
          cancelAnimationFrame(rafRef.current);
          resolve(true);
        };
        audio.onerror = () => {
          setAmplitude(0);
          cancelAnimationFrame(rafRef.current);
          resolve(false);
        };
        audio.play().then(() => pollAmplitude()).catch(() => resolve(false));
      });
    } catch {
      return false;
    }
  }

  function playViaWebSpeech(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve(false);
      if (!webSpeechVoiceRef.current) {
        webSpeechVoiceRef.current = pickStableWebSpeechVoice();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.lang = webSpeechVoiceRef.current?.lang ?? "en-US";
      if (webSpeechVoiceRef.current) {
        utter.voice = webSpeechVoiceRef.current;
      }
      utter.onend = () => resolve(true);
      utter.onerror = () => resolve(false);
      window.speechSynthesis.speak(utter);
    });
  }

  async function drainQueue() {
    if (busyRef.current || queueRef.current.length === 0) return;
    busyRef.current = true;
    setSpeaking(true);
    while (queueRef.current.length > 0) {
      const text = queueRef.current.shift()!;
      const ok = await playViaMiniMax(text);
      if (!ok) await playViaWebSpeech(text);
    }
    busyRef.current = false;
    setSpeaking(false);
  }

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !text.trim()) return;
      const clean = text
        .replace(/```[\s\S]*?```/g, "code block")
        .replace(/`[^`]+`/g, "")
        .replace(/[#*_~>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (!clean) return;
      queueRef.current.push(clean);
      drainQueue();
    },
    [enabled]
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    busyRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setAmplitude(0);
    setSpeaking(false);
    audioElRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      if (v) {
        queueRef.current = [];
        audioElRef.current?.pause();
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        setAmplitude(0);
        setSpeaking(false);
        busyRef.current = false;
      }
      return !v;
    });
  }, []);

  return { speak, stop, toggle, speaking, enabled, amplitude, supported: true };
}
