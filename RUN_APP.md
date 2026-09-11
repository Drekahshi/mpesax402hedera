# Run App

Open separate PowerShell terminals for the services below.

## 1. Set up your API key

Copy `.env.example` to `.env` and add your Groq API key:

```
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
```

## 2. Start the FastAPI RAG agent

From the project root:

```powershell
cd .\ai-agent
if (-not (Test-Path .\.venv)) { py -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

Check the API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

The API endpoints are:

- `GET http://127.0.0.1:8000/health`
- `POST http://127.0.0.1:8000/chat`
- `POST http://127.0.0.1:8000/stream`

## 3. Start the Next.js frontend

From the project root:

```powershell
npm --prefix .\frontend install
npm --prefix .\frontend run dev
```

Open `http://localhost:3000` in your browser.

## Optional: run the terminal agent directly

This runs the interactive RAG agent instead of the HTTP API:

```powershell
cd .\ai-agent
.\.venv\Scripts\python.exe .\main.py
```

Type `q` to exit.