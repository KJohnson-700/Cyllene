"""
Cyllene local proxy — port 8080
Routes:
  /v1/tts → MiniMax TTS (synthesize mp3, return blob)
  /v1/*   → Hermes API server  :8642  (chat, runs, SSE)
  /api/*  → Hermes web server  :9119  (status, sessions, cron)
  /*      → 404

Run: python proxy.py
"""

import binascii
import json
import os
import re
import ssl
from pathlib import Path
from aiohttp import web, ClientSession, ClientTimeout

API_PORT  = int(os.getenv("HERMES_API_PORT",  "8642"))
WEB_PORT  = int(os.getenv("HERMES_WEB_PORT",  "9119"))
PROXY_PORT = int(os.getenv("CYLLENE_PROXY_PORT", "8080"))

MINIMAX_URL = "https://api.minimax.io/v1/t2a_v2"
MINIMAX_MODEL = os.getenv("CYLLENE_TTS_MODEL", "speech-2.8-hd")
MINIMAX_VOICE = os.getenv("CYLLENE_TTS_VOICE", "English_Graceful_Lady")
OBSIDIAN_VAULT = os.getenv("OBSIDIAN_VAULT", "Hermes Second Brain").strip()
OBSIDIAN_VAULT_PATH = Path(
    os.getenv("OBSIDIAN_VAULT_PATH", str(Path.home() / "Documents" / OBSIDIAN_VAULT))
).expanduser()
OBSIDIAN_REST_CONFIG = OBSIDIAN_VAULT_PATH / ".obsidian" / "plugins" / "obsidian-local-rest-api" / "data.json"
OBSIDIAN_MEMORY_NOTE = os.getenv("OBSIDIAN_MEMORY_NOTE", "users/hermes-memory.md").strip()


def _load_minimax_key() -> str:
    """Read MINIMAX_API_KEY from env, falling back to ~/.hermes/.env"""
    key = os.getenv("MINIMAX_API_KEY", "").strip()
    if key:
        return key
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("MINIMAX_API_KEY=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip()
    return ""


MINIMAX_KEY = _load_minimax_key()


def _load_obsidian_rest_settings() -> dict:
    if not OBSIDIAN_REST_CONFIG.exists():
        return {}
    try:
        return json.loads(OBSIDIAN_REST_CONFIG.read_text())
    except Exception:
        return {}


def _obsidian_status_payload(ok: bool, available: bool, **extra) -> dict:
    return {
        "ok": ok,
        "available": available,
        "vault": OBSIDIAN_VAULT,
        "vault_path": str(OBSIDIAN_VAULT_PATH),
        **extra,
    }


def _vault_markdown_files() -> list[Path]:
    if not OBSIDIAN_VAULT_PATH.exists():
        return []
    return sorted(
        path for path in OBSIDIAN_VAULT_PATH.rglob("*")
        if path.is_file() and path.suffix.lower() in {".md", ".markdown"} and ".obsidian" not in path.parts
    )


def _search_vault_filesystem(query: str, limit: int = 8) -> list[dict]:
    terms = [term.lower() for term in re.findall(r"[a-zA-Z0-9_-]+", query) if len(term) > 1]
    if not terms:
        return []

    scored: list[tuple[int, dict]] = []
    for path in _vault_markdown_files():
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        lowered = content.lower()
        rel = path.relative_to(OBSIDIAN_VAULT_PATH).as_posix()
        file_score = sum(6 for term in terms if term in rel.lower())
        body_score = sum(lowered.count(term) for term in terms)
        score = file_score + body_score
        if score <= 0:
            continue

        snippets: list[str] = []
        for term in terms[:3]:
            idx = lowered.find(term)
            if idx == -1:
                continue
            start = max(0, idx - 100)
            end = min(len(content), idx + 180)
            snippet = " ".join(content[start:end].split())
            if snippet and snippet not in snippets:
                snippets.append(snippet[:220])
        if not snippets:
            snippets.append(" ".join(content[:220].split()))

        scored.append((score, {"filename": rel, "score": score, "snippets": snippets[:3]}))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:limit]]


def _append_vault_memory(content: str) -> Path:
    target = OBSIDIAN_VAULT_PATH / OBSIDIAN_MEMORY_NOTE
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as fh:
        fh.write(f"\n{content}\n")
    return target


async def _call_obsidian(method: str, path: str, *, params: dict | None = None, data: str | None = None) -> tuple[dict, int]:
    settings = _load_obsidian_rest_settings()
    api_key = (settings.get("apiKey") or "").strip()
    port = settings.get("port", 27124)

    if not settings:
        return _obsidian_status_payload(
            ok=False,
            available=False,
            error="Obsidian Local REST API plugin config was not found",
        ), 503

    if not api_key:
        return _obsidian_status_payload(
            ok=False,
            available=False,
            error="Obsidian Local REST API API key is missing",
        ), 503

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    url = f"https://127.0.0.1:{port}{path}"
    headers = {"Authorization": f"Bearer {api_key}"}
    timeout = ClientTimeout(total=8, connect=3)

    try:
        async with ClientSession(timeout=timeout) as session:
            async with session.request(
                method,
                url,
                params=params,
                data=data,
                headers=headers,
                ssl=ssl_ctx,
            ) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    body = await resp.json()
                else:
                    body = await resp.text()
                return {
                    "ok": resp.status < 400,
                    "available": True,
                    "vault": OBSIDIAN_VAULT,
                    "vault_path": str(OBSIDIAN_VAULT_PATH),
                    "port": port,
                    "status": resp.status,
                    "body": body,
                }, resp.status
    except Exception as exc:
        return _obsidian_status_payload(
            ok=False,
            available=True,
            port=port,
            error=f"Obsidian Local REST API is configured but not reachable: {exc}",
        ), 503


async def proxy(request: web.Request, target_port: int) -> web.StreamResponse:
    target_url = f"http://127.0.0.1:{target_port}{request.path_qs}"

    # SSE streams need chunked streaming — detect by path
    is_sse = "events" in request.path or request.headers.get("Accept") == "text/event-stream"

    timeout = ClientTimeout(total=None, connect=10, sock_read=None if is_sse else 30)

    async with ClientSession(timeout=timeout) as session:
        body = await request.read()
        headers = {
            k: v for k, v in request.headers.items()
            if k.lower() not in ("host", "transfer-encoding")
        }

        async with session.request(
            request.method,
            target_url,
            headers=headers,
            data=body or None,
            allow_redirects=False,
        ) as upstream:
            response = web.StreamResponse(
                status=upstream.status,
                headers={
                    k: v for k, v in upstream.headers.items()
                    if k.lower() not in ("transfer-encoding", "content-encoding")
                },
            )
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

            await response.prepare(request)
            async for chunk in upstream.content.iter_any():
                await response.write(chunk)
            await response.write_eof()
            return response


async def handle_tts(request: web.Request) -> web.Response:
    """POST /v1/tts  { text, voice?, speed? } → audio/mpeg"""
    if not MINIMAX_KEY:
        return web.json_response(
            {"error": "MINIMAX_API_KEY not set"},
            status=500,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    try:
        payload_in = await request.json()
    except Exception:
        return web.json_response(
            {"error": "invalid JSON"},
            status=400,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    text = (payload_in.get("text") or "").strip()
    if not text:
        return web.json_response(
            {"error": "text required"},
            status=400,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    voice_id = payload_in.get("voice") or MINIMAX_VOICE
    speed = payload_in.get("speed", 1.0)

    mm_payload = {
        "model": MINIMAX_MODEL,
        "text": text[:9000],
        "stream": False,
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "vol": 1,
            "pitch": 0,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1,
        },
    }

    timeout = ClientTimeout(total=60)
    async with ClientSession(timeout=timeout) as session:
        async with session.post(
            MINIMAX_URL,
            json=mm_payload,
            headers={
                "Authorization": f"Bearer {MINIMAX_KEY}",
                "Content-Type": "application/json",
            },
        ) as resp:
            data = await resp.json()

    base = data.get("base_resp", {})
    if base.get("status_code", -1) != 0:
        return web.json_response(
            {"error": f"minimax: {base.get('status_msg', 'unknown')}"},
            status=502,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    hex_audio = data.get("data", {}).get("audio", "")
    if not hex_audio:
        return web.json_response(
            {"error": "minimax returned empty audio"},
            status=502,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    try:
        mp3 = binascii.unhexlify(hex_audio)
    except Exception as e:
        return web.json_response(
            {"error": f"hex decode: {e}"},
            status=502,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    return web.Response(
        body=mp3,
        content_type="audio/mpeg",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
    )


async def handle_api(request: web.Request) -> web.StreamResponse:
    return await proxy(request, API_PORT)


async def handle_web(request: web.Request) -> web.StreamResponse:
    return await proxy(request, WEB_PORT)


async def handle_obsidian_status(request: web.Request) -> web.Response:
    result, status = await _call_obsidian("GET", "/")
    mode = "rest"
    if not result.get("ok"):
        mode = "filesystem" if OBSIDIAN_VAULT_PATH.exists() else "unavailable"
    payload = {
        "ok": result.get("ok", False),
        "available": result.get("available", False) or OBSIDIAN_VAULT_PATH.exists(),
        "vault": result.get("vault"),
        "vault_path": result.get("vault_path"),
        "port": result.get("port"),
        "version": None,
        "mode": mode,
        "error": result.get("error"),
    }
    if result.get("ok") and isinstance(result.get("body"), dict):
        payload["info"] = result["body"]
    elif OBSIDIAN_VAULT_PATH.exists():
        payload["file_count"] = len(_vault_markdown_files())
    return web.json_response(payload, status=200 if payload["available"] else status, headers={"Access-Control-Allow-Origin": "*"})


async def handle_obsidian_search(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    query = (payload.get("query") or request.query.get("query") or "").strip()
    if not query:
        return web.json_response(
            {"ok": False, "error": "query required"},
            status=400,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    result, status = await _call_obsidian("POST", "/search/simple/", params={"query": query, "contextLength": 140})
    if result.get("ok") and isinstance(result.get("body"), list):
        formatted = []
        for item in result["body"][:8]:
            snippets = []
            for match in item.get("matches", [])[:3]:
                context = (match.get("context") or "").strip().replace("\n", " ")
                if context:
                    snippets.append(context[:220])
            formatted.append({
                "filename": item.get("filename"),
                "score": item.get("score"),
                "snippets": snippets,
            })
        return web.json_response(
            {
                "ok": True,
                "available": True,
                "vault": result.get("vault"),
                "vault_path": result.get("vault_path"),
                "port": result.get("port"),
                "mode": "rest",
                "results": formatted,
            },
            headers={"Access-Control-Allow-Origin": "*"},
        )
    fallback = _search_vault_filesystem(query)
    if fallback:
        return web.json_response(
            {
                "ok": True,
                "available": True,
                "vault": OBSIDIAN_VAULT,
                "vault_path": str(OBSIDIAN_VAULT_PATH),
                "mode": "filesystem",
                "results": fallback,
                "warning": result.get("error"),
            },
            headers={"Access-Control-Allow-Origin": "*"},
        )
    return web.json_response(result, status=status, headers={"Access-Control-Allow-Origin": "*"})


async def handle_obsidian_daily_append(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    content = (payload.get("content") or "").strip()
    if not content:
        return web.json_response(
            {"ok": False, "error": "content required"},
            status=400,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    body = f"\n{content}\n"
    result, status = await _call_obsidian("POST", f"/vault/{OBSIDIAN_MEMORY_NOTE}", data=body)
    if result.get("ok"):
        result["mode"] = "rest"
        return web.json_response(result, status=200, headers={"Access-Control-Allow-Origin": "*"})

    try:
        path = _append_vault_memory(content)
        return web.json_response(
            {
                "ok": True,
                "available": True,
                "vault": OBSIDIAN_VAULT,
                "vault_path": str(OBSIDIAN_VAULT_PATH),
                "mode": "filesystem",
                "path": str(path.relative_to(OBSIDIAN_VAULT_PATH)),
                "warning": result.get("error"),
            },
            headers={"Access-Control-Allow-Origin": "*"},
        )
    except Exception as exc:
        return web.json_response(
            _obsidian_status_payload(
                ok=False,
                available=OBSIDIAN_VAULT_PATH.exists(),
                error=f"Could not append memory note: {exc}",
            ),
            status=503,
            headers={"Access-Control-Allow-Origin": "*"},
        )


async def handle_options(request: web.Request) -> web.Response:
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
    })


def make_app() -> web.Application:
    app = web.Application()
    app.router.add_route("OPTIONS", "/{path:.*}", handle_options)
    # TTS must come BEFORE the generic /v1/* route
    app.router.add_post("/v1/tts", handle_tts)
    app.router.add_get("/obsidian/status", handle_obsidian_status)
    app.router.add_route("*", "/obsidian/search", handle_obsidian_search)
    app.router.add_post("/obsidian/daily-append", handle_obsidian_daily_append)
    app.router.add_route("*", "/v1/{path:.*}", handle_api)
    app.router.add_route("*", "/health",        handle_api)
    app.router.add_route("*", "/api/{path:.*}", handle_web)
    return app


if __name__ == "__main__":
    print(f"Cyllene proxy → :{PROXY_PORT}")
    print(f"  /v1/tts → MiniMax TTS  (key {'set' if MINIMAX_KEY else 'MISSING'})")
    print(f"  /obsidian/* → Obsidian Local REST API ({OBSIDIAN_VAULT_PATH})")
    print(f"  /v1/*   → :{API_PORT}  (Hermes API)")
    print(f"  /api/*  → :{WEB_PORT}  (Hermes web)")
    web.run_app(make_app(), port=PROXY_PORT, print=lambda *a: None)
