export type InpaintPoint = { x: number; y: number };
export type InpaintMark = { kind: "rect" | "brush"; points: InpaintPoint[]; size?: number };

type OverlayOptions = {
  brushSize: number;
  feather: number;
  invert: boolean;
  outlineRects?: boolean;
};

export function drawInpaintOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  marks: readonly InpaintMark[],
  options: OverlayOptions,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.fillStyle = "rgba(14, 165, 233, 0.72)";
  if (options.invert) ctx.fillRect(0, 0, width, height);

  for (const mark of marks) {
    ctx.save();
    ctx.globalCompositeOperation = options.invert ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(14, 165, 233, 0.72)";
    ctx.strokeStyle = "rgba(14, 165, 233, 0.72)";
    ctx.filter = options.feather > 0 ? `blur(${options.feather}px)` : "none";
    if (mark.kind === "rect") {
      const [start, end] = mark.points;
      ctx.fillRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(start.x - end.x),
        Math.abs(start.y - end.y),
      );
    } else {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = mark.size || options.brushSize;
      ctx.beginPath();
      mark.points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  if (!options.invert && marks.length && options.outlineRects) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = Math.max(2, Math.min(width, height) / 640);
    marks.filter((mark) => mark.kind === "rect").forEach((mark) => {
      const [start, end] = mark.points;
      ctx.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(start.x - end.x),
        Math.abs(start.y - end.y),
      );
    });
    ctx.restore();
  }
}
