/**
 * A one-shot canvas confetti burst -- hand-rolled rather than a library (canvas-confetti
 * et al.) since a few dozen animated rects for ~2.5s doesn't need a new dependency.
 * Appends a full-viewport, click-through canvas to <body>, animates it via
 * requestAnimationFrame, then removes itself. Returns a cleanup function that cancels
 * the animation and removes the canvas early (call it from a useEffect's own cleanup so
 * an unmount mid-burst -- e.g. the dialog closing immediately -- doesn't leave a
 * dangling rAF loop or an orphaned canvas element).
 */
export function fireConfetti(durationMs = 2500): () => void {
  if (typeof document === "undefined") return () => {};

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "100";
  canvas.style.pointerEvents = "none";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const colors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];
  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 3,
    size: 4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)]!,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 12,
  }));

  const start = Date.now();
  let frameId = 0;
  let stopped = false;

  function frame() {
    if (stopped || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rotation += p.rotationSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (Date.now() - start < durationMs) {
      frameId = requestAnimationFrame(frame);
    } else {
      cleanup();
    }
  }

  function cleanup() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    canvas.remove();
  }

  frameId = requestAnimationFrame(frame);
  return cleanup;
}
