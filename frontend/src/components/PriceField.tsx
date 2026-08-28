"use client";

import { useEffect, useRef } from "react";
import { useProtocol } from "@/hooks/useProtocol";

/**
 * A price-reactive particle field behind the whole app.
 *
 * It samples the live LSD price and leans on it: above a dollar the field runs
 * warmer, faster and drifts upward (expansion); below, it cools, slows and
 * settles (contraction). Colours are read from the same CSS accent variables
 * everything else uses, so it follows the Sherwood palette too.
 *
 * Deliberately quiet (low opacity, screen blend) so it sits under the
 * existing gradient rather than fighting it. It pauses when the tab is hidden
 * and renders a single static frame under prefers-reduced-motion.
 */

const ONE = BigInt(10) ** BigInt(18);

type P = { x: number; y: number; vx: number; vy: number; r: number; t: number };

function readAccents(): [string, string] {
  const s = getComputedStyle(document.documentElement);
  const warm = s.getPropertyValue("--color-ember").trim() || "#e3b341";
  const cool = s.getPropertyValue("--color-leaf").trim() || "#57b06c";
  return [warm, cool];
}

export function PriceField() {
  const { price } = useProtocol();
  const priceRef = useRef(1);

  useEffect(() => {
    priceRef.current = price !== undefined ? Number(price) / Number(ONE) : 1;
  }, [price]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let particles: P[] = [];
    let raf = 0;
    let accents = readAccents();
    let accentTick = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.round((w * h) / 22000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 40 + Math.random() * 90,
        t: Math.random(),
      }));
    }

    function mix(a: string, b: string, k: number): string {
      // a,b are hex #rrggbb; k in [0,1]
      const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
      const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
      const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }

    function frame() {
      const p = priceRef.current;
      const dev = Math.max(-1, Math.min(1, (p - 1) / 0.1)); // -1 (deep under) .. +1 (well over)
      const speed = 0.5 + (dev + 1) * 0.5; // 0.5 .. 1.5
      const lift = -dev * 0.18; // above peg: drift up; below: down
      // warm when over the peg, cool when under
      const warmth = (dev + 1) / 2;

      if (accentTick++ % 120 === 0) accents = readAccents();
      const color = mix(accents[1], accents[0], warmth);

      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "screen";

      for (const q of particles) {
        q.x += q.vx * speed;
        q.y += q.vy * speed + lift;
        q.t += 0.005 * speed;
        if (q.x < -q.r) q.x = w + q.r;
        if (q.x > w + q.r) q.x = -q.r;
        if (q.y < -q.r) q.y = h + q.r;
        if (q.y > h + q.r) q.y = -q.r;

        const pulse = 0.5 + 0.5 * Math.sin(q.t * Math.PI * 2);
        const alpha = 0.05 + pulse * 0.07;
        const g = ctx!.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
        g.addColorStop(0, color.replace("rgb", "rgba").replace(")", `, ${alpha.toFixed(3)})`));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (raf) return;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else if (!reduce) start();
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) {
      frame(); // one static frame
      stop();
    } else {
      start();
    }

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[1] opacity-70"
    />
  );
}
