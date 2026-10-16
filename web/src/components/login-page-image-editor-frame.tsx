import {
  getLoginPageImagePositionPercentFromOffset,
} from "@/lib/login-page-image-layout";

import type { LoginPageImageEditorFrameProps } from "./login-page-image-editor-types";

export function LoginPageImageEditorFrame({
  frameRef,
  dragStateRef,
  currentSrc,
  fallbackSrc,
  resolvedSrc,
  imageLayout,
  imageStyle,
  transform,
  setFailedSrc,
  setImageSize,
  commitTransform,
}: LoginPageImageEditorFrameProps) {
  return (
    <div
      ref={frameRef}
      className="relative mx-auto flex aspect-[10/13] w-full max-w-[20rem] touch-none items-stretch justify-stretch overflow-hidden rounded-2xl border bg-stone-100/60 shadow-inner dark:bg-muted/10"
      onPointerDown={(event) => {
        dragStateRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          initialPositionX: transform.positionX,
          initialPositionY: transform.positionY,
          initialOffsetX: imageLayout?.x ?? 0,
          initialOffsetY: imageLayout?.y ?? 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId || !imageLayout) return;
        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        commitTransform({
          positionX: getLoginPageImagePositionPercentFromOffset(
            dragState.initialOffsetX + deltaX,
            imageLayout.availableX,
            dragState.initialPositionX,
          ),
          positionY: getLoginPageImagePositionPercentFromOffset(
            dragState.initialOffsetY + deltaY,
            imageLayout.availableY,
            dragState.initialPositionY,
          ),
        });
      }}
      onPointerUp={(event) => clearDrag(event, dragStateRef)}
      onPointerCancel={(event) => clearDrag(event, dragStateRef)}
    >
      <img
        src={currentSrc}
        alt={"\u767b\u5f55\u9875\u56fe\u7247\u9884\u89c8"}
        className="absolute top-0 left-0 max-w-none select-none"
        draggable={false}
        onLoad={(event) => {
          const target = event.currentTarget;
          const nextImageSize = { width: target.naturalWidth, height: target.naturalHeight };
          setImageSize((current) =>
            current.width === nextImageSize.width && current.height === nextImageSize.height ? current : nextImageSize,
          );
        }}
        onError={(event) => {
          if (event.currentTarget.src !== fallbackSrc) {
            event.currentTarget.src = fallbackSrc;
            setFailedSrc(resolvedSrc);
          }
        }}
        style={imageStyle}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-white/40 to-transparent dark:from-white/5" />
      <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-full bg-background/80 px-3 py-1.5 text-center text-[11px] font-medium tracking-[0.08em] text-muted-foreground backdrop-blur">
        {"\u62d6\u52a8\u8c03\u6574\u4f4d\u7f6e\uff0c\u6eda\u8f6e\u6216\u6ed1\u6746\u7f29\u653e"}
      </div>
    </div>
  );
}

function clearDrag(
  event: React.PointerEvent<HTMLDivElement>,
  dragStateRef: LoginPageImageEditorFrameProps["dragStateRef"],
) {
  if (dragStateRef.current?.pointerId === event.pointerId) {
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}
