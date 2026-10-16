import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";

import type { getLoginPageImageLayout } from "@/lib/login-page-image-layout";

export type LoginPageImageTransform = {
  zoom: number;
  positionX: number;
  positionY: number;
};

export type LoginPageImageEditorSize = { width: number; height: number };
export type LoginPageImageLayout = ReturnType<typeof getLoginPageImageLayout>;

export type LoginPageImageDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  initialPositionX: number;
  initialPositionY: number;
  initialOffsetX: number;
  initialOffsetY: number;
};

export type LoginPageImageEditorFrameProps = {
  frameRef: RefObject<HTMLDivElement | null>;
  dragStateRef: RefObject<LoginPageImageDragState | null>;
  currentSrc: string;
  fallbackSrc: string;
  resolvedSrc: string;
  imageLayout: LoginPageImageLayout;
  imageStyle: CSSProperties | undefined;
  transform: LoginPageImageTransform;
  setFailedSrc: Dispatch<SetStateAction<string>>;
  setImageSize: Dispatch<SetStateAction<LoginPageImageEditorSize>>;
  commitTransform: (patch?: Partial<LoginPageImageTransform>) => void;
};
