/**
 * BrainGraph — canvas-based neural memory visualization.
 * Same visual DNA as GhostFace: no shadowBlur, ResizeObserver, fillContainer.
 *
 * Data: obsidianApi.listRecent(40) polled every 45s.
 * Edges: obsidianApi.search('[[') → extract [[TargetNote]] patterns from snippets.
 * Force simulation: repulsion + spring + gravity, all hand-rolled (no D3).
 */
import { useEffect, useRef, useState } from "react";
import { obsidianApi } from "@/lib/api";

// ── Color palette — mirrors GhostFace STATE_RGB ────────────────────────────────
const C_DAILY:   [number, number, number] = [120, 255, 180];  // idle green
const C_REGULAR: [number, number, number] = [160, 200, 255];  // responding blue
const C_TODAY:   [number, number, number] = [255, 180,  80];  // amber — modified today
const BG_COLOR = "#020810";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GraphNode {
  id: string;        // filename without .md
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: [number, number, number];
  alpha: number;     // 0→1 fade-in
  born: number;      // frame born
  isNew: boolean;
  modified: number;  // unix ms
  birthFrame: number;
  newRingFrame: number; // when isNew animation started
}

interface GraphEdge {
  from: string;
  to: string;
  particleT: number; // 0..1 along edge
}

const DAILY_RE = /^\d{4}-\d{2}-\d{2}/;
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:[|#][^\]]*?)?\]\]/g;

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function isToday(modified: number): boolean {
  const d = new Date(modified);
  const t = new Date();
  return d.getFullYear() === t.getFullYear()
    && d.getMonth() === t.getMonth()
    && d.getDate() === t.getDate();
}

function nodeColor(name: string, modified: number): [number, number, number] {
  if (isToday(modified))       return C_TODAY;
  if (DAILY_RE.test(name))     return C_DAILY;
  return C_REGULAR;
}

function nodeRadius(modified: number): number {
  const age = Date.now() - modified;
  const dayMs = 86400_000;
  if (age < dayMs)      return 13;
  if (age < 7 * dayMs)  return 10;
  if (age < 30 * dayMs) return 7;
  return 5;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Status badge (shown while loading / on error) ──────────────────────────────
type PanelStatus = 'loading' | 'error' | 'ok';

// ── Component ─────────────────────────────────────────────────────────────────
export function BrainGraph() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const nodesRef   = useRef<GraphNode[]>([]);
  const edgesRef   = useRef<GraphEdge[]>([]);
  const statusRef  = useRef<PanelStatus>('loading');
  const nodeCountRef = useRef(0);
  const tooltipRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ id: string; ts: number } | null>(null);
  const resetRef   = useRef(false);

  // Exposed status for overlay text
  const [statusDisplay, setStatusDisplay] = useState<PanelStatus>('loading');

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchData = async (W: number, H: number) => {
    try {
      const res = await obsidianApi.listRecent(40);
      const files = res.files ?? [];

      const existingIds = new Set(nodesRef.current.map((n) => n.id));
      const newIds      = new Set<string>();

      const updatedNodes: GraphNode[] = files.map((f) => {
        const id    = basename(f.path);
        const isNew = !existingIds.has(id);
        newIds.add(id);

        const existing = nodesRef.current.find((n) => n.id === id);
        if (existing) {
          // Update radius + color, keep position
          existing.r     = nodeRadius(f.modified);
          existing.color = nodeColor(id, f.modified);
          existing.modified = f.modified;
          return existing;
        }

        return {
          id,
          x: W * 0.2 + Math.random() * W * 0.6,
          y: H * 0.2 + Math.random() * H * 0.6,
          vx: 0, vy: 0,
          r: nodeRadius(f.modified),
          color: nodeColor(id, f.modified),
          alpha: 0,
          born: Date.now(),
          isNew,
          modified: f.modified,
          birthFrame: 0,
          newRingFrame: isNew ? 0 : 999,
        };
      });

      nodesRef.current   = updatedNodes;
      nodeCountRef.current = updatedNodes.length;

      // Extract edges from wikilink search
      try {
        const searchRes = await obsidianApi.search("[[");
        const nodeSet   = new Set(updatedNodes.map((n) => n.id));
        const edges: GraphEdge[] = [];
        const seen = new Set<string>();

        for (const item of searchRes.results ?? []) {
          const fromName = basename(item.filename ?? "");
          if (!nodeSet.has(fromName)) continue;
          for (const snippet of item.snippets ?? []) {
            let m: RegExpExecArray | null;
            WIKILINK_RE.lastIndex = 0;
            while ((m = WIKILINK_RE.exec(snippet)) !== null) {
              const toName = m[1].trim();
              if (!nodeSet.has(toName)) continue;
              if (fromName === toName) continue;
              const key = [fromName, toName].sort().join("→");
              if (seen.has(key)) continue;
              seen.add(key);
              // Reuse existing edge particle position if available
              const existing = edgesRef.current.find(
                (e) => (e.from === fromName && e.to === toName) ||
                        (e.from === toName && e.to === fromName)
              );
              edges.push({
                from: fromName,
                to: toName,
                particleT: existing?.particleT ?? Math.random(),
              });
            }
          }
        }
        edgesRef.current = edges;
      } catch {
        // Edge extraction is best-effort; graph still shows without edges
        edgesRef.current = [];
      }

      statusRef.current = 'ok';
      setStatusDisplay('ok');
    } catch {
      if (nodesRef.current.length === 0) {
        statusRef.current = 'error';
        setStatusDisplay('error');
      }
    }
  };

  // ── Canvas animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;

    const resize = () => {
      try {
        const rect = canvas.getBoundingClientRect();
        const w    = Math.floor(rect.width  * dpr);
        const h    = Math.floor(rect.height * dpr);
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width  = w;
          canvas.height = h;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          W = rect.width;
          H = rect.height;
        }
      } catch { /* ignore */ }
    };

    const ro = new ResizeObserver(() => {
      resize();
      // Re-fetch with new dimensions
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        fetchData(rect.width, rect.height);
      }
    });
    ro.observe(canvas);
    resize();

    // Initial fetch
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    fetchData(W, H);

    // Poll every 45s
    const pollTimer = setInterval(() => fetchData(W, H), 45_000);

    // ── Tap handling ──────────────────────────────────────────────────────────
    const onTap = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      let cx = 0, cy = 0;
      if (e instanceof MouseEvent) {
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
      } else {
        const t = e.changedTouches[0];
        cx = t.clientX - rect.left;
        cy = t.clientY - rect.top;
      }

      // Double tap → reset layout
      const now = Date.now();
      const prevTap = lastTapRef.current;
      if (prevTap && (now - prevTap.ts) < 350) {
        resetRef.current = true;
        tooltipRef.current = null;
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { id: '', ts: now };

      // Hit-test nodes
      let hit: GraphNode | null = null;
      for (const node of nodesRef.current) {
        const dx = node.x - cx;
        const dy = node.y - cy;
        if (Math.sqrt(dx * dx + dy * dy) <= node.r + 6) {
          hit = node;
          break;
        }
      }

      if (!hit) {
        tooltipRef.current = null;
        return;
      }

      // Toggle tooltip
      if (tooltipRef.current?.id === hit.id) {
        tooltipRef.current = null;
      } else {
        tooltipRef.current = { id: hit.id, x: hit.x, y: hit.y };
      }
    };

    canvas.addEventListener("click", onTap);
    canvas.addEventListener("touchend", onTap);

    // ── Draw loop ─────────────────────────────────────────────────────────────
    let frame = 0;
    let raf   = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      frame++;

      const rect2 = canvas.getBoundingClientRect();
      W = rect2.width;
      H = rect2.height;
      if (W <= 0 || H <= 0) return;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // Reset layout if requested
      if (resetRef.current) {
        resetRef.current = false;
        for (const n of nodes) {
          n.x = W * 0.15 + Math.random() * W * 0.70;
          n.y = H * 0.15 + Math.random() * H * 0.70;
          n.vx = (Math.random() - 0.5) * 2;
          n.vy = (Math.random() - 0.5) * 2;
        }
      }

      // ── Force simulation — 3 ticks per frame ─────────────────────────────
      for (let tick = 0; tick < 3; tick++) {
        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist2 = dx * dx + dy * dy + 0.01;
            const dist  = Math.sqrt(dist2);
            const minDist = nodes[i].r + nodes[j].r + 20;
            if (dist < minDist * 3) {
              const k    = 800 / dist2;
              const fx   = (dx / dist) * k;
              const fy   = (dy / dist) * k;
              nodes[i].vx -= fx;
              nodes[i].vy -= fy;
              nodes[j].vx += fx;
              nodes[j].vy += fy;
            }
          }
        }

        // Edge spring attraction
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        for (const edge of edges) {
          const a = nodeMap.get(edge.from);
          const b = nodeMap.get(edge.to);
          if (!a || !b) continue;
          const dx   = b.x - a.x;
          const dy   = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const rest = 80 + a.r + b.r;
          const stretch = dist - rest;
          const k  = 0.003 * stretch;
          const fx = (dx / dist) * k;
          const fy = (dy / dist) * k;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        // Center gravity
        const cx2 = W / 2, cy2 = H / 2;
        for (const n of nodes) {
          n.vx += (cx2 - n.x) * 0.0008;
          n.vy += (cy2 - n.y) * 0.0008;
        }

        // Damping + integrate + clamp
        for (const n of nodes) {
          n.vx *= 0.88;
          n.vy *= 0.88;
          n.x  = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x + n.vx));
          n.y  = Math.max(n.r + 8, Math.min(H - n.r - 8, n.y + n.vy));
        }
      }

      // ── Clear ─────────────────────────────────────────────────────────────
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, W, H);

      // Faint dot grid
      ctx.fillStyle = "rgba(80,220,255,0.04)";
      for (let gx = 0; gx < W; gx += 28) {
        for (let gy = 0; gy < H; gy += 28) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Status overlays ───────────────────────────────────────────────────
      if (statusRef.current === 'loading') {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = "12px ui-monospace,'SF Mono','Courier New',monospace";
        const alpha = 0.3 + 0.2 * Math.sin(frame * 0.08);
        ctx.fillStyle    = `rgba(80,220,255,${alpha.toFixed(2)})`;
        ctx.fillText("mapping vault memories…", W / 2, H / 2);
        ctx.textBaseline = "alphabetic";
        return;
      }

      if (statusRef.current === 'error' && nodes.length === 0) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = "11px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.fillStyle    = "rgba(255,80,80,0.5)";
        ctx.fillText("no vault connection", W / 2, H / 2 - 10);
        // Pulsing dot
        const pr = 4 + 2 * Math.sin(frame * 0.1);
        ctx.fillStyle = `rgba(255,80,80,${0.4 + 0.3 * Math.sin(frame * 0.1)})`;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2 + 18, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.textBaseline = "alphabetic";
        return;
      }

      // ── Edges ─────────────────────────────────────────────────────────────
      const nodeMap2 = new Map(nodes.map((n) => [n.id, n]));

      for (const edge of edges) {
        const a = nodeMap2.get(edge.from);
        const b = nodeMap2.get(edge.to);
        if (!a || !b) continue;

        const [ar, ag, ab] = a.color;

        // Bezier curve
        const cpx = (a.x + b.x) / 2 + (b.y - a.y) * 0.2;
        const cpy = (a.y + b.y) / 2 - (b.x - a.x) * 0.2;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.08)`;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Particle drifting along the edge
        edge.particleT = (edge.particleT + 0.003) % 1;
        const t  = edge.particleT;
        const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cpx + t * t * b.x;
        const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cpy + t * t * b.y;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar},${ag},${ab},0.35)`;
        ctx.fill();
      }

      // ── Nodes ─────────────────────────────────────────────────────────────
      for (const node of nodes) {
        // Fade in
        node.alpha = Math.min(1, node.alpha + 0.04);
        node.birthFrame++;

        const [r, g, b] = node.color;
        const alpha = node.alpha;

        // New-node animation: expanding rings (like GhostFace alert pulse)
        if (node.isNew && node.newRingFrame < 80) {
          node.newRingFrame++;
          const progress = node.newRingFrame / 80;
          for (let ri = 0; ri < 3; ri++) {
            const rProgress = Math.max(0, progress - ri * 0.12);
            if (rProgress <= 0) continue;
            const ringR = node.r + rProgress * node.r * 3;
            const ringA = (1 - rProgress) * 0.4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},${ringA * alpha})`;
            ctx.lineWidth   = 1.5;
            ctx.stroke();
          }
          if (node.newRingFrame >= 80) node.isNew = false;
        }

        // 4 glow rings (no shadowBlur)
        for (let gi = 4; gi >= 1; gi--) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + gi * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.04 * gi * alpha})`;
          ctx.lineWidth   = gi * 2;
          ctx.stroke();
        }

        // Solid core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.75 * alpha})`;
        ctx.fill();

        // Outline
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.9 * alpha})`;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // White glint
        if (node.r > 5) {
          ctx.beginPath();
          ctx.arc(
            node.x - node.r * 0.28,
            node.y - node.r * 0.28,
            node.r * 0.22,
            0, Math.PI * 2,
          );
          ctx.fillStyle = `rgba(255,255,255,${0.55 * alpha})`;
          ctx.fill();
        }
      }

      // ── Tooltip ───────────────────────────────────────────────────────────
      const tip = tooltipRef.current;
      if (tip) {
        const node = nodeMap2.get(tip.id);
        if (node) {
          // Sync position
          tip.x = node.x;
          tip.y = node.y;

          const label   = node.id;
          const subLabel = timeAgo(node.modified);
          const pad     = 8;
          const fw      = 9;

          ctx.font = `bold 11px ui-monospace,'SF Mono','Courier New',monospace`;
          const labelW = ctx.measureText(label).width;
          ctx.font = `9px ui-monospace,'SF Mono','Courier New',monospace`;
          const subW = ctx.measureText(subLabel).width;

          const boxW = Math.max(labelW, subW) + pad * 2;
          const boxH = 32;
          let bx = node.x - boxW / 2;
          let by = node.y - node.r - boxH - 8;

          // Clamp to canvas bounds
          bx = Math.max(4, Math.min(W - boxW - 4, bx));
          by = Math.max(4, Math.min(H - boxH - 4, by));

          // Background
          ctx.fillStyle   = "rgba(2,8,16,0.92)";
          ctx.strokeStyle = `rgba(${node.color[0]},${node.color[1]},${node.color[2]},0.5)`;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, boxW, boxH, 5);
          ctx.fill();
          ctx.stroke();

          // Text
          ctx.font      = "bold 11px ui-monospace,'SF Mono','Courier New',monospace";
          ctx.textAlign = "left";
          ctx.fillStyle = `rgb(${node.color[0]},${node.color[1]},${node.color[2]})`;
          ctx.fillText(label, bx + pad, by + 13);

          ctx.font      = `9px ui-monospace,'SF Mono','Courier New',monospace`;
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillText(subLabel, bx + pad, by + 25);

          void fw; // suppress unused warning
        }
      }

      // ── Node count label ──────────────────────────────────────────────────
      if (nodes.length > 0) {
        ctx.textAlign    = "left";
        ctx.textBaseline = "alphabetic";
        ctx.font         = "9px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.fillStyle    = "rgba(80,220,255,0.18)";
        ctx.fillText(`${nodes.length} notes`, 10, H - 10);
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearInterval(pollTimer);
      canvas.removeEventListener("click", onTap);
      canvas.removeEventListener("touchend", onTap);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      {/* React-land loading overlay (before first paint) */}
      {statusDisplay === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Canvas handles the text — this is just a fallback before first frame */}
        </div>
      )}
    </div>
  );
}
