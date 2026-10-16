import { useEffect, useMemo, useState } from "react";

import type { ManagedImage } from "@/lib/api";

const IMAGE_MASONRY_BREAKPOINTS = [
  { minWidth: 1280, columns: 4 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 640, columns: 2 },
] as const;

function getImageMasonryColumnCount() {
  if (typeof window === "undefined") {
    return 1;
  }

  return IMAGE_MASONRY_BREAKPOINTS.find(({ minWidth }) =>
    window.matchMedia(`(min-width: ${minWidth}px)`).matches,
  )?.columns ?? 1;
}

export function useOrderedImageMasonryColumns(items: ManagedImage[]) {
  const [columnCount, setColumnCount] = useState(getImageMasonryColumnCount);

  useEffect(() => {
    const updateColumnCount = () => setColumnCount(getImageMasonryColumnCount());
    const mediaQueries = IMAGE_MASONRY_BREAKPOINTS.map(({ minWidth }) =>
      window.matchMedia(`(min-width: ${minWidth}px)`),
    );

    updateColumnCount();
    mediaQueries.forEach((query) => query.addEventListener("change", updateColumnCount));
    return () => mediaQueries.forEach((query) => query.removeEventListener("change", updateColumnCount));
  }, []);

  return useMemo(() => {
    const columns = Array.from({ length: columnCount }, () => [] as Array<{ item: ManagedImage; index: number }>);
    items.forEach((item, index) => {
      columns[index % columnCount].push({ item, index });
    });
    return columns;
  }, [columnCount, items]);
}
