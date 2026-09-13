"""
KAI AI Agent Server v6.0
FastAPI application exposing:
  - Original RAG chat endpoints  (/chat, /stream, /health)
  - 8 specialised agent endpoints (/agents/*)
  - x402 payment rails            (/agents/x402/*)
  - W3C DID identity              (/agents/identity/*)
  - Escrow management             (/agents/escrow/*)
  - Agentic audit log             (/agents/rails/*)
  - Onboarding suite              (/agents/onboard/*)
  - Trust score engine            (/agents/onboard/trust)
  - Hat switcher / intent         (/agents/onboard/hat)
  - Unified profiler              (/agents/onboard/profile)
  - Content curator               (/agents/onboard/content)
  - Payment approver              (/agents/onboard/payment-risk)
Powered by Groq cloud API.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage
from vector import retriever
import os, sys, json, httpx, asyncio, shutil, hashlib, time
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Agent imports ─────────────────────────────────────────────────────────────
from agents.tx_analyst       import TxAnalystAgent
from agents.portfolio_health  import PortfolioHealthAgent
from agents.contract_auditor  import ContractAuditorAgent, DEFAULT_CONTRACTS_DIR
from agents.dao_drafter       import DAODrafterAgent
from agents.commodity_pricing import CommodityPricingAgent
from agents.policy_recommender import PolicyRecommenderAgent
from agents.code_gen          import CodeGenAgent
from agents.doc_summarizer    import DocSummarizerAgent

# ── KAI Ecosystem agents ──────────────────────────────────────────────────────
from agents.did_tracker      import (DIDTrackerAgent, log_action, authorize,
                                     revoke, is_authorized, get_audit_log)
from agents.indexer_balance  import IndexerBalanceAgent, fetch_portfolio
from agents.liquidity_manager import LiquidityManagerAgent, get_pool_state, calculate_il
from agents.yield_optimizer  import YieldOptimizerAgent, scan_all_yields
from agents.onboarding       import OnboardingAgent, STEP_GUIDES
from agents.kai_navigator    import KaiNavigatorAgent, INTENT_ROUTES

# ── Onboarding suite imports ──────────────────────────────────────────────────
from agents.trust_score      import TrustScoreAgent, compute_score
from agents.hat_switcher     import HatSwitcherAgent, classify_hat
from agents.unified_profiler import UnifiedProfilerAgent
from agents.content_curator  import ContentCuratorAgent
from agents.payment_approver import PaymentApproverAgent, assess_risk

# ── Agentic Rails imports ─────────────────────────────────────────────────────
from agents.identity   import (
    list_agent_dids, resolve_did, resolve_address,
    AgentPassport, AgentCapabilities, AgentSigner,
)
from agents.x402_rails import (
    build_402_response, build_payment_requirement, get_x402_info,
    settle_payment_async, decode_payment_header, x402_gate, ROUTE_PRICES,
)
from agents.rails import agent_rails, PaymentChannel

# ── Singleton agent instances ─────────────────────────────────────────────────
tx_agent        = TxAnalystAgent()
portfolio_agent = PortfolioHealthAgent()
auditor_agent   = ContractAuditorAgent()
dao_agent       = DAODrafterAgent()
pricing_agent   = CommodityPricingAgent()
policy_agent     = PolicyRecommenderAgent()
codegen_agent    = CodeGenAgent()
doc_agent        = DocSummarizerAgent()

# ── KAI Ecosystem agent singletons ───────────────────────────────────────────
did_tracker_agent   = DIDTrackerAgent()
indexer_agent       = IndexerBalanceAgent()
liquidity_agent     = LiquidityManagerAgent()
yield_agent         = YieldOptimizerAgent()
onboarding_agent    = OnboardingAgent()
navigator_agent     = KaiNavigatorAgent()

# ── Onboarding agent singletons ────────────────────────────────────────────────
trust_score_agent   = TrustScoreAgent()
hat_agent           = HatSwitcherAgent()
profiler_agent      = UnifiedProfilerAgent()
curator_agent       = ContentCuratorAgent()
payment_risk_agent  = PaymentApproverAgent()

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="KAI Multi-Agent Server", version="6.0.0")

ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Gemini & Groq & Needle config ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL     = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

model        = None
chain        = None
plain_chain  = None

RAG_TEMPLATE = """You are KAI, the AI assistant for KAI Nuvari — a DeFi ecosystem built on Ethereum Sepolia & Hedera Testnet (X402).

KAI Nuvari is a decentralised finance platform that provides:
- 6 ecosystem tokens: NVR (governance), yBOB (stable), YTOKEN (yield ETF), YGOLD (gold-backed), GAMI (community rewards), CENTS (micro-savings)
- AMM liquidity pools (NVR/yBOB, YTOKEN/YGOLD, GAMI/CENTS) with x*y=k pricing
- Yield vaults for each token (kvNVR, kvyBOB, etc.) paying APY
- Securities & Insurance products: KAI Pension, KAI Trust, Crop Insurance, Forest Protection, Medical Pool, RWA Tokenization
- Community commodity tokenization: honey, milk, beadwork, traditional medicine, seeds, pottery, bark cloth
- DAO governance with NVR voting power
- M-Pesa integration for KES payments (Kenya)
- x402 payment rails and W3C DID agent identity
- Conservation NFT marketplace priced in yBOB

Always answer based on the retrieved context below. Be specific about token addresses,
APY rates, pool pairs, and product features. If the context doesn't cover the question,
say so rather than guessing.

Retrieved context from KAI Nuvari documentation:
{reviews}

User question: {question}

Answer clearly and helpfully. Use numbers and specifics from the context."""

PLAIN_TEMPLATE = """You are KAI, the AI assistant for KAI Nuvari — a DeFi ecosystem on Ethereum & Hedera (X402).
KAI Nuvari provides yield vaults, AMM pools, conservation NFTs, M-Pesa payments,
and community commodity tokenization for African markets.

User: {question}
KAI:"""

prompt       = ChatPromptTemplate.from_template(RAG_TEMPLATE)
plain_prompt = ChatPromptTemplate.from_template(PLAIN_TEMPLATE)

from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.messages import AIMessage

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

# 1. Prioritize Gemini if GEMINI_API_KEY is present
if GEMINI_API_KEY:
    try:
        model = ChatGemini(
            api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
            temperature=0.3,
            max_tokens=2048,
        )
        chain        = prompt | model
        plain_chain  = plain_prompt | model
    except Exception:
        model = None
        chain = None
        plain_chain = None

# 2. Fall back to Groq if configured
if model is None and GROQ_API_KEY and ChatGroq is not None:
    try:
        model = ChatGroq(
            model=GROQ_MODEL,
            groq_api_key=GROQ_API_KEY,
            temperature=0.3,
            max_tokens=2048,
        )
        chain        = prompt | model
        plain_chain  = plain_prompt | model
    except Exception:
        model = None
        chain = None
        plain_chain = None

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ═════════════════════════════════════════════════════════════════════════════
# Core & Needle Endpoints
# ═════════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    message: str
    rag: bool = True

class ChatResponse(BaseModel):
    text: str
    agent: str
    rag_used: bool
    sources_count: int

class NeedleRunRequest(BaseModel):
    query: str


@app.get("/health")
def health():
    active_provider = "gemini" if GEMINI_API_KEY else ("groq" if GROQ_API_KEY else "needle (on-device)")
    active_model = GEMINI_MODEL if GEMINI_API_KEY else (GROQ_MODEL if GROQ_API_KEY else "needle-2 (on-device)")
    return {
        "status": "ok",
        "model": active_model,
        "provider": active_provider,
        "needle_available": True,
        "agents": [
            "needle_dispatcher", "tx_analyst", "portfolio_health", "contract_auditor",
            "dao_drafter", "commodity_pricing", "policy_recommender",
            "code_gen", "doc_summarizer",
        ],
    }


@app.get("/agents/needle/health")
def needle_health():
    """Health check and tool catalogue for the on-device Needle 2 harness."""
    try:
        from agents.needle_harness import get_needle_harness
        h = get_needle_harness()
        return {
            "status": "ok",
            "engine": "needle-2 (cactus-compute)",
            "mode": "on-device",
            "parameters": "45M",
            "size": "14MB",
            "tools": [t.__name__ for t in h.tools],
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/agents/needle/run")
async def needle_run(body: NeedleRunRequest):
    """Run an on-device Needle query with automatic tool execution."""
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        from agents.needle_harness import run_needle_agent
        result = await run_needle_agent(body.query)
        return result
    except Exception as e:
        raise HTTPException(500, f"Needle execution error: {e}")


@app.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    if not body.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    
    # 1. Try Gemini or Groq if key is present
    if (GEMINI_API_KEY or GROQ_API_KEY) and chain is not None:
        try:
            if body.rag:
                docs    = retriever.invoke(body.message)
                context = "\n\n".join(f"[Doc {i+1}]: {d.page_content}" for i, d in enumerate(docs))
                result  = chain.invoke({"reviews": context, "question": body.message})
                out_text = result.content if hasattr(result, "content") else str(result)
                provider_tag = "Gemini" if GEMINI_API_KEY else "Groq"
                return ChatResponse(text=out_text, agent=f"KAI Agent ({provider_tag})", rag_used=True, sources_count=len(docs))
            if plain_chain is not None:
                result = plain_chain.invoke({"question": body.message})
                out_text = result.content if hasattr(result, "content") else str(result)
                provider_tag = "Gemini" if GEMINI_API_KEY else "Groq"
                return ChatResponse(text=out_text, agent=f"KAI Agent ({provider_tag})", rag_used=False, sources_count=0)
        except Exception:
            pass

    # 2. Fallback seamlessly to on-device Needle 2
    try:
        from agents.needle_harness import run_needle_agent
        n_res = await run_needle_agent(body.message)
        text = n_res.get("text")
        if not text and n_res.get("results"):
            res_items = n_res["results"]
            first = res_items[0].get("result") if isinstance(res_items[0], dict) else res_items[0]
            if isinstance(first, dict) and "error" in first:
                text = f"Tool result: {first['error']}"
            else:
                text = json.dumps(first, indent=2)
        elif not text:
            if body.rag:
                docs = retriever.invoke(body.message)
                if docs:
                    text = f"**KAI Knowledge Base:**\n\n{docs[0].page_content}"
                else:
                    text = f"Query executed via on-device Needle agent: {body.message}"
            else:
                text = f"Needle on-device agent active. (Query: {body.message})"

        return ChatResponse(
            text=text or "Query processed successfully by Needle 2.",
            agent="Needle ⚡ (On-Device)",
            rag_used=body.rag,
            sources_count=1 if body.rag else 0,
        )
    except Exception as e:
        raise HTTPException(500, f"Needle execution error: {e}")


@app.post("/stream")
async def stream_chat(body: ChatRequest):
    if not body.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    
    # 1. Try Gemini / Groq streaming if configured
    if (GEMINI_API_KEY or GROQ_API_KEY) and model is not None:
        try:
            if body.rag:
                docs    = retriever.invoke(body.message)
                context = "\n\n".join(f"[Doc {i+1}]: {d.page_content}" for i, d in enumerate(docs))
                sources = len(docs)
                messages = [
                    SystemMessage(content=(
                        "You are KAI, the AI assistant for KAI Nuvari — a DeFi ecosystem on Ethereum & Hedera (X402).\n\n"
                        "KAI Nuvari provides: 6 ecosystem tokens (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS), "
                        "AMM pools, yield vaults, securities & insurance products, community commodity tokenization, "
                        "M-Pesa integration, and conservation NFTs."
                    )),
                    HumanMessage(content=(
                        f"Retrieved context from KAI Nuvari documentation:\n{context}\n\n"
                        f"User question: {body.message}\n\n"
                        f"Answer clearly using specifics from the context. If unsure, say so."
                    )),
                ]
            else:
                sources = 0
                messages = [
                    SystemMessage(content="You are KAI, an AI advisor."),
                    HumanMessage(content=body.message),
                ]

            async def event_generator():
                try:
                    stream = model.stream(messages)
                    for chunk in stream:
                        token = chunk.content
                        if token:
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
                except Exception:
                    from agents.needle_harness import run_needle_agent
                    n_res = await run_needle_agent(body.message)
                    text = n_res.get("text") or json.dumps(n_res.get("results", []), indent=2)
                    for w in text.split(" "):
                        yield f"data: {json.dumps({'token': w + ' '})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"

            return StreamingResponse(event_generator(), media_type="text/event-stream",
                                     headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
        except Exception:
            pass

    # 2. Seamless On-Device Needle streaming
    async def needle_event_generator():
        try:
            from agents.needle_harness import run_needle_agent
            n_res = await run_needle_agent(body.message)
            text = n_res.get("text")
            if not text and n_res.get("results"):
                res_items = n_res["results"]
                first = res_items[0].get("result") if isinstance(res_items[0], dict) else res_items[0]
                text = json.dumps(first, indent=2)
            elif not text:
                if body.rag:
                    docs = retriever.invoke(body.message)
                    if docs:
                        text = f"**KAI Knowledge Base:**\n\n{docs[0].page_content}"
                    else:
                        text = f"Query executed via on-device Needle agent: {body.message}"
                else:
                    text = f"Needle on-device agent active. (Query: {body.message})"

            words = (text or "Response processed by Needle 2.").split(" ")
            for w in words:
                yield f"data: {json.dumps({'token': w + ' '})}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'done': True, 'sources': 1 if body.rag else 0})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'token': f'Needle on-device error: {e}'})}\n\n"
            yield f"data: {json.dumps({'done': True, 'sources': 0})}\n\n"

    return StreamingResponse(needle_event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ═════════════════════════════════════════════════════════════════════════════
# Agent 1: Transaction Analyst
# ═════════════════════════════════════════════════════════════════════════════

class TxRequest(BaseModel):
    tx_hash: str = ""
    address: str = ""

@app.post("/agents/tx/analyse")
async def tx_analyse(body: TxRequest):
    if not body.tx_hash and not body.address:
        raise HTTPException(400, "Provide tx_hash or address")
    return await tx_agent.run(tx_hash=body.tx_hash, address=body.address)

@app.post("/agents/tx/stream")
async def tx_stream(body: TxRequest):
    if not body.tx_hash and not body.address:
        raise HTTPException(400, "Provide tx_hash or address")
    return StreamingResponse(
        tx_agent.stream(tx_hash=body.tx_hash, address=body.address),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 2: Portfolio Health
# ═════════════════════════════════════════════════════════════════════════════

class PortfolioRequest(BaseModel):
    wallet: str
    token_map: dict = Field(default_factory=dict)
    vault_map:  dict = Field(default_factory=dict)

@app.post("/agents/portfolio/health")
async def portfolio_health(body: PortfolioRequest):
    if not body.wallet:
        raise HTTPException(400, "wallet address required")
    return await portfolio_agent.run(
        wallet=body.wallet,
        token_map=body.token_map,
        vault_map=body.vault_map,
    )

@app.post("/agents/portfolio/stream")
async def portfolio_stream(body: PortfolioRequest):
    return StreamingResponse(
        portfolio_agent.stream(wallet=body.wallet,
                               token_map=body.token_map,
                               vault_map=body.vault_map),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 3: Contract Auditor
# ═════════════════════════════════════════════════════════════════════════════

class AuditRequest(BaseModel):
    contracts_dir: str = DEFAULT_CONTRACTS_DIR
    filename: Optional[str] = None

@app.post("/agents/audit")
async def audit_contracts(body: AuditRequest):
    return await auditor_agent.run(
        contracts_dir=body.contracts_dir,
        filename=body.filename,
    )

@app.post("/agents/audit/stream")
async def audit_stream(body: AuditRequest):
    return StreamingResponse(
        auditor_agent.stream(contracts_dir=body.contracts_dir,
                             filename=body.filename),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 4: DAO Proposal Drafter
# ═════════════════════════════════════════════════════════════════════════════

class DAORequest(BaseModel):
    idea: str
    author: str = "Community Member"
    category: str = "Protocol"
    kip_number: Optional[int] = None

@app.post("/agents/dao/draft")
async def dao_draft(body: DAORequest):
    if not body.idea.strip():
        raise HTTPException(400, "idea cannot be empty")
    return await dao_agent.run(
        idea=body.idea,
        author=body.author,
        category=body.category,
        kip_number=body.kip_number,
    )

@app.post("/agents/dao/stream")
async def dao_stream(body: DAORequest):
    return StreamingResponse(
        dao_agent.stream(idea=body.idea, author=body.author,
                         category=body.category, kip_number=body.kip_number),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 5: Commodity Pricing
# ═════════════════════════════════════════════════════════════════════════════

class CommodityRequest(BaseModel):
    commodity: Optional[str] = None
    days: int = 7
    question: Optional[str] = None

class PriceSubmission(BaseModel):
    commodity: str
    price_usd: float
    submitter: str = "community"
    unit: str = "kg"

@app.post("/agents/commodities/report")
async def commodity_report(body: CommodityRequest):
    return await pricing_agent.run(
        commodity=body.commodity,
        days=body.days,
        question=body.question,
    )

@app.post("/agents/commodities/stream")
async def commodity_stream(body: CommodityRequest):
    return StreamingResponse(
        pricing_agent.stream(commodity=body.commodity,
                             days=body.days, question=body.question),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/agents/commodities/price")
async def submit_price(body: PriceSubmission):
    """Submit a community price observation."""
    result = CommodityPricingAgent.submit_price(
        commodity=body.commodity,
        price_usd=body.price_usd,
        submitter=body.submitter,
        unit=body.unit,
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


# ═════════════════════════════════════════════════════════════════════════════
# Agent 6: Policy Recommender
# ═════════════════════════════════════════════════════════════════════════════

class PolicyRequest(BaseModel):
    age: int = 30
    risk_tolerance: str = "medium"
    goals: list[str] = Field(default_factory=lambda: ["savings", "yield"])
    occupation: str = "general"
    monthly_income_usd: float = 500.0
    current_holdings: dict = Field(default_factory=dict)
    location: str = "Kenya"
    question: Optional[str] = None

@app.post("/agents/policy/recommend")
async def policy_recommend(body: PolicyRequest):
    return await policy_agent.run(**body.model_dump())

@app.post("/agents/policy/stream")
async def policy_stream(body: PolicyRequest):
    return StreamingResponse(
        policy_agent.stream(**body.model_dump()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 7: Code Generator
# ═════════════════════════════════════════════════════════════════════════════

class CodeGenRequest(BaseModel):
    description: str
    contract_name: str = "GeneratedContract"
    save: bool = False

@app.post("/agents/codegen/generate")
async def codegen_generate(body: CodeGenRequest):
    if not body.description.strip():
        raise HTTPException(400, "description cannot be empty")
    return await codegen_agent.run(
        description=body.description,
        contract_name=body.contract_name,
        save=body.save,
    )

@app.post("/agents/codegen/stream")
async def codegen_stream(body: CodeGenRequest):
    return StreamingResponse(
        codegen_agent.stream(description=body.description,
                             contract_name=body.contract_name,
                             save=body.save),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# Agent 8: Document Summarizer
# ═════════════════════════════════════════════════════════════════════════════

class DocQuestionRequest(BaseModel):
    question: str
    collection: str = "kai_docs_uploaded"
    k: int = 5

@app.post("/agents/docs/ask")
async def docs_ask(body: DocQuestionRequest):
    if not body.question.strip():
        raise HTTPException(400, "question cannot be empty")
    return await doc_agent.run(
        question=body.question,
        collection=body.collection,
        k=body.k,
    )

@app.post("/agents/docs/stream")
async def docs_stream(body: DocQuestionRequest):
    return StreamingResponse(
        doc_agent.stream(question=body.question,
                         collection=body.collection, k=body.k),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/agents/docs/ingest")
async def docs_ingest(
    file: UploadFile = File(...),
    collection: str = Form(default="kai_docs_uploaded"),
):
    """Upload a document (PDF, TXT, MD) and ingest it into the vector store."""
    dest = os.path.join(UPLOADS_DIR, file.filename or "upload.txt")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    result = doc_agent.ingest(dest, collection=collection)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result

@app.get("/agents/docs/list")
async def docs_list(collection: str = "kai_docs_uploaded"):
    return {"collection": collection, "documents": doc_agent.list_documents(collection)}

@app.delete("/agents/docs/collection")
async def docs_delete_collection(collection: str = "kai_docs_uploaded"):
    return doc_agent.delete_collection(collection)


# ═════════════════════════════════════════════════════════════════════════════
# Agent registry — discovery endpoint
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/agents")
def list_agents():
    return {
        "agents": [
            {"name": "tx_analyst",        "endpoints": ["/agents/tx/analyse",          "/agents/tx/stream"],           "description": "Explains Sepolia transactions in plain English"},
            {"name": "portfolio_health",   "endpoints": ["/agents/portfolio/health",    "/agents/portfolio/stream"],    "description": "Wallet & vault position health report"},
            {"name": "contract_auditor",   "endpoints": ["/agents/audit",               "/agents/audit/stream"],        "description": "Security analysis of Solidity contracts"},
            {"name": "dao_drafter",        "endpoints": ["/agents/dao/draft",           "/agents/dao/stream"],          "description": "Formal KAI DAO governance proposals"},
            {"name": "commodity_pricing",  "endpoints": ["/agents/commodities/report",  "/agents/commodities/stream",
                                                          "/agents/commodities/price"],                                  "description": "Community commodity market analysis"},
            {"name": "policy_recommender", "endpoints": ["/agents/policy/recommend",    "/agents/policy/stream"],       "description": "Personalised KAI product recommendations"},
            {"name": "code_gen",           "endpoints": ["/agents/codegen/generate",    "/agents/codegen/stream"],      "description": "Solidity generation with Hardhat compile loop"},
            {"name": "doc_summarizer",     "endpoints": ["/agents/docs/ask",            "/agents/docs/stream",
                                                          "/agents/docs/ingest",         "/agents/docs/list",
                                                          "/agents/docs/collection"],                                    "description": "Document Q&A via local RAG"},
            # ── KAI Ecosystem agents ────────────────────────────────────────
            {"name": "did_tracker",       "endpoints": ["/agents/did/activity",  "/agents/did/stream",
                                                         "/agents/did/authorize", "/agents/did/revoke"],                 "description": "W3C DID activity tracker with audit log and authorization"},
            {"name": "indexer_balance",   "endpoints": ["/agents/balance",        "/agents/balance/stream"],            "description": "EVM Indexer API: ETH + token balances, tx history, NFTs"},
            {"name": "liquidity_manager", "endpoints": ["/agents/liquidity",      "/agents/liquidity/stream",
                                                         "/agents/liquidity/il",  "/agents/liquidity/pools"],            "description": "KAI LP position manager: IL calc, pool analytics, rebalancing"},
            {"name": "yield_optimizer",   "endpoints": ["/agents/yield",          "/agents/yield/stream"],              "description": "Scans all vaults + pools for best risk-adjusted APY"},
            {"name": "onboarding",        "endpoints": ["/agents/onboarding",     "/agents/onboarding/stream",
                                                         "/agents/onboarding/progress", "/agents/onboarding/steps"],    "description": "KAI learner step-by-step onboarding assistant"},
            {"name": "kai_navigator",     "endpoints": ["/agents/kai",            "/agents/kai/stream"],                "description": "KAI master navigator: answers any question, routes to features"},
        ],
        "rails": {
            "x402":     "/agents/x402/info",
            "identity": "/agents/identity/list",
            "escrow":   "/agents/escrow/list",
            "audit":    "/agents/rails/audit",
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
# AGENTIC RAILS — x402, DID Identity, Escrow, Audit
# ═════════════════════════════════════════════════════════════════════════════

# ─── x402 Payment Rails ──────────────────────────────────────────────────────

@app.get("/agents/x402/info")
def x402_info():
    """Returns x402 payment configuration for this server."""
    return get_x402_info()


@app.post("/agents/x402/challenge")
async def x402_challenge(request: Request):
    """
    Return an HTTP 402 payment challenge for a given route.
    Call this to get payment requirements before calling a paid endpoint.
    """
    body   = await request.json()
    route  = body.get("route", "/agents/tx/analyse")
    payer  = body.get("payer")
    req    = build_payment_requirement(route, payer)
    return {"x402Version": 1, "accepts": [req], "route": route}


@app.post("/agents/x402/verify")
async def x402_verify(request: Request):
    """
    Verify an X-PAYMENT header payload off-chain.
    Returns {valid, payer} — does not settle on-chain.
    """
    body   = await request.json()
    header = body.get("payment_header", "")
    route  = body.get("route", "/agents/tx/analyse")
    if not header:
        raise HTTPException(400, "payment_header required")
    try:
        from agents.x402_rails import verify_payment_signature, decode_payment_header, ROUTE_PRICES
        payment  = decode_payment_header(header)
        price    = ROUTE_PRICES.get(route, 100)
        valid, payer = verify_payment_signature(payment, route, price)
        return {"valid": valid, "payer": payer, "route": route, "required_amount": price}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@app.post("/agents/x402/settle")
async def x402_settle(request: Request):
    """
    Request async on-chain settlement of a completed payment.
    Returns the unsigned escrow deposit transaction for the frontend to broadcast.
    """
    body          = await request.json()
    payment       = body.get("payment", {})
    agent_address = body.get("agent_address", "")
    service_desc  = body.get("service_desc", "KAI agent service")
    if not payment or not agent_address:
        raise HTTPException(400, "payment and agent_address required")
    result = await settle_payment_async(payment, agent_address, service_desc)
    return result


# ─── Agent-initiated x402 payment (payer side) ───────────────────────────────

from agents.x402_payer import (
    X402PaymentClient,
    X402PaymentSigner,
    settle_and_broadcast,
    get_daily_spend,
    pay_and_call,
)


class X402PayRequest(BaseModel):
    url:         str
    method:      str  = "POST"
    json_body:   Optional[dict] = None
    description: str  = "Agent-initiated x402 payment"
    hedera_account: Optional[str] = None
    # Override caps for this call (must be ≤ the server-wide limits)
    max_amount_usd:  Optional[float] = None
    max_amount_hbar: Optional[float] = None


class X402SettleBroadcastRequest(BaseModel):
    payment:       dict
    agent_address: str
    service_desc:  str = "KAI agent service"
    auto_release_sec: int = 300


@app.post("/agents/x402/pay")
async def x402_pay_endpoint(body: X402PayRequest):
    """
    Agent-initiated x402 payment — the agent acts as the PAYER.

    This endpoint executes the full 402 → sign → retry cycle autonomously:
      1. Makes an outbound HTTP request to the target URL
      2. If the server returns HTTP 402, extracts the payment requirement
      3. Signs a TransferWithAuthorization (EVM) or transfers HBAR (Hedera)
      4. Retries the original request with proof of payment
      5. Returns the API response + a payment receipt

    The agent's signing key (AGENT_PRIVATE_KEY) must be set in .env.
    Per-tx cap: $1.00 USD / 5.0 HBAR. Daily cap: $10.00 USD.

    Body:
        url          — target endpoint (http://...)
        method       — GET or POST (default: POST)
        json_body    — request body for POST calls
        description  — logged in the audit trail
        hedera_account — Hedera payer account (0.0.XXXXX) for HBAR path
    """
    method = body.method.upper()
    if method not in ("GET", "POST"):
        raise HTTPException(400, "method must be GET or POST")

    try:
        async with X402PaymentClient(hedera_account=body.hedera_account) as client:
            resp, receipt = (
                await client.post(body.url, json=body.json_body or {})
                if method == "POST"
                else await client.get(body.url)
            )
            try:
                api_response = resp.json()
            except Exception:
                api_response = {"raw": resp.text, "status": resp.status_code}

    except ValueError as e:
        # Spend cap exceeded
        raise HTTPException(402, detail={"error": str(e), "spend": get_daily_spend()})
    except RuntimeError as e:
        raise HTTPException(502, detail={"error": str(e)})
    except Exception as e:
        raise HTTPException(500, detail={"error": f"x402 payment execution failed: {e}"})

    return {
        "url":         body.url,
        "description": body.description,
        "api_response": api_response,
        "receipt": {
            "paid":           receipt.paid if receipt else False,
            "network":        receipt.network if receipt else "none",
            "payer":          receipt.payer if receipt else "",
            "amount":         receipt.amount if receipt else 0,
            "amount_unit":    receipt.amount_unit if receipt else "",
            "tx_hash":        receipt.tx_hash if receipt else "",
            "hedera_tx_id":   receipt.hedera_tx_id if receipt else "",
            "response_status": receipt.response_status if receipt else api_response.get("status"),
        } if receipt else {"paid": False},
        "daily_spend": get_daily_spend(),
    }


@app.post("/agents/x402/settle/broadcast")
async def x402_settle_broadcast(body: X402SettleBroadcastRequest):
    """
    Sign and broadcast an escrow deposit transaction from the agent's EOA.

    Unlike /agents/x402/settle (which returns unsigned tx data for the frontend),
    this endpoint signs and submits the transaction directly using AGENT_PRIVATE_KEY.

    Returns the real on-chain tx_hash when successful.
    """
    try:
        result = await settle_and_broadcast(
            payment=body.payment,
            agent_address=body.agent_address,
            service_desc=body.service_desc,
            auto_release_sec=body.auto_release_sec,
        )
        return result
    except Exception as e:
        raise HTTPException(500, detail={"error": str(e)})


@app.get("/agents/x402/spend")
async def x402_spend():
    """
    Return the agent's current x402 payment spend for today.
    Shows accumulated USD and HBAR totals and the configured caps.
    """
    return get_daily_spend()


@app.post("/agents/x402/sign")
async def x402_sign(request: Request):
    """
    Sign a TransferWithAuthorization payload using the agent's EOA key.

    This is a lower-level endpoint for cases where you want to build the
    X-PAYMENT header yourself. Normally use /agents/x402/pay instead.

    Body:
        token_address  — ERC-20 contract address
        token_name     — EIP-712 domain name of the token (e.g. 'USD Coin')
        to             — recipient address (treasury)
        value          — amount in token's smallest unit (int)
        valid_before   — Unix timestamp (optional, default now+300s)
    """
    body = await request.json()
    required = ("token_address", "to", "value")
    for field in required:
        if field not in body:
            raise HTTPException(400, f"{field} required")
    try:
        signer = X402PaymentSigner()
        auth   = signer.sign_transfer_with_authorization(
            token_address=body["token_address"],
            token_name=body.get("token_name", "USD Coin"),
            to=body["to"],
            value=int(body["value"]),
            valid_before=int(body.get("valid_before", 0)) or None,
        )
        from agents.x402_payer import build_payment_header
        # Keep a copy of signature before it gets popped
        sig    = auth["signature"]
        header = build_payment_header({**auth})
        return {
            "x_payment_header": header,
            "authorization":    {**auth, "signature": sig},
            "signer":           signer.address,
            "network":          f"eip155:{os.getenv('CHAIN_ID', '11155111')}",
        }
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})
    except Exception as e:
        raise HTTPException(500, detail={"error": str(e)})


# ─── W3C DID Identity ─────────────────────────────────────────────────────────

@app.get("/agents/identity/list")
def identity_list():
    """List all registered KAI agent DID documents."""
    return {"agents": list_agent_dids(), "count": len(list_agent_dids())}


@app.get("/agents/identity/{agent_name}")
def identity_resolve(agent_name: str):
    """
    Resolve the W3C DID document for a named KAI agent.
    Also accepts a full did:kai:... string or 0x address.
    """
    if agent_name.startswith("did:kai:"):
        doc = resolve_did(agent_name)
        if doc:
            return doc
        raise HTTPException(404, f"DID not found: {agent_name}")

    if agent_name.startswith("0x"):
        passport = resolve_address(agent_name)
        if passport:
            return passport.to_w3c_document()
        raise HTTPException(404, f"Agent address not found: {agent_name}")

    from agents.identity import _PASSPORT_STORE
    for passport in _PASSPORT_STORE.values():
        name_slug = passport.name.lower().replace(" ", "_").replace("kai_", "")
        if agent_name.lower() in (name_slug, passport.name.lower()):
            return passport.to_w3c_document()

    raise HTTPException(404, f"Agent '{agent_name}' not found")


class RegisterAgentRequest(BaseModel):
    agent_address: str
    owner_address: str
    name: str
    description: str
    capabilities: dict = Field(default_factory=dict)
    service_endpoint: str = "http://127.0.0.1:8000"

@app.post("/agents/identity/register")
def identity_register(body: RegisterAgentRequest):
    """
    Register a new agent passport in the local DID store.
    Also returns the args to call KaiAgentRegistry.registerAgent() on-chain.
    """
    from agents.identity import register_local
    caps = AgentCapabilities(**{k: v for k, v in body.capabilities.items()
                                if k in AgentCapabilities.__dataclass_fields__})
    passport = AgentPassport(
        agent_address=body.agent_address,
        owner_address=body.owner_address,
        name=body.name,
        description=body.description,
        capabilities=caps,
        service_endpoint=body.service_endpoint,
    )
    doc          = register_local(passport)
    registry_args = passport.to_registry_args()
    return {
        "did":           passport.did,
        "document":      doc,
        "registry_args": registry_args,
        "note": "Call KaiAgentRegistry.registerAgent() with registry_args to register on-chain.",
    }


# ─── Escrow Management ────────────────────────────────────────────────────────

class EscrowDepositRequest(BaseModel):
    payment_ref:      str
    provider:         str
    agent_name:       str
    token:            str = ""
    amount:           int = 100
    auto_release_sec: int = 300
    service_desc:     str = "KAI agent service"

@app.post("/agents/escrow/deposit")
async def escrow_deposit(body: EscrowDepositRequest):
    from agents.identity import _PASSPORT_STORE
    agent_addr = ""
    for p in _PASSPORT_STORE.values():
        if body.agent_name.lower() in p.name.lower():
            agent_addr = p.agent_address
            break

    if not agent_addr:
        raise HTTPException(404, f"Agent '{body.agent_name}' not found")

    tx = agent_rails.escrow.build_deposit_tx(
        payment_ref=body.payment_ref,
        provider=body.provider,
        agent=agent_addr,
        token=body.token or "0x0000000000000000000000000000000000000000",
        amount=body.amount,
        auto_release_sec=body.auto_release_sec,
        service_desc=body.service_desc,
    )
    return {"escrow_tx": tx, "agent_address": agent_addr}


@app.post("/agents/escrow/release/{escrow_id}")
def escrow_release(escrow_id: str):
    tx = agent_rails.escrow.build_release_tx(escrow_id)
    return {"release_tx": tx}


@app.post("/agents/escrow/refund/{escrow_id}")
def escrow_refund(escrow_id: str):
    tx = agent_rails.escrow.build_refund_tx(escrow_id)
    return {"refund_tx": tx}


@app.get("/agents/escrow/list")
def escrow_list():
    return {
        "escrows": [vars(e) for e in agent_rails.escrow.list_local()],
        "count":   len(agent_rails.escrow.list_local()),
    }


# ─── Agent-to-Agent Payments ─────────────────────────────────────────────────

class A2APaymentRequest(BaseModel):
    from_agent:  str
    to_agent:    str
    amount:      int  = 100
    description: str  = "Sub-service payment"

@app.post("/agents/rails/a2a")
async def rails_a2a(body: A2APaymentRequest):
    result = await agent_rails.agent_to_agent_payment(
        from_agent=body.from_agent,
        to_agent=body.to_agent,
        amount=body.amount,
        description=body.description,
    )
    return result


# ─── Spend Policy ─────────────────────────────────────────────────────────────

@app.get("/agents/rails/spend/{agent_name}")
def rails_spend(agent_name: str):
    spent = agent_rails.enforcer.daily_spent(agent_name)
    return {"agent": agent_name, "daily_spent_wei": spent, "daily_spent_eth": spent / 1e18}


# ─── Audit Log ────────────────────────────────────────────────────────────────

@app.get("/agents/rails/audit")
def rails_audit(limit: int = 50):
    return {"channels": agent_rails.audit_log(limit), "total": len(agent_rails._channels)}


# ─── Pre-flight check (used by the Next.js frontend) ─────────────────────────

class PreflightRequest(BaseModel):
    route:         str
    agent_name:    str
    agent_address: str = ""
    payer:         str = ""
    amount:        int = 100

@app.post("/agents/rails/preflight")
async def rails_preflight(body: PreflightRequest):
    if not body.agent_address:
        from agents.identity import _PASSPORT_STORE
        for p in _PASSPORT_STORE.values():
            if body.agent_name.lower() in p.name.lower():
                body.agent_address = p.agent_address
                break

    body_hash = hashlib.sha3_256(body.route.encode()).hexdigest()

    try:
        channel = await agent_rails.pre_flight(
            route=body.route,
            agent_name=body.agent_name,
            agent_address=body.agent_address or "0x0000000000000000000000000000000000000001",
            payer=body.payer or "anonymous",
            amount=body.amount,
            body_hash=body_hash,
        )
        escrow_tx = agent_rails.get_escrow_deposit(
            channel=channel,
            provider_address=body.agent_address or "0x0000000000000000000000000000000000000001",
            service_desc=f"KAI {body.agent_name} → {body.route}",
        )
        return {
            "pre_flight": "passed",
            "channel":    channel.to_receipt(),
            "escrow_tx":  escrow_tx,
            "x402_req":   build_payment_requirement(body.route, body.payer or None),
        }
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(429, str(e))



# ═════════════════════════════════════════════════════════════════════════════
# KAI ECOSYSTEM AGENTS
# ═════════════════════════════════════════════════════════════════════════════

# ─── 1. DID Activity Tracker ─────────────────────────────────────────────────

class DIDActivityRequest(BaseModel):
    query:     str = "summarise"
    agent_did: Optional[str] = None
    action:    Optional[str] = None
    limit:     int = 50

class DIDAuthorizeRequest(BaseModel):
    granter_did:  str
    grantee_did:  str
    capability:   str
    expires_in_s: int = 86400
    conditions:   dict = Field(default_factory=dict)

class DIDRevokeRequest(BaseModel):
    granter_did: str
    grantee_did: str
    capability:  str

class DIDLogRequest(BaseModel):
    agent_did:  str
    action:     str
    details:    dict = Field(default_factory=dict)
    outcome:    str = "success"
    caller_did: Optional[str] = None

@app.post("/agents/did/activity")
async def did_activity(body: DIDActivityRequest):
    return await did_tracker_agent.run(
        query=body.query, agent_did=body.agent_did,
        action=body.action, limit=body.limit,
    )

@app.post("/agents/did/stream")
async def did_stream(body: DIDActivityRequest):
    return StreamingResponse(
        did_tracker_agent.stream(query=body.query, agent_did=body.agent_did, limit=body.limit),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/agents/did/log")
async def did_log(body: DIDLogRequest):
    entry = log_action(
        agent_did=body.agent_did, action=body.action,
        details=body.details, outcome=body.outcome, caller_did=body.caller_did,
    )
    return {"logged": True, "entry": entry}

@app.post("/agents/did/authorize")
async def did_authorize(body: DIDAuthorizeRequest):
    record = authorize(
        granter_did=body.granter_did, grantee_did=body.grantee_did,
        capability=body.capability, expires_in_s=body.expires_in_s,
        conditions=body.conditions,
    )
    return {"authorized": True, "record": record}

@app.post("/agents/did/revoke")
async def did_revoke(body: DIDRevokeRequest):
    record = revoke(body.granter_did, body.grantee_did, body.capability)
    return {"revoked": True, "record": record}

@app.get("/agents/did/log")
async def did_get_log(agent_did: Optional[str] = None, action: Optional[str] = None, limit: int = 50):
    return {"entries": get_audit_log(agent_did=agent_did, action=action, limit=limit)}

@app.get("/agents/did/check")
async def did_check_auth(grantee_did: str, capability: str):
    from agents.did_tracker import is_authorized as _is_auth
    authorized = _is_auth(grantee_did, capability)
    return {"grantee_did": grantee_did, "capability": capability, "authorized": authorized}


# ─── 2. Indexer Balance Checker ──────────────────────────────────────────────

class BalanceRequest(BaseModel):
    address:  str
    question: Optional[str] = None

@app.post("/agents/balance")
async def balance_check(body: BalanceRequest):
    if not body.address.strip():
        raise HTTPException(400, "address is required")
    return await indexer_agent.run(address=body.address, question=body.question)

@app.post("/agents/balance/stream")
async def balance_stream(body: BalanceRequest):
    return StreamingResponse(
        indexer_agent.stream(address=body.address, question=body.question),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/agents/balance/{address}")
async def balance_get(address: str):
    data = await fetch_portfolio(address)
    return data


# ─── 3. Liquidity Manager ────────────────────────────────────────────────────

class LiquidityRequest(BaseModel):
    question:      str = "Show all pools and best LP opportunity"
    pair:          Optional[str] = None
    lp_balance:    float = 0.0
    initial_price: float = 0.0
    wallet:        Optional[str] = None

class ILRequest(BaseModel):
    initial_price: float
    current_price: float
    initial_a:     float
    initial_b:     float

@app.post("/agents/liquidity")
async def liquidity_check(body: LiquidityRequest):
    return await liquidity_agent.run(
        question=body.question, pair=body.pair,
        lp_balance=body.lp_balance, initial_price=body.initial_price,
        wallet=body.wallet,
    )

@app.post("/agents/liquidity/stream")
async def liquidity_stream(body: LiquidityRequest):
    return StreamingResponse(
        liquidity_agent.stream(question=body.question, pair=body.pair),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/agents/liquidity/il")
async def liquidity_il(body: ILRequest):
    result = calculate_il(
        initial_price=body.initial_price, current_price=body.current_price,
        initial_a=body.initial_a, initial_b=body.initial_b,
    )
    return result

@app.get("/agents/liquidity/pools")
async def liquidity_pools():
    import asyncio as _asyncio
    pools = await _asyncio.gather(*[get_pool_state(p) for p in ["NVR/yBOB", "YTOKEN/YGOLD", "GAMI/CENTS"]])
    return {"pools": list(pools)}


# ─── 4. Yield Optimizer ──────────────────────────────────────────────────────

class YieldRequest(BaseModel):
    question:       str = "What are the best yield opportunities?"
    risk_tolerance: str = "medium"
    amount_usd:     float = 0.0
    goals:          list[str] = Field(default_factory=lambda: ["yield"])
    wallet:         Optional[str] = None

@app.post("/agents/yield")
async def yield_check(body: YieldRequest):
    return await yield_agent.run(
        question=body.question, risk_tolerance=body.risk_tolerance,
        amount_usd=body.amount_usd, goals=body.goals, wallet=body.wallet,
    )

@app.post("/agents/yield/stream")
async def yield_stream(body: YieldRequest):
    return StreamingResponse(
        yield_agent.stream(
            question=body.question, risk_tolerance=body.risk_tolerance,
            amount_usd=body.amount_usd, wallet=body.wallet,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/agents/yield/scan")
async def yield_scan(wallet: Optional[str] = None):
    data = await scan_all_yields(wallet=wallet)
    return data


# ─── 5. Onboarding Assistant ─────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    user_id:       str = "default"
    question:      str = "Where do I start?"
    step:          Optional[int] = None
    complete_step: Optional[int] = None
    experience:    str = "beginner"

@app.post("/agents/onboarding")
async def onboarding_ask(body: OnboardingRequest):
    return await onboarding_agent.run(
        user_id=body.user_id, question=body.question,
        step=body.step, complete_step=body.complete_step,
        experience=body.experience,
    )

@app.post("/agents/onboarding/stream")
async def onboarding_stream(body: OnboardingRequest):
    return StreamingResponse(
        onboarding_agent.stream(
            user_id=body.user_id, question=body.question,
            step=body.step, experience=body.experience,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/agents/onboarding/steps")
async def onboarding_steps():
    return {"steps": STEP_GUIDES, "total": len(STEP_GUIDES)}

@app.get("/agents/onboarding/progress/{user_id}")
async def onboarding_progress(user_id: str):
    from agents.onboarding import _load_progress
    progress = _load_progress()
    user = progress.get(user_id, {"current_step": 1, "completed": [], "user_id": user_id})
    return {**user, "progress_pct": len(user.get("completed", [])) * 10}


# ─── 6. KAI Navigator (Master Assistant) ─────────────────────────────────────

class NavigatorRequest(BaseModel):
    question:   str
    context:    dict = Field(default_factory=dict)
    wallet:     Optional[str] = None
    user_level: str = "intermediate"

@app.post("/agents/kai")
async def kai_navigate(body: NavigatorRequest):
    if not body.question.strip():
        raise HTTPException(400, "question is required")
    return await navigator_agent.run(
        question=body.question, context=body.context or None,
        wallet=body.wallet, user_level=body.user_level,
    )

@app.post("/agents/kai/stream")
async def kai_stream(body: NavigatorRequest):
    return StreamingResponse(
        navigator_agent.stream(
            question=body.question, context=body.context or None,
            wallet=body.wallet, user_level=body.user_level,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/agents/kai/routes")
async def kai_routes():
    return {"routes": INTENT_ROUTES, "description": "Intent → page mapping for KAI Nuvari"}


# ═════════════════════════════════════════════════════════════════════════════
# ONBOARDING SUITE  — /agents/onboard/*
# ═════════════════════════════════════════════════════════════════════════════

# ── Pydantic models ─────────────────────────────────────────────────────────

class TrustScoreRequest(BaseModel):
    forest_score: float = 0.0
    msme_score:   float = 0.0
    chama_score:  float = 0.0
    user_name:    str   = "Community Member"

class HatRequest(BaseModel):
    message:   str = ""
    user_name: str = "User"

class ProfileRequest(BaseModel):
    message:        str   = ""
    wallet_address: str   = ""
    phone_number:   str   = ""
    name:           str   = "Community Member"
    language:       str   = "SWAHILI"
    cfa_group:      str   = ""
    business_name:  str   = ""
    chama_name:     str   = ""
    forest_score:   float = 0.0
    msme_score:     float = 0.0
    chama_score:    float = 0.0

class ContentRequest(BaseModel):
    hat:       str  = "CHAMA_SAVER"
    interests: list = []
    context:   str  = ""

class PaymentRiskRequest(BaseModel):
    route:   str = ""
    payer:   str = ""
    amount:  int = 0
    nonce:   str = ""
    service: str = ""


# ── 1. Trust Score ──────────────────────────────────────────────────────────

@app.post("/agents/onboard/trust")
async def onboard_trust(body: TrustScoreRequest):
    result = await trust_score_agent.run(
        forest_score=body.forest_score,
        msme_score=body.msme_score,
        chama_score=body.chama_score,
        user_name=body.user_name,
    )
    return result

@app.post("/agents/onboard/trust/stream")
async def onboard_trust_stream(body: TrustScoreRequest):
    return StreamingResponse(
        trust_score_agent.stream(
            forest_score=body.forest_score,
            msme_score=body.msme_score,
            chama_score=body.chama_score,
            user_name=body.user_name,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 2. Hat Switcher ────────────────────────────────────────────────────────

@app.post("/agents/onboard/hat")
async def onboard_hat(body: HatRequest):
    result = await hat_agent.run(message=body.message, user_name=body.user_name)
    return result

@app.post("/agents/onboard/hat/stream")
async def onboard_hat_stream(body: HatRequest):
    return StreamingResponse(
        hat_agent.stream(message=body.message, user_name=body.user_name),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 3. Unified Profiler ────────────────────────────────────────────────────

@app.post("/agents/onboard/profile")
async def onboard_profile(body: ProfileRequest):
    result = await profiler_agent.run(**body.model_dump())
    return result

@app.post("/agents/onboard/profile/stream")
async def onboard_profile_stream(body: ProfileRequest):
    return StreamingResponse(
        profiler_agent.stream(**body.model_dump()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 4. Content Curator ─────────────────────────────────────────────────────

@app.post("/agents/onboard/content")
async def onboard_content(body: ContentRequest):
    result = await curator_agent.run(
        hat=body.hat, interests=body.interests, context=body.context,
    )
    return result

@app.post("/agents/onboard/content/stream")
async def onboard_content_stream(body: ContentRequest):
    return StreamingResponse(
        curator_agent.stream(
            hat=body.hat, interests=body.interests, context=body.context,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 5. Payment Approver ────────────────────────────────────────────────────

@app.post("/agents/onboard/payment-risk")
async def onboard_payment_risk(body: PaymentRiskRequest):
    result = await payment_risk_agent.run(
        route=body.route, payer=body.payer,
        amount=body.amount, nonce=body.nonce, service=body.service,
    )
    return result

@app.post("/agents/onboard/payment-risk/stream")
async def onboard_payment_risk_stream(body: PaymentRiskRequest):
    return StreamingResponse(
        payment_risk_agent.stream(
            route=body.route, payer=body.payer,
            amount=body.amount, nonce=body.nonce, service=body.service,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5 — Hedera Native Rails  (/agents/hedera/*)
# ═══════════════════════════════════════════════════════════════════════════════

from agents.hedera_rails import (
    hedera_agent,
    get_account_info   as hedera_get_account,
    get_token_balance  as hedera_get_token_balance,
    get_token_info     as hedera_get_token_info,
    get_nfts_for_account,
    get_transaction_history as hedera_get_txs,
    get_hcs_messages,
    mint_kaibar        as hedera_mint_kaibar,
    mint_conservation_nft,
    transfer_hbar      as hedera_transfer_hbar,
    associate_token    as hedera_associate_token,
    log_hcs_event,
    KAIBAR_TOKEN, CONNFT_TOKEN, AUDIT_TOPIC, NETWORK as HEDERA_NETWORK, EXPLORER as HEDERA_EXPLORER,
)


# ── Request models ─────────────────────────────────────────────────────────────

class HederaAccountRequest(BaseModel):
    account_id: str
    question: Optional[str] = None
    action: str = "account"   # account | kaibar | connft | hcs | tx | token_info

class HederaMintKaibarRequest(BaseModel):
    recipient: str
    amount: float
    reason: str = "manual_mint"

class HederaMintNFTRequest(BaseModel):
    recipient: str
    conservation_id: str
    event_type: str = "conservation_event"
    metadata_pointer: str
    count: int = 1

class HederaTransferRequest(BaseModel):
    to: str
    amount: float
    memo: Optional[str] = ""

class HederaAssociateRequest(BaseModel):
    account_id: str
    token_ids: list[str]

class HederaHCSLogRequest(BaseModel):
    event: str
    payload: dict = {}


# ── Read endpoints ─────────────────────────────────────────────────────────────

@app.get("/agents/hedera/health")
async def hedera_health():
    """Return Hedera rail configuration and status."""
    return {
        "service":    "KAI Hedera Rails",
        "network":    HEDERA_NETWORK,
        "kaibar_token":  KAIBAR_TOKEN  or "not configured",
        "connft_token":  CONNFT_TOKEN  or "not configured",
        "audit_topic":   AUDIT_TOPIC   or "not configured",
        "explorer":      HEDERA_EXPLORER,
        "configured": bool(os.getenv("HEDERA_OPERATOR_ID") and os.getenv("HEDERA_OPERATOR_KEY")),
    }


@app.get("/agents/hedera/account/{account_id}")
async def hedera_account(account_id: str):
    """Fetch HBAR balance and account metadata from Mirror Node."""
    try:
        return await hedera_get_account(account_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/agents/hedera/balance/{account_id}/{token_id}")
async def hedera_token_balance(account_id: str, token_id: str):
    """Fetch a specific HTS token balance for an account."""
    try:
        return await hedera_get_token_balance(account_id, token_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/agents/hedera/token/{token_id}")
async def hedera_token_info(token_id: str):
    """Fetch HTS token metadata."""
    try:
        return await hedera_get_token_info(token_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/agents/hedera/nfts/{account_id}")
async def hedera_nfts(account_id: str, token_id: Optional[str] = None):
    """List NFT serials held by an account."""
    try:
        nfts = await get_nfts_for_account(account_id, token_id)
        return {"account_id": account_id, "nfts": nfts, "count": len(nfts)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/agents/hedera/transactions/{account_id}")
async def hedera_transactions(account_id: str, limit: int = 25):
    """Fetch recent Hedera transactions for an account."""
    try:
        return {"account_id": account_id, "transactions": await hedera_get_txs(account_id, limit)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/agents/hedera/hcs/messages")
async def hedera_hcs_messages(limit: int = 25):
    """Fetch recent HCS audit log entries."""
    if not AUDIT_TOPIC:
        raise HTTPException(status_code=503, detail="HEDERA_AUDIT_TOPIC_ID not configured")
    try:
        msgs = await get_hcs_messages(AUDIT_TOPIC, limit)
        return {"topic_id": AUDIT_TOPIC, "messages": msgs, "count": len(msgs)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── AI-powered analysis endpoints ──────────────────────────────────────────────

@app.post("/agents/hedera/analyse")
async def hedera_analyse(body: HederaAccountRequest):
    """AI analysis of a Hedera account, token, NFT, or HCS data."""
    result = await hedera_agent.run(
        account_id=body.account_id,
        question=body.question or "",
        action=body.action,
    )
    return result


@app.post("/agents/hedera/analyse/stream")
async def hedera_analyse_stream(body: HederaAccountRequest):
    """Streaming AI analysis of Hedera data."""
    return StreamingResponse(
        hedera_agent.stream(
            account_id=body.account_id,
            question=body.question or "",
            action=body.action,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Write endpoints (delegate to Next.js operator API) ────────────────────────

@app.post("/agents/hedera/mint/kaibar")
async def hedera_mint_kaibar_endpoint(body: HederaMintKaibarRequest):
    """
    Mint KAIBAR tokens and transfer to recipient.
    Delegates actual signing to the Next.js operator API (hederaClient.ts).
    """
    try:
        result = await hedera_mint_kaibar(body.recipient, body.amount, body.reason)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/hedera/mint/connft")
async def hedera_mint_connft_endpoint(body: HederaMintNFTRequest):
    """
    Mint Conservation NFT(s) for a verified conservation event.
    Idempotency: callers must supply a unique conservation_id.
    """
    try:
        result = await mint_conservation_nft(
            recipient=body.recipient,
            conservation_id=body.conservation_id,
            event_type=body.event_type,
            metadata_pointer=body.metadata_pointer,
            count=body.count,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/hedera/transfer/hbar")
async def hedera_transfer_hbar_endpoint(body: HederaTransferRequest):
    """Transfer HBAR from the operator account to a recipient."""
    try:
        result = await hedera_transfer_hbar(body.to, body.amount, body.memo or "")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/hedera/associate")
async def hedera_associate_endpoint(body: HederaAssociateRequest):
    """Associate HTS token(s) with an account."""
    try:
        result = await hedera_associate_token(body.account_id, body.token_ids)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/hedera/hcs/log")
async def hedera_hcs_log(body: HederaHCSLogRequest):
    """Write a custom audit entry to the HCS topic."""
    try:
        result = await log_hcs_event(body.event, body.payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Needle (Cactus Compute) on-device tool-calling harness  (/agents/needle/*)
# ═══════════════════════════════════════════════════════════════════════════════

from agents.needle_harness import run_needle_agent, get_needle_harness, KAI_TOOLS


class NeedleRequest(BaseModel):
    query: str


@app.get("/agents/needle/health")
async def needle_health():
    """Check Needle harness status and list available tools."""
    try:
        harness = get_needle_harness()
        return {
            "status":  "ok",
            "engine":  "needle-2 (cactus-compute, on-device, 14MB)",
            "tools":   [t.__name__ for t in KAI_TOOLS],
            "tool_count": len(KAI_TOOLS),
            "note": "Needle weights download from HuggingFace on first run (~14MB, cached).",
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/agents/needle/run")
async def needle_run(body: NeedleRequest):
    """
    Run a query through the Needle 2 on-device tool-calling harness.
    Needle selects the right KAI tool and fills its arguments — no Groq key needed.
    Returns structured result including which tool was called and its output.
    """
    try:
        result = await run_needle_agent(body.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/needle/stream")
async def needle_stream(body: NeedleRequest):
    """Streaming version of the Needle harness endpoint."""
    import json as _json

    async def _gen():
        try:
            result = await run_needle_agent(body.query)
            # Stream the text response word by word
            text = result.get("text", "")
            if text:
                for word in text.split(" "):
                    yield f"data: {_json.dumps({'token': word + ' '})}\n\n"
            # Stream each tool result
            for item in result.get("results", []):
                yield f"data: {_json.dumps({'tool': item.get('tool_name'), 'result': item.get('result')})}\n\n"
            yield f"data: {_json.dumps({'done': True, 'success': result.get('success'), 'tool_count': result.get('tool_count', 0)})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Voice Box  (/agents/voice/*)
# STT: Groq Whisper | TTS: edge-tts (Microsoft Edge Neural)
# ═══════════════════════════════════════════════════════════════════════════════

from agents.voice_agent import (
    voice_agent,
    transcribe_audio,
    synthesize_speech,
    synthesize_speech_stream,
    AVAILABLE_VOICES,
    VOICE_NAME,
    _clean_for_speech,
)


# ── Request models ─────────────────────────────────────────────────────────────

class VoiceSpeakRequest(BaseModel):
    text:  str
    voice: Optional[str] = None
    rate:  Optional[str] = None
    pitch: Optional[str] = None

class VoiceChatRequest(BaseModel):
    text:  str
    voice: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/agents/voice/health")
async def voice_health():
    """Voice box status — confirms STT and TTS are configured."""
    return {
        "service":        "KAI Voice Box",
        "stt":            "Groq Whisper (whisper-large-v3-turbo)",
        "tts":            "edge-tts (Microsoft Edge Neural)",
        "default_voice":  VOICE_NAME,
        "available_voices": AVAILABLE_VOICES,
        "stt_ready":      bool(os.getenv("GROQ_API_KEY") and
                               not os.getenv("GROQ_API_KEY","").startswith("your_")),
        "tts_ready":      True,   # edge-tts needs no API key
    }


@app.get("/agents/voice/voices")
async def voice_list():
    """List all available TTS voices."""
    return {"voices": AVAILABLE_VOICES, "default": VOICE_NAME}


@app.post("/agents/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
):
    """
    Transcribe uploaded audio to text using Groq Whisper.
    Accepts: WebM, MP3, WAV, M4A, OGG, FLAC.
    Returns: { text, duration_ms }
    """
    t0 = time.time()
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, "Audio file is empty")

    try:
        text = await transcribe_audio(audio_bytes, filename=file.filename or "audio.webm")
        return {
            "text":        text,
            "duration_ms": int((time.time() - t0) * 1000),
            "model":       "whisper-large-v3-turbo",
        }
    except ValueError as e:
        raise HTTPException(503, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=f"Transcription failed: {e}")


@app.post("/agents/voice/speak")
async def voice_speak(body: VoiceSpeakRequest):
    """
    Convert text to speech and return MP3 audio.
    Useful for one-shot TTS without an agent call.
    Returns: audio/mpeg binary response.
    """
    if not body.text.strip():
        raise HTTPException(400, "text cannot be empty")
    try:
        audio = await synthesize_speech(
            body.text,
            voice=body.voice,
            rate=body.rate,
            pitch=body.pitch,
        )
        from fastapi.responses import Response
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={"X-Voice": body.voice or VOICE_NAME,
                     "X-Text-Length": str(len(body.text))},
        )
    except Exception as e:
        raise HTTPException(500, detail=f"TTS failed: {e}")


@app.post("/agents/voice/speak/stream")
async def voice_speak_stream(body: VoiceSpeakRequest):
    """
    Streaming TTS — returns MP3 audio chunks as they are generated.
    Lower latency for long text.
    """
    if not body.text.strip():
        raise HTTPException(400, "text cannot be empty")

    async def _gen():
        async for chunk in synthesize_speech_stream(body.text, voice=body.voice):
            yield chunk

    return StreamingResponse(
        _gen(),
        media_type="audio/mpeg",
        headers={"X-Voice": body.voice or VOICE_NAME},
    )


@app.post("/agents/voice/chat")
async def voice_chat(body: VoiceChatRequest):
    """
    Full voice chat: user text → KAI agent → text response + MP3 audio.
    Returns: { text, audio_b64, audio_bytes, voice, duration_ms }
    """
    if not body.text.strip():
        raise HTTPException(400, "text cannot be empty")
    try:
        result = await voice_agent.voice_chat(body.text, voice=body.voice)
        return result
    except Exception as e:
        raise HTTPException(500, detail=f"Voice chat failed: {e}")


@app.post("/agents/voice/chat/stream")
async def voice_chat_stream(body: VoiceChatRequest):
    """
    Streaming voice chat.
    SSE stream of:
      {type: 'text', chunk: '...'}    — agent text tokens as they arrive
      {type: 'audio', data: '<b64>'}  — TTS audio chunks (MP3, base64)
      {type: 'done', voice: '...'}
    """
    if not body.text.strip():
        raise HTTPException(400, "text cannot be empty")

    return StreamingResponse(
        voice_agent.voice_chat_stream(body.text, voice=body.voice),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/agents/voice/full")
async def voice_full_pipeline(
    file:  UploadFile = File(...),
    voice: str        = "en-US-AvaMultilingualNeural",
):
    """
    Full voice round-trip in one call:
      1. Transcribe uploaded audio (Groq Whisper)
      2. Send text to KAI agent (Groq LLM)
      3. Synthesize response to speech (edge-tts)

    Returns: { transcript, response_text, audio_b64, voice, duration_ms }
    """
    t0 = time.time()
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, "Audio file is empty")

    try:
        # Step 1: STT
        transcript = await transcribe_audio(audio_bytes, filename=file.filename or "audio.webm")
        if not transcript:
            raise HTTPException(422, "Could not transcribe audio — please speak more clearly")

        # Step 2 + 3: LLM + TTS
        result = await voice_agent.voice_chat(transcript, voice=voice)

        return {
            "transcript":    transcript,
            "response_text": result["text"],
            "audio_b64":     result["audio_b64"],
            "audio_bytes":   result["audio_bytes"],
            "content_type":  "audio/mpeg",
            "voice":         voice,
            "duration_ms":   int((time.time() - t0) * 1000),
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(503, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=f"Voice pipeline failed: {e}")
