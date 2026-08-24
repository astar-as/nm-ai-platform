import os
from datetime import datetime, timezone
from pathlib import Path

from fastmcp import FastMCP

DOCS_DIR = Path(__file__).parent / "docs"

# ISO-8601 datetime. Before this time, only docs under PUBLIC_DOC_PREFIXES are
# served. Unset hides non-public documents unless REVEAL_ALL_DOCS is explicit.
COMPETITION_START_ENV = os.environ.get("COMPETITION_START", "")
REVEAL_ALL_DOCS = os.environ.get("REVEAL_ALL_DOCS", "").lower() in {"1", "true", "yes"}

# Comma-separated list of doc path prefixes that are always public
# (e.g. "public/,getting-started/").
PUBLIC_DOC_PREFIXES = tuple(
    p.strip().lstrip("/")
    for p in os.environ.get("PUBLIC_DOC_PREFIXES", "").split(",")
    if p.strip() and ".." not in p
)

NOT_YET_MESSAGE = "This documentation will be available at the competition kickoff."
MAX_DOC_BYTES = 1024 * 1024


def _competition_start() -> datetime | None:
    if not COMPETITION_START_ENV:
        return None
    try:
        start = datetime.fromisoformat(COMPETITION_START_ENV)
    except ValueError as exc:
        raise RuntimeError("COMPETITION_START must be a valid ISO-8601 datetime") from exc
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start


def _is_revealed() -> bool:
    if REVEAL_ALL_DOCS:
        return True
    start = _competition_start()
    if start is None:
        return False
    return datetime.now(timezone.utc) >= start


def _is_public_doc(path: str) -> bool:
    return any(path == p.rstrip("/") or path.startswith(p.rstrip("/") + "/") for p in PUBLIC_DOC_PREFIXES)


mcp = FastMCP(
    name="championship-docs",
    instructions="""
    Championship Documentation Server

    This server provides documentation for the championship tasks.
    Use the list_docs tool to see available documentation.
    Use the search_docs tool to search for specific topics.
    Use the read_doc tool to read a full document.
    """,
)


def get_all_docs() -> dict[str, str]:
    docs = {}
    for md_file in sorted(DOCS_DIR.rglob("*.md")):
        resolved = md_file.resolve()
        if not resolved.is_relative_to(DOCS_DIR.resolve()) or not resolved.is_file():
            continue
        if resolved.stat().st_size > MAX_DOC_BYTES:
            continue
        rel = md_file.relative_to(DOCS_DIR).with_suffix("")
        uri = f"challenge://{rel}"
        docs[uri] = resolved.read_text(encoding="utf-8")
    return docs


@mcp.resource("challenge://{path*}")
def read_doc_resource(path: str) -> str:
    """Read a challenge documentation page by path (e.g. public/overview)."""
    if not _is_revealed() and not _is_public_doc(path):
        return NOT_YET_MESSAGE
    doc_path = (DOCS_DIR / path).with_suffix(".md").resolve()
    if not doc_path.is_relative_to(DOCS_DIR.resolve()) or not doc_path.is_file():
        return f"Document '{path}' not found. Use list_docs to see available documentation."
    if doc_path.stat().st_size > MAX_DOC_BYTES:
        return "Document is too large to serve."
    return doc_path.read_text(encoding="utf-8")


@mcp.tool()
def read_doc(path: str) -> str:
    """
    Read a full documentation page.

    Args:
        path: Doc path relative to the docs root, without extension
              (e.g. "public/overview")

    Returns:
        The full markdown content of the document
    """
    return read_doc_resource(path)


@mcp.tool()
def search_docs(query: str) -> str:
    """
    Search challenge documentation for relevant content.

    Args:
        query: Search terms to look for

    Returns:
        Matching documentation excerpts with resource URIs
    """
    query = query.strip()
    if len(query) < 2 or len(query) > 100:
        return "Search query must contain between 2 and 100 characters."
    docs = get_all_docs()
    query_lower = query.lower()
    results = []

    for uri, content in docs.items():
        path = uri.replace("challenge://", "")
        if not _is_revealed() and not _is_public_doc(path):
            continue
        if query_lower in content.lower():
            lines = content.split("\n")
            matches = []
            for i, line in enumerate(lines):
                if query_lower in line.lower():
                    start = max(0, i - 1)
                    end = min(len(lines), i + 3)
                    context = "\n".join(lines[start:end])
                    matches.append(context)

            if matches:
                results.append(f"## {uri}\n\n" + "\n\n---\n\n".join(matches[:3]))

    if not results:
        return f"No results found for '{query}'"

    return "\n\n========\n\n".join(results)


@mcp.tool()
def list_docs() -> str:
    """
    List all available challenge documentation resources.

    Returns:
        List of available documentation URIs
    """
    lines = ["# Championship Documentation", ""]
    for uri in get_all_docs():
        path = uri.replace("challenge://", "")
        if not _is_revealed() and not _is_public_doc(path):
            continue
        lines.append(f"- `{uri}`")
    if len(lines) == 2:
        lines.append("No documentation available yet.")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    _competition_start()
    if "--stdio" in sys.argv:
        mcp.run()
    else:
        port = int(os.environ.get("PORT", "8080"))
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                port = int(sys.argv[i + 1])
        mcp.run(transport="streamable-http", host="0.0.0.0", port=port)
