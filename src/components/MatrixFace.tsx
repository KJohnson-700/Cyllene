import { useEffect, useRef } from "react";
import type { AgentState } from "@/hooks/useRunStream";

interface Props {
  agentState: AgentState;
  activeTool?: string | null;
  tokenCount?: number;
  amplitude?: number;
  weather?: { condition: string; temp: number } | null;
  /** Smoothed device orientation for dynamic light source shift. */
  orientation?: { beta: number; gamma: number } | null;
  /** Tap handler — e.g. to toggle fullscreen from parent. */
  onDoubleTap?: () => void;
}

// ── Config ────────────────────────────────────────────────────────────────────
const CHARS =
  "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ" +
  "0123456789ABCDEF@#$%&*+=<>|/\\";

const COLS = 64;
const ROWS = 80;
const ATLAS_COLS = 12;
const ATLAS_ROWS = 8;               // 96 slots, we have ~95 chars
const ATLAS_CELL = 48;              // px per char in atlas

const STATE_HUE: Record<AgentState, [number, number, number]> = {
  idle:       [0.00, 1.00, 0.40],
  reasoning:  [0.25, 0.95, 0.85],
  responding: [0.00, 0.90, 1.00],
  alert:      [1.00, 0.20, 0.20],
};

// ── Character atlas ──────────────────────────────────────────────────────────
function buildCharAtlas(): HTMLCanvasElement {
  const cvs = document.createElement("canvas");
  cvs.width  = ATLAS_COLS * ATLAS_CELL;
  cvs.height = ATLAS_ROWS * ATLAS_CELL;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.font = `bold ${Math.floor(ATLAS_CELL * 0.78)}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  for (let i = 0; i < CHARS.length && i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const cx = col * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = row * ATLAS_CELL + ATLAS_CELL / 2 + 1;
    ctx.fillText(CHARS[i], cx, cy);
  }
  return cvs;
}

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D uAtlas;
uniform sampler2D uGrid;      // per-cell char index (R channel)
uniform sampler2D uHeads;     // per-column head pos (R channel, 0..1 of ROWS+14)

uniform float uTime;
uniform float uAspect;
uniform vec4 uExprA;    // mouthOpen, mouthRound, eyeOpenness, browFurrow
uniform vec4 uExprB;    // browHeight, smileAmt, browSplit, blink
uniform vec3 uStateColor;
uniform float uAlert;   // 0..1 red tint
uniform vec2 uLightShift; // orientation-driven light offset
uniform float uReasoningGlow; // 0..1 for reasoning state inner glow

const float COLS = ${COLS}.0;
const float ROWS = ${ROWS}.0;
const float ATLAS_COLS = ${ATLAS_COLS}.0;
const float ATLAS_ROWS = ${ATLAS_ROWS}.0;

// ── Face geometry (anatomical) ─────────────────────────────────────────────
float faceZ(vec2 n) {
  float skullW = 0.81 + 0.055 * exp(-pow(n.y - 0.05, 2.0) / 0.30);
  float sphere = 1.0 - pow(n.x / skullW, 2.0) - pow(n.y / 1.045, 2.0);
  if (sphere <= 0.0) return 0.0;
  float z = sqrt(sphere) * 0.91;

  // Temple hollows
  float tdL = length(vec2((n.x + 0.55) * 1.85, (n.y + 0.04) * 2.3));
  float tdR = length(vec2((n.x - 0.55) * 1.85, (n.y + 0.04) * 2.3));
  if (tdL < 0.42) z -= pow((0.42 - tdL) / 0.42, 1.6) * 0.10;
  if (tdR < 0.42) z -= pow((0.42 - tdR) / 0.42, 1.6) * 0.10;

  // Forehead recedes
  if (n.y < -0.40) z *= 1.0 - ((-n.y - 0.40) / 0.62) * 0.09;

  // Brow ridge
  float browCY = -0.25;
  if (n.y > browCY - 0.14 && n.y < browCY + 0.09 && abs(n.x) < 0.52) {
    float ty = (n.y - browCY) / 0.14;
    float tx2 = pow(n.x / 0.48, 2.0);
    z += exp(-ty * ty * 2.3) * exp(-tx2 * 1.2) * 0.14;
  }

  // Eye sockets
  float edL = length(vec2((n.x + 0.265) * 2.45, (n.y + 0.105) * 3.15));
  float edR = length(vec2((n.x - 0.265) * 2.45, (n.y + 0.105) * 3.15));
  if (edL < 0.40) z -= pow((0.40 - edL) / 0.40, 1.1) * 0.22;
  if (edR < 0.40) z -= pow((0.40 - edR) / 0.40, 1.1) * 0.22;

  // Nose bridge + tip
  float nbD = length(vec2(n.x * 5.9, (n.y - 0.09) * 4.6));
  if (nbD < 0.40) z += pow((0.40 - nbD) / 0.40, 0.75) * 0.24;
  float ntD = length(vec2(n.x * 5.1, (n.y - 0.34) * 6.1));
  if (ntD < 0.27) z += ((0.27 - ntD) / 0.27) * 0.17;
  // Nostril wings
  float nwL = length(vec2((n.x + 0.13) * 5.1, (n.y - 0.39) * 7.6));
  float nwR = length(vec2((n.x - 0.13) * 5.1, (n.y - 0.39) * 7.6));
  if (nwL < 0.19) z -= ((0.19 - nwL) / 0.19) * 0.06;
  if (nwR < 0.19) z -= ((0.19 - nwR) / 0.19) * 0.06;

  // Cheekbones
  float cdL = length(vec2((n.x + 0.44) * 2.1, (n.y - 0.08) * 2.7));
  float cdR = length(vec2((n.x - 0.44) * 2.1, (n.y - 0.08) * 2.7));
  if (cdL < 0.36) z += pow((0.36 - cdL) / 0.36, 1.2) * 0.12;
  if (cdR < 0.36) z += pow((0.36 - cdR) / 0.36, 1.2) * 0.12;

  // Philtrum
  float phD = length(vec2(n.x * 7.6, (n.y - 0.43) * 10.2));
  if (phD < 0.21) z -= ((0.21 - phD) / 0.21) * 0.045;

  // Lip ridge
  float lipD = length(vec2(n.x * 2.7, (n.y - 0.49) * 5.4));
  if (lipD < 0.27) z += ((0.27 - lipD) / 0.27) * 0.12;

  // Chin
  float chD = length(vec2(n.x * 4.1, (n.y - 0.70) * 5.2));
  if (chD < 0.25) z += ((0.25 - chD) / 0.25) * 0.13;

  return max(0.0, z);
}

vec3 L1vec() {
  vec3 v = vec3(-0.44 + uLightShift.x, -0.60 + uLightShift.y, 0.67);
  return normalize(v);
}
const vec3 L2 = vec3(0.52, -0.12, 0.85);

float faceLighting(vec2 n) {
  float z = faceZ(n);
  if (z <= 0.0) return 0.0;
  float eps = 0.012;
  float dzdx = (faceZ(vec2(n.x + eps, n.y)) - faceZ(vec2(n.x - eps, n.y))) / (2.0 * eps);
  float dzdy = (faceZ(vec2(n.x, n.y + eps)) - faceZ(vec2(n.x, n.y - eps))) / (2.0 * eps);
  vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));

  vec3 L1 = L1vec();
  vec3 L2n = normalize(L2);

  float diff1 = max(0.0, dot(L1, normal));
  float diff2 = max(0.0, dot(L2n, normal)) * 0.22;

  // Blinn-Phong specular
  vec3 H = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(0.0, dot(normal, H)), 38.0) * 0.80;

  // Rim light (back lighting on silhouette edges)
  float rim = pow(1.0 - max(0.0, normal.z), 3.0) * 0.15;

  return clamp(0.03 + diff1 * 0.95 + diff2 + spec + rim, 0.0, 1.0);
}

float applyExpression(vec2 n, float baseLight) {
  float light = baseLight;

  // Eye openness
  float sdL = length(vec2((n.x + 0.265) / 0.20, (n.y + 0.105) / 0.155));
  float sdR = length(vec2((n.x - 0.265) / 0.20, (n.y + 0.105) / 0.155));
  if (sdL < 1.0) {
    float inner = 1.0 - sdL;
    light += inner * (1.0 - uExprA.z) * 0.34;
    light -= inner * max(0.0, uExprA.z - 1.0) * 0.22;
  }
  if (sdR < 1.0) {
    float inner = 1.0 - sdR;
    light += inner * (1.0 - uExprA.z) * 0.34;
    light -= inner * max(0.0, uExprA.z - 1.0) * 0.22;
  }

  // Pupils: bright highlight when eyes open
  if (uExprA.z > 0.85) {
    float pL = length(vec2((n.x + 0.265) / 0.035, (n.y + 0.10) / 0.035));
    float pR = length(vec2((n.x - 0.265) / 0.035, (n.y + 0.10) / 0.035));
    if (pL < 1.0) light += (1.0 - pL) * (uExprA.z - 0.85) * 0.6;
    if (pR < 1.0) light += (1.0 - pR) * (uExprA.z - 0.85) * 0.6;
  }

  // Brow furrow
  float browY = -0.26 + uExprB.x * 0.09;
  float bxSq = n.x * n.x / 0.012;
  float bySq = pow(n.y - browY, 2.0) / 0.0038;
  if (bxSq < 9.0 && bySq < 9.0) {
    light -= exp(-bxSq) * exp(-bySq) * uExprA.w * 0.50;
  }

  // Brow split (inner raise for angry look)
  float bsL = length(vec2((n.x + 0.14) / 0.13, (n.y - browY - 0.07) / 0.065));
  float bsR = length(vec2((n.x - 0.14) / 0.13, (n.y - browY - 0.07) / 0.065));
  if (bsL < 1.0) light += (1.0 - bsL) * uExprB.z * 0.18;
  if (bsR < 1.0) light += (1.0 - bsR) * uExprB.z * 0.18;

  // Mouth cavity
  float mRx = 0.22 * (1.0 - uExprA.y * 0.32);
  float mRy = 0.052 + uExprA.x * 0.20 + uExprA.y * 0.075;
  float mD = length(vec2(n.x / mRx, (n.y - 0.49) / mRy));
  if (mD < 1.0) light -= (1.0 - mD) * uExprA.x * 0.98;

  // Teeth (rim of mouth)
  if (uExprA.x > 0.18) {
    float tD = length(vec2(n.x / (mRx * 0.72), (n.y - 0.455) / (mRy * 0.34)));
    if (tD < 1.0) light += (1.0 - tD) * (uExprA.x - 0.18) * 0.46;
  }

  // Smile corners
  float lcL = length(vec2((n.x + 0.175) / 0.068, (n.y - 0.465) / 0.048));
  float lcR = length(vec2((n.x - 0.175) / 0.068, (n.y - 0.465) / 0.048));
  if (lcL < 1.0) light += (1.0 - lcL) * uExprB.y * 0.26;
  if (lcR < 1.0) light += (1.0 - lcR) * uExprB.y * 0.26;

  return clamp(light, 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;
  uv.y = 1.0 - uv.y;

  // Cell
  vec2 cellUV = uv * vec2(COLS, ROWS);
  vec2 cellIdx = floor(cellUV);
  vec2 cellLocal = fract(cellUV);

  // Face normalized coords at cell centre
  vec2 cellCenter = (cellIdx + 0.5) / vec2(COLS, ROWS);
  vec2 n = (cellCenter * 2.0 - 1.0) * vec2(uAspect, 1.0);

  // Lighting
  float fBase = faceLighting(n);
  float fDepth = faceZ(n);
  bool onFace = fDepth > 0.0;
  float fBrite = applyExpression(n, fBase);

  // Rain head
  float headSample = texture(uHeads, vec2((cellIdx.x + 0.5) / COLS, 0.5)).r;
  float colHead = headSample * (ROWS + 14.0) - 4.0;
  float headDist = colHead - cellIdx.y;
  float rainBrite;
  if (headDist >= 0.0 && headDist < 1.0) rainBrite = 1.0;
  else if (headDist < 0.0 || headDist >= 16.0) rainBrite = 0.015;
  else rainBrite = exp(-headDist * 0.36);

  // Composite — face hard-dominates, background very dim
  float finalBrite;
  if (fBrite > 0.14) finalBrite = fBrite * 1.0 + rainBrite * 0.08;
  else if (fBrite > 0.03) finalBrite = fBrite * 0.62 + rainBrite * 0.18;
  else finalBrite = rainBrite * 0.16 + 0.004;
  finalBrite = clamp(finalBrite, 0.0, 1.0);

  // Character sample
  float charIdx = floor(texture(uGrid, cellCenter).r * 255.0 + 0.5);
  float aCol = mod(charIdx, ATLAS_COLS);
  float aRow = floor(charIdx / ATLAS_COLS);
  vec2 atlasUV = (vec2(aCol, aRow) + cellLocal) / vec2(ATLAS_COLS, ATLAS_ROWS);
  float charMask = texture(uAtlas, atlasUV).r;

  // Base colour with depth tint
  float dt = onFace ? clamp(fDepth * 0.7, 0.0, 1.0) : 0.0;
  vec3 baseCol = uStateColor;
  if (uAlert < 0.5) {
    baseCol.r += dt * 0.25;
    baseCol.b -= dt * 0.15;
  }

  // Bloom: bright face cells glow additively
  float bloomK = smoothstep(0.50, 0.95, fBrite) * 0.9;
  vec3 bloomCol = baseCol * bloomK;

  // Reasoning inner glow
  float rG = uReasoningGlow * smoothstep(0.35, 0.85, fBrite);
  bloomCol += vec3(0.0, 0.6, 1.0) * rG * 0.4;

  // Final
  vec3 col = (baseCol * finalBrite + bloomCol) * charMask;

  // Background ambient glow (very subtle)
  if (!onFace) {
    col += baseCol * rainBrite * 0.04 * charMask;
  }

  float alpha = charMask * clamp(finalBrite * 1.6 + bloomK * 0.5, 0.0, 1.0);

  // Scanlines
  float sl = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.1);
  col *= sl;

  // Vignette
  vec2 vpos = uv * 2.0 - 1.0;
  float vig = 1.0 - dot(vpos, vpos) * 0.35;
  col *= vig;

  outColor = vec4(col, alpha);
}`;

// ── GL helpers ────────────────────────────────────────────────────────────────
function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    throw new Error("shader compile");
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, v: WebGLShader, f: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    throw new Error("program link");
  }
  return p;
}

// ── Expression system (CPU-side, lerped each frame) ──────────────────────────
interface Expr {
  mouthOpen: number; mouthRound: number; eyeOpenness: number; browFurrow: number;
  browHeight: number; smileAmt: number; browSplit: number;
}
const E_IDLE: Expr      = { mouthOpen:0.06, mouthRound:0,    eyeOpenness:0.95, browFurrow:0,    browHeight:0,     smileAmt:0.55, browSplit:0   };
const E_REASONING: Expr = { mouthOpen:0,    mouthRound:0,    eyeOpenness:0.52, browFurrow:1.0,  browHeight:-0.16, smileAmt:0,    browSplit:0.9 };
const E_TALK_A: Expr    = { mouthOpen:0.32, mouthRound:0,    eyeOpenness:1.0,  browFurrow:0,    browHeight:0.03,  smileAmt:0.3,  browSplit:0   };
const E_TALK_B: Expr    = { mouthOpen:0.60, mouthRound:0,    eyeOpenness:0.94, browFurrow:0.08, browHeight:0,     smileAmt:0.15, browSplit:0.1 };
const E_TALK_C: Expr    = { mouthOpen:0.54, mouthRound:0.78, eyeOpenness:1.1,  browFurrow:0,    browHeight:0.07,  smileAmt:0.1,  browSplit:0   };
const E_TALK_D: Expr    = { mouthOpen:0.44, mouthRound:1.0,  eyeOpenness:1.0,  browFurrow:0,    browHeight:0,     smileAmt:0,    browSplit:0   };
const E_ALERT: Expr     = { mouthOpen:0.24, mouthRound:0.2,  eyeOpenness:1.52, browFurrow:0.3,  browHeight:0.22,  smileAmt:0,    browSplit:0.4 };
const TALK_FRAMES = [E_TALK_A, E_TALK_B, E_TALK_C, E_TALK_D];

function lerpExpr(a: Expr, b: Expr, t: number): Expr {
  const L = (x: number, y: number) => x + (y - x) * t;
  return {
    mouthOpen: L(a.mouthOpen, b.mouthOpen),
    mouthRound: L(a.mouthRound, b.mouthRound),
    eyeOpenness: L(a.eyeOpenness, b.eyeOpenness),
    browFurrow: L(a.browFurrow, b.browFurrow),
    browHeight: L(a.browHeight, b.browHeight),
    smileAmt: L(a.smileAmt, b.smileAmt),
    browSplit: L(a.browSplit, b.browSplit),
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Component ─────────────────────────────────────────────────────────────────
export function MatrixFace({
  agentState, activeTool, tokenCount = 0, amplitude = 0, weather,
  orientation, onDoubleTap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ agentState, activeTool, tokenCount, amplitude, weather, orientation });
  propsRef.current = { agentState, activeTool, tokenCount, amplitude, weather, orientation };
  const prevState = useRef<AgentState>(agentState);
  const lastTapRef = useRef(0);

  // Haptic on state change
  useEffect(() => {
    if (agentState === prevState.current) return;
    prevState.current = agentState;
    const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
    if (!tg) return;
    if (agentState === "alert") tg.notificationOccurred?.("error");
    else if (agentState === "reasoning") tg.impactOccurred?.("soft");
    else if (agentState === "responding") tg.impactOccurred?.("light");
  }, [agentState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }

    // Compile
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = link(gl, vs, fs);
    gl.useProgram(prog);

    // Fullscreen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Atlas texture
    const atlasCvs = buildCharAtlas();
    const atlasTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCvs);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Grid texture (R8, COLS x ROWS) — char indices
    const gridData = new Uint8Array(COLS * ROWS);
    const charAges = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < gridData.length; i++) gridData[i] = Math.floor(Math.random() * CHARS.length);
    const gridTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gridTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, COLS, ROWS, 0, gl.RED, gl.UNSIGNED_BYTE, gridData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Heads texture (R8, COLS x 1) — normalized head positions
    const headData = new Uint8Array(COLS);
    const colSpeeds = new Float32Array(COLS);
    const headPos = new Float32Array(COLS);  // raw head positions
    for (let i = 0; i < COLS; i++) {
      colSpeeds[i] = 0.28 + Math.random() * 1.0;
      headPos[i] = Math.random() * ROWS;
    }
    const headTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, headTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, COLS, 1, 0, gl.RED, gl.UNSIGNED_BYTE, headData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Uniform locations
    const uAtlas  = gl.getUniformLocation(prog, "uAtlas");
    const uGrid   = gl.getUniformLocation(prog, "uGrid");
    const uHeads  = gl.getUniformLocation(prog, "uHeads");
    const uTime   = gl.getUniformLocation(prog, "uTime");
    const uAspect = gl.getUniformLocation(prog, "uAspect");
    const uExprA  = gl.getUniformLocation(prog, "uExprA");
    const uExprB  = gl.getUniformLocation(prog, "uExprB");
    const uState  = gl.getUniformLocation(prog, "uStateColor");
    const uAlert  = gl.getUniformLocation(prog, "uAlert");
    const uLightShift = gl.getUniformLocation(prog, "uLightShift");
    const uReasoningGlow = gl.getUniformLocation(prog, "uReasoningGlow");
    gl.uniform1i(uAtlas, 0);
    gl.uniform1i(uGrid, 1);
    gl.uniform1i(uHeads, 2);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Expression state
    let expr: Expr = { ...E_IDLE };
    let talkT = 0;
    let blinkPhase = 0;
    let blinkTimer = 0;
    let blinkNext = 200;
    let frame = 0;
    let raf = 0;

    const render = () => {
      frame++;
      resize();
      const { agentState: state, amplitude: level, orientation: ori } = propsRef.current;

      // Blink
      blinkTimer++;
      if (state === "idle" && blinkTimer > blinkNext) {
        blinkPhase = 10; blinkTimer = 0; blinkNext = 165 + Math.random() * 250;
      }
      const blinkAmt = blinkPhase > 0 ? Math.sin((blinkPhase / 10) * Math.PI) : 0;
      if (blinkPhase > 0) blinkPhase--;

      // Expression target
      let target: Expr;
      if (state === "reasoning") target = E_REASONING;
      else if (state === "alert") target = E_ALERT;
      else if (state === "responding") {
        const spd = level > 0.06 ? level * 12 : 0.05;
        talkT = (talkT + spd) % 4;
        const tf = TALK_FRAMES[Math.floor(talkT)];
        target = level > 0.04 ? { ...tf, mouthOpen: clamp(level * 1.9, 0.12, 1.0) } : tf;
      } else {
        const p = 0.5 + 0.5 * Math.sin(frame * 0.007);
        target = { ...E_IDLE, smileAmt: 0.32 + p * 0.56 };
      }
      target = { ...target, eyeOpenness: target.eyeOpenness * clamp(1 - blinkAmt * 0.98, 0.02, 1) };
      expr = lerpExpr(expr, target, 0.09);

      // Column heads + char recycling
      const driveSpeed = state === "alert" ? 1.30 : state === "reasoning" ? 0.85 : 0.45;
      for (let c = 0; c < COLS; c++) {
        headPos[c] += colSpeeds[c] * driveSpeed;
        if (headPos[c] > ROWS + 14) headPos[c] = -(3 + Math.random() * 10);
        headData[c] = Math.max(0, Math.min(255, Math.floor(((headPos[c] + 4) / (ROWS + 14)) * 255)));
      }
      // Character recycle
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          charAges[i]++;
          const nearHead = Math.abs(headPos[c] - r) < 4;
          if (charAges[i] > (nearHead ? 1 : 22)) {
            gridData[i] = Math.floor(Math.random() * CHARS.length);
            charAges[i] = 0;
          }
        }
      }

      // Upload textures
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gridTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RED, gl.UNSIGNED_BYTE, gridData);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, headTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, 1, gl.RED, gl.UNSIGNED_BYTE, headData);

      // Uniforms
      gl.uniform1f(uTime, frame);
      const aspect = (canvas.clientWidth / canvas.clientHeight) * 0.96;
      gl.uniform1f(uAspect, aspect);
      gl.uniform4f(uExprA, expr.mouthOpen, expr.mouthRound, expr.eyeOpenness, expr.browFurrow);
      gl.uniform4f(uExprB, expr.browHeight, expr.smileAmt, expr.browSplit, blinkAmt);

      const [sr, sg, sb] = STATE_HUE[state];
      gl.uniform3f(uState, sr, sg, sb);
      gl.uniform1f(uAlert, state === "alert" ? 1.0 : 0.0);
      gl.uniform1f(uReasoningGlow, state === "reasoning" ? 1.0 : 0.0);

      // Orientation-driven light shift
      const gamma = ori?.gamma ?? 0;
      const beta = ori?.beta ?? 0;
      const lx = clamp(gamma / 45, -1, 1) * 0.18;
      const ly = clamp((beta - 45) / 45, -1, 1) * 0.18;
      gl.uniform2f(uLightShift, lx, ly);

      // Clear + draw
      gl.clearColor(0, 0.015, 0.008, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    // Double-tap handler
    const handleTap = () => {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        onDoubleTap?.();
      }
      lastTapRef.current = now;
    };
    canvas.addEventListener("click", handleTap);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleTap);
      gl.deleteTexture(atlasTex);
      gl.deleteTexture(gridTex);
      gl.deleteTexture(headTex);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    };
  }, []);

  // ── Chrome overlay (DOM) ────────────────────────────────────────────────────
  const shellRgb =
    agentState === "alert"      ? "rgb(255,80,80)" :
    agentState === "reasoning"  ? "rgb(64,240,215)" :
    agentState === "responding" ? "rgb(0,230,255)" :
                                  "rgb(0,255,100)";

  const stateLabel = agentState.toUpperCase();
  const dotClass =
    agentState === "alert" ? "animate-pulse"
    : agentState === "reasoning" ? "animate-pulse"
    : "";

  return (
    <div
      className="relative w-full"
      style={{
        height: 420,
        borderRadius: 14,
        overflow: "hidden",
        background: "#000503",
        border: `1.5px solid ${shellRgb}`,
        boxShadow: `0 0 14px ${shellRgb}55, inset 0 0 18px ${shellRgb}22`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Title bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 pointer-events-none"
        style={{
          height: 34,
          background: "linear-gradient(to bottom, rgba(0,6,3,0.98), rgba(0,6,3,0.85))",
          borderBottom: `1px solid ${shellRgb}33`,
          backdropFilter: "blur(4px)",
        }}
      >
        <div className="flex items-center gap-2">
          {/* Smiley */}
          <div
            style={{
              width: 18, height: 18, borderRadius: "50%",
              background: "#f6d22a",
              boxShadow: "0 0 6px #f6d22a88",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, lineHeight: 1,
            }}
          >
            <span style={{ color: "#000", fontSize: 13 }}>☺</span>
          </div>
          {/* State dot */}
          <div
            className={dotClass}
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: shellRgb,
              boxShadow: `0 0 6px ${shellRgb}`,
            }}
          />
          <span
            style={{
              fontFamily: "ui-monospace,'SF Mono',monospace",
              fontSize: 11, fontWeight: 700,
              color: shellRgb,
              textShadow: `0 0 4px ${shellRgb}88`,
              letterSpacing: 1,
            }}
          >
            HERMES
          </span>
        </div>

        <div className="flex items-center gap-3">
          {activeTool && (
            <span
              style={{
                fontFamily: "ui-monospace,'SF Mono',monospace",
                fontSize: 9,
                color: `${shellRgb}99`,
                letterSpacing: 0.5,
              }}
            >
              {activeTool.replace(/_/g, " ").toUpperCase().slice(0, 14)}
            </span>
          )}
          {/* Terminal-style controls */}
          <div className="flex items-center gap-2">
            <div style={{ width: 10, height: 2, background: `${shellRgb}80` }} />
            <div style={{ width: 8, height: 8, border: `1.2px solid ${shellRgb}aa` }} />
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke={shellRgb} strokeWidth="1.3" />
              <line x1="9" y1="1" x2="1" y2="9" stroke={shellRgb} strokeWidth="1.3" />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pointer-events-none"
        style={{
          height: 26,
          background: "linear-gradient(to top, rgba(0,6,3,0.98), rgba(0,6,3,0.85))",
          borderTop: `1px solid ${shellRgb}33`,
          fontFamily: "ui-monospace,'SF Mono',monospace",
          fontSize: 9,
          color: `${shellRgb}cc`,
          letterSpacing: 0.5,
          backdropFilter: "blur(4px)",
        }}
      >
        <span style={{ color: `${shellRgb}88` }}>CMD ▸</span>
        <span>{stateLabel}</span>
        <span style={{ color: `${shellRgb}88` }}>
          {agentState === "reasoning" && tokenCount > 0
            ? `${tokenCount} OPS`
            : weather
              ? `${weather.temp}°`
              : "—"}
        </span>
      </div>

      {/* Alert overlay */}
      {agentState === "alert" && (
        <div
          className="absolute inset-0 pointer-events-none animate-pulse"
          style={{
            background: "radial-gradient(circle at 50% 45%, transparent 40%, rgba(255,30,30,0.12) 100%)",
          }}
        />
      )}
    </div>
  );
}
