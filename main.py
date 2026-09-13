try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.messages import AIMessage
from vector import retriever
import os, httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

class ChatGemini(Runnable):
    """Native Google Gemini chat runnable for LangChain."""
    def __init__(self, api_key: str, model: str = "gemini-flash-latest", temperature: float = 0.3, max_tokens: int = 2048):
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

    def _call(self, prompt_text: str, system_text: str = "") -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        contents = []
        if system_text:
            contents.append({"role": "user", "parts": [{"text": f"System Instructions: {system_text}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood."}]})
        contents.append({"role": "user", "parts": [{"text": prompt_text}]})
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": self.max_tokens,
            }
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code != 200:
                raise Exception(f"Gemini API error ({resp.status_code}): {resp.text}")
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    def invoke(self, input_val: any, config: RunnableConfig = None) -> AIMessage:
        if hasattr(input_val, "to_string"):
            text = input_val.to_string()
        elif hasattr(input_val, "messages"):
            text = "\n".join(f"{m.type}: {m.content}" for m in input_val.messages)
        elif isinstance(input_val, dict):
            text = str(input_val)
        else:
            text = str(input_val)
        out = self._call(text)
        return AIMessage(content=out)

    def stream(self, input_val: any, config: RunnableConfig = None):
        msg = self.invoke(input_val, config)
        words = msg.content.split(" ")
        for i, w in enumerate(words):
            suffix = " " if i < len(words) - 1 else ""
            yield AIMessage(content=w + suffix)

model = None
if GEMINI_API_KEY:
    try:
        model = ChatGemini(
            api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
    except Exception:
        model = None

if model is None and GROQ_API_KEY and ChatGroq is not None:
    try:
        model = ChatGroq(
            groq_api_key=GROQ_API_KEY,
            model_name=GROQ_MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
    except Exception:
        model = None

template = """
You are KAI, an expert advisor for the KAI Nuvari DeFi ecosystem on Ethereum & Hedera (X402).

Use the following retrieved context to answer the user's question:

{reviews}

User question:
{question}

Answer concisely, accurately, and only use the context when it is relevant.
"""

prompt = ChatPromptTemplate.from_template(template)
chain = (prompt | model) if model is not None else None


def main():
    provider_name = f"Google Gemini ({GEMINI_MODEL})" if GEMINI_API_KEY else (f"Groq ({GROQ_MODEL})" if GROQ_API_KEY else "Needle (on-device)")
    print("\n========================================")
    print("        KAI Nuvari AI Agent")
    print("========================================")
    print(f"Fast RAG + {provider_name}")
    print("Type 'q' to quit.\n")

    while True:
        question = input("You: ").strip()

        if question.lower() == "q":
            print("Goodbye!")
            break

        if not question:
            continue

        try:
            print("\n🔎 Searching KAI knowledge base...")

            reviews = retriever.invoke(question)

            print("✓ Relevant context retrieved")
            print("🧠 KAI is analyzing and responding...\n")
            print("KAI: ", end="", flush=True)

            if chain is not None:
                # Stream the answer so the user sees it immediately
                for chunk in chain.stream({
                    "reviews": reviews,
                    "question": question,
                }):
                    out = chunk.content if hasattr(chunk, "content") else str(chunk)
                    print(out, end="", flush=True)
            else:
                from agents.needle_harness import run_needle_agent
                import asyncio
                res = asyncio.run(run_needle_agent(question))
                print(res.get("text", "No response generated."))

            print("\n")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            print(
                "Check your GEMINI_API_KEY in .env and that your RAG retriever "
                "is available.\n"
            )


if __name__ == "__main__":
    main()