"use client";
import { useEffect, useRef } from "react";

type V3 = [number, number, number];
const TAU = Math.PI * 2;

function heart(n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.random() * TAU;
    const shell = Math.random() < 0.6 ? 1 : Math.cbrt(Math.random());
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const depth = 7 * Math.sqrt(Math.max(0, 1 - (Math.abs(x) / 17) ** 2)) * (0.45 + 0.55 * ((y + 17) / 30));
    out.push([(x * shell) / 15, ((y + 2.5) * shell) / 15, ((Math.random() * 2 - 1) * depth * shell) / 15]);
  }
  return out;
}
function sphere(n: number): V3[] {
  const out: V3[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(g * i) * r * 1.05, y * 1.05, Math.sin(g * i) * r * 1.05]);
  }
  return out;
}
/** Four satellite clusters around a shared core: the four connected fronts. */
function clusters(n: number): V3[] {
  const centers: V3[] = [
    [-1.15, 0.62, 0.2],
    [1.15, 0.62, -0.2],
    [-1.15, -0.62, -0.2],
    [1.15, -0.62, 0.2],
  ];
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % 5;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const s = Math.sqrt(1 - u * u);
    if (k === 4) {
      // bridges travelling from each cluster to the core
      const c = centers[i % 4];
      const f = Math.random();
      out.push([c[0] * f + (Math.random() - 0.5) * 0.05, c[1] * f + (Math.random() - 0.5) * 0.05, c[2] * f]);
    } else {
      const c = centers[k];
      const r = 0.36 * Math.cbrt(Math.random());
      out.push([c[0] + s * Math.cos(a) * r, c[1] + u * r, c[2] + s * Math.sin(a) * r]);
    }
  }
  return out;
}

function sprite(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.5, color.replace("1)", "0.25)"));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/**
 * Dependency-free interactive 3D particle scene rendered on a 2D canvas.
 * `progress` (0..1) morphs heart -> four linked clusters -> one sphere.
 */
export function NexoScene({ progressRef }: { progressRef: React.RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const small = window.innerWidth < 760;
    const N = small ? 520 : 1100;
    const shapes = [heart(N), clusters(N), sphere(N)];
    const pos = shapes[0].map((p) => [...p] as V3);
    const seed = Array.from({ length: N }, () => Math.random());
    const sprites = [sprite("rgba(255,30,138,1)"), sprite("rgba(255,140,200,1)"), sprite("rgba(170,110,255,1)")];
    const nodes = Array.from({ length: small ? 70 : 130 }, (_, i) => Math.floor((i * N) / (small ? 70 : 130)));
    let w = 0, h = 0, dpr = 1, raf = 0, running = true;
    let rotY = -0.35, rotX = -0.12, velY = 0.0024, velX = 0, tiltX = 0, tiltY = 0;
    let px = -9999, py = -9999, dragging = false, lastX = 0, lastY = 0;
    const proj = new Float32Array(N * 3);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top;
      tiltY = (px / w - 0.5) * 0.5; tiltX = (py / h - 0.5) * 0.3;
      if (dragging) {
        velY = (e.clientX - lastX) * 0.0045; velX = (e.clientY - lastY) * 0.003;
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const up = () => { dragging = false; };
    const leave = () => { px = py = -9999; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    document.addEventListener("pointerleave", leave);
    const io = new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running) loop(); });
    io.observe(canvas);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    function loop() {
      cancelAnimationFrame(raf);
      if (!running) return;
      t += 0.016;
      const p = Math.min(0.9999, Math.max(0, progressRef.current ?? 0)) * (shapes.length - 1);
      const a = Math.floor(p), f = p - a;
      const e = f * f * (3 - 2 * f);
      rotY += velY; rotX += velX;
      velY += (0.0024 - velY) * 0.03; velX *= 0.94; rotX += (-0.12 - rotX) * 0.03;
      const ry = rotY + tiltY, rx = rotX + tiltX;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const scale = Math.min(w, h) * (small ? 0.36 : 0.33);
      const beat = 1 + (a === 0 ? (1 - e) : 0) * 0.045 * Math.max(0, Math.sin(t * 4.2)) ** 6;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const A = shapes[a], B = shapes[a + 1];
      for (let i = 0; i < N; i++) {
        const q = pos[i];
        const wob = 0.018 * Math.sin(t * 1.3 + seed[i] * 40);
        const tx = (A[i][0] + (B[i][0] - A[i][0]) * e) * beat + wob;
        const ty = (A[i][1] + (B[i][1] - A[i][1]) * e) * beat + wob;
        const tz = (A[i][2] + (B[i][2] - A[i][2]) * e) * beat;
        q[0] += (tx - q[0]) * 0.09; q[1] += (ty - q[1]) * 0.09; q[2] += (tz - q[2]) * 0.09;
        const x1 = q[0] * cy + q[2] * sy, z1 = -q[0] * sy + q[2] * cy;
        const y1 = q[1] * cx - z1 * sx, z2 = q[1] * sx + z1 * cx;
        const k = 3.2 / (3.2 + z2);
        let X = w / 2 + x1 * scale * k, Y = h / 2 - y1 * scale * k;
        const dx = X - px, dy = Y - py, d2 = dx * dx + dy * dy;
        if (d2 < 14000) { const push = (1 - d2 / 14000) * 26; const d = Math.sqrt(d2) || 1; X += (dx / d) * push; Y += (dy / d) * push; }
        proj[i * 3] = X; proj[i * 3 + 1] = Y; proj[i * 3 + 2] = k;
        const size = (seed[i] * 5 + 4) * k * k * (small ? 0.9 : 1.15);
        ctx.globalAlpha = Math.min(1, 0.25 + (k - 0.75) * 1.6) * (0.55 + 0.45 * Math.sin(t * 2 + seed[i] * 30));
        ctx.drawImage(sprites[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0], X - size, Y - size, size * 2, size * 2);
      }
      ctx.lineWidth = 0.6;
      const lim = small ? 52 : 74, lim2 = lim * lim;
      for (let i = 0; i < nodes.length; i++) {
        const ia = nodes[i] * 3;
        for (let j = i + 1; j < nodes.length; j++) {
          const ib = nodes[j] * 3;
          const dx = proj[ia] - proj[ib], dy = proj[ia + 1] - proj[ib + 1];
          const d2 = dx * dx + dy * dy;
          if (d2 < lim2) {
            ctx.globalAlpha = (1 - d2 / lim2) * 0.34;
            ctx.strokeStyle = "#ff5aa9";
            ctx.beginPath(); ctx.moveTo(proj[ia], proj[ia + 1]); ctx.lineTo(proj[ib], proj[ib + 1]); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(loop);
    }
    loop();
    return () => {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      document.removeEventListener("pointerleave", leave);
    };
  }, [progressRef]);
  return <canvas ref={ref} className="nexo-scene" aria-hidden="true" />;
}
