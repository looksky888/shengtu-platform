import { Link } from "react-router-dom";

import { AdminStatusBadge } from "@/components/admin";
import type { AccountPoolHealth, CreationTask, QuarantineItem } from "@/lib/api";
import type { ImageChannel, ImageChannelModel } from "@/lib/image-channel-api";

export type OverviewTab = "models" | "pool" | "errors" | "pricing";

export type ModelAnalyticsRow = {
  model: string;
  kind: "视频" | "生图";
  total: number;
  succeeded: number;
  failed: number;
  durationSum: number;
  durationCount: number;
};

type OverviewTabPanelsProps = {
  activeTab: OverviewTab;
  modelAnalyticsRows: ModelAnalyticsRow[];
  poolHealth: AccountPoolHealth | null;
  quarantineCount: number;
  grokTotal: number;
  grokAvailable: number;
  errorTasks: CreationTask[];
  channelModels: Array<{ channel: ImageChannel; model: ImageChannelModel }>;
};

export function OverviewTabPanels({
  activeTab,
  modelAnalyticsRows,
  poolHealth,
  quarantineCount,
  grokTotal,
  grokAvailable,
  errorTasks,
  channelModels,
}: OverviewTabPanelsProps) {
  if (activeTab === "models") {
    return (
      <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <table className="admin-table">
          <thead>
            <tr>
              <th>模型标识</th>
              <th>能力类型</th>
              <th>请求量</th>
              <th>成功交付</th>
              <th>失败/拦截</th>
              <th>成功率</th>
              <th>平均耗时</th>
            </tr>
          </thead>
          <tbody>
            {modelAnalyticsRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--admin-text-muted)]">
                  当前筛选范围内暂无模型调用样本
                </td>
              </tr>
            ) : (
              modelAnalyticsRows.map((row) => {
                const rate =
                  row.total > 0 ? ((row.succeeded / row.total) * 100).toFixed(1) : "100.0";
                const avg =
                  row.durationCount > 0
                    ? `${(row.durationSum / row.durationCount).toFixed(1)}s`
                    : "—";
                return (
                  <tr key={row.model}>
                    <td className="font-mono font-medium">{row.model}</td>
                    <td>
                      <AdminStatusBadge tone={row.kind === "视频" ? "info" : "neutral"}>
                        {row.kind}
                      </AdminStatusBadge>
                    </td>
                    <td className="font-mono tabular-nums">{row.total}</td>
                    <td className="font-mono tabular-nums text-[var(--admin-success)]">
                      {row.succeeded}
                    </td>
                    <td className="font-mono tabular-nums text-[var(--admin-warning)]">
                      {row.failed}
                    </td>
                    <td className="font-mono tabular-nums">{rate}%</td>
                    <td className="font-mono tabular-nums text-[var(--admin-text-muted)]">
                      {avg}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (activeTab === "pool") {
    return (
      <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <table className="admin-table">
          <thead>
            <tr>
              <th>号池维度</th>
              <th>总容量</th>
              <th>可用在线</th>
              <th>冷却 / 限流</th>
              <th>异常 / 隔离</th>
              <th>空闲并发槽位</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-medium">ChatGPT 本地生图号池</td>
              <td className="font-mono tabular-nums">{poolHealth?.total ?? 0}</td>
              <td className="font-mono tabular-nums text-[var(--admin-success)]">
                {poolHealth?.available ?? 0}
              </td>
              <td className="font-mono tabular-nums text-[var(--admin-warning)]">
                {(poolHealth?.cooling ?? 0) + (poolHealth?.rate_limited ?? 0)}
              </td>
              <td className="font-mono tabular-nums text-[var(--admin-danger)]">
                {(poolHealth?.invalid ?? 0) + quarantineCount}
              </td>
              <td className="font-mono tabular-nums">{poolHealth?.free_slots ?? "—"}</td>
              <td>
                <Link
                  to="/admin/accounts"
                  className="text-[12px] font-medium text-[var(--admin-text)] underline-offset-4 hover:underline"
                >
                  进入号池 →
                </Link>
              </td>
            </tr>
            <tr>
              <td className="font-medium">Grok 实时供给号池</td>
              <td className="font-mono tabular-nums">{grokTotal}</td>
              <td className="font-mono tabular-nums text-[var(--admin-success)]">
                {grokAvailable}
              </td>
              <td className="font-mono tabular-nums text-[var(--admin-warning)]">0</td>
              <td className="font-mono tabular-nums text-[var(--admin-danger)]">
                {Math.max(0, grokTotal - grokAvailable)}
              </td>
              <td className="font-mono tabular-nums">—</td>
              <td>
                <Link
                  to="/admin/accounts?platform=grok"
                  className="text-[12px] font-medium text-[var(--admin-text)] underline-offset-4 hover:underline"
                >
                  管理 Grok →
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (activeTab === "errors") {
    return (
      <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <table className="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>任务 ID</th>
              <th>模型 / 渠道</th>
              <th>HTTP / 错误码</th>
              <th>异常摘要</th>
              <th>追踪</th>
            </tr>
          </thead>
          <tbody>
            {errorTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--admin-text-muted)]">
                  当前统计周期内无失败或拦截任务
                </td>
              </tr>
            ) : (
              errorTasks.map((task) => (
                <tr key={task.id}>
                  <td className="font-mono text-[12px] text-[var(--admin-text-muted)]">
                    {task.created_at.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="font-mono text-[12px]">{task.id.slice(0, 12)}</td>
                  <td className="font-mono text-[12px]">
                    {task.effective_model || task.model || "—"}
                  </td>
                  <td className="font-mono text-[12px] text-[var(--admin-warning)]">
                    {task.upstream_http_status || task.error_code || "ERR"}
                  </td>
                  <td
                    className="max-w-[360px] truncate text-[12px] text-[var(--admin-danger)]"
                    title={task.error}
                  >
                    {task.error || "未知上游异常"}
                  </td>
                  <td>
                    <Link
                      to="/admin/logs?tab=tasks&view=history"
                      className="text-[12px] text-[var(--admin-text)] underline-offset-4 hover:underline"
                    >
                      排错详情
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
      <table className="admin-table">
        <thead>
          <tr>
            <th>所属渠道</th>
            <th>展示名称</th>
            <th>上游模型 ID</th>
            <th>阶梯积分定价 (1K / 2K / 4K)</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {channelModels.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-[var(--admin-text-muted)]">
                暂无已配置渠道模型
              </td>
            </tr>
          ) : (
            channelModels.map(({ channel, model }) => {
              const costs = model.credit_costs || {};
              const tierText =
                Object.keys(costs).length > 0
                  ? Object.entries(costs)
                      .map(([k, v]) => `${k.toUpperCase()}: ${v} 积分`)
                      .join(" · ")
                  : `${model.credit_cost} 积分 / 次`;
              return (
                <tr key={`${channel.id}-${model.id}`}>
                  <td className="font-medium">{channel.name}</td>
                  <td>{model.display_name || model.upstream_model}</td>
                  <td className="font-mono text-[12px] text-[var(--admin-text-muted)]">
                    {model.upstream_model}
                  </td>
                  <td className="font-mono text-[12px] tabular-nums">{tierText}</td>
                  <td>
                    <AdminStatusBadge tone={model.enabled ? "success" : "neutral"}>
                      {model.enabled ? "启用中" : "已停用"}
                    </AdminStatusBadge>
                  </td>
                  <td>
                    <Link
                      to={`/admin/channels?channel=${encodeURIComponent(channel.id)}`}
                      className="text-[12px] text-[var(--admin-text)] underline-offset-4 hover:underline"
                    >
                      调整单价 →
                    </Link>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export type { QuarantineItem };
