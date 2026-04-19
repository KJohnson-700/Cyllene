import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { useRunStream } from "@/hooks/useRunStream";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useTTS } from "@/hooks/useTTS";
import { useWeather } from "@/hooks/useWeather";
import { useTelegramOrientation } from "@/hooks/useTelegramSensors";
import { GhostFace } from "@/components/GhostFace";
import {
  haptic,
  loadPreference,
  savePreference,
  setMainButton,
  requestFullscreen,
  exitFullscreen,
  isFullscreen,
} from "@/lib/telegram";

export function ChatPage() {
  const [input, setInput] = useState("");
  const [openMicEnabled, setOpenMicEnabled] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const { messages, agentState, activeTool, tokenCount, isRunning, error, sendMessage, cancel } =
    useRunStream();

  const { speak, stop, toggle, speaking, enabled: ttsEnabled, amplitude } = useTTS();

  const {
    supported: speechSupported,
    listening,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechInput();

  const weather = useWeather();
  const orientation = useTelegramOrientation();

  const spokenIdsRef = useRef<Set<string>>(new Set());
  const transcriptRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last assistant message — shown as the status line
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  // Speak assistant messages when streaming finishes
  useEffect(() => {
    if (isRunning) return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    speak(last.content);
  }, [isRunning, messages, speak]);

  // Open mic auto-restart — after agent finishes + TTS done, listen again
  useEffect(() => {
    if (!openMicEnabled || isRunning || speaking || listening) return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;
    const timer = setTimeout(() => {
      if (!isRunning && !speaking && !listening) startListening();
    }, 800);
    return () => clearTimeout(timer);
  }, [isRunning, speaking, listening, openMicEnabled, messages, startListening]);

  const handleCancel = useCallback(() => {
    stopListening();
    stop();
    cancel();
  }, [stopListening, stop, cancel]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isRunning) return;
    stopListening();
    stop();
    haptic.impact("light");
    transcriptRef.current = "";
    setInput("");
    setShowInput(false);
    await sendMessage(text);
  }, [input, isRunning, stopListening, stop, sendMessage]);

  const handleMicToggle = useCallback(() => {
    if (!speechSupported || isRunning) return;
    haptic.selection();
    if (listening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stopListening();
      return;
    }
    stop();
    startListening();
  }, [speechSupported, isRunning, listening, stopListening, stop, startListening]);

  // Sync interim transcript to input while listening
  useEffect(() => {
    if (!listening) return;
    setInput(interimTranscript);
    transcriptRef.current = interimTranscript;
  }, [interimTranscript, listening]);

  // Load open mic pref
  useEffect(() => {
    loadPreference("cyllene:open-mic-enabled").then((v) => {
      if (v === "true") setOpenMicEnabled(true);
    });
  }, []);

  // Save open mic pref
  useEffect(() => {
    savePreference("cyllene:open-mic-enabled", String(openMicEnabled));
  }, [openMicEnabled]);

  // Open mic silence timer — send after 2.2 s of no new transcript while listening
  useEffect(() => {
    if (!openMicEnabled || !listening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      return;
    }
    const text = interimTranscript.trim();
    if (!text) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      void handleSend();
    }, 2200);
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [interimTranscript, listening, openMicEnabled, handleSend]);

  const handleOpenMicToggle = useCallback(() => {
    haptic.selection();
    setOpenMicEnabled((v) => !v);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
    },
    [handleSend],
  );

  // Double-tap face → toggle fullscreen
  const handleFaceDoubleTap = useCallback(() => {
    haptic.impact("medium");
    if (isFullscreen()) exitFullscreen();
    else requestFullscreen();
  }, []);

  // Telegram main button
  useEffect(() => {
    const hasInput = !!input.trim();
    if (!hasInput && !isRunning) return setMainButton({ text: "", visible: false });
    return setMainButton({
      text: isRunning ? "Stop Response" : "Send Message",
      visible: true,
      enabled: isRunning || hasInput,
      loading: false,
      color: isRunning ? "#8b1e2d" : "#18a558",
      textColor: "#f6fff8",
      hasShineEffect: !isRunning && hasInput,
      onClick: isRunning ? handleCancel : handleSend,
    });
  }, [handleSend, handleCancel, input, isRunning]);

  // Decide which text to show in the status bubble
  const statusText = (() => {
    if (listening && interimTranscript) return interimTranscript;
    if (isRunning && lastAssistant?.content) return lastAssistant.content;
    if (!isRunning && lastAssistant?.content) return lastAssistant.content;
    return null;
  })();

  const statusRole: "user" | "assistant" | "interim" = listening && interimTranscript
    ? "interim"
    : lastAssistant
    ? "assistant"
    : "assistant";

  return (
    <div className="flex flex-col h-full bg-transparent select-none">

      {/* ── GhostFace — fills all available vertical space ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <GhostFace
          agentState={speaking ? "responding" : agentState}
          activeTool={activeTool}
          tokenCount={tokenCount}
          amplitude={amplitude}
          weather={weather}
          orientation={orientation.supported ? orientation : null}
          onDoubleTap={handleFaceDoubleTap}
          fillContainer
        />
      </div>

      {/* ── Status bubble — last reply or interim transcript ── */}
      <div className="px-5 pb-2 min-h-[56px] flex items-end">
        {statusText ? (
          <div
            className={`w-full rounded-2xl px-4 py-2.5 text-[13px] leading-snug font-mono transition-colors ${
              statusRole === "interim"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200/80"
                : "bg-white/5 border border-white/8 text-white/60"
            }`}
            style={{ maxHeight: "72px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
          >
            {statusText}
          </div>
        ) : (
          <div className="w-full text-center text-white/15 text-[11px] font-mono py-1">
            {error
              ? <span className="text-red-400/70">{error}</span>
              : speechError
              ? <span className="text-yellow-400/60">{speechError}</span>
              : isRunning
              ? "thinking…"
              : "say something or tap the keyboard"}
          </div>
        )}
      </div>

      {/* ── Collapsible text input ── */}
      {showInput && (
        <div className="px-4 pb-2 flex items-end gap-2">
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="message hermes…"
            disabled={isRunning}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-cyan-500/40 transition-colors disabled:opacity-40 font-mono"
            style={{ maxHeight: "100px", overflowY: "auto" }}
          />
          {isRunning ? (
            <button
              onClick={handleCancel}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── Controls bar ── */}
      <div className="px-4 pb-4 flex items-center justify-between gap-3">

        {/* Left: TTS toggle + open mic */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            title={ttsEnabled ? "Mute voice" : "Enable voice"}
            className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-xl border transition-colors ${
              ttsEnabled
                ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                : "border-white/10 text-white/30"
            }`}
          >
            {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {speaking ? "speaking…" : ttsEnabled ? "voice on" : "voice off"}
          </button>

          {speechSupported && (
            <button
              onClick={handleOpenMicToggle}
              title={openMicEnabled ? "Disable Open Mic" : "Enable Open Mic"}
              className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-xl border transition-colors ${
                openMicEnabled
                  ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                  : "border-white/10 text-white/30"
              }`}
            >
              <Mic size={13} />
              {openMicEnabled ? "open mic" : "mic off"}
            </button>
          )}
        </div>

        {/* Right: mic button + keyboard toggle */}
        <div className="flex items-center gap-2">
          {/* Keyboard / text input toggle */}
          <button
            onClick={() => { haptic.selection(); setShowInput((v) => !v); }}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
              showInput
                ? "bg-white/10 border-white/20 text-white/70"
                : "bg-white/5 border-white/10 text-white/35 hover:text-white/60"
            }`}
            title="Type a message"
          >
            {/* keyboard icon via SVG */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <line x1="6" y1="10" x2="6" y2="10"/>
              <line x1="10" y1="10" x2="10" y2="10"/>
              <line x1="14" y1="10" x2="14" y2="10"/>
              <line x1="18" y1="10" x2="18" y2="10"/>
              <line x1="6" y1="14" x2="6" y2="14"/>
              <line x1="18" y1="14" x2="18" y2="14"/>
              <line x1="10" y1="14" x2="14" y2="14"/>
            </svg>
          </button>

          {/* Main mic / cancel button */}
          {isRunning ? (
            <button
              onClick={handleCancel}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          ) : speechSupported ? (
            <button
              onClick={handleMicToggle}
              className={`w-12 h-12 flex items-center justify-center rounded-2xl border transition-colors shrink-0 ${
                listening
                  ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300 animate-pulse"
                  : "bg-white/8 border-white/15 text-white/60 hover:text-white/90 hover:border-white/30"
              }`}
              title={listening ? "Stop listening" : "Speak"}
            >
              {listening ? <Square size={18} /> : <Mic size={20} />}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Listening status strip ── */}
      {speechSupported && listening && (
        <div className="px-5 pb-3 -mt-2">
          <div className="text-center text-[10px] font-mono text-emerald-300/60">
            {openMicEnabled ? "listening · auto-send on silence" : "listening · tap to stop"}
          </div>
        </div>
      )}
    </div>
  );
}
