import base64
import os
import re
import secrets
import sys
from urllib.parse import urlsplit

import httpx
from fastmcp import FastMCP

API_URL = os.environ.get("PLATFORM_API_URL", "http://backend:8080").rstrip("/")
ACCESS_TOKEN = os.environ.get("PLATFORM_ACCESS_TOKEN", "")
SERVER_AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")
ALLOW_INSECURE_HTTP = os.environ.get("ALLOW_INSECURE_HTTP", "").lower() in {
    "1",
    "true",
    "yes",
}
MAX_UPLOAD_MB = max(1, min(100, int(os.environ.get("MCP_MAX_UPLOAD_MB", "25"))))
_INTERNAL_ERROR = re.compile(
    r"traceback|/app/|/home/|/tmp/|file \"|gs://|postgresql://",
    re.IGNORECASE,
)

mcp = FastMCP(
    name="competition-submit",
    instructions="""
    Authenticated competition submission client.

    This server applies the same identity, competition-window, quota, and team
    checks as the web application. Configure PLATFORM_API_URL and a participant's
    PLATFORM_ACCESS_TOKEN before starting it.
    """,
)


def _validate_config() -> None:
    parsed = urlsplit(API_URL)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RuntimeError("PLATFORM_API_URL must be an absolute HTTP(S) URL")
    if parsed.scheme != "https" and not ALLOW_INSECURE_HTTP:
        raise RuntimeError("PLATFORM_API_URL must use HTTPS unless ALLOW_INSECURE_HTTP=true")
    if not ACCESS_TOKEN:
        raise RuntimeError("PLATFORM_ACCESS_TOKEN is required")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=API_URL,
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
        timeout=httpx.Timeout(30, connect=10),
        follow_redirects=False,
    )


def _safe_error(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail", "Request failed")
        message = str(detail)
    except Exception:
        message = "Request failed"
    if _INTERNAL_ERROR.search(message):
        return "The platform rejected the request"
    return message[:300]


async def _json(method: str, path: str, **kwargs):
    async with _client() as client:
        response = await client.request(method, path, **kwargs)
    if not response.is_success:
        raise ValueError(f"Platform returned {response.status_code}: {_safe_error(response)}")
    return response.json()


@mcp.tool()
async def who_am_i() -> str:
    """Show the authenticated participant and their current team."""
    user = await _json("GET", "/users/me")
    team = await _json("GET", "/teams/my")
    team_text = team["name"] if team else "no team"
    return f"Authenticated as {user['name']} ({user['email']}), team: {team_text}."


@mcp.tool()
async def list_tasks() -> str:
    """List currently revealed tasks and their accepted submission modes."""
    competition = await _json("GET", "/competitions/current")
    tasks = await _json("GET", f"/competitions/{competition['slug']}/tasks")
    if not tasks:
        return "No tasks are currently available."
    lines = [f"Competition: {competition['name']}"]
    for task in tasks:
        lines.append(f"- {task['name']} (id={task['id']}, mode={task['submission_mode']})")
    return "\n".join(lines)


@mcp.tool()
async def submit_endpoint(
    task_id: str,
    endpoint_url: str,
    endpoint_api_key: str | None = None,
) -> str:
    """Submit an HTTPS endpoint to an endpoint-mode task."""
    payload = {"endpoint_url": endpoint_url, "endpoint_api_key": endpoint_api_key}
    result = await _json("POST", f"/tasks/{task_id}/submissions", json=payload)
    return f"Queued submission {result['id']}."


@mcp.tool()
async def submit_code(task_id: str, filename: str, file_content_base64: str) -> str:
    """Submit a ZIP artifact to a code-mode task."""
    if not filename.lower().endswith(".zip"):
        raise ValueError("filename must end in .zip")
    try:
        content = base64.b64decode(file_content_base64, validate=True)
    except Exception as exc:
        raise ValueError("file_content_base64 is not valid base64") from exc
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f"MCP upload exceeds the {MAX_UPLOAD_MB} MB client limit")
    if content[:4] != b"PK\x03\x04":
        raise ValueError("The uploaded content is not a ZIP archive")
    async with _client() as client:
        response = await client.post(
            f"/tasks/{task_id}/submissions/upload",
            files={"file": (filename, content, "application/zip")},
        )
    if not response.is_success:
        raise ValueError(f"Platform returned {response.status_code}: {_safe_error(response)}")
    result = response.json()
    return f"Queued submission {result['id']} ({result['size_bytes']} bytes)."


@mcp.tool()
async def check_submission(submission_id: str) -> str:
    """Check one submission belonging to the authenticated participant's team."""
    result = await _json("GET", f"/submissions/{submission_id}")
    parts = [f"id={result['id']}", f"status={result['status']}"]
    if result.get("score") is not None:
        parts.append(f"score={result['score']}")
    if result.get("error_message"):
        parts.append(f"error={result['error_message']}")
    return ", ".join(parts)


@mcp.tool()
async def list_submissions(task_id: str) -> str:
    """List the authenticated team’s submissions for a task."""
    task = await _json("GET", f"/tasks/{task_id}")
    suffix = "/submissions/upload" if task["submission_mode"] == "code" else "/submissions"
    rows = await _json("GET", f"/tasks/{task_id}{suffix}")
    if not rows:
        return "No submissions yet."
    lines = []
    for row in rows[:50]:
        score = f", score={row['score']}" if row.get("score") is not None else ""
        lines.append(f"- {row['id']}: {row['status']}{score}")
    return "\n".join(lines)


@mcp.tool()
async def get_leaderboard(task_id: str, limit: int = 10) -> str:
    """Get the public leaderboard for a revealed task."""
    limit = max(1, min(limit, 100))
    competition = await _json("GET", "/competitions/current")
    task = await _json("GET", f"/tasks/{task_id}")
    rows = await _json("GET", f"/competitions/{competition['slug']}/leaderboard/{task['slug']}")
    if isinstance(rows, dict) and rows.get("closed_for_review"):
        return rows["message"]
    if not rows:
        return "No scores yet."
    return "\n".join(
        f"{row['rank']}. {row['team_name']}: {row.get('score', 'N/A')}"
        for row in rows[:limit]
    )


def _parse_args() -> tuple[bool, int]:
    use_http = "--http" in sys.argv
    port = int(os.environ.get("PORT", "8080"))
    for index, arg in enumerate(sys.argv):
        if arg == "--port" and index + 1 < len(sys.argv):
            port = int(sys.argv[index + 1])
    return use_http, port


if __name__ == "__main__":
    _validate_config()
    http_mode, server_port = _parse_args()
    if not http_mode:
        mcp.run()
    else:
        if not SERVER_AUTH_TOKEN:
            raise RuntimeError("AUTH_TOKEN is required for HTTP transport")

        from starlette.middleware import Middleware
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.responses import JSONResponse

        class BearerAuthMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                supplied = request.headers.get("authorization", "")
                expected = f"Bearer {SERVER_AUTH_TOKEN}"
                if secrets.compare_digest(supplied, expected):
                    return await call_next(request)
                return JSONResponse({"error": "Unauthorized"}, status_code=401)

        app = mcp.http_app(
            transport="streamable-http",
            middleware=[Middleware(BearerAuthMiddleware)],
        )
        import uvicorn

        uvicorn.run(app, host="0.0.0.0", port=server_port)
