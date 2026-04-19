import { useState, useEffect } from "react";
import { MonitorWidgets } from "@/components/MonitorWidgets";
import { StreamPanel }    from "@/components/monitor/StreamPanel";
import { KanbanPanel }    from "@/components/monitor/KanbanPanel";
import { BrainGraph }     from "@/components/monitor/BrainGraph";
import { useRunStream }   from "@/hooks/useRunStream";

type Tab = "status" | "stream" | "kanban" | "brain";
const TABS: Tab[] = ["status", "stream", "kanban", "brain"];
const TAB_STORE_KEY = "cyllene:monitor-tab";

function readPersistedTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_STORE_KEY);
    if (v && TABS.includes(v as Tab)) return v as Tab;
  } catch { /* ignore */ }
  return "status";
}

function TabStrip({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-0 border-b border-white/8 px-4 shrink-0">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`relative px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              isActive ? "text-cyan-400" : "text-white/25 hover:text-white/50"
            }`}
          >
            {tab}
            {isActive && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>(readPersistedTab);

  // useRunStream lifted here so StreamPanel gets live data
  const { messages, agentState, activeTool, isRunning } = useRunStream();

  const onTabChange = (tab: Tab) => {
    setActiveTab(tab);
    try { localStorage.setItem(TAB_STORE_KEY, tab); } catch { /* ignore */ }
  };

  // Keep localStorage in sync (also handles tab changes from elsewhere)
  useEffect(() => {
    try { localStorage.setItem(TAB_STORE_KEY, activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-4 pt-4 pb-1 shrink-0">
        <h1 className="text-xs font-mono uppercase tracking-widest text-white/30">
          Hermes Monitor
        </h1>
      </div>

      {/* Tab strip */}
      <TabStrip active={activeTab} onChange={onTabChange} />

      {/* Panel content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === "status" && (
          <div className="h-full overflow-y-auto">
            <MonitorWidgets />
          </div>
        )}

        {activeTab === "stream" && (
          <div className="h-full overflow-hidden">
            <StreamPanel
              messages={messages}
              agentState={agentState}
              activeTool={activeTool}
              isRunning={isRunning}
            />
          </div>
        )}

        {activeTab === "kanban" && (
          <div className="h-full overflow-hidden">
            <KanbanPanel />
          </div>
        )}

        {activeTab === "brain" && (
          <div className="h-full overflow-hidden">
            <BrainGraph />
          </div>
        )}
      </div>
    </div>
  );
}
