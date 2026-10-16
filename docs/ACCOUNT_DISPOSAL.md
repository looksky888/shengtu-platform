# 号池账号处置状态机

生图抢号 / 上游 stream / 批量刷新 统一走：

`ClassifyAccountFailure(event, message)` → `disposeAccount(...)`

设置项 **「自动移除异常账号」**（`auto_remove_invalid_accounts`）控制永久失效是否**物理删除**。

---

## 分级（DisposalGrade）

| 等级 | 含义 | 典型触发 | 动作 |
|------|------|----------|------|
| `none` | 忽略 | bootstrap 失败、stream 瞬时 401 | 不改账号 |
| `permanent` | 永久失效 | `token_invalidated` / 显式 revoked；acquire 路径 401 | 见下 |
| `temporary` | 暂时不可用 | 限流、Cloudflare challenge、额度耗尽 | **移出号池并写入隔离舱**（可自动/手动恢复）；写入隔离舱失败时回池并回退为「限流」+ 冷却 |
| `unknown` | 未知软失败 | 超时、5xx、连接重置 | 冷却；累计 ≥3 次且开启自动移除 → 删除+隔离 |

### permanent 硬删除条件

```
shouldHardDelete = AutoRemoveInvalidAccounts == true
```

| 开关 | 结果 |
|------|------|
| **开** | 从号池删除 + 写入隔离舱（可恢复） |
| **关** | 仅标 `status=异常`、`quota=0`（`IsImageAccountAvailable` 为 false，不再被选中） |

---

## 状态流转（示意）

```text
                    ┌─────────────┐
                    │   正常      │
                    │ (可生图)    │
                    └──────┬──────┘
           抢号/探活/stream│错误
           ┌───────────────┼────────────────┐
           ▼               ▼                ▼
     ┌──────────┐   ┌──────────┐     ┌──────────┐
     │ temporary│   │ 异常     │     │ permanent│
     │→隔离舱   │   │(自动移除关)│     │→隔离舱   │
     └────┬─────┘   └──────────┘     └────▲─────┘
          │ 自动探活恢复 / 手动恢复         │ 自动移除开
          └──────────► 正常               │ 或 unknown×3
     隔离舱 ──恢复──► 重新导入号池 ────────┘
```

### 事件来源

| event | 入口 |
|-------|------|
| `image_acquire` | `GetAvailableAccessTokenFor` 探活失败 |
| `image_stream` | 上游生图失败 `ApplyAccountError` |
| `refresh_account_state` / `refresh_accounts` | 刷新号池 |

### 账户锁（与处置独立）

```text
reserve → imageReservations[token]++
        → lease until = now + max(15m, taskTimeout+5m)
使用中 → RenewImageLease（stream 开跑时）
结束   → MarkImageResult → release slot；slot=0 清 lease
僵尸   → reclaim：仅 lease 过期的 reservation 清空
```

---

## 运维建议

1. 生产建议打开 **自动移除异常账号**，配合任务中心「隔离舱」审计/恢复。  
2. 调试时可关闭自动移除，观察「异常」账号而不丢 token。  
3. 限流账号另有开关 **自动移除限流账号**（`UpdateAccount` 路径）。  
4. 多实例部署：内存锁与本地 quarantine/outlook 状态文件**不共享**，请单写节点或外置存储。

---

## 相关代码

| 文件 | 职责 |
|------|------|
| `account_disposal.go` | 分级、隔离舱、dispose |
| `account_error.go` | ApplyAccountError 统一入口 |
| `account_reservation.go` | 抢号锁 / 调度策略 |
| `account_ops.go` | Lease TTL / PoolHealth |
| 设置页 | 单账号并发、调度策略、自动移除开关 |
