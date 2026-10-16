# P0 → P1 → P2 历史修复计划（shengtu 3.x）

原则：最小改动、有测试再合并、不改变对外 API 契约（可扩展字段）、每步可回滚。

## P0（数据正确性 / 部署安全）

| ID | 项 | 方案 | 验收 |
|----|----|------|------|
| P0-1 | 积分加载失败可写穿 | `storeReady`：缺文件=空库就绪；读/解析失败=拒绝一切 save | 单测：load 失败后 Add/Deduct 拒绝且磁盘不被空覆盖 |
| P0-2 | state/ledger 双写顺序 | 先写 ledger 再写 core；加载时用末条 ledger 对账 balance | 单测：模拟 core 写失败后不丢幂等；重启余额与 ledger 一致 |
| P0-3 | 多实例不安全 | 文档明确单写节点；`/health` 增加 `deployment.single_writer_required` + store 就绪位 | 文档+health 字段；不假装做分布式锁 |

## P1（稳定性 / 钱与号 / 运维）

| ID | 项 | 方案 | 验收 |
|----|----|------|------|
| P1-1 | 隔离舱写失败吞掉 | `appendQuarantine` 返回 error；失败则不删号或回滚入池 | 单测：save 失败账号仍在池或可恢复 |
| P1-2 | n>1 部分成功全额退 | 按成功张数比例/逐张计费退剩余 | 单测或逻辑单测：1/2 成功只退一半 |
| P1-3 | 探活硬顶 6 | 提高到可配置默认 12，或「至少扫完一圈可用候选」 | 单测/常量注释 |
| P1-4 | health 过绿 | `status=degraded` 当号池/积分 store 未就绪 | 单测 health payload |
| P1-5 | `.env` 非原子写 | 改用 `AtomicWriteFile` | 单测或复用 storage 测试 |
| P1-6 | 退款失败仅日志 | 结构化 warning + 可选内存 pending 计数进 admin health | 日志字段完整；不阻塞主路径 |
| P1-7 | XFF 可伪造 | 仅在配置了 trusted proxy / 部署在反向代理后才信 XFF；默认用 RemoteAddr | 单测 authClientIP |
| P1-8 | 处置文档漂移 | 更新 `ACCOUNT_DISPOSAL.md` temporary→隔离舱 | 文档与代码一致 |
| P1-9 | Shutdown 10s | 可配置 `CHATGPT2API_SHUTDOWN_TIMEOUT_SECONDS`，默认 120 | main 读 env |

## P2（性能 / 体验债，低风险优先）

| ID | 项 | 方案 | 验收 |
|----|----|------|------|
| P2-1 | 任务 save 吞错 | 终端态 save 失败打 Error 日志；dirty 保留重试 | 不静默丢终端态 |
| P2-2 | ledger 幂等 O(n) | 内存 `refIndex map[user|reason|ref]→idx` | DeductOnce 热路径 O(1) |
| P2-3 | Paid 分辨率文案 | 修正「1080P 一律 Paid」误导 | 文案正确 |
| P2-4 | 其余（整文件任务、Arkose、指纹） | **记录不改** 或仅文档 | 避免大重构引入风险 |

## 执行顺序

1. P0-1 → P0-2 → 积分相关测试  
2. P0-3 health/docs  
3. P1-1 … P1-9 逐项 + 定向测试  
4. P2-1 … P2-3  
5. `go test` 相关包全量回归  

## 完成状态（2026-07-13）

| ID | 状态 |
|----|------|
| P0-1 storeReady | ✅ |
| P0-2 ledger 先写 + 对账 + 失败回滚 | ✅ |
| P0-3 health/docs 单写 | ✅ |
| P1-1 隔离舱写失败回池 | ✅ |
| P1-2 部分退款 | ✅ |
| P1-3 探活 12 | ✅ |
| P1-4 health degraded | ✅ |
| P1-5 .env 原子写 | ✅ |
| P1-6 退款失败日志字段 | ✅ |
| P1-7 TRUST_PROXY_HEADERS | ✅ |
| P1-8 文档 | ✅ |
| P1-9 shutdown 可配 | ✅ |
| P2-1 任务 save 失败 dirty 重试 + log | ✅ |
| P2-2 ledger 幂等索引 | ✅ |
| P2-3 Paid 文案 | ✅ |
| P2-4 大项 | 明确不做 |

回归：`go test ./internal/service/ ./internal/httpapi/ ./internal/config/ ./internal/protocol/` 通过。

## 明确不做（本轮）

- 分布式锁 / 多副本号池  
- 重写任务存储为分片  
- 实现 Arkose  
- 改对外 REST 破坏性字段名  
