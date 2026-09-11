"use client";

/**
 * /policy now redirects to the unified KAI Playground
 * with the Build Policy section pre-selected.
 * All policy creation, listing, and management lives in /nuvari.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PolicyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/nuvari");
  }, [router]);

  return (
    <main style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100dvh", background: "#0a0a0c", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontSize: 32 }}></div>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>
        Redirecting to KAI Playground…
      </p>
    </main>
  );
}
