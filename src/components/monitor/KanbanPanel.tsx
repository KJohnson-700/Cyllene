/**
 * KanbanPanel — renders Kanban.md as a horizontal scrolling board.
 * Parses Obsidian Kanban plugin markdown format.
 */
import { useEffect, useState } from "react";
import { obsidianApi } from "@/lib/api";

interface KanbanTask {
  text: string;
  done: boolean;
}

interface KanbanColumn {
  name: string;
  tasks: KanbanTask[];
}

const KANBAN_CANDIDATE_PATHS = [
  "Kanban.md",
  "kanban.md",
  "projects/Kanban.md",
  "projects/kanban.md",
] as const;

function normalizeKanbanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("404")) {
    return "Kanban.md not found. Ensure the file exists in your vault root.";
  }
  if (raw.includes("502") || raw.includes("503") || raw.includes("504")) {
    return "Obsidian endpoint unavailable. Hermes tunnel may be offline.";
  }
  if (raw.includes("<!DOCTYPE html") || raw.includes("<html")) {
    return "Obsidian endpoint returned HTML instead of JSON. Check tunnel/rewrite target.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

// ── Parser ─────────────────────────────────────────────────────────────────────
function parseKanban(raw: string): KanbanColumn[] {
  // Strip YAML frontmatter
  let content = raw.replace(/^---[\s\S]*?---\n?/, "");
  // Strip kanban settings block
  content = content.replace(/%%\s*kanban:settings[\s\S]*?%%/g, "");

  const columns: KanbanColumn[] = [];
  let currentCol: KanbanColumn | null = null;

  for (const line of content.split("\n")) {
    // Column header: ## Heading
    const colMatch = line.match(/^##\s+(.+)/);
    if (colMatch) {
      currentCol = { name: colMatch[1].trim(), tasks: [] };
      columns.push(currentCol);
      continue;
    }

    if (!currentCol) continue;

    // Incomplete task: - [ ] text
    const todoMatch = line.match(/^[-*]\s+\[\s\]\s+(.*)/);
    if (todoMatch) {
      currentCol.tasks.push({ text: todoMatch[1].trim(), done: false });
      continue;
    }

    // Done task: - [x] text (case-insensitive x)
    const doneMatch = line.match(/^[-*]\s+\[[xX]\]\s+(.*)/);
    if (doneMatch) {
      currentCol.tasks.push({ text: doneMatch[1].trim(), done: true });
    }
  }

  return columns.filter((c) => c.tasks.length > 0 || c.name.length > 0);
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function ColumnSkeleton() {
  return (
    <div className="shrink-0 w-52 flex flex-col gap-2">
      <div className="h-6 rounded-full bg-white/8 animate-pulse w-28" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task }: { task: KanbanTask }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 flex items-start gap-2 transition-opacity ${
        task.done
          ? "border-white/5 bg-white/2 opacity-40"
          : "border-white/8 bg-white/3"
      }`}
    >
      {/* Visual checkbox */}
      <div
        className={`shrink-0 mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center ${
          task.done
            ? "border-white/20 bg-white/10"
            : "border-white/25"
        }`}
      >
        {task.done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3L3 5L7 1" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span
        className={`text-[11px] font-mono leading-snug ${
          task.done ? "line-through text-white/30" : "text-white/70"
        }`}
      >
        {task.text}
      </span>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────
function Column({ col }: { col: KanbanColumn }) {
  const isDone = /done|complete|finished|archive/i.test(col.name);

  return (
    <div className={`shrink-0 w-52 flex flex-col gap-2 ${isDone ? "opacity-60" : ""}`}>
      {/* Header pill */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
          {col.name}
        </span>
        <span className="text-[10px] font-mono text-white/20">{col.tasks.length}</span>
      </div>

      {/* Tasks */}
      <div className="flex flex-col gap-1.5">
        {col.tasks.map((task, i) => (
          <TaskCard key={i} task={task} />
        ))}
        {col.tasks.length === 0 && (
          <p className="text-[10px] font-mono text-white/15 px-1">empty</p>
        )}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function KanbanPanel() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    async function loadKanban() {
      let lastErr: unknown = null;
      for (const path of KANBAN_CANDIDATE_PATHS) {
        try {
          const res = await obsidianApi.readFile(path);
          if (cancelled) return;
          setColumns(parseKanban(res.content));
          setResolvedPath(path);
          setError(null);
          return;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!cancelled) {
        setResolvedPath(null);
        setError(normalizeKanbanError(lastErr));
      }
    }

    void loadKanban().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        <ColumnSkeleton />
        <ColumnSkeleton />
        <ColumnSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col gap-2">
        <p className="text-[11px] font-mono text-yellow-400/60 leading-relaxed">{error}</p>
        <p className="text-[10px] font-mono text-white/20">
          Ensure Kanban.md exists at the root of your vault and the /obsidian/file endpoint is available.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-1 w-fit rounded border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-mono text-white/55 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          retry
        </button>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-[11px] font-mono text-white/20">
          No columns found in Kanban.md — add ## Column headers with task items.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      {resolvedPath && (
        <p className="px-4 pt-2 text-[10px] font-mono text-white/25">source: {resolvedPath}</p>
      )}
      <div className="flex gap-4 p-4 min-w-max">
        {columns.map((col, i) => (
          <Column key={i} col={col} />
        ))}
      </div>
    </div>
  );
}
