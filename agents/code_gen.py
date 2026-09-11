"""
Agent 7: Solidity Code Generator
Generates Solidity smart contracts from plain-language descriptions,
then self-corrects by running `hardhat compile` and feeding errors back
to the model — loops until it compiles or max retries reached.
No external APIs — uses Groq cloud + local Hardhat.
"""

from __future__ import annotations
import os
import re
import asyncio
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import AsyncIterator
from .base import AgentBase

# Repo root contracts directory
CONTRACTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "contracts")
)
HARDHAT_ROOT  = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
MAX_RETRIES   = 4

SYSTEM = """You are an expert Solidity smart contract developer specialising in DeFi on Ethereum & Hedera.
You write clean, secure, gas-efficient Solidity contracts.

Rules:
1. Always use pragma solidity ^0.8.28;
2. Import from @openzeppelin/contracts when using ERC-20, ERC-721, AccessControl, Ownable, ReentrancyGuard
3. Emit events for every state change
4. Use custom errors instead of require strings (saves gas)
5. Add NatSpec comments (@notice, @param, @return)
6. The contract must be production-quality, not a skeleton
7. Return ONLY the Solidity code inside a ```solidity code block — nothing else"""

SYSTEM_FIX = """You are fixing compilation errors in a Solidity contract.
Given the original contract and the compiler errors, produce a corrected version.
Return ONLY the corrected Solidity code inside a ```solidity code block — nothing else."""


def _extract_solidity(text: str) -> str | None:
    """Extract Solidity code from a markdown code block."""
    match = re.search(r"```solidity\s*(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: if it starts with // SPDX or pragma, return as-is
    if text.strip().startswith(("// SPDX", "pragma")):
        return text.strip()
    return None


def _run_hardhat_compile(contract_source: str, contract_name: str) -> tuple[bool, str]:
    """
    Write contract to a temp file, run hardhat compile, return (success, output).
    Cleans up after itself.
    """
    tmp_path = os.path.join(CONTRACTS_DIR, f"_tmp_{contract_name}.sol")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(contract_source)

        result = subprocess.run(
            ["npx", "hardhat", "compile", "--quiet"],
            cwd=HARDHAT_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = result.stdout + result.stderr
        success = result.returncode == 0 and "error" not in output.lower()
        return success, output

    except subprocess.TimeoutExpired:
        return False, "Hardhat compile timed out (120s)"
    except Exception as e:
        return False, str(e)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


class CodeGenAgent(AgentBase):
    name = "code_gen"
    description = "Generates and self-corrects Solidity contracts via Hardhat compile loop"

    async def run(
        self,
        description: str,
        contract_name: str = "GeneratedContract",
        save: bool = False,
    ) -> dict:
        """
        Generate a Solidity contract from a description.
        Loops up to MAX_RETRIES times fixing compile errors.

        If save=True, writes the final contract to contracts/ directory.
        """
        # Sanitise contract name
        contract_name = re.sub(r"[^a-zA-Z0-9_]", "", contract_name) or "GeneratedContract"

        prompt = f"""Write a complete Solidity smart contract for this requirement:

"{description}"

Contract name: {contract_name}
Target network: Ethereum & Hedera (X402) (EVM compatible)

Write the complete contract now."""

        history: list[dict] = []
        current_source: str | None = None
        compile_success = False
        attempts = 0

        # Generation loop
        for attempt in range(1, MAX_RETRIES + 1):
            attempts = attempt

            if attempt == 1:
                # First attempt: fresh generation
                raw = await self.complete(prompt, system=SYSTEM)
            else:
                # Subsequent: fix errors
                fix_prompt = (
                    f"The contract has these compilation errors:\n\n{history[-1]['errors']}\n\n"
                    f"Original contract:\n```solidity\n{current_source}\n```\n\n"
                    f"Fix all errors and return the corrected contract."
                )
                raw = await self.complete(fix_prompt, system=SYSTEM_FIX)

            source = _extract_solidity(raw)
            if not source:
                history.append({
                    "attempt": attempt,
                    "error":   "Could not extract Solidity from model response",
                    "raw":     raw[:500],
                })
                continue

            current_source = source
            success, output = await asyncio.get_event_loop().run_in_executor(
                None, _run_hardhat_compile, source, contract_name
            )

            history.append({
                "attempt":  attempt,
                "compiled": success,
                "output":   output[:1000],
                "errors":   output if not success else None,
            })

            if success:
                compile_success = True
                break

        # Optionally save the final contract
        saved_path = None
        if save and current_source and compile_success:
            saved_path = os.path.join(CONTRACTS_DIR, f"{contract_name}.sol")
            Path(saved_path).write_text(current_source, encoding="utf-8")

        return {
            "agent":           self.name,
            "contract_name":   contract_name,
            "description":     description,
            "compile_success": compile_success,
            "attempts":        attempts,
            "source":          current_source,
            "saved_to":        saved_path,
            "history":         history,
        }

    async def stream(
        self,
        description: str,
        contract_name: str = "GeneratedContract",
        save: bool = False,
    ) -> AsyncIterator[str]:
        contract_name = re.sub(r"[^a-zA-Z0-9_]", "", contract_name) or "GeneratedContract"

        import json
        yield f'data: {json.dumps({"token": f"⚙️ Generating {contract_name}...\\n"})}\n\n'

        prompt = f"""Write a complete Solidity smart contract for:
"{description}"
Contract name: {contract_name}"""

        collected = ""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            collected += chunk
            yield chunk

        # Try compile after streaming
        source = _extract_solidity(collected)
        if source:
            yield f'data: {json.dumps({"token": "\\n\\n🔨 Compiling with Hardhat...\\n"})}\n\n'
            success, output = await asyncio.get_event_loop().run_in_executor(
                None, _run_hardhat_compile, source, contract_name
            )
            if success:
                yield f'data: {json.dumps({"token": "\\n✅ Compiled successfully!\\n"})}\n\n'
            else:
                yield f'data: {json.dumps({"token": f"\\n❌ Compile errors:\\n{output[:500]}\\n"})}\n\n'

        yield 'data: {"done": true}\n\n'
