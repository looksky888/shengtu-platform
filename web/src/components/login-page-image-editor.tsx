"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { DEFAULT_LOGIN_PAGE_IMAGE, resolveLoginPageImageSrc } from "@/lib/app-meta";
import {
  getLoginPageImageLayout,
  getLoginPageImagePositionPercentFromOffset,
  LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM,
  LOGIN_PAGE_IMAGE_MAX_ZOOM,
  LOGIN_PAGE_IMAGE_MIN_ZOOM,
  normalizeLoginPageImageMode,
  normalizeLoginPageImageTransform,
  type LoginPageImageMode,
} from "@/lib/login-page-image-layout";

import { LoginPageImageEditorControls } from "./login-page-image-editor-controls";
import { LoginPageImageEditorFrame } from "./login-page-image-editor-frame";
import type { LoginPageImageDragState, LoginPageImageTransform } from "./login-page-image-editor-types";

type LoginPageImageEditorProps = {
  mode?: LoginPageImageMode | string;
  onChange?: (transform: LoginPageImageTransform) => void;
  positionX?: number;
  positionY?: number;
  src?: string;
  zoom?: number;
};

const zoomStep = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LoginPageImageEditor({
  mode = "contain",
  onChange,
  positionX = LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.positionX,
  positionY = LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.positionY,
  src,
  zoom = LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.zoom,
}: LoginPageImageEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<LoginPageImageDragState | null>(null);
  const [failedSrc, setFailedSrc] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const resolvedMode = normalizeLoginPageImageMode(mode);
  const resolvedSrc = resolveLoginPageImageSrc(src);
  const fallbackSrc = resolveLoginPageImageSrc(DEFAULT_LOGIN_PAGE_IMAGE);
  const currentSrc = failedSrc === resolvedSrc ? fallbackSrc : resolvedSrc;
  const transform = useMemo(
    () => normalizeLoginPageImageTransform({ zoom, positionX, positionY }),
    [positionX, positionY, zoom],
  );
  const imageLayout = useMemo(
    () => getLoginPageImageLayout({
      frameWidth: frameSize.width,
      frameHeight: frameSize.height,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      mode: resolvedMode,
      zoom: transform.zoom,
      positionX: transform.positionX,
      positionY: transform.positionY,
    }),
    [frameSize.height, frameSize.width, imageSize.height, imageSize.width, resolvedMode, transform.positionX, transform.positionY, transform.zoom],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const updateFrameSize = () => {
      const nextWidth = frame.clientWidth;
      const nextHeight = frame.clientHeight;
      setFrameSize((current) => current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight });
    };
    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const commitTransform = useCallback(
    (patch: Partial<LoginPageImageTransform> = {}) => {
      onChange?.(normalizeLoginPageImageTransform({ ...transform, ...patch }));
    },
    [onChange, transform],
  );

  const applyZoomAtPoint = useCallback(
    (nextZoom: number, pointX: number, pointY: number) => {
      const clampedZoom = clamp(nextZoom, LOGIN_PAGE_IMAGE_MIN_ZOOM, LOGIN_PAGE_IMAGE_MAX_ZOOM);
      if (!imageLayout) {
        commitTransform({ zoom: clampedZoom });
        return;
      }
      const safeImagePointX = imageLayout.width ? (pointX - imageLayout.x) / imageLayout.width : 0.5;
      const safeImagePointY = imageLayout.height ? (pointY - imageLayout.y) / imageLayout.height : 0.5;
      const nextLayout = getLoginPageImageLayout({
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        mode: resolvedMode,
        zoom: clampedZoom,
        positionX: transform.positionX,
        positionY: transform.positionY,
      });
      if (!nextLayout) {
        commitTransform({ zoom: clampedZoom });
        return;
      }
      commitTransform({
        zoom: clampedZoom,
        positionX: getLoginPageImagePositionPercentFromOffset(pointX - safeImagePointX * nextLayout.width, nextLayout.availableX, transform.positionX),
        positionY: getLoginPageImagePositionPercentFromOffset(pointY - safeImagePointY * nextLayout.height, nextLayout.availableY, transform.positionY),
      });
    },
    [commitTransform, frameSize.height, frameSize.width, imageLayout, imageSize.height, imageSize.width, resolvedMode, transform.positionX, transform.positionY],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      applyZoomAtPoint(transform.zoom + (event.deltaY < 0 ? zoomStep : -zoomStep), event.clientX - rect.left, event.clientY - rect.top);
    };
    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [applyZoomAtPoint, transform.zoom]);

  const imageStyle: CSSProperties | undefined = imageLayout ? {
    width: `${imageLayout.width}px`,
    height: `${imageLayout.height}px`,
    transform: `translate(${imageLayout.x}px, ${imageLayout.y}px)`,
    transformOrigin: "top left",
  } : {
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: resolvedMode === "fill" ? "fill" : resolvedMode,
    objectPosition: `${transform.positionX}% ${transform.positionY}%`,
    transform: `scale(${transform.zoom})`,
    transformOrigin: "center center",
  };

  return (
    <div className="flex flex-col gap-3">
      <LoginPageImageEditorFrame
        frameRef={frameRef}
        dragStateRef={dragStateRef}
        currentSrc={currentSrc}
        fallbackSrc={fallbackSrc}
        resolvedSrc={resolvedSrc}
        imageLayout={imageLayout}
        imageStyle={imageStyle}
        transform={transform}
        setFailedSrc={setFailedSrc}
        setImageSize={setImageSize}
        commitTransform={commitTransform}
      />
      <LoginPageImageEditorControls
        transform={transform}
        frameSize={frameSize}
        onZoomChange={applyZoomAtPoint}
        onReset={commitTransform}
      />
    </div>
  );
}
