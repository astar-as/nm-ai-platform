import importlib.util
from pathlib import Path

SERVER_PATH = Path(__file__).parents[1] / "server.py"
SPEC = importlib.util.spec_from_file_location("challenge_server_under_test", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def test_documentation_is_hidden_by_default(monkeypatch):
    monkeypatch.setattr(server, "COMPETITION_START_ENV", "")
    monkeypatch.setattr(server, "REVEAL_ALL_DOCS", False)
    monkeypatch.setattr(server, "PUBLIC_DOC_PREFIXES", ())
    assert server._is_revealed() is False
    assert server._is_public_doc("private/overview") is False


def test_public_prefix_requires_a_path_boundary(monkeypatch):
    monkeypatch.setattr(server, "PUBLIC_DOC_PREFIXES", ("public",))
    assert server._is_public_doc("public")
    assert server._is_public_doc("public/getting-started")
    assert not server._is_public_doc("publicity/hidden")


def test_document_reader_does_not_follow_symlinks_outside_root(tmp_path, monkeypatch):
    docs = tmp_path / "docs"
    docs.mkdir()
    outside = tmp_path / "outside.md"
    outside.write_text("secret", encoding="utf-8")
    (docs / "linked.md").symlink_to(outside)
    monkeypatch.setattr(server, "DOCS_DIR", docs)
    assert server.get_all_docs() == {}
