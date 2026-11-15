/**
 * Client view of the current server page.
 * True pagination lives in use-image-manager-loader (cursor stack + replace).
 * This hook only passes through filtered items — no infinite scroll.
 */
export function useImageManagerPagination({
  filteredItems,
}: {
  filteredItems: import("@/lib/api").ManagedImage[];
}) {
  return {
    visibleItems: filteredItems,
  };
}
