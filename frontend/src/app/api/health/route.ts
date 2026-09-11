import { NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/models';
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000';

export async function GET() {
  const status = {
    ragServer: 'offline',
    groqServer: 'offline',
    modelLoaded: false,
    modelName: GROQ_MODEL,
    details: ''
  };

  // 1. Check Python FastAPI RAG Server Health
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const ragRes = await fetch(`${RAG_API_URL}/health`, { 
      signal: controller.signal,
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);

    if (ragRes.ok) {
      const data = await ragRes.json();
      status.ragServer = 'online';
      if (data.model) {
        status.modelName = data.model;
      }
    } else {
      status.details += `FastAPI health returned status ${ragRes.status}. `;
    }
  } catch (e: any) {
    status.details += `FastAPI offline: ${e.message || e}. `;
  }

  // 2. Check Groq API Health
  if (GROQ_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const groqRes = await fetch(GROQ_URL, { 
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
      });

      clearTimeout(timeoutId);

      if (groqRes.ok) {
        status.groqServer = 'online';
        status.modelLoaded = true;
      } else {
        status.details += `Groq API returned status ${groqRes.status}. `;
      }
    } catch (e: any) {
      status.details += `Groq offline: ${e.message || e}. `;
    }
  } else {
    status.details += 'GROQ_API_KEY not set. ';
  }

  return NextResponse.json(status);
}
