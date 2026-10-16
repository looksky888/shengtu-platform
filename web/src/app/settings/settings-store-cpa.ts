"use client";

import { toast } from "sonner";
import type { StateCreator } from "zustand";

import {
  createCPAPool,
  deleteCPAPool,
  fetchCPAPoolFiles,
  fetchCPAPools,
  startCPAImport,
  updateCPAPool,
  type CPAPool,
} from "@/lib/api";
import { normalizeFiles } from "./settings-normalizers";
import { runSettingsRequest, type SettingsRequestFlight } from "./settings-load-flight";
import type { PageSizeOption, SettingsLoadOptions, SettingsStore } from "./settings-store-types";

const poolsFlight: SettingsRequestFlight = { value: null };

export type CPASlice = Pick<
  SettingsStore,
  | "pools"
  | "isLoadingPools"
  | "deletingId"
  | "loadingFilesId"
  | "dialogOpen"
  | "editingPool"
  | "formName"
  | "formBaseUrl"
  | "formSecretKey"
  | "showSecret"
  | "isSavingPool"
  | "browserOpen"
  | "browserPool"
  | "remoteFiles"
  | "selectedNames"
  | "fileQuery"
  | "filePage"
  | "pageSize"
  | "isStartingImport"
  | "loadPools"
  | "openAddDialog"
  | "openEditDialog"
  | "setDialogOpen"
  | "setFormName"
  | "setFormBaseUrl"
  | "setFormSecretKey"
  | "setShowSecret"
  | "savePool"
  | "deletePool"
  | "browseFiles"
  | "setBrowserOpen"
  | "toggleFile"
  | "replaceSelectedNames"
  | "setFileQuery"
  | "setFilePage"
  | "setPageSize"
  | "startImport"
>;

export const createCPASlice: StateCreator<SettingsStore, [], [], CPASlice> = (set, get) => ({
  pools: [],
  isLoadingPools: true,
  deletingId: null,
  loadingFilesId: null,

  dialogOpen: false,
  editingPool: null,
  formName: "",
  formBaseUrl: "",
  formSecretKey: "",
  showSecret: false,
  isSavingPool: false,

  browserOpen: false,
  browserPool: null,
  remoteFiles: [],
  selectedNames: [],
  fileQuery: "",
  filePage: 1,
  pageSize: "100" as PageSizeOption,
  isStartingImport: false,

  loadPools: (options: SettingsLoadOptions = {}) => runSettingsRequest(poolsFlight, async (isCurrent) => {
      const { silent = false, signal } = options;
      if (!silent) set({ isLoadingPools: true });
      try {
        const data = await fetchCPAPools({ signal });
        if (!isCurrent()) return;
        set((state) => ({
          pools: data.pools,
          loadedAt: { ...state.loadedAt, pools: Date.now() },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        if (!signal?.aborted && !silent) {
          toast.error(error instanceof Error ? error.message : "加载 CPA 连接失败");
        }
      } finally {
        if (isCurrent() && (!silent || get().isLoadingPools)) set({ isLoadingPools: false });
      }
  }),

  openAddDialog: () => {
    set({
      editingPool: null,
      formName: "",
      formBaseUrl: "",
      formSecretKey: "",
      showSecret: false,
      dialogOpen: true,
    });
  },

  openEditDialog: (pool) => {
    set({
      editingPool: pool,
      formName: pool.name,
      formBaseUrl: pool.base_url,
      formSecretKey: "",
      showSecret: false,
      dialogOpen: true,
    });
  },

  setDialogOpen: (open) => {
    set({ dialogOpen: open });
  },

  setFormName: (value) => {
    set({ formName: value });
  },

  setFormBaseUrl: (value) => {
    set({ formBaseUrl: value });
  },

  setFormSecretKey: (value) => {
    set({ formSecretKey: value });
  },

  setShowSecret: (checked) => {
    set({ showSecret: checked });
  },

  savePool: async () => {
    const { editingPool, formName, formBaseUrl, formSecretKey } = get();
    if (!formBaseUrl.trim()) {
      toast.error("请输入 CPA 地址");
      return;
    }
    if (!editingPool && !formSecretKey.trim()) {
      toast.error("请输入 Secret Key");
      return;
    }

    set({ isSavingPool: true });
    try {
      if (editingPool) {
        const data = await updateCPAPool(editingPool.id, {
          name: formName.trim(),
          base_url: formBaseUrl.trim(),
          secret_key: formSecretKey.trim() || undefined,
        });
        set({ pools: data.pools, dialogOpen: false });
        toast.success("连接已更新");
      } else {
        const data = await createCPAPool({
          name: formName.trim(),
          base_url: formBaseUrl.trim(),
          secret_key: formSecretKey.trim(),
        });
        set({ pools: data.pools, dialogOpen: false });
        toast.success("连接已添加");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      set({ isSavingPool: false });
    }
  },

  deletePool: async (pool) => {
    set({ deletingId: pool.id });
    try {
      const data = await deleteCPAPool(pool.id);
      set({ pools: data.pools });
      toast.success("连接已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      set({ deletingId: null });
    }
  },

  browseFiles: async (pool) => {
    set({ loadingFilesId: pool.id });
    try {
      const data = await fetchCPAPoolFiles(pool.id);
      const files = normalizeFiles(data.files);
      set({
        browserPool: pool,
        remoteFiles: files,
        selectedNames: [],
        fileQuery: "",
        filePage: 1,
        browserOpen: true,
      });
      toast.success(`读取成功，共 ${files.length} 个远程账号`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取远程账号失败");
    } finally {
      set({ loadingFilesId: null });
    }
  },

  setBrowserOpen: (open) => {
    set({ browserOpen: open });
  },

  toggleFile: (name, checked) => {
    set((state) => {
      if (checked) {
        return {
          selectedNames: Array.from(new Set([...state.selectedNames, name])),
        };
      }
      return {
        selectedNames: state.selectedNames.filter((item) => item !== name),
      };
    });
  },

  replaceSelectedNames: (names) => {
    set({ selectedNames: Array.from(new Set(names)) });
  },

  setFileQuery: (value) => {
    set({ fileQuery: value, filePage: 1 });
  },

  setFilePage: (page) => {
    set({ filePage: page });
  },

  setPageSize: (value) => {
    set({ pageSize: value, filePage: 1 });
  },

  startImport: async () => {
    const { browserPool, selectedNames, pools } = get();
    if (!browserPool) {
      return;
    }
    if (selectedNames.length === 0) {
      toast.error("请先选择要导入的账号");
      return;
    }

    set({ isStartingImport: true });
    try {
      const result = await startCPAImport(browserPool.id, selectedNames);
      set({
        pools: pools.map((pool) =>
          pool.id === browserPool.id ? { ...pool, import_job: result.import_job } : pool,
        ),
        browserOpen: false,
      });
      toast.success("导入任务已启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动导入失败");
    } finally {
      set({ isStartingImport: false });
    }
  },
});
