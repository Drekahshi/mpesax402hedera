from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from vector import retriever
import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

model = ChatGroq(
    groq_api_key=GROQ_API_KEY,
    model_name=GROQ_MODEL,
    temperature=0.3,
    max_tokens=1024,
)

template = """
You are KAI, an expert advisor for the KAI Nuvari DeFi ecosystem on Ethereum & Hedera (X402).

Use the following retrieved context to answer the user's question:

{reviews}

User question:
{question}

Answer concisely, accurately, and only use the context when it is relevant.
"""

prompt = ChatPromptTemplate.from_template(template)
chain = prompt | model


def main():
    print("\n========================================")
    print("        KAI Nuvari AI Agent")
    print("========================================")
    print("Fast RAG + Groq (Llama 3.1 8B)")
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

            # Stream the answer so the user sees it immediately
            for chunk in chain.stream({
                "reviews": reviews,
                "question": question,
            }):
                print(chunk, end="", flush=True)

            print("\n")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            print(
                "Check your GROQ_API_KEY in .env and your RAG retriever "
                "is available.\n"
            )


if __name__ == "__main__":
    main()