"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

/** A plain `<canvas>` signature pad -- pointer events draw a line, `toBlob()` exports
 * the drawing as a PNG. No signature-capture library: this is the entire feature (draw,
 * export), and every mainstream one wraps exactly this API for a cost this platform
 * doesn't need to pay (CLAUDE.md principle 2). */
export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const pointFromEvent = (canvas: HTMLCanvasElement, e: React.PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    toBlob: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      }),
  }));

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={160}
      className="w-full max-w-md touch-none rounded-md border border-border bg-white"
      onPointerDown={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawingRef.current = true;
        lastPointRef.current = pointFromEvent(canvas, e);
      }}
      onPointerMove={(e) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !drawingRef.current || !lastPointRef.current) return;
        const point = pointFromEvent(canvas, e);
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        lastPointRef.current = point;
      }}
      onPointerUp={() => {
        drawingRef.current = false;
        lastPointRef.current = null;
      }}
      onPointerLeave={() => {
        drawingRef.current = false;
        lastPointRef.current = null;
      }}
    />
  );
});
