"use client";

import { StudioStatsBall } from "./studio-stats-ball";
import { StudioStatsPanel } from "./studio-stats-panel";
import { useStudioStatsFab } from "./use-studio-stats-fab";

export function StudioStatsFab() {
  const fab = useStudioStatsFab();
  if (!fab.ready) return null;

  return (
    <>
      <StudioStatsPanel fab={fab} />
      <StudioStatsBall fab={fab} />
    </>
  );
}
