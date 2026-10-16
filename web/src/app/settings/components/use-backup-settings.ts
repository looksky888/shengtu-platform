"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
	fetchBackupConfig,
	fetchBackupRunStatus,
	runBackup,
	updateBackupConfig,
	type BackupConfig,
	type BackupState,
} from "@/lib/api";
import { usePageVisible } from "@/lib/use-page-visible";

export function defaultBackupConfig(): BackupConfig {
	return {
		enabled: false,
		provider: "local",
		local_dir: "data/backups",
		interval_minutes: 1440,
		include: ["config", "data", "images"],
		last_max_files: 20,
		r2_account_id: "",
		r2_access_key_id: "",
		r2_secret_access_key: "",
		r2_bucket: "",
		r2_prefix: "shengtu-backups",
	};
}

const idleState: BackupState = { status: "idle" };

export function formatBackupSize(value?: number) {
	const size = Number(value || 0);
	if (size <= 0) return "—";
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function backupStatusText(state: BackupState) {
	const phases: Record<string, string> = {
		queued: "等待执行",
		collecting: "收集文件",
		snapshotting: "创建数据库快照",
		archiving: "生成 ZIP",
		uploading: "上传 R2",
		finalizing: "清理旧备份",
	};
	if (state.status === "running") return `备份中${state.phase ? `（${phases[state.phase] || state.phase}）` : ""}`;
	if (state.status === "success") return "最近备份成功";
	if (state.status === "failed") return "最近备份失败";
	return "尚未运行";
}

export function useBackupSettings() {
	const [config, setConfig] = useState<BackupConfig>(defaultBackupConfig);
	const [state, setState] = useState<BackupState>(idleState);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const pageVisible = usePageVisible();

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			try {
				const data = await fetchBackupConfig({ signal: controller.signal });
				setConfig({ ...defaultBackupConfig(), ...data.config });
				setState(data.state || idleState);
			} catch (error) {
				if (!controller.signal.aborted) {
					toast.error(error instanceof Error ? error.message : "加载备份配置失败");
				}
			} finally {
				if (!controller.signal.aborted) setIsLoading(false);
			}
		})();
		return () => controller.abort();
	}, []);

	useEffect(() => {
		if (state.status !== "running" || !pageVisible) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		let reportedError = false;
		const controller = new AbortController();
		const poll = async () => {
			try {
				const data = await fetchBackupRunStatus({ signal: controller.signal });
				if (stopped) return;
				reportedError = false;
				setState(data.state);
				if (data.state.status === "success") toast.success("备份已完成");
				else if (data.state.status === "failed") toast.error(data.state.last_error || "备份失败");
				else timer = setTimeout(poll, 2000);
			} catch (error) {
				if (stopped || controller.signal.aborted) return;
				if (!reportedError) {
					toast.error(error instanceof Error ? error.message : "查询备份状态失败");
					reportedError = true;
				}
				timer = setTimeout(poll, 5000);
			}
		};
		timer = setTimeout(poll, 1000);
		return () => {
			stopped = true;
			controller.abort();
			if (timer) clearTimeout(timer);
		};
	}, [pageVisible, state.status]);

	const updateInclude = (value: string, checked: boolean) => {
		setConfig((current) => {
			const values = new Set(current.include || []);
			if (checked) values.add(value);
			else values.delete(value);
			return { ...current, include: Array.from(values) };
		});
	};

	const save = async () => {
		setIsSaving(true);
		try {
			const data = await updateBackupConfig(config);
			setConfig({ ...defaultBackupConfig(), ...data.config });
			setState(data.state || idleState);
			toast.success("备份配置已保存");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存备份配置失败");
		} finally {
			setIsSaving(false);
		}
	};

	const run = async () => {
		setIsStarting(true);
		try {
			const data = await runBackup();
			setState(data.state);
			if (data.error) toast.error(data.error);
			else toast.info(data.started ? "备份任务已启动" : "备份任务正在运行");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "启动备份失败");
		} finally {
			setIsStarting(false);
		}
	};

	return {
		config,
		setConfig,
		state,
		isLoading,
		isSaving,
		isRunning: isStarting || state.status === "running",
		updateInclude,
		save,
		run,
	};
}
