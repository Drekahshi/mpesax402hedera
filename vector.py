"""
vector.py
Builds the ChromaDB knowledge base for the KAI RAG agent.

Sources ingested (in priority order):
  1. ai-agent/kainuv/*.html   — Official KAI Nuvari product documentation
  2. ai-agent/docs/*.txt         — Study notes, whitepapers, supplementary docs
  3. ai-agent/docs/*.pdf         — PDF documents (via pypdf if installed)
  4. ai-agent/uploads/*.txt|pdf  — User-uploaded documents via /agents/docs/ingest

The knowledge base covers:
  - KAI Nuvari tokens, vaults, AMM pools, securities & insurance
  - DeFi fundamentals: yield farming, liquidity, staking, AMMs
  - Agentic AI integration with DeFi
  - Community commodity tokenization
  - M-Pesa integration and African fintech context

Rebuild: set REBUILD_INDEX=true in .env or delete chrome_langchain_db/
"""

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
import os, sys, time, shutil, re
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from html.parser import HTMLParser
from dotenv import load_dotenv

load_dotenv()


# ── Local embeddings (ChromaDB ONNX — no external service required) ────────────

class LocalEmbeddings(Embeddings):
    """Wrapper around ChromaDB's built-in ONNX embedding model (all-MiniLM-L6-v2)."""

    def __init__(self):
        self._ef = DefaultEmbeddingFunction()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._ef(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._ef([text])[0]


# ── HTML parser ────────────────────────────────────────────────────────────────

class KaiDocParser(HTMLParser):
    SKIP_TAGS   = {"script","style","nav","footer","head","button","input",
                   "select","option","form","noscript"}
    HEADING_TAGS = {"h1","h2","h3","h4"}
    BLOCK_TAGS   = {"p","li","td","th","dt","dd","blockquote","caption","span","div"}

    def __init__(self):
        super().__init__()
        self.reset()
        self.blocks:     list[str] = []
        self.title:      str       = ""
        self.desc:       str       = ""
        self._skip_depth = 0
        self._cur_tag    = ""
        self._cur_text: list[str]  = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        tag = tag.lower()
        if tag == "meta":
            name = attrs_dict.get("name","").lower()
            if name in ("description","og:description"):
                self.desc = attrs_dict.get("content","")
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag == "title":
            self._cur_tag = "title"; self._cur_text = []
        elif tag in self.HEADING_TAGS or tag in self.BLOCK_TAGS:
            self._cur_tag = tag; self._cur_text = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1); return
        if self._skip_depth > 0: return
        if tag == "title" and self._cur_tag == "title":
            self.title = " ".join(self._cur_text).strip()
            self._cur_tag = ""; self._cur_text = []
        elif tag in self.HEADING_TAGS or tag in self.BLOCK_TAGS:
            text = re.sub(r"\s+", " ", " ".join(self._cur_text)).strip()
            if len(text) > 15:
                prefix = "## " if tag in self.HEADING_TAGS else ""
                self.blocks.append(prefix + text)
            self._cur_tag = ""; self._cur_text = []

    def handle_data(self, data):
        if self._skip_depth > 0: return
        cleaned = data.strip()
        if cleaned and self._cur_tag:
            self._cur_text.append(cleaned)

    def get_document_text(self) -> str:
        parts = []
        if self.title: parts.append(f"# {self.title}")
        if self.desc:  parts.append(f"Description: {self.desc}")
        parts.extend(self.blocks)
        return "\n\n".join(parts)


# ── Text chunker ───────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        if len(para) > chunk_size:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sent in sentences:
                if current_len + len(sent) > chunk_size and current:
                    chunks.append("\n\n".join(current))
                    current = current[-1:] if current else []
                    current_len = sum(len(p) for p in current)
                current.append(sent)
                current_len += len(sent)
        else:
            if current_len + len(para) > chunk_size and current:
                chunks.append("\n\n".join(current))
                current = current[-1:] if current else []
                current_len = sum(len(p) for p in current)
            current.append(para)
            current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))
    return [c for c in chunks if len(c) > 50]


# ── Document loaders ───────────────────────────────────────────────────────────

def load_html_docs(docs_dir: str) -> list[dict]:
    results = []
    if not os.path.exists(docs_dir):
        return results
    for filename in sorted(f for f in os.listdir(docs_dir) if f.endswith(".html")):
        filepath = os.path.join(docs_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                html = f.read()
            parser = KaiDocParser()
            parser.feed(html)
            text = parser.get_document_text()
            if text.strip():
                results.append({
                    "filename": filename,
                    "title":    parser.title or filename.replace(".html",""),
                    "text":     text,
                    "source":   "kainuv",
                })
                print(f"  [HTML] {filename}: {len(text):,} chars — {parser.title}")
        except Exception as e:
            print(f"  ⚠️  Error parsing {filename}: {e}")
    return results


def load_text_docs(docs_dir: str) -> list[dict]:
    """Load .txt and .md files from the docs/ directory."""
    results = []
    if not os.path.exists(docs_dir):
        return results
    extensions = (".txt", ".md", ".rst")
    for filename in sorted(f for f in os.listdir(docs_dir)
                           if any(f.endswith(ext) for ext in extensions)):
        filepath = os.path.join(docs_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
            if text.strip():
                first_line = next((l.strip().lstrip("#").strip()
                                   for l in text.splitlines() if l.strip()), filename)
                results.append({
                    "filename": filename,
                    "title":    first_line[:80],
                    "text":     text,
                    "source":   "docs",
                })
                print(f"  [TXT]  {filename}: {len(text):,} chars")
        except Exception as e:
            print(f"  ⚠️  Error reading {filename}: {e}")
    return results


def load_pdf_docs(docs_dir: str) -> list[dict]:
    """Load PDF files using pypdf."""
    results = []
    if not os.path.exists(docs_dir):
        return results
    pdf_files = [f for f in os.listdir(docs_dir) if f.endswith(".pdf")]
    if not pdf_files:
        return results
    try:
        import pypdf
    except ImportError:
        print("  ⚠️  pypdf not installed — skipping PDF files. Run: pip install pypdf")
        return results

    for filename in sorted(pdf_files):
        filepath = os.path.join(docs_dir, filename)
        try:
            reader = pypdf.PdfReader(filepath)
            pages  = [page.extract_text() or "" for page in reader.pages]
            text   = "\n\n".join(p for p in pages if p.strip())
            if text.strip():
                results.append({
                    "filename": filename,
                    "title":    filename.replace(".pdf", "").replace("-", " ").replace("_", " ").title(),
                    "text":     text,
                    "source":   "docs-pdf",
                })
                print(f"  [PDF]  {filename}: {len(reader.pages)} pages, {len(text):,} chars")
        except Exception as e:
            print(f"  ⚠️  Error reading {filename}: {e}")
    return results


# ── Config ─────────────────────────────────────────────────────────────────────

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
KAINUVVAX_DIR  = os.path.join(BASE_DIR, "kainuv")
DOCS_DIR       = os.path.join(BASE_DIR, "docs")
DB_LOCATION    = os.path.join(BASE_DIR, "chrome_langchain_db")

rebuild_index = (
    os.getenv("REBUILD_INDEX", "false").lower() == "true"
    or not os.path.exists(DB_LOCATION)
)

embeddings = LocalEmbeddings()

# ── Build or load index ────────────────────────────────────────────────────────

if rebuild_index:
    if os.path.exists(DB_LOCATION):
        print("🗑️  Removing old vector index…")
        shutil.rmtree(DB_LOCATION)

    print("\n📚 Building KAI knowledge base from all sources…")
    print(f"  Sources:")
    print(f"    kainuv/ — KAI Nuvari product docs (HTML)")
    print(f"    docs/      — Study notes & supplementary (TXT/PDF)\n")

    all_raw: list[dict] = []
    all_raw.extend(load_html_docs(KAINUVVAX_DIR))
    all_raw.extend(load_text_docs(DOCS_DIR))
    all_raw.extend(load_pdf_docs(DOCS_DIR))

    total_chars = sum(len(d["text"]) for d in all_raw)
    print(f"\n  Total: {len(all_raw)} documents, {total_chars:,} chars")

    if not all_raw:
        print("⚠️  No documents loaded — starting with empty index.")
        vector_store = Chroma(
            collection_name="kai_docs",
            persist_directory=DB_LOCATION,
            embedding_function=embeddings,
        )
    else:
        split_docs: list[Document] = []
        for doc in all_raw:
            chunks = chunk_text(doc["text"])
            for i, chunk in enumerate(chunks):
                split_docs.append(Document(
                    page_content=chunk,
                    metadata={
                        "source":        doc["filename"],
                        "source_type":   doc.get("source", "unknown"),
                        "title":         doc.get("title", doc["filename"]),
                        "chunk_id":      i,
                        "total_chunks":  len(chunks),
                    },
                ))

        print(f"\n📊 {len(all_raw)} documents → {len(split_docs)} chunks")
        print("🔢 Embedding chunks (this takes a minute on first run)…\n")

        vector_store = Chroma(
            collection_name="kai_docs",
            persist_directory=DB_LOCATION,
            embedding_function=embeddings,
        )

        BATCH = 40
        ids_all = [f"kai_{i}" for i in range(len(split_docs))]
        for start in range(0, len(split_docs), BATCH):
            batch_docs = split_docs[start : start + BATCH]
            batch_ids  = ids_all[start : start + BATCH]
            vector_store.add_documents(documents=batch_docs, ids=batch_ids)
            done = min(start + BATCH, len(split_docs))
            pct  = int(done / len(split_docs) * 100)
            print(f"  Embedded {done}/{len(split_docs)} chunks ({pct}%)")

        print(f"\n✅ KAI knowledge base ready: {len(split_docs)} chunks from {len(all_raw)} documents\n")

        env_path = os.path.join(BASE_DIR, ".env")
        if os.path.exists(env_path):
            env_text = open(env_path, "r").read()
            env_text = env_text.replace("REBUILD_INDEX=true", "REBUILD_INDEX=false")
            open(env_path, "w").write(env_text)
            print("✓ REBUILD_INDEX reset to false in .env\n")

else:
    print("✓ Loading existing KAI knowledge base…")
    vector_store = Chroma(
        collection_name="kai_docs",
        persist_directory=DB_LOCATION,
        embedding_function=embeddings,
    )
    try:
        count = vector_store._collection.count()
        print(f"  {count} chunks loaded from index\n")
    except Exception:
        pass

# ── Retriever ─────────────────────────────────────────────────────────────────

retriever = vector_store.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 6, "fetch_k": 20},
)
