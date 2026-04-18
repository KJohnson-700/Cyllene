import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Send, Square, Volume2, VolumeX, X, Copy, Check } from "lucide-react";
import { useRunStream } from "@/hooks/useRunStream";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useTTS } from "@/hooks/useTTS";
import { useWeather } from "@/hooks/useWeather";
import { useTelegramOrientation } from "@/hooks/useTelegramSensors";
import { MatrixFace } from "@/components/MatrixFace";
import {
  haptic,
  loadPreference,
  savePreference,
  setMainButton,
  showConfirm,
  writeClipboard,
  requestFullscreen,
  exitFullscreen,
  isFullscreen,
} from "@/lib/telegram";

export function ChatPage() {
  const [input, setInput] = useState("");
  const [openMicEnabled, setOpenMicEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { messages, agentState, activeTool, tokenCount, isRunning, error, sendMessage, cancel, clearMessages } =
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const listeningRef = useRef(false);
  const transcriptRef = useRef("");

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Speak assistant messages when streaming finishes
  useEffect(() => {
    if (isRunning) return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    speak(last.content);
  }, [isRunning, messages, speak]);

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
    await sendMessage(text);
  }, [input, isRunning, stopListening, stop, sendMessage]);

  const handleMicToggle = useCallback(() => {
    if (!speechSupported || isRunning) return;
    haptic.selection();
    if (listening) { stopListening(); return; }
    stop();
    startListening();
  }, [speechSupported, isRunning, listening, stopListening, stop, startListening]);

  useEffect(() => {
    if (!listening) return;
    setInput(interimTranscript);
    transcriptRef.current = interimTranscript;
  }, [interimTranscript, listening]);

  useEffect(() => {
    loadPreference("cyllene:open-mic-enabled").then((v) => {
      if (v === "true") setOpenMicEnabled(true);
    });
  }, []);

  useEffect(() => {
    savePreference("cyllene:open-mic-enabled", String(openMicEnabled));
  }, [openMicEnabled]);

  useEffect(() => {
    const justStopped = listeningRef.current && !listening;
    listeningRef.current = listening;
    if (!justStopped || !openMicEnabled || isRunning) return;
    const text = (transcriptRef.current || input).trim();
    if (!text) return;
    const captured = handleSend;
    setTimeout(() => {
      if (!isRunning && text === (transcriptRef.current || input).trim()) void captured();
    }, 120);
  }, [handleSend, input, isRunning, listening, openMicEnabled]);

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

  // Telegram native confirm before clearing
  const handleClear = useCallback(async () => {
    haptic.impact("light");
    const confirmed = await showConfirm("Clear all messages?");
    if (confirmed) { haptic.notification("success"); clearMessages(); }
  }, [clearMessages]);

  // Copy message text to clipboard
  const handleCopy = useCallback(async (id: string, content: string) => {
    const ok = await writeClipboard(content);
    if (ok) {
      haptic.impact("light");
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  }, []);

  // Double-tap face → toggle fullscreen
  const handleFaceDoubleTap = useCallback(() => {
    haptic.impact("medium");
    if (isFullscreen()) exitFullscreen();
    else requestFullscreen();
  }, []);

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

  return (
    <div className="flex flex-col h-full">
      {/* Header: MatrixFace */}
      <div className="px-2 pt-1 pb-2 border-b border-white/8">
        <MatrixFace
          agentState={agentState}
          activeTool={activeTool}
          tokenCount={tokenCount}
          amplitude={amplitude}
          weather={weather}
          orientation={orientation.supported ? orientation : null}
          onDoubleTap={handleFaceDoubleTap}
        />

        {/* Controls row */}
        <div className="flex items-center justify-between px-3 -mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              title={ttsEnabled ? "Mute voice" : "Enable voice"}
              className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg border transition-colors ${
                ttsEnabled
                  ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                  : "border-white/10 text-white/30"
              }`}
            >
              {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {speaking ? "speaking…" : ttsEnabled ? "voice on" : "voice off"}
            </button>

            {speechSupported && (
              <button
                onClick={handleOpenMicToggle}
                title={openMicEnabled ? "Disable Open Mic" : "Enable Open Mic"}
                className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg border transition-colors ${
                  openMicEnabled
                    ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                    : "border-white/10 text-white/30"
                }`}
              >
                <Mic size={12} />
                {openMicEnabled ? "open mic" : "mic off"}
              </button>
            )}
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-[10px] text-white/20 hover:text-white/50 font-mono transition-colors"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <p className="text-white/20 text-sm font-mono">say something</p>
            <div className="flex flex-col gap-1">
              {["what did you work on today?", "any cron jobs due?", "show me my sessions"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors font-mono border border-white/8 hover:border-white/20 rounded px-3 py-1"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`group flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="relative max-w-[85%]">
              <div
                className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-cyan-500/20 text-white border border-cyan-500/20 rounded-br-sm"
                    : "bg-white/5 text-white/80 border border-white/8 rounded-bl-sm"
                }`}
              >
                {msg.content || (
                  <span className="inline-flex gap-1 text-white/30">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                  </span>
                )}
              </div>

              {/* Copy button — appears on hover/focus */}
              {msg.content && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className={`absolute -top-1 ${msg.role === "user" ? "-left-7" : "-right-7"} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-white/30 hover:text-white/70`}
                  title="Copy"
                >
                  {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="text-center text-red-400/70 text-xs font-mono py-1">{error}</div>
        )}
        {speechError && !error && (
          <div className="text-center text-yellow-300/70 text-xs font-mono py-1">{speechError}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/8">
        {speechSupported && (
          <div className="mb-2 flex items-center justify-between text-[10px] font-mono">
            <span className={listening ? "text-emerald-300/80" : "text-white/25"}>
              {listening ? "listening…" : openMicEnabled ? "open mic armed" : "tap mic to talk"}
            </span>
            {listening && (
              <span className="text-white/35">
                {openMicEnabled ? "stop speaking → auto-send" : "tap again to stop"}
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="message hermes…"
            disabled={isRunning}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-cyan-500/40 transition-colors disabled:opacity-40 font-mono"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />

          {speechSupported && !isRunning && (
            <button
              onClick={handleMicToggle}
              className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
                listening
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
              }`}
              title={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? <Square size={15} /> : <Mic size={16} />}
            </button>
          )}

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
      </div>
    </div>
  );
}
