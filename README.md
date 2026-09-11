# KAI Local RAG Agent

This service embeds the HTML pages in the workspace `kainuv` folder using
ChromaDB's built-in ONNX model (`all-MiniLM-L6-v2`) and answers questions
with Groq's `llama-3.1-8b-instant` model.

## Run locally

Set your `GROQ_API_KEY` in `.env`, then run the API:

```bash
cd ai-agent
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The Next.js app expects the API at `http://localhost:8000`.

## Rebuild website embeddings

Run this after adding or changing files in `kainuv` or `docs`:

```bash
cd ai-agent
REBUILD_INDEX=true python -c "import vector"
```

The index is built from the HTML files in `../kainuv` and text/PDF files
in `../docs`.