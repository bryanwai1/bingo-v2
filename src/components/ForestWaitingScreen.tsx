import { useEffect, useRef, useState } from 'react';

/**
 * ForestWaitingScreen
 *
 * Full-bleed animated forest that cycles dawn -> midnight -> dawn on a seamless
 * loop. One 300KB master image plus three small sprites; every lighting change,
 * star, firefly, mist band and falling leaf is drawn on canvas, so there is no
 * frame sequence to preload and no visible crossfade seam.
 *
 * Replaces the 20-frame pixel-forest crossfade.
 *
 * Assets go in: public/forest/
 *   forest-master.webp  birds.webp  deer.webp  butterflies.webp
 *
 * Renders as an absolute background layer, the same shape as DayNightForest.
 * The parent must be `relative` and have a real height; page copy sits above
 * it with `relative z-10`.
 *
 * Usage:
 *   <div className="relative overflow-hidden" style={{ minHeight: '100dvh' }}>
 *     <ForestWaitingScreen />
 *     <div className="relative z-10">…</div>
 *   </div>
 */

const CYCLE_MS = 120_000; // 2 minutes for a waiting room; 50_000 is the punchier demo pace
const MAX_DPR = 1.5;
const FPS = 30;
const ASSET_BASE = '/forest';

type Stop = {
  at: number;
  name: string;
  overlay: [number, number, number, number];
  bright: number;
  sat: number;
  hue: number;
  stars: number;
  fireflies: number;
};

const STOPS: Stop[] = [
  { at: 0.0,  name: 'Early morning', overlay: [68, 90, 116, 0.12],  bright: 0.78, sat: 0.78, hue: -7, stars: 0.12, fireflies: 0.18 },
  { at: 0.1,  name: 'Sunrise',       overlay: [255, 157, 90, 0.12], bright: 0.98, sat: 1.08, hue: -4, stars: 0,    fireflies: 0 },
  { at: 0.26, name: 'Late morning',  overlay: [207, 235, 188, 0.04],bright: 1.1,  sat: 1.03, hue: 1,  stars: 0,    fireflies: 0 },
  { at: 0.42, name: 'Afternoon',     overlay: [255, 232, 163, 0.03],bright: 1.04, sat: 1.08, hue: 3,  stars: 0,    fireflies: 0 },
  { at: 0.56, name: 'Golden hour',   overlay: [255, 117, 49, 0.16], bright: 0.9,  sat: 1.24, hue: -8, stars: 0,    fireflies: 0.04 },
  { at: 0.66, name: 'Twilight',      overlay: [71, 46, 108, 0.34],  bright: 0.64, sat: 0.88, hue: 12, stars: 0.28, fireflies: 0.35 },
  { at: 0.78, name: 'Midnight',      overlay: [7, 18, 58, 0.56],    bright: 0.42, sat: 0.68, hue: 18, stars: 0.92, fireflies: 1 },
  { at: 0.89, name: 'Before dawn',   overlay: [25, 38, 80, 0.44],   bright: 0.52, sat: 0.66, hue: 8,  stars: 0.58, fireflies: 0.62 },
  { at: 1.0,  name: 'Early morning', overlay: [68, 90, 116, 0.12],  bright: 0.78, sat: 0.78, hue: -7, stars: 0.12, fireflies: 0.18 },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const bell = (a: number, peak: number, b: number, x: number) =>
  x <= peak ? smoothstep(a, peak, x) : 1 - smoothstep(peak, b, x);

function sample(t: number) {
  let a = STOPS[0];
  let b = STOPS[1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].at && t <= STOPS[i + 1].at) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const raw = (t - a.at) / (b.at - a.at || 1);
  const p = raw * raw * (3 - 2 * raw);
  return {
    name: raw < 0.5 ? a.name : b.name,
    bright: lerp(a.bright, b.bright, p),
    sat: lerp(a.sat, b.sat, p),
    hue: lerp(a.hue, b.hue, p),
    stars: lerp(a.stars, b.stars, p),
    fireflies: lerp(a.fireflies, b.fireflies, p),
    overlay: a.overlay.map((v, i) => lerp(v, b.overlay[i], p)) as [number, number, number, number],
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

type Props = {
  children?: React.ReactNode;
  /** Full loop duration in ms. Default 120s. */
  cycleMs?: number;
  /** Start the loop partway in, 0–1. Useful to open on golden hour. */
  startAt?: number;
  className?: string;
};

export function ForestWaitingScreen({
  children,
  cycleMs = CYCLE_MS,
  startAt = 0,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let lastFrame = 0;
    let paused = false;
    let startedAt = performance.now() - startAt * cycleMs;
    let pausedAt = 0;
    let disposed = false;
    const images: Record<string, HTMLImageElement> = {};

    const rng = mulberry32(1837);
    const stars = Array.from({ length: 72 }, () => ({
      x: 0.3 + rng() * 0.4,
      y: 0.03 + rng() * 0.38,
      r: 0.45 + rng() * 1.25,
      twinkle: rng() * Math.PI * 2,
    }));
    const fireflies = Array.from({ length: 34 }, () => ({
      x: 0.08 + rng() * 0.84,
      y: 0.48 + rng() * 0.42,
      r: 1.1 + rng() * 1.7,
      phase: rng() * Math.PI * 2,
      drift: 0.5 + rng() * 1.2,
    }));
    const mist = Array.from({ length: 8 }, () => ({
      x: rng(),
      y: 0.43 + rng() * 0.3,
      w: 0.18 + rng() * 0.25,
      phase: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 0.45,
    }));
    const leaves = Array.from({ length: 15 }, () => ({
      x: rng(),
      y: rng(),
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 0.9,
      size: 2 + rng() * 4,
    }));

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width || window.innerWidth;
      H = rect.height || window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawCover(image: HTMLImageElement, zoom: number, dx: number, dy: number) {
      const imageRatio = image.width / image.height;
      const viewRatio = W / H;
      let sw: number;
      let sh: number;
      if (imageRatio > viewRatio) {
        sh = image.height / zoom;
        sw = sh * viewRatio;
      } else {
        sw = image.width / zoom;
        sh = sw / viewRatio;
      }
      const sx = (image.width - sw) / 2 + dx * (image.width - sw) * 0.5;
      const sy = (image.height - sh) / 2 + dy * (image.height - sh) * 0.5;
      ctx!.drawImage(image, sx, sy, sw, sh, 0, 0, W, H);
    }

    function drawLight(t: number, starLevel: number) {
      const day = bell(-0.02, 0.32, 0.69, t);
      if (day > 0.01) {
        const x = W * lerp(0.34, 0.68, smoothstep(0.03, 0.64, t));
        const y = H * (0.34 - Math.sin(smoothstep(0.02, 0.66, t) * Math.PI) * 0.22);
        const glow = ctx!.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.34);
        glow.addColorStop(0, `rgba(255,238,177,${0.22 * day})`);
        glow.addColorStop(0.22, `rgba(255,193,104,${0.09 * day})`);
        glow.addColorStop(1, 'rgba(255,170,80,0)');
        ctx!.globalCompositeOperation = 'screen';
        ctx!.fillStyle = glow;
        ctx!.fillRect(0, 0, W, H);
      }
      if (starLevel > 0.03) {
        const moonP = Math.max(0, Math.min(1, (t - 0.64) / 0.36));
        const x = W * lerp(0.72, 0.4, moonP);
        const y = H * (0.17 - Math.sin(moonP * Math.PI) * 0.08);
        const r = Math.max(9, Math.min(W, H) * 0.018);
        const halo = ctx!.createRadialGradient(x, y, r * 0.2, x, y, r * 8);
        halo.addColorStop(0, `rgba(225,237,255,${0.36 * starLevel})`);
        halo.addColorStop(1, 'rgba(180,210,255,0)');
        ctx!.fillStyle = halo;
        ctx!.fillRect(x - r * 8, y - r * 8, r * 16, r * 16);
        ctx!.fillStyle = `rgba(234,241,255,${0.78 * starLevel})`;
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';
    }

    function drawStars(level: number, elapsed: number) {
      if (level < 0.02) return;
      ctx!.save();
      ctx!.globalCompositeOperation = 'screen';
      for (const s of stars) {
        ctx!.globalAlpha = level * (0.52 + 0.48 * Math.sin(elapsed * 0.0017 + s.twinkle));
        ctx!.fillStyle = '#e8f2ff';
        ctx!.beginPath();
        ctx!.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    function drawMist(t: number, elapsed: number) {
      const strength =
        0.08 + 0.12 * Math.max(bell(0.82, 0.96, 1.08, t), bell(-0.08, 0.02, 0.16, t));
      ctx!.save();
      ctx!.globalCompositeOperation = 'screen';
      for (const c of mist) {
        const x = (((c.x + elapsed * 0.000004 * c.speed) % 1.3) - 0.15) * W;
        const y = (c.y + Math.sin(elapsed * 0.00025 + c.phase) * 0.018) * H;
        const w = c.w * W;
        const g = ctx!.createRadialGradient(x, y, 0, x, y, w);
        g.addColorStop(0, `rgba(205,226,217,${strength})`);
        g.addColorStop(1, 'rgba(205,226,217,0)');
        ctx!.fillStyle = g;
        ctx!.save();
        ctx!.scale(1, 0.22);
        ctx!.fillRect(x - w, y * 4.55 - w, w * 2, w * 2);
        ctx!.restore();
      }
      ctx!.restore();
    }

    function drawFireflies(level: number, elapsed: number) {
      if (level < 0.02) return;
      ctx!.save();
      ctx!.globalCompositeOperation = 'screen';
      for (const f of fireflies) {
        const pulse = Math.pow(Math.max(0, Math.sin(elapsed * 0.0022 * f.drift + f.phase)), 3);
        const x = (f.x + Math.sin(elapsed * 0.00018 + f.phase) * 0.025) * W;
        const y = (f.y + Math.cos(elapsed * 0.00023 * f.drift + f.phase) * 0.022) * H;
        const glow = ctx!.createRadialGradient(x, y, 0, x, y, f.r * 5);
        glow.addColorStop(0, `rgba(255,244,133,${level * pulse})`);
        glow.addColorStop(1, 'rgba(221,255,97,0)');
        ctx!.fillStyle = glow;
        ctx!.fillRect(x - f.r * 5, y - f.r * 5, f.r * 10, f.r * 10);
      }
      ctx!.restore();
    }

    function drawLeaves(t: number, elapsed: number) {
      const visible = 1 - smoothstep(0.62, 0.72, t);
      if (visible < 0.02) return;
      ctx!.save();
      for (const leaf of leaves) {
        const x = (((leaf.x + elapsed * 0.000006 * leaf.speed) % 1.18) - 0.09) * W;
        const y = (((leaf.y + elapsed * 0.000012 * leaf.speed) % 1.25) - 0.12) * H;
        ctx!.translate(x, y);
        ctx!.rotate(elapsed * 0.001 * leaf.speed + leaf.phase);
        ctx!.globalAlpha = 0.16 * visible;
        ctx!.fillStyle = t > 0.48 ? '#d88a3f' : '#9fca62';
        ctx!.beginPath();
        ctx!.ellipse(0, 0, leaf.size * 1.7, leaf.size * 0.55, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx!.restore();
    }

    function drawSprite(
      image: HTMLImageElement | undefined,
      x: number,
      y: number,
      w: number,
      alpha: number,
      bob = 0,
      flip = false,
    ) {
      if (!image || alpha <= 0.01) return;
      const h = (w * image.height) / image.width;
      ctx!.save();
      ctx!.globalAlpha = Math.min(1, alpha);
      ctx!.translate(x, y + bob);
      if (flip) ctx!.scale(-1, 1);
      ctx!.drawImage(image, -w / 2, -h / 2, w, h);
      ctx!.restore();
    }

    function drawAnimals(t: number, elapsed: number) {
      const birdsP = smoothstep(0.07, 0.31, t);
      drawSprite(
        images.birds,
        lerp(-0.1, 1.06, birdsP) * W,
        H * (0.23 - 0.06 * Math.sin(birdsP * Math.PI)),
        Math.min(W * 0.14, 210),
        bell(0.08, 0.16, 0.3, t) * 0.75,
        Math.sin(elapsed * 0.009) * 2,
      );
      drawSprite(
        images.butterflies,
        W * (0.29 + Math.sin(elapsed * 0.0007) * 0.035),
        H * (0.69 + Math.sin(elapsed * 0.0013) * 0.03),
        Math.min(W * 0.065, 92),
        bell(0.3, 0.4, 0.52, t) * 0.78,
        Math.sin(elapsed * 0.005) * 3,
      );
      drawSprite(
        images.deer,
        W * 0.56,
        H * 0.6,
        Math.min(W * 0.055, 82),
        bell(0.53, 0.61, 0.7, t) * 0.64,
        Math.sin(elapsed * 0.0012) * 1.5,
        true,
      );
    }

    function drawVignette(t: number) {
      const g = ctx!.createRadialGradient(
        W * 0.5, H * 0.46, Math.min(W, H) * 0.15,
        W * 0.5, H * 0.5, Math.max(W, H) * 0.72,
      );
      g.addColorStop(0.3, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,9,7,${t > 0.65 ? 0.5 : 0.3})`);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, W, H);
    }

    function render(t: number, elapsed: number) {
      const state = sample(t);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      ctx!.filter = `brightness(${state.bright}) saturate(${state.sat}) hue-rotate(${state.hue}deg) contrast(1.06)`;
      drawCover(
        images.forest,
        reduced ? 1.015 : 1.035,
        reduced ? 0 : Math.sin(t * Math.PI * 2) * 0.22,
        reduced ? 0 : Math.cos(t * Math.PI * 2) * 0.12,
      );
      ctx!.filter = 'none';

      const [r, g, b, a] = state.overlay;
      ctx!.globalCompositeOperation = t > 0.62 ? 'multiply' : 'soft-light';
      ctx!.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx!.fillRect(0, 0, W, H);
      ctx!.globalCompositeOperation = 'source-over';

      drawStars(state.stars, elapsed);
      drawLight(t, state.stars);
      drawMist(t, elapsed);
      if (!reduced) {
        drawAnimals(t, elapsed);
        drawLeaves(t, elapsed);
        drawFireflies(state.fireflies, elapsed);
      }
      drawVignette(t);
    }

    function progress(now: number) {
      const point = paused ? pausedAt : now;
      return ((((point - startedAt) % cycleMs) + cycleMs) % cycleMs) / cycleMs;
    }

    function frame(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / FPS) return;
      lastFrame = now;
      render(progress(now), now);
    }

    function onVisibility() {
      const now = performance.now();
      if (document.hidden && !paused) {
        pausedAt = now;
        paused = true;
      } else if (!document.hidden && paused) {
        startedAt += now - pausedAt;
        paused = false;
      }
    }

    const ro = new ResizeObserver(() => {
      resize();
      render(progress(performance.now()), performance.now());
    });

    Promise.all(
      (
        [
          ['forest', 'forest-master.webp'],
          ['birds', 'birds.webp'],
          ['deer', 'deer.webp'],
          ['butterflies', 'butterflies.webp'],
        ] as const
      ).map(async ([key, file]) => {
        images[key] = await loadImage(`${ASSET_BASE}/${file}`);
      }),
    )
      .then(() => {
        if (disposed) return;
        resize();
        ro.observe(canvas!);
        document.addEventListener('visibilitychange', onVisibility);
        setReady(true);
        render(progress(performance.now()), performance.now());
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cycleMs, startAt]);

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden bg-[#07140f] ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {!ready && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-emerald-50/80">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-200/25 border-t-emerald-200" />
          <span className="text-sm tracking-wide">Entering the forest</span>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-emerald-50/80">
          The forest artwork did not load. Check that the four .webp files are in public/forest/.
        </div>
      )}

      {children}
    </div>
  );
}
