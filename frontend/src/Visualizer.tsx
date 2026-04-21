import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import butterchurn from "butterchurn";
import butterchurnPresets from "butterchurn-presets";
import WebGLFluidEnhanced from "webgl-fluid-enhanced";

const THEME_PATTERNS: Record<string, RegExp> = {
  all: /.*/i,
  liquid: /liquid|water|pond|ocean|wave|storm|spirits|jelly|pearl|mashup/i,
  neon: /neon|glow|light|lights|plasma|grafitti|mindblob|shine|color/i,
  fractal: /fractal|spiral|concentric|meta|decay|cube|cubetrace|geometry|tile/i,
  space: /astral|alien|sky|skylight|desert|artifact|air|hurricane|star|space/i,
  organic: /organic|fish|flower|moss|witchcraft|potion|songflower|eye|pond/i,
  chaos: /explosion|nightmare|storm|smashing|posterize|predator|thunder|hurricane/i,
};

const FLUID_PALETTES: Record<string, string[]> = {
  all: ["#1cf2b5", "#51f2ff", "#7a4dff", "#ff2d75", "#c3ff37"],
  liquid: ["#1fd8b5", "#36ffc9", "#89fff2", "#3f8cff", "#baf95c"],
  neon: ["#00f0ff", "#4d7dff", "#ff3bbd", "#ff7a00", "#ecff3a"],
  fractal: ["#77f7ff", "#735dff", "#d032ff", "#ff5376", "#ffe866"],
  space: ["#3f4dff", "#7b35ff", "#ff296f", "#7fff5b", "#f7f39a"],
  organic: ["#14d98f", "#77f56b", "#efe05a", "#48b6ff", "#ff8b6c"],
  chaos: ["#ff145b", "#ff6f1a", "#f2f230", "#32ffd2", "#7a33ff"],
};

function getThemePresetKeys(theme: string) {
  const presets = butterchurnPresets.getPresets();
  const allKeys = Object.keys(presets);
  const matcher = THEME_PATTERNS[theme] ?? THEME_PATTERNS.all;
  const themedKeys = allKeys.filter((key) => matcher.test(key));
  return themedKeys.length > 0 ? themedKeys : allKeys;
}

function getFluidPalette(theme: string) {
  return FLUID_PALETTES[theme] ?? FLUID_PALETTES.all;
}

function pickFluidColor(theme: string) {
  const palette = getFluidPalette(theme);
  return palette[Math.floor(Math.random() * palette.length)] ?? "#7a4dff";
}

function createFluidConfig(theme: string) {
  return {
    simResolution: 196,
    dyeResolution: 768,
    captureResolution: 512,
    densityDissipation: 0.985,
    velocityDissipation: 0.92,
    pressure: 0.18,
    pressureIterations: 24,
    curl: 32,
    splatRadius: 0.2,
    splatForce: 5600,
    shading: true,
    colorful: false,
    colorUpdateSpeed: 6,
    colorPalette: getFluidPalette(theme),
    hover: false,
    backgroundColor: "#000000",
    inverted: false,
    transparent: true,
    brightness: 1,
    bloom: true,
    bloomIterations: 8,
    bloomResolution: 256,
    bloomIntensity: 0.42,
    bloomThreshold: 0.34,
    bloomSoftKnee: 0.65,
    sunrays: false,
    sunraysResolution: 196,
    sunraysWeight: 1,
  };
}

interface Props {
  analyser: AnalyserNode | null;
  audioCtx: AudioContext | null;
  isPlaying: boolean;
  theme?: string;
  width: number;
  height: number;
}

interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export default function Visualizer({ analyser, audioCtx, isPlaying, theme = "all", width, height }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidLayerRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<any>(null);
  const fluidRef = useRef<WebGLFluidEnhanced | null>(null);
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(isPlaying);
  const fluidPausedRef = useRef(false);
  const pointerTargetRef = useRef({ x: 0.5, y: 0.5 });
  const pointerCurrentRef = useRef({ x: 0.5, y: 0.5 });
  const hoverRef = useRef(false);
  const swirlPhaseRef = useRef(0);
  const lastSplatRef = useRef<PointerSample>({ x: 0, y: 0, t: 0 });

  function resetPointerEffect() {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    surface.style.setProperty("--mx", "50%");
    surface.style.setProperty("--my", "50%");
    surface.style.setProperty("--swirl-angle", "0deg");
    surface.style.setProperty("--glow-strength", "0.08");
    surface.style.setProperty("--swirl-size", "160px");

    canvas.style.transformOrigin = "50% 50%";
    canvas.style.transform = "translate3d(0px, 0px, 0) scale(1) rotateX(0deg) rotateY(0deg) rotate(0deg)";
    canvas.style.filter = "saturate(1) brightness(1) contrast(1)";
  }

  function syncFluidPause(nextPlaying: boolean) {
    const fluid = fluidRef.current;
    if (!fluid) return;

    if (!nextPlaying && !fluidPausedRef.current) {
      fluid.togglePause(false);
      fluidPausedRef.current = true;
      return;
    }

    if (nextPlaying && fluidPausedRef.current) {
      fluid.togglePause(false);
      fluidPausedRef.current = false;
      fluid.multipleSplats(2);
    }
  }

  function splatFluid(px: number, py: number, dx: number, dy: number, strong = false) {
    const fluid = fluidRef.current;
    if (!fluid || fluidPausedRef.current || !playingRef.current) return;

    const forceScale = strong ? 24 : 16;
    const forceX = Math.max(-900, Math.min(900, dx * forceScale));
    const forceY = Math.max(-900, Math.min(900, -dy * forceScale));

    fluid.splatAtLocation(px, py, forceX, forceY, pickFluidColor(theme));

    if (!strong) return;

    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.45;
      const spread = 18 + Math.random() * 22;
      fluid.splatAtLocation(
        px + Math.cos(angle) * spread,
        py + Math.sin(angle) * spread,
        Math.cos(angle) * 520,
        -Math.sin(angle) * 520,
        pickFluidColor(theme)
      );
    }
  }

  function applyPointerEffect() {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    if (!playingRef.current) {
      resetPointerEffect();
      return;
    }

    const easing = hoverRef.current ? 0.16 : 0.09;
    const target = pointerTargetRef.current;
    const current = pointerCurrentRef.current;

    current.x += (target.x - current.x) * easing;
    current.y += (target.y - current.y) * easing;

    const dx = current.x - 0.5;
    const dy = current.y - 0.5;
    const distance = Math.min(Math.hypot(dx, dy) * 1.8, 1);

    swirlPhaseRef.current += 0.018 + distance * 0.034;

    const orbitRadius = hoverRef.current ? 6 + distance * 20 : 0;
    const orbitX = Math.cos(swirlPhaseRef.current * 1.4) * orbitRadius;
    const orbitY = Math.sin(swirlPhaseRef.current * 1.15) * orbitRadius * 0.72;
    const panX = dx * 18 + orbitX;
    const panY = dy * 12 + orbitY;
    const rotateX = -dy * 8 + Math.cos(swirlPhaseRef.current) * 1.4;
    const rotateY = dx * 8 + Math.sin(swirlPhaseRef.current * 0.9) * 1.8;
    const rotateZ = Math.sin(swirlPhaseRef.current * 0.75) * 2.8 + dx * 3.2;
    const scale = 1.018 + distance * 0.05;
    const brightness = 1.01 + distance * 0.05;
    const saturation = 1.02 + distance * 0.08;
    const contrast = 1.01 + distance * 0.03;

    surface.style.setProperty("--mx", `${(current.x * 100).toFixed(2)}%`);
    surface.style.setProperty("--my", `${(current.y * 100).toFixed(2)}%`);
    surface.style.setProperty("--swirl-angle", `${(swirlPhaseRef.current * 57.2958).toFixed(2)}deg`);
    surface.style.setProperty("--glow-strength", `${(hoverRef.current ? 0.32 : 0.12) + distance * 0.28}`);
    surface.style.setProperty("--swirl-size", `${170 + distance * 130}px`);

    canvas.style.transformOrigin = `${(current.x * 100).toFixed(2)}% ${(current.y * 100).toFixed(2)}%`;
    canvas.style.transform = `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${scale.toFixed(3)}) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) rotate(${rotateZ.toFixed(2)}deg)`;
    canvas.style.filter = `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!surfaceRef.current) return;

    const rect = surfaceRef.current.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    pointerTargetRef.current = {
      x: Math.min(Math.max(px / rect.width, 0), 1),
      y: Math.min(Math.max(py / rect.height, 0), 1),
    };
    hoverRef.current = playingRef.current;

    if (!playingRef.current) return;

    const now = performance.now();
    const last = lastSplatRef.current;
    if (last.t > 0) {
      const timeScale = Math.max((now - last.t) / 16, 1);
      const dx = (px - last.x) / timeScale;
      const dy = (py - last.y) / timeScale;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.45) {
        splatFluid(px, py, dx, dy, speed > 10);
      }
    }
    lastSplatRef.current = { x: px, y: py, t: now };
  }

  function handlePointerLeave() {
    hoverRef.current = false;
    pointerTargetRef.current = { x: 0.5, y: 0.5 };
    lastSplatRef.current = { x: 0, y: 0, t: 0 };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!surfaceRef.current || !playingRef.current) return;

    const rect = surfaceRef.current.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const last = lastSplatRef.current;
    const dx = last.t > 0 ? px - last.x : 24 - Math.random() * 48;
    const dy = last.t > 0 ? py - last.y : 24 - Math.random() * 48;
    splatFluid(px, py, dx, dy, true);
    lastSplatRef.current = { x: px, y: py, t: performance.now() };
  }

  // Keep a ref in sync so the RAF loop can read it without re-creating
  useEffect(() => {
    playingRef.current = isPlaying;
    syncFluidPause(isPlaying);

    if (!isPlaying) {
      hoverRef.current = false;
      pointerTargetRef.current = { x: 0.5, y: 0.5 };
      pointerCurrentRef.current = { x: 0.5, y: 0.5 };
      lastSplatRef.current = { x: 0, y: 0, t: 0 };
      resetPointerEffect();
    }
  }, [isPlaying]);

  useEffect(() => {
    resetPointerEffect();
  }, []);

  useEffect(() => {
    if (!fluidLayerRef.current) return;

    try {
      const fluid = new WebGLFluidEnhanced(fluidLayerRef.current);
      fluidRef.current = fluid;
      fluid.start();
      fluid.setConfig(createFluidConfig(theme));

      if (playingRef.current) {
        fluid.multipleSplats(3);
      } else {
        fluid.togglePause(false);
        fluidPausedRef.current = true;
      }
    } catch (error) {
      console.warn("fluid init", error);
    }

    return () => {
      const fluid = fluidRef.current;
      fluidRef.current = null;

      if (!fluid) return;

      try {
        if (fluidPausedRef.current) {
          fluid.togglePause(false);
        }
        fluid.stop();
      } catch (error) {
        console.warn("fluid stop", error);
      }

      fluidPausedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const fluid = fluidRef.current;
    if (!fluid) return;

    fluid.setConfig(createFluidConfig(theme));
    if (playingRef.current && !fluidPausedRef.current) {
      fluid.multipleSplats(1);
    }
  }, [theme]);

  useEffect(() => {
    if (!canvasRef.current || !audioCtx || !analyser) return;

    const visualizer = butterchurn.createVisualizer(audioCtx, canvasRef.current, {
      width,
      height,
      pixelRatio: window.devicePixelRatio || 1,
    });
    vizRef.current = visualizer;

    try {
      visualizer.connectAudio(analyser);
    } catch (e) {
      console.warn("viz connect", e);
    }

    const presets = butterchurnPresets.getPresets();
    const keys = getThemePresetKeys(theme);
    const pick = keys[Math.floor(Math.random() * keys.length)];
    visualizer.loadPreset(presets[pick], 0.0);

    // cycle presets every 30s
    const cycle = window.setInterval(() => {
      const k = keys[Math.floor(Math.random() * keys.length)];
      visualizer.loadPreset(presets[k], 2.5);
    }, 30000);

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      if (playingRef.current) {
        applyPointerEffect();
        visualizer.render();
      } else {
        resetPointerEffect();
      }
    };
    render();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearInterval(cycle);
    };
  }, [analyser, audioCtx, theme]);

  useEffect(() => {
    if (vizRef.current) vizRef.current.setRendererSize(width, height);
  }, [width, height]);

  return (
    <div
      ref={surfaceRef}
      className="viz-surface"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <canvas ref={canvasRef} width={width} height={height} className="viz-canvas" />
      <div ref={fluidLayerRef} className="viz-fluid-layer" aria-hidden="true" />
    </div>
  );
}
