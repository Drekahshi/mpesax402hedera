"use client";

import React, { useEffect, useRef } from "react";
import type { StakePosition } from "./PoolDrawer";

export interface PoolToken {
  id: string;
  symbol: string;
  name: string;
  apy: number;
  tvl: number;
  poolType: "Daily Flex" | "Monthly Lock" | "x402 Sweep" | "RWA Lock";
  colorStart: string;
  colorEnd: string;
}

export const KAI_TOKENS: PoolToken[] = [
  { id: "nvr", symbol: "NVR", name: "Nuvari Governance", apy: 18.5, tvl: 1250000, poolType: "Monthly Lock", colorStart: "#c9a24b", colorEnd: "#1c3d2e" },
  { id: "nuvari-stable", symbol: "NVR-STABLE", name: "Nuvari Stablecoin", apy: 10.2, tvl: 3100000, poolType: "Daily Flex", colorStart: "#0f2e20", colorEnd: "#10b981" },
  { id: "ytoken", symbol: "YToken", name: "Yield Aggregator", apy: 14.8, tvl: 890000, poolType: "Daily Flex", colorStart: "#f59e0b", colorEnd: "#d97706" },
  { id: "ygold", symbol: "YGold", name: "RWA Gold Vault", apy: 12.4, tvl: 2100000, poolType: "RWA Lock", colorStart: "#d4af37", colorEnd: "#996515" },
  { id: "gami", symbol: "GAMI", name: "Community Rewards", apy: 22.0, tvl: 450000, poolType: "Daily Flex", colorStart: "#34d399", colorEnd: "#059669" },
  { id: "nuvari-cents", symbol: "NVR-CENTS", name: "x402 Micro-Unit", apy: 6.5, tvl: 620000, poolType: "x402 Sweep", colorStart: "#e2d1a6", colorEnd: "#8c6d31" },
];

interface BubbleNode extends PoolToken {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export default function CryptoBubblesCanvas({
  onSelectPool,
  stakedPositions = {},
}: {
  onSelectPool: (token: PoolToken) => void;
  stakedPositions?: Record<string, StakePosition>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const height = (canvas.height = 480);

    // Initialize bubble positions
    let nodes: BubbleNode[] = KAI_TOKENS.map((token, i) => {
      const radius = Math.min(130, Math.max(50, Math.sqrt(token.tvl) / 15));
      return {
        ...token,
        x: (i + 1) * (width / 7),
        y: height / 2 + (Math.random() * 40 - 20),
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius,
      };
    });

    let mouseX = -1000;
    let mouseY = -1000;
    let isDragging = false;
    let draggedNode: BubbleNode | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      if (isDragging && draggedNode) {
        if (Math.abs(mouseX - dragStartX) > 5 || Math.abs(mouseY - dragStartY) > 5) {
          dragMoved = true;
        }
        draggedNode.x = mouseX;
        draggedNode.y = mouseY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      dragStartX = x;
      dragStartY = y;
      dragMoved = false;
      
      for (let i = 0; i < nodes.length; i++) {
        const dx = x - nodes[i].x;
        const dy = y - nodes[i].y;
        if (dx * dx + dy * dy <= nodes[i].radius * nodes[i].radius) {
          isDragging = true;
          draggedNode = nodes[i];
          return;
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging && draggedNode) {
        if (!dragMoved) {
          onSelectPool(draggedNode);
        } else {
          draggedNode.vx = (Math.random() - 0.5) * 4;
          draggedNode.vy = (Math.random() - 0.5) * 4;
        }
      }
      isDragging = false;
      draggedNode = null;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", () => {
      isDragging = false;
      draggedNode = null;
    });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Repel physics between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          let minDist = nodes[i].radius + nodes[j].radius + 10;
          
          if (dist < minDist && dist > 0) {
            const angle = Math.atan2(dy, dx);
            const targetX = nodes[i].x + Math.cos(angle) * minDist;
            const targetY = nodes[i].y + Math.sin(angle) * minDist;
            const ax = (targetX - nodes[j].x) * 0.05;
            const ay = (targetY - nodes[j].y) * 0.05;
            
            if (nodes[i] !== draggedNode) {
              nodes[i].vx -= ax;
              nodes[i].vy -= ay;
            }
            if (nodes[j] !== draggedNode) {
              nodes[j].vx += ax;
              nodes[j].vy += ay;
            }
          }
        }
      }

      nodes.forEach((node) => {
        if (node !== draggedNode) {
          node.x += node.vx;
          node.y += node.vy;
          
          node.vx *= 0.99;
          node.vy *= 0.99;
          
          if (Math.abs(node.vx) < 0.2) node.vx += (Math.random() - 0.5) * 0.1;
          if (Math.abs(node.vy) < 0.2) node.vy += (Math.random() - 0.5) * 0.1;
        }

        if (node.x - node.radius < 0) { node.x = node.radius; node.vx *= -0.8; }
        if (node.x + node.radius > width) { node.x = width - node.radius; node.vx *= -0.8; }
        if (node.y - node.radius < 0) { node.y = node.radius; node.vy *= -0.8; }
        if (node.y + node.radius > height) { node.y = height - node.radius; node.vy *= -0.8; }

        // Staked ring glow
        const isStaked = !!stakedPositions[node.id];
        if (isStaked) {
          const ringRadius = node.radius + 6 + Math.sin(Date.now() / 600) * 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(52, 211, 153, 0.7)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const gradient = ctx.createLinearGradient(
          node.x - node.radius,
          node.y - node.radius,
          node.x + node.radius,
          node.y + node.radius
        );
        gradient.addColorStop(0, node.colorStart);
        gradient.addColorStop(1, node.colorEnd);

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.stroke();

        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy <= node.radius * node.radius) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
          ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        
        ctx.font = "bold 16px Inter, sans-serif";
        ctx.fillText(node.symbol, node.x, node.y - 12);

        ctx.font = "bold 14px Inter, sans-serif";
        ctx.fillStyle = "#34d399";
        ctx.fillText(`+${node.apy.toFixed(1)}% APY`, node.x, node.y + 10);

        ctx.font = "10px Inter, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillText(node.poolType, node.x, node.y + 26);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onSelectPool]);

  return (
    <div className="w-full bg-[#0a1811] border border-[#1c3d2e] rounded-2xl p-4 shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 px-2">
        <div>
          <h2 className="text-xl font-bold text-[#faf7f0]">KAI Nuvari Token Pools</h2>
          <p className="text-xs text-[#c9a24b]">Interactive AMM Yield & Liquidity Canvas (Click a bubble to open pool)</p>
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-[#1c3d2e] text-[#34d399] px-3 py-1 rounded-full font-mono border border-[#34d399]/30">
            6 Core Tokens Active
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-[480px] cursor-pointer rounded-xl" />
    </div>
  );
}
