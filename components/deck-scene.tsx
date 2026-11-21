"use client";
import { useEffect, useRef } from "react";

type V3 = [number, number, number];
const TAU = Math.PI * 2;
const rnd = (a = 1) => (Math.random() * 2 - 1) * a;

function heart(n: number): V3[] {
  return Array.from({ length: n }, () => {
    const t = Math.random() * TAU;
    const s = Math.random() < 0.6 ? 1 : Math.cbrt(Math.random());
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const d = 7 * Math.sqrt(Math.max(0, 1 - (Math.abs(x) / 17) ** 2)) * (0.45 + 0.55 * ((y + 17) / 30));
    return [(x * s) / 15, ((y + 2.5) * s) / 15, (rnd(d) * s) / 15] as V3;
  });
}
/** Scattered fragments: the same person living in four disconnected places. */
function chaos(n: number): V3[] {
  const c: V3[] = [[-1.2, 0.7, 0.3], [1.1, 0.8, -0.4], [-0.9, -0.8, -0.3], [1.2, -0.6, 0.4]];
  return Array.from({ length: n }, (_, i) => {
    if (i % 3 === 0) return [rnd(1.9), rnd(1.2), rnd(1.2)] as V3;
    const k = c[i % 4];
    // each fragment is a small flat sheet
    return [k[0] + rnd(0.34), k[1] + rnd(0.22), k[2] + rnd(0.02)] as V3;
  });
}
function helix(n: number): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const f = i / n, a = f * TAU * 3.2, x = (f - 0.5) * 2.5;
    const m = i % 5;
    if (m === 4) {
      const u = Math.random() * 2 - 1;
      return [x, Math.cos(a) * 0.55 * u, Math.sin(a) * 0.55 * u] as V3;
    }
    const s = m < 2 ? 1 : -1;
    return [x + rnd(0.02), Math.cos(a) * 0.55 * s + rnd(0.03), Math.sin(a) * 0.55 * s + rnd(0.03)] as V3;
  });
}
function phone(n: number): V3[] {
  const W = 0.62, H = 1.25, R = 0.16;
  return Array.from({ length: n }, (_, i) => {
    const m = i % 10;
    if (m < 4) {
      // rounded outline, front and back faces
      const t = Math.random() * TAU, cx = Math.sign(Math.cos(t)) * (W - R), cy = Math.sign(Math.sin(t)) * (H - R);
      const per = Math.random();
      let x: number, y: number;
      if (per < 0.3) { x = rnd(W - R); y = Math.sign(rnd()) * H; }
      else if (per < 0.8) { x = Math.sign(rnd()) * W; y = rnd(H - R); }
      else { x = cx + Math.cos(t) * R; y = cy + Math.sin(t) * R; }
      return [x, y, m < 2 ? 0.06 : -0.06] as V3;
    }
    if (m < 8) {
      // screen rows: a form being filled in
      const row = Math.floor(Math.random() * 7);
      const len = [0.9, 0.6, 0.8, 0.45, 0.85, 0.55, 0.7][row];
      return [-W * 0.78 + Math.random() * W * 1.56 * len, H * 0.72 - row * 0.3 + rnd(0.02), 0.07] as V3;
    }
    // signal waves leaving the device
    const a = Math.random() * 1.2 - 0.6, r = 0.95 + Math.floor(Math.random() * 3) * 0.28;
    return [Math.sin(a) * r * 0.9 + 0.2, H * 0.2 + Math.cos(a) * r * 0.6, rnd(0.25)] as V3;
  });
}
function clusters(n: number): V3[] {
  const c: V3[] = [[-1.15, 0.62, 0.2], [1.15, 0.62, -0.2], [-1.15, -0.62, -0.2], [1.15, -0.62, 0.2]];
  return Array.from({ length: n }, (_, i) => {
    const k = i % 6, u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u);
    if (k === 4) { const p = c[i % 4], f = Math.random(); return [p[0] * f + rnd(0.02), p[1] * f + rnd(0.02), p[2] * f] as V3; }
    if (k === 5) { const r = 0.3 * Math.cbrt(Math.random()); return [s * Math.cos(a) * r, u * r, s * Math.sin(a) * r] as V3; }
    const p = c[k], r = 0.34 * Math.cbrt(Math.random());
    return [p[0] + s * Math.cos(a) * r, p[1] + u * r, p[2] + s * Math.sin(a) * r] as V3;
  });
}
function bars(n: number): V3[] {
  const hs = [0.35, 0.55, 0.5, 0.8, 1.05, 1.3, 1.7];
  return Array.from({ length: n }, (_, i) => {
    if (i % 5 === 0) return [rnd(1.5), -0.9, rnd(0.7)] as V3; // floor
    const b = i % 7, x = -1.26 + b * 0.42, hh = hs[b], y = -0.9 + Math.random() * hh;
    const side = Math.floor(Math.random() * 4), o = rnd(0.13);
    const top = Math.random() < 0.18;
    if (top) return [x + rnd(0.13), -0.9 + hh, rnd(0.13)] as V3;
    return (side === 0 ? [x - 0.13, y, o] : side === 1 ? [x + 0.13, y, o] : side === 2 ? [x + o, y, 0.13] : [x + o, y, -0.13]) as V3;
  });
}
function shield(n: number): V3[] {
  const width = (y: number) => (y > 0.15 ? 0.95 : 0.95 * Math.sqrt(Math.max(0, 1 - ((0.15 - y) / 1.35) ** 2)));
  return Array.from({ length: n }, (_, i) => {
    const m = i % 6;
    if (m === 5) {
      // keyhole core
      const a = Math.random() * TAU, r = Math.random() < 0.6 ? 0.2 : 0.2 * Math.sqrt(Math.random());
      if (Math.random() < 0.35) return [rnd(0.07), -0.1 - Math.random() * 0.42, 0.34] as V3;
      return [Math.cos(a) * r, 0.22 + Math.sin(a) * r, 0.34] as V3;
    }
    const y = 1.0 - Math.random() * 2.2, w = width(y);
    const edge = m < 3;
    const x = edge ? Math.sign(rnd()) * w : rnd(w);
    const yy = edge && Math.random() < 0.25 ? 1.0 : y;
    const xx = yy === 1.0 ? rnd(0.95) : x;
    const z = 0.3 * (1 - (xx / 1) ** 2) * (m % 2 ? 1 : -0.25);
    return [xx, yy, z] as V3;
  });
}
function globe(n: number): V3[] {
  const g = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    if (i % 4 === 0) {
      // orbital rings: more sites joining the same core
      const a = Math.random() * TAU, ring = i % 3, r = 1.25 + ring * 0.22, tilt = [0.5, -0.7, 1.2][ring];
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return [x, z * Math.sin(tilt), z * Math.cos(tilt)] as V3;
    }
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y);
    return [Math.cos(g * i) * r * 0.92, y * 0.92, Math.sin(g * i) * r * 0.92] as V3;
  });
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

export const SHAPES = ["heart", "chaos", "helix", "phone", "clusters", "bars", "shield", "globe"] as const;
export type Shape = (typeof SHAPES)[number];
export type SceneState = { shape: Shape; side: number; burst: number };

/** Dependency-free 3D particle stage: morphs between one model per slide. */
export function DeckScene({ state }: { state: React.RefObject<SceneState> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const small = window.innerWidth < 760;
    const N = small ? 620 : 1500;
    const make = { heart, chaos, helix, phone, clusters, bars, shield, globe };
    const shapes = Object.fromEntries(SHAPES.map((s) => [s, make[s](N)])) as Record<Shape, V3[]>;
    const pos = shapes.heart.map(() => [rnd(3), rnd(3), rnd(3)] as V3);
    const seed = Array.from({ length: N }, () => Math.random());
    const dir = Array.from({ length: N }, () => [rnd(), rnd(), rnd()] as V3);
    const main = [sprite("rgba(255,30,138,1)"), sprite("rgba(255,150,205,1)"), sprite("rgba(160,110,255,1)")];
    const red = sprite("rgba(255,40,70,1)"), cyan = sprite("rgba(40,230,255,1)");
    const nodeN = small ? 60 : 120;
    const nodes = Array.from({ length: nodeN }, (_, i) => Math.floor((i * N) / nodeN));
    const stars = Array.from({ length: small ? 60 : 140 }, () => [Math.random(), Math.random(), Math.random()]);
    const proj = new Float32Array(N * 2);
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0;
    let spin = 0, velY = 0, tiltX = 0, tiltY = 0, px = -9999, py = -9999, cxp = 0.5, dragging = false, lastX = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const move = (e: PointerEvent) => {
      px = e.clientX; py = e.clientY;
      tiltY = (px / w - 0.5) * 0.7; tiltX = (py / h - 0.5) * 0.4;
      if (dragging) { velY = (e.clientX - lastX) * 0.005; lastX = e.clientX; }
    };
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; };
    const up = () => { dragging = false; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let sTiltX = 0, sTiltY = 0;
    function loop() {
      t += 0.016;
      const st = state.current!;
      const B = shapes[st.shape];
      const burst = still ? 0 : st.burst;
      const flat = small || w < 900;
      cxp += ((flat ? 0.5 : st.side) - cxp) * 0.06;
      if (!still) { spin += velY + burst * 0.06; velY *= 0.95; spin *= 0.985; }
      const rotY = Math.sin(t * 0.32) * 0.42 + spin; 
      sTiltX += (tiltX - sTiltX) * 0.06; sTiltY += (tiltY - sTiltY) * 0.06;
      const ry = rotY + sTiltY, rx = -0.1 + sTiltX;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const breathe = 1 + 0.035 * Math.sin(t * 1.25);
      const scale = Math.min(w, h) * (flat ? 0.3 : 0.27) * breathe * (1 + burst * 0.5);
      const ox = w * cxp, oy = h * (flat ? 0.3 : 0.5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      // depth field of drifting stars, streaking during transitions
      for (const s of stars) {
        s[2] -= 0.0012 + burst * 0.03; if (s[2] <= 0.02) { s[0] = Math.random(); s[1] = Math.random(); s[2] = 1; }
        const k = 1 / s[2], X = w / 2 + (s[0] - 0.5) * w * 0.5 * k - sTiltY * 60 * k, Y = h / 2 + (s[1] - 0.5) * h * 0.5 * k - sTiltX * 60 * k;
        ctx.globalAlpha = Math.min(0.5, (1 - s[2]) * 0.6);
        ctx.fillStyle = "#ffb3da";
        ctx.fillRect(X, Y, 1.2 + burst * 26 * k * 0.2, 1.2);
      }
      const ease = still ? 1 : 0.07 + burst * 0.05;
      const split = burst * 16;
      for (let i = 0; i < N; i++) {
        const q = pos[i], b = B[i], d = dir[i];
        const wob = 0.02 * Math.sin(t * 1.3 + seed[i] * 40);
        const ex = burst * burst * 2.2;
        q[0] += (b[0] + wob + d[0] * ex - q[0]) * ease;
        q[1] += (b[1] + wob + d[1] * ex - q[1]) * ease;
        q[2] += (b[2] + d[2] * ex - q[2]) * ease;
        const x1 = q[0] * cy + q[2] * sy, z1 = -q[0] * sy + q[2] * cy;
        const y1 = q[1] * cx - z1 * sx, z2 = q[1] * sx + z1 * cx;
        const k = 3.4 / (3.4 + z2);
        let X = ox + x1 * scale * k, Y = oy - y1 * scale * k;
        const dx = X - px, dy = Y - py, d2 = dx * dx + dy * dy;
        if (d2 < 16000) { const push = (1 - d2 / 16000) * 30, dd = Math.sqrt(d2) || 1; X += (dx / dd) * push; Y += (dy / dd) * push; }
        proj[i * 2] = X; proj[i * 2 + 1] = Y;
        const size = (seed[i] * 5 + 3.5) * k * k * (small ? 0.85 : 1.1);
        const a = Math.min(1, 0.25 + (k - 0.75) * 1.6) * (0.55 + 0.45 * Math.sin(t * 2 + seed[i] * 30)) * (flat ? 0.55 : 1);
        if (split > 0.4 && i % 2 === 0) {
          // chromatic aberration: channels drift apart while the camera cuts
          ctx.globalAlpha = a * 0.8;
          ctx.drawImage(red, X - size + split * k, Y - size, size * 2, size * 2);
          ctx.drawImage(cyan, X - size - split * k, Y - size, size * 2, size * 2);
        }
        ctx.globalAlpha = a;
        ctx.drawImage(main[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0], X - size, Y - size, size * 2, size * 2);
      }
      ctx.lineWidth = 0.6; ctx.strokeStyle = "#ff5aa9";
      const lim2 = (small ? 46 : 70) ** 2;
      for (let i = 0; i < nodes.length; i++) {
        const ia = nodes[i] * 2;
        for (let j = i + 1; j < nodes.length; j++) {
          const ib = nodes[j] * 2, dx = proj[ia] - proj[ib], dy = proj[ia + 1] - proj[ib + 1], d2 = dx * dx + dy * dy;
          if (d2 < lim2) {
            ctx.globalAlpha = (1 - d2 / lim2) * 0.3 * (flat ? 0.5 : 1);
            ctx.beginPath(); ctx.moveTo(proj[ia], proj[ia + 1]); ctx.lineTo(proj[ib], proj[ib + 1]); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up);
    };
  }, [state]);
  return <canvas ref={ref} className="pz-scene" aria-hidden="true" />;
}
