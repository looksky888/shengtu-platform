import { useCallback, useMemo, useState } from "react";

import { managedImageKey } from "@/app/image-manager/image-manager-utils";
import type { ManagedImage } from "@/lib/api";

export function useImageManagerSelection(filteredItems: ManagedImage[]) {
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const selectedItems = useMemo(
    () => filteredItems.filter((item) => selectedImageIds[managedImageKey(item)]),
    [filteredItems, selectedImageIds],
  );
  const selectedPrivateItems = useMemo(
    () => selectedItems.filter((item) => item.visibility !== "public"),
    [selectedItems],
  );
  const selectedPublicItems = useMemo(
    () => selectedItems.filter((item) => item.visibility === "public"),
    [selectedItems],
  );
  const selectedCount = selectedItems.length;
  const allSelected = filteredItems.length > 0 && selectedCount === filteredItems.length;

  const resetSelection = useCallback(() => setSelectedImageIds({}), []);
  const removeSelectedPaths = useCallback((paths: string[]) => {
    setSelectedImageIds((current) => {
      const next = { ...current };
      paths.forEach((path) => {
        delete next[path];
      });
      return next;
    });
  }, []);
  const toggleImageSelection = useCallback((item: ManagedImage) => {
    const key = managedImageKey(item);
    setSelectedImageIds((current) => ({ ...current, [key]: !current[key] }));
  }, []);
  const toggleAllImages = useCallback(() => {
    if (allSelected) {
      setSelectedImageIds({});
      return;
    }
    setSelectedImageIds(Object.fromEntries(filteredItems.map((item) => [managedImageKey(item), true])));
  }, [allSelected, filteredItems]);

  return {
    selectedImageIds,
    selectedItems,
    selectedPrivateItems,
    selectedPublicItems,
    selectedCount,
    allSelected,
    resetSelection,
    removeSelectedPaths,
    toggleImageSelection,
    toggleAllImages,
  };
}