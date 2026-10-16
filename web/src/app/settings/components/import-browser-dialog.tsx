"use client";

import { Import, LoaderCircle, Search } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PAGE_SIZE_OPTIONS, useSettingsStore } from "../store";
import { ImportBrowserFileList } from "./import-browser-file-list";
import { settingsDialogInputClassName } from "./settings-ui";

export function ImportBrowserDialog() {
  const browserOpen = useSettingsStore((state) => state.browserOpen);
  const browserPool = useSettingsStore((state) => state.browserPool);
  const remoteFiles = useSettingsStore((state) => state.remoteFiles);
  const selectedNames = useSettingsStore((state) => state.selectedNames);
  const fileQuery = useSettingsStore((state) => state.fileQuery);
  const filePage = useSettingsStore((state) => state.filePage);
  const pageSize = useSettingsStore((state) => state.pageSize);
  const isStartingImport = useSettingsStore((state) => state.isStartingImport);
  const setBrowserOpen = useSettingsStore((state) => state.setBrowserOpen);
  const toggleFile = useSettingsStore((state) => state.toggleFile);
  const replaceSelectedNames = useSettingsStore(
    (state) => state.replaceSelectedNames,
  );
  const setFileQuery = useSettingsStore((state) => state.setFileQuery);
  const setFilePage = useSettingsStore((state) => state.setFilePage);
  const setPageSize = useSettingsStore((state) => state.setPageSize);
  const startImport = useSettingsStore((state) => state.startImport);

  const filteredFiles = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    if (!query) {
      return remoteFiles;
    }
    return remoteFiles.filter((item) => {
      return (
        item.email.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query)
      );
    });
  }, [fileQuery, remoteFiles]);

  const currentPageSize = Number(pageSize);
  const filePageCount = Math.max(
    1,
    Math.ceil(filteredFiles.length / currentPageSize),
  );
  const safeFilePage = Math.min(filePage, filePageCount);
  const pagedFiles = filteredFiles.slice(
    (safeFilePage - 1) * currentPageSize,
    safeFilePage * currentPageSize,
  );
  const allFilteredSelected =
    filteredFiles.length > 0 &&
    filteredFiles.every((item) => selectedNames.includes(item.name));

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      replaceSelectedNames([
        ...selectedNames,
        ...filteredFiles.map((item) => item.name),
      ]);
      return;
    }
    const filteredSet = new Set(filteredFiles.map((item) => item.name));
    replaceSelectedNames(
      selectedNames.filter((name) => !filteredSet.has(name)),
    );
  };

  return (
    <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] max-w-5xl rounded-2xl p-6"
      >
        <DialogHeader className="gap-2">
          <DialogTitle>{"\u9009\u62e9\u8981\u5bfc\u5165\u7684\u8d26\u53f7"}</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {browserPool
              ? `\u6765\u81ea ${browserPool.name || browserPool.base_url}`
              : "\u8bfb\u53d6\u5230\u7684\u8fdc\u7a0b\u8d26\u53f7\u5217\u8868"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder={"\u641c\u7d22 email \u6216\u6587\u4ef6\u540d"}
              className={`${settingsDialogInputClassName} pl-10`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={pageSize}
              onValueChange={(value) =>
                setPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number])
              }
            >
              <SelectTrigger className="h-11 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item} / {"\u9875"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="lg"
              onClick={() => toggleSelectAllFiltered(!allFilteredSelected)}
            >
              {allFilteredSelected ? "\u53d6\u6d88\u5168\u9009" : "\u5168\u9009\u7b5b\u9009\u7ed3\u679c"}
            </Button>
          </div>
        </div>

        <ImportBrowserFileList
          filteredFiles={filteredFiles}
          pagedFiles={pagedFiles}
          selectedNames={selectedNames}
          allFilteredSelected={allFilteredSelected}
          onToggleSelectAllFiltered={toggleSelectAllFiltered}
          onToggleFile={toggleFile}
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {"\u7b2c"}{" "}
            {filteredFiles.length === 0
              ? 0
              : (safeFilePage - 1) * currentPageSize + 1}{" "}
            - {Math.min(safeFilePage * currentPageSize, filteredFiles.length)}{" "}
            {"\u6761\uff0c\u5171"} {filteredFiles.length} {"\u6761"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilePage(Math.max(1, safeFilePage - 1))}
              disabled={safeFilePage <= 1}
            >
              {"\u4e0a\u4e00\u9875"}
            </Button>
            <span>
              {safeFilePage}/{filePageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFilePage(Math.min(filePageCount, safeFilePage + 1))
              }
              disabled={safeFilePage >= filePageCount}
            >
              {"\u4e0b\u4e00\u9875"}
            </Button>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setBrowserOpen(false)}
            disabled={isStartingImport}
          >
            {"\u53d6\u6d88"}
          </Button>
          <Button
            size="lg"
            onClick={() => void startImport()}
            disabled={isStartingImport || selectedNames.length === 0}
          >
            {isStartingImport ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Import data-icon="inline-start" />
            )}
            {"\u5bfc\u5165\u9009\u4e2d\u8d26\u53f7"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
