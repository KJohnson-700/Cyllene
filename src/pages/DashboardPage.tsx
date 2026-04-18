import { MonitorWidgets } from "@/components/MonitorWidgets";

export function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-1">
        <h1 className="text-xs font-mono uppercase tracking-widest text-white/30">
          Hermes Monitor
        </h1>
      </div>
      <MonitorWidgets />
    </div>
  );
}
