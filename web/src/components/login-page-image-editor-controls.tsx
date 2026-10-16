import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM,
  LOGIN_PAGE_IMAGE_MAX_ZOOM,
  LOGIN_PAGE_IMAGE_MIN_ZOOM,
} from "@/lib/login-page-image-layout";

import type { LoginPageImageEditorSize, LoginPageImageTransform } from "./login-page-image-editor-types";

type LoginPageImageEditorControlsProps = {
  transform: LoginPageImageTransform;
  frameSize: LoginPageImageEditorSize;
  onZoomChange: (nextZoom: number, pointX: number, pointY: number) => void;
  onReset: (patch?: Partial<LoginPageImageTransform>) => void;
};

export function LoginPageImageEditorControls({
  transform,
  frameSize,
  onZoomChange,
  onReset,
}: LoginPageImageEditorControlsProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{"\u7f29\u653e"}</span>
          <span>{transform.zoom.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          aria-label="登录页图片缩放"
          min={String(LOGIN_PAGE_IMAGE_MIN_ZOOM)}
          max={String(LOGIN_PAGE_IMAGE_MAX_ZOOM)}
          step="0.01"
          value={transform.zoom}
          className="w-full accent-[#1456f0]"
          onChange={(event) => onZoomChange(Number(event.target.value), frameSize.width / 2, frameSize.height / 2)}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{"\u6c34\u5e73"} {transform.positionX.toFixed(0)}% / {"\u5782\u76f4"} {transform.positionY.toFixed(0)}%</span>
        <Button type="button" variant="ghost" className="h-auto px-2 py-1 text-xs" onClick={() => onReset(LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM)}>
          <RotateCcw className="size-3.5" />
          {"\u91cd\u7f6e\u89c6\u56fe"}
        </Button>
      </div>
    </>
  );
}
