import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Brush, Eraser, FlipHorizontal2, LoaderCircle, ScanEye, SquareDashed, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoredImage } from "@/store/image-conversations";
import {
  drawInpaintOverlay,
  type InpaintMark,
  type InpaintPoint,
} from "@/app/image/lib/image-inpaint-overlay";
import { dataUrlToFile } from "@/app/image/lib/reference-image-utils";

export type ImageInpaintSource = { image: StoredImage; src: string; name: string };
export type ImageInpaintSubmit = { prompt: string; originalFile: File; markedFile: File };

type ImageInpaintDialogProps = {
  source: ImageInpaintSource | null;
  onClose: () => void;
  onSubmit: (payload: ImageInpaintSubmit) => void | Promise<void>;
};

export function ImageInpaintDialog({ source, onClose, onSubmit }: ImageInpaintDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState<InpaintMark[]>([]);
  const [tool, setTool] = useState<"rect" | "brush">("rect");
  const [brushSize, setBrushSize] = useState(44);
  const [feather, setFeather] = useState(12);
  const [invert, setInvert] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [drag, setDrag] = useState<{ pointerId: number; start: InpaintPoint; mark: InpaintMark } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const imageSize = () => ({ width: imageRef.current?.naturalWidth || 0, height: imageRef.current?.naturalHeight || 0 });

  const draw = useCallback(
    (preview?: InpaintMark) => {
      const image = imageRef.current;
      const canvas = canvasRef.current;
      if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!showOverlay) return;
      drawInpaintOverlay(ctx, canvas.width, canvas.height, preview ? [...marks, preview] : marks, {
        brushSize,
        feather,
        invert,
        outlineRects: true,
      });
    },
    [brushSize, feather, invert, marks, showOverlay],
  );

  useEffect(() => {
    setMarks([]);
    setPrompt("");
    setDrag(null);
    setShowOverlay(true);
  }, [source?.src]);
  useEffect(() => draw(), [draw]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const { width, height } = imageSize();
    if (!canvas || !width || !height) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((event.clientX - rect.left) / rect.width) * width)),
      y: Math.max(0, Math.min(height, ((event.clientY - rect.top) / rect.height) * height)),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    const mark: InpaintMark = tool === "rect" ? { kind: "rect", points: [point, point] } : { kind: "brush", points: [point], size: brushSize };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, start: point, mark });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const mark =
      drag.mark.kind === "rect"
        ? { ...drag.mark, points: [drag.start, point] }
        : { ...drag.mark, points: [...drag.mark.points, point] };
    setDrag({ ...drag, mark });
    draw(mark);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mark.kind === "rect" && (Math.abs(drag.mark.points[1].x - drag.start.x) < 8 || Math.abs(drag.mark.points[1].y - drag.start.y) < 8)) {
      setDrag(null);
      draw();
      return;
    }
    if (drag.mark.kind === "brush" && drag.mark.points.length < 2) {
      setDrag(null);
      draw();
      return;
    }
    setMarks((current) => [...current, drag.mark]);
    setDrag(null);
  };

  const submit = async () => {
    if (!source || !prompt.trim() || !marks.length || submitting) return;
    const image = imageRef.current;
    if (!image) return;
    setSubmitting(true);
    try {
      let originalFile: File;
      if (source.image.b64_json) {
        const mimeType = `image/${source.image.outputFormat || "png"}`;
        originalFile = dataUrlToFile(
          `data:${mimeType};base64,${source.image.b64_json}`,
          source.name || "source.png",
          mimeType,
        );
      } else {
        const isSameOrigin =
          typeof window !== "undefined" &&
          new URL(source.src, window.location.href).origin === window.location.origin;
        const originalResponse = await fetch(source.src, { credentials: isSameOrigin ? "same-origin" : "omit" });
        if (!originalResponse.ok) throw new Error(`读取原图失败：HTTP ${originalResponse.status}`);
        const originalBlob = await originalResponse.blob();
        originalFile = new File([originalBlob], source.name || "source.png", {
          type: originalBlob.type || "image/png",
        });
      }
      const markedCanvas = document.createElement("canvas");
      markedCanvas.width = image.naturalWidth;
      markedCanvas.height = image.naturalHeight;
      const markedCtx = markedCanvas.getContext("2d");
      if (!markedCtx) throw new Error("浏览器不支持标记画布");
      markedCtx.drawImage(image, 0, 0);
      const overlay = document.createElement("canvas");
      overlay.width = image.naturalWidth;
      overlay.height = image.naturalHeight;
      const overlayCtx = overlay.getContext("2d");
      if (!overlayCtx) throw new Error("浏览器不支持选区画布");
      drawInpaintOverlay(overlayCtx, overlay.width, overlay.height, marks, { brushSize, feather, invert });
      markedCtx.drawImage(overlay, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        markedCanvas.toBlob((value) => (value ? resolve(value) : reject(new Error("标记图生成失败"))), "image/png"),
      );
      await onSubmit({ prompt: prompt.trim(), originalFile, markedFile: new File([blob], "marked-edit-region.png", { type: "image/png" }) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "局部修改提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,980px)] flex-col overflow-hidden rounded-[24px] p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>局部修改</DialogTitle>
          <DialogDescription>用矩形或画笔标出需要修改的区域，蓝色标记只用于说明范围。</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-muted/20 p-4 md:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="flex flex-row flex-wrap content-start gap-2 md:flex-col">
            <Button size="sm" variant={tool === "rect" ? "default" : "outline"} onClick={() => setTool("rect")}><SquareDashed />矩形</Button>
            <Button size="sm" variant={tool === "brush" ? "default" : "outline"} onClick={() => setTool("brush")}><Brush />画笔</Button>
            <label className="grid gap-1 text-xs text-muted-foreground">画笔 {brushSize}px<input type="range" min="8" max="160" step="2" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">羽化 {feather}px<input type="range" min="0" max="96" step="2" value={feather} onChange={(event) => setFeather(Number(event.target.value))} /></label>
            <Button size="sm" variant={invert ? "default" : "outline"} onClick={() => setInvert((value) => !value)}><FlipHorizontal2 />反选</Button>
            <Button size="sm" variant={showOverlay ? "default" : "outline"} onClick={() => setShowOverlay((value) => !value)}><ScanEye />{showOverlay ? "隐藏" : "显示"}</Button>
            <Button size="sm" variant="outline" disabled={!marks.length} onClick={() => setMarks((current) => current.slice(0, -1))}><Undo2 />撤销</Button>
            <Button size="sm" variant="outline" disabled={!marks.length} onClick={() => setMarks([])}><Eraser />清空</Button>
          </aside>
          <div className="flex min-h-[280px] items-center justify-center overflow-auto rounded-2xl border border-border bg-background p-3">
            {source ? <div className="relative inline-block max-w-full overflow-hidden rounded-xl"><img ref={imageRef} src={source.src} alt={source.name} crossOrigin="anonymous" draggable={false} className="block max-h-[58vh] max-w-full select-none" onLoad={() => draw()} onError={() => toast.error("原图加载失败，请检查图片地址或跨域配置")} /><canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-crosshair touch-none" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} /></div> : null}
          </div>
        </div>
        <DialogFooter className="flex-row items-center border-t border-border px-5 py-4">
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void submit()} placeholder="描述局部修改要求" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
          <Button variant="outline" disabled={!marks.length} onClick={() => setMarks([])}>清空选区</Button>
          <Button disabled={!prompt.trim() || !marks.length || submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="animate-spin" /> : null}提交修改</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
