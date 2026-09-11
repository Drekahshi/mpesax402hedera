"""
Agent 3: Smart Contract Auditor
Reads Solidity source files from the contracts/ directory and produces
structured security findings using the Groq cloud model.
No external APIs — pure static analysis via LLM reasoning.
"""

from __future__ import annotations
import os
import glob
from pathlib import Path
from typing import AsyncIterator
from .base import AgentBase

# Default contracts dir (relative to repo root)
DEFAULT_CONTRACTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "contracts")
)

SYSTEM = """You are a senior Solidity smart contract security auditor with 10 years of experience.
You perform thorough security reviews of Solidity contracts.

For each contract, produce a structured audit report with these sections:

## Audit Report: <ContractName>

### Critical Issues 🔴
(Bugs that MUST be fixed before deployment — fund loss risk)

### High Issues 🟠
(Serious vulnerabilities that should be fixed)

### Medium Issues 🟡
(Issues that could cause problems under certain conditions)

### Low Issues 🟢
(Best-practice violations, minor inefficiencies)

### Informational ℹ️
(Style, gas optimisations, suggestions)

### Summary
(Overall security posture, key recommendations, pass/fail recommendation)

Check specifically for:
- Reentrancy vulnerabilities
- Integer overflow/underflow (even with 0.8+ auto-checks, note division precision)
- Access control gaps (missing onlyOwner, missing role checks)
- Unchecked return values
- Timestamp dependence
- Front-running opportunities
- Improper ERC-20 interactions (missing return value checks)
- Self-destruct or delegatecall risks
- Centralisation risks (single admin key)
- Missing events for state changes
- Incorrect math in AMM / vault share calculations"""


def _load_contracts(contracts_dir: str, filename: str | None = None) -> list[dict]:
    """Load .sol files from the contracts directory."""
    results = []
    path = Path(contracts_dir)
    if not path.exists():
        return results

    pattern = str(path / (filename if filename else "*.sol"))
    for sol_file in sorted(glob.glob(pattern)):
        try:
            content = Path(sol_file).read_text(encoding="utf-8")
            results.append({
                "filename": Path(sol_file).name,
                "path":     sol_file,
                "content":  content,
                "lines":    content.count("\n"),
            })
        except Exception:
            pass
    return results


def _chunk_contract(content: str, max_chars: int = 6000) -> list[str]:
    """Split large contracts into overlapping chunks so they fit in context."""
    if len(content) <= max_chars:
        return [content]
    chunks = []
    start  = 0
    overlap = 500
    while start < len(content):
        end = min(start + max_chars, len(content))
        chunks.append(content[start:end])
        start = end - overlap
    return chunks


class ContractAuditorAgent(AgentBase):
    name = "contract_auditor"
    description = "Performs security analysis of Solidity smart contracts"

    async def _audit_single(self, filename: str, content: str) -> str:
        chunks = _chunk_contract(content)
        if len(chunks) == 1:
            prompt = f"Audit this Solidity contract:\n\nFile: {filename}\n\n```solidity\n{content}\n```"
            return await self.complete(prompt, system=SYSTEM)

        # Multi-chunk: audit each part then consolidate
        part_reports = []
        for i, chunk in enumerate(chunks):
            prompt = (
                f"Audit PART {i+1}/{len(chunks)} of contract {filename}:\n\n"
                f"```solidity\n{chunk}\n```\n\n"
                f"List any issues found in this section only."
            )
            part_reports.append(await self.complete(prompt, system=SYSTEM))

        consolidate_prompt = (
            f"You have audited {filename} in {len(chunks)} parts.\n"
            f"Here are the part reports:\n\n"
            + "\n\n---\n\n".join(f"Part {i+1}:\n{r}" for i, r in enumerate(part_reports))
            + "\n\nNow write the final consolidated audit report."
        )
        return await self.complete(consolidate_prompt, system=SYSTEM)

    async def run(
        self,
        contracts_dir: str = DEFAULT_CONTRACTS_DIR,
        filename: str | None = None,
    ) -> dict:
        contracts = _load_contracts(contracts_dir, filename)
        if not contracts:
            return {"error": f"No .sol files found in {contracts_dir}"}

        reports = {}
        for c in contracts:
            reports[c["filename"]] = {
                "lines":  c["lines"],
                "report": await self._audit_single(c["filename"], c["content"]),
            }

        summary_prompt = (
            f"You audited {len(contracts)} contracts: {', '.join(reports.keys())}.\n"
            "Write a 3-sentence overall security summary for the entire codebase."
        )
        overall = await self.complete(summary_prompt, system=SYSTEM)

        return {
            "agent":           self.name,
            "contracts_dir":   contracts_dir,
            "contracts_audited": len(contracts),
            "reports":         reports,
            "overall_summary": overall,
        }

    async def stream(
        self,
        contracts_dir: str = DEFAULT_CONTRACTS_DIR,
        filename: str | None = None,
    ) -> AsyncIterator[str]:
        contracts = _load_contracts(contracts_dir, filename)
        if not contracts:
            yield 'data: {"error": "No .sol files found"}\n\n'
            return

        for c in contracts:
            yield f'data: {{"token": "\\n## Auditing {c["filename"]} ({c["lines"]} lines)...\\n"}}\n\n'
            prompt = (
                f"Audit this Solidity contract:\n\n"
                f"File: {c['filename']}\n\n"
                f"```solidity\n{c['content'][:6000]}\n```"
            )
            async for chunk in self.stream_response(prompt, system=SYSTEM):
                yield chunk
        yield 'data: {"done": true}\n\n'
