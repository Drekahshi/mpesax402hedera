"use client";

/**
 * RealisticQR — A 21×21 CSS-only QR code that looks like a real one.
 * It includes the three 7×7 finder patterns ("eyes"), timing stripes,
 * and deterministic data modules seeded from the value string.
 */
export default function RealisticQR({
  value,
  size = 210,
  fg = "#1a1a2e",
  bg = "#ffffff",
  label,
}: {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  label?: string;
}) {
  const N = 21;
  const cell = size / N;

  // Build a 21×21 boolean grid
  const grid: boolean[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => false)
  );

  // ── Finder pattern (7×7 eye) ───────────────────
  const drawFinder = (sr: number, sc: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[sr + r][sc + c] = border || inner;
      }
    }
  };
  drawFinder(0, 0);       // top-left
  drawFinder(0, N - 7);   // top-right
  drawFinder(N - 7, 0);   // bottom-left

  // ── Separator (white quiet zone around finders — force off) ──
  const clearSep = (sr: number, sc: number, h: number, w: number) => {
    for (let r = sr; r < sr + h && r < N; r++)
      for (let c = sc; c < sc + w && c < N; c++)
        grid[r][c] = false;
  };
  // horizontal bars
  clearSep(7, 0, 1, 8);
  clearSep(7, N - 8, 1, 8);
  clearSep(N - 8, 0, 1, 8);
  // vertical bars
  clearSep(0, 7, 8, 1);
  clearSep(0, N - 8, 8, 1);
  clearSep(N - 8, 7, 8, 1);

  // Re-draw finders (separators may have clipped them)
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  // ── Timing patterns (row 6 and col 6, alternating) ──
  for (let i = 8; i < N - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // ── Alignment pattern (small 5×5 at row=14, col=14) ──
  const drawAlign = (cr: number, cc: number) => {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const rr = cr + r, cc2 = cc + c;
        if (rr >= 0 && rr < N && cc2 >= 0 && cc2 < N) {
          const border = Math.abs(r) === 2 || Math.abs(c) === 2;
          const center = r === 0 && c === 0;
          grid[rr][cc2] = border || center;
        }
      }
    }
  };
  drawAlign(14, 14);

  // ── Dark module ──
  grid[N - 8][8] = true;

  // ── Format / version info strips (just add a few dark modules) ──
  grid[8][0] = true; grid[8][1] = true; grid[8][2] = false; grid[8][3] = true;
  grid[8][4] = true; grid[8][5] = false;

  // ── Deterministic data fill (seed from value string) ──
  let seed = 0;
  for (let i = 0; i < value.length; i++) {
    seed = ((seed << 5) - seed + value.charCodeAt(i)) | 0;
  }
  const rng = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  // Fill the "data area" — skip finder, timing, alignment zones
  const isReserved = (r: number, c: number) => {
    // Top-left finder + separator
    if (r < 9 && c < 9) return true;
    // Top-right finder + separator
    if (r < 9 && c >= N - 8) return true;
    // Bottom-left finder + separator
    if (r >= N - 9 && c < 9) return true;
    // Timing rows/cols
    if (r === 6 || c === 6) return true;
    // Alignment pattern
    if (r >= 12 && r <= 16 && c >= 12 && c <= 16) return true;
    return false;
  };

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!isReserved(r, c)) {
        grid[r][c] = rng(3) !== 0; // ~66% fill for realistic density
      }
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: size + 16,
          height: size + 16,
          padding: 8,
          background: bg,
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: `repeat(${N}, ${cell}px)`,
          gridTemplateRows: `repeat(${N}, ${cell}px)`,
        }}
      >
        {grid.flat().map((on, i) => (
          <div
            key={i}
            style={{
              width: cell,
              height: cell,
              background: on ? fg : bg,
              borderRadius: cell > 6 ? 1.5 : 0.5,
            }}
          />
        ))}
      </div>
      {label && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
