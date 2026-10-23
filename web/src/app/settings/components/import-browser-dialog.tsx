"use client";

import { useMemo } from "react";
import { Import, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

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
    (state) => state.replaceSelectedNames
  );
  const setFileQuery = useSettingsStore((state) => state.setFileQuery);
  const setFilePage = useSettingsStore((state) => state.setFilePage);
  const setPageSize = useSettingsStore((state) => state.setPageSize);
  const startImport = useSettingsStore((state) => state.startImport);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);

  const filteredFiles = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    if (!query) {
      return remoteFiles;
    }
    return remoteFiles.filter(
      (item) =>
        item.email.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query)
    );
  }, [fileQuery, remoteFiles]);

  const currentPageSize = Number(pageSize);
  const filePageCount = Math.max(
    1,
    Math.ceil(filteredFiles.length / currentPageSize)
  );
  const safeFilePage = Math.min(filePage, filePageCount);
  const pagedFiles = useMemo(
    () =>
      filteredFiles.slice(
        (safeFilePage - 1) * currentPageSize,
        safeFilePage * currentPageSize
      ),
    [currentPageSize, filteredFiles, safeFilePage]
  );

  const pageSelectedCount = useMemo(
    () => pagedFiles.filter((item) => selectedSet.has(item.name)).length,
    [pagedFiles, selectedSet]
  );
  const allPageSelected =
    pagedFiles.length > 0 && pageSelectedCount === pagedFiles.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;

  const allFilteredSelected =
    filteredFiles.length > 0 &&
    filteredFiles.every((item) => selectedSet.has(item.name));

  const toggleSelectCurrentPage = (checked: boolean) => {
    if (checked) {
      replaceSelectedNames([
        ...selectedNames,
        ...pagedFiles.map((item) => item.name),
      ]);
      return;
    }
    const pageSet = new Set(pagedFiles.map((item) => item.name));
    replaceSelectedNames(selectedNames.filter((name) => !pageSet.has(name)));
  };

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
      selectedNames.filter((name) => !filteredSet.has(name))
    );
  };

  return (
    <Dialog
      open={browserOpen}
      onOpenChange={(nextOpen) => {
        if (!isStartingImport) setBrowserOpen(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={!isStartingImport}
        className="flex max-h-[88vh] flex-col overflow-hidden rounded-xl p-6 sm:max-w-3xl"
      >
        <DialogHeader className="gap-1.5 text-left">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <DialogTitle>选择要导入的远程账号</DialogTitle>
            <Badge variant="outline" className="tabular-nums">
              共 {remoteFiles.length} 个远程文件
            </Badge>
          </div>
          <DialogDescription className="text-xs leading-5 sm:text-sm">
            {browserPool
              ? `数据源：${browserPool.name || browserPool.base_url}`
              : "勾选需要同步至本地号池的账号凭证文件"}
          </DialogDescription>
        </DialogHeader>

        {/* Search & Filter Controls */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="按邮箱或文件名搜索…"
              disabled={isStartingImport}
              className={cn("h-9 pl-9", settingsDialogInputClassName)}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select
              value={pageSize}
              disabled={isStartingImport}
              onValueChange={(value) =>
                setPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number])
              }
            >
              <SelectTrigger
                className={cn("h-9 w-[112px] text-xs", settingsDialogInputClassName)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item} / 页
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 tabular-nums"
              disabled={isStartingImport || filteredFiles.length === 0}
              onClick={() => toggleSelectAllFiltered(!allFilteredSelected)}
            >
              {allFilteredSelected
                ? "取消全选筛选结果"
                : `全选筛选结果 (${filteredFiles.length})`}
            </Button>
          </div>
        </div>

        {/* Live Selection Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/75 bg-surface-subtle/55 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5 rounded-full",
                selectedNames.length > 0
                  ? "bg-status-success"
                  : "bg-muted-foreground/50"
              )}
            />
            <span className="font-medium tabular-nums text-foreground">
              已选 {selectedNames.length} 个账号文件
            </span>
            {fileQuery.trim() ? (
              <span className="tabular-nums text-muted-foreground">
                · 当前筛选匹配 {filteredFiles.length} 个
              </span>
            ) : null}
          </div>
          {selectedNames.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={isStartingImport}
              onClick={() => replaceSelectedNames([])}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              清空已选
            </Button>
          ) : null}
        </div>

        <ImportBrowserFileList
          pagedFiles={pagedFiles}
          selectedSet={selectedSet}
          allPageSelected={allPageSelected}
          somePageSelected={somePageSelected}
          disabled={isStartingImport}
          onToggleSelectPage={toggleSelectCurrentPage}
          onToggleFile={toggleFile}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
          <span>
            显示第{" "}
            {filteredFiles.length === 0
              ? 0
              : (safeFilePage - 1) * currentPageSize + 1}
            –{Math.min(safeFilePage * currentPageSize, filteredFiles.length)}{" "}
            条，共 {filteredFiles.length} 条
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setFilePage(Math.max(1, safeFilePage - 1))}
              disabled={isStartingImport || safeFilePage <= 1}
            >
              上一页
            </Button>
            <span className="font-mono">
              {safeFilePage} / {filePageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                setFilePage(Math.min(filePageCount, safeFilePage + 1))
              }
              disabled={isStartingImport || safeFilePage >= filePageCount}
            >
              下一页
            </Button>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBrowserOpen(false)}
            disabled={isStartingImport}
          >
            取消
          </Button>
          <Button
            type="button"
            loading={isStartingImport}
            onClick={() => void startImport()}
            disabled={selectedNames.length === 0}
            className="tabular-nums"
          >
            {!isStartingImport ? <Import className="size-4" /> : null}
            导入选中账号 ({selectedNames.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
