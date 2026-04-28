import { useState, useEffect, useCallback } from "react";
import { MessageSquare, CloudSun, LayoutDashboard } from "lucide-react";
import { ChatPage } from "@/pages/ChatPage";
import { DragonPage } from "@/pages/DragonPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SplashScreen } from "@/components/SplashScreen";
import {
  applyTelegramTheme,
  expand,
  haptic,
  loadPreference,
  onEvent,
  ready,
  savePreference,
  setBackButton,
  setBackgroundColor,
  setBottomBarColor,
  setHeaderColor,
  setVerticalSwipes,
  themeParams,
  isVersionAtLeast,
  checkHomeScreenStatus,
  addToHomeScreen,
  isFullscreen,
} from "@/lib/telegram";
import type { AgentState } from "@/hooks/useRunStream";

type Tab = "chat" | "dragon" | "dashboard";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "chat",      label: "Chat",    icon: <MessageSquare size={18} /> },
  { id: "dragon",    label: "Weather", icon: <CloudSun size={18} /> },
  { id: "dashboard", label: "Monitor", icon: <LayoutDashboard size={18} /> },
];

// Shared agent state so Dragon reacts to chat activity
let _agentState: AgentState = "idle";
let _setAgentStateGlobal: ((s: AgentState) => void) | null = null;

export function notifyAgentState(s: AgentState) {
  _agentState = s;
  _setAgentStateGlobal?.(s);
}

export default function App() {
  const [tab, setTab]           = useState<Tab>("chat");
  const [agentState, setAgentState] = useState<AgentState>(_agentState);
  const [showSplash, setShowSplash] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const onSplashDone = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    _setAgentStateGlobal = setAgentState;

    ready();
    expand();
    applyTelegramTheme();

    // Disable vertical swipe-to-close so the face area doesn't accidentally
    // dismiss the Mini App when the user swipes the canvas.
    setVerticalSwipes(false);

    const syncTheme = () => {
      applyTelegramTheme();
      const p = themeParams();
      setHeaderColor(p.header_bg_color ?? p.bg_color ?? "#0a0a0f");
      setBackgroundColor(p.bg_color ?? "#0a0a0f");
      setBottomBarColor(p.bottom_bar_bg_color ?? p.secondary_bg_color ?? p.bg_color ?? "#0a0a0f");
    };

    syncTheme();
    const offTheme    = onEvent("themeChanged",    syncTheme);
    const offViewport = onEvent("viewportChanged", applyTelegramTheme);

    // Track fullscreen state changes (v8.0+)
    let offFullscreen = () => {};
    if (isVersionAtLeast("8.0")) {
      const onFsChange = () => setFullscreen(isFullscreen());
      offFullscreen = onEvent("fullscreenChanged", onFsChange);
    }

    loadPreference("cyllene:active-tab").then((v) => {
      if (v === "chat" || v === "dragon" || v === "dashboard") setTab(v);
    });


    return () => {
      offTheme();
      offViewport();
      offFullscreen();
      _setAgentStateGlobal = null;
    };
  }, []);

  useEffect(() => {
    savePreference("cyllene:active-tab", tab);
  }, [tab]);

  useEffect(() => {
    return setBackButton(tab !== "chat", () => {
      haptic.selection();
      setTab("chat");
    });
  }, [tab]);

  return (
    <div
      className={`app-shell flex flex-col text-white overflow-hidden ${fullscreen ? "app-shell--fullscreen" : ""}`}
    >
      {showSplash && <SplashScreen onDone={onSplashDone} />}

      {/* Page content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={tab === "chat"      ? "h-full flex flex-col" : "hidden"}><ChatPage /></div>
        <div className={tab === "dragon"    ? "h-full" : "hidden"}><DragonPage agentState={agentState} /></div>
        <div className={tab === "dashboard" ? "h-full overflow-y-auto" : "hidden"}><DashboardPage /></div>
      </div>

      {/* Bottom nav — hidden in fullscreen */}
      {!fullscreen && (
        <nav
          className="flex border-t border-white/8 backdrop-blur-sm safe-area-bottom"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--tg-bottom-bar-bg-color) 88%, transparent)",
          }}
        >
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => {
                haptic.selection();
                setTab(id);
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                tab === id ? "text-cyan-400" : "text-white/30 hover:text-white/50"
              }`}
            >
              {icon}
              <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
              {tab === id && <span className="w-1 h-1 rounded-full bg-cyan-400" />}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
