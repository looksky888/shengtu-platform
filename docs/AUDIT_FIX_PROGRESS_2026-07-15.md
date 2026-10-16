# 审计整改进度（2026-07-15）

对照：`代码审计报告_2026-07-15.md` + `代码优化实施方案_2026-07-15.md`

## 本轮已完成

| 编号 | 等级 | 状态 | 说明 |
|------|------|------|------|
| F-01 | P0 | 基本完成 | `newTestApp`/`newTestConfigStore` 隔离 + 登录限流重置 + 登录页 env 清理；`scripts/verify-test-isolation.ps1` 校验 `.env`/`data` 指纹；proxy e2e 全用 helper |
| F-02 / F-13 | P0/P2 | 基本完成 | 允许列表打包脚本 + 已打样例净包无禁入路径；含 `RELEASE_MANIFEST.txt` |
| F-03 | P1 | 完成 | 任务继承 rootCtx、WaitGroup、`ImageTaskService.Close`、`App.Close` 先等任务 |
| F-04 | P1 | 完成 | `SaveImageBytes*` 返回 error；原子 tmp+rename；元数据失败回滚图片；Format 传播错误 |
| F-05 | P1 | 本轮完成 | 用户/Key、公告、收藏、账号增删改：保存失败回滚内存并返回 error；handler 返回 5xx；任务首次 save 此前已处理 |
| F-06 | P1 | 完成 | `readJSONMapOr400`；26 处忽略错误已替换；Outlook pool 禁止缺省 `scope=all` |
| F-08 | P1 | 完成 | 改密成功删除 `bootstrap-admin.txt`；启动告警遗留文件；README 改为一口读文件说明 |
| F-11 | P2 | 完成 | lint 0 error 0 warning（prefer-const + hooks deps） |
| F-12 | P2 | 基本完成 | README 版本/端口/bootstrap；`docs/CLEAN_DEPLOY.md` 干净部署与净包验收步骤 |
| F-14 | P3 | 完成 | 悬浮球双层 timeout 均可清理 + mounted 保护 |

## 本轮追加：F-09 图库索引分页

| 编号 | 状态 | 说明 |
|------|------|------|
| F-09 | 完成 | 持久化 `image_gallery_index`；`ListImagesQuery` 支持 `limit/cursor/updated_after`；保存/删除/可见性同步索引；前端首屏分页 + 滚动续页 + 增量刷新；后台标签页暂停自动刷新 |

## 本轮追加：F-10 大文件拆分（部分）

| 原文件 | 拆分结果 |
|--------|----------|
| `auth_helpers.go` (~846 行) | `auth_storage.go` / `auth_credential_factory.go` / `auth_user_projection.go` / `auth_role_helpers.go` |
| `routes_profile.go` (~569 行) | `routes_user_keys.go` / `routes_profile_core.go` / `routes_profile_credits.go` / `routes_profile_api_key.go` / `routes_profile_favorites.go` |
| `studio-stats-fab.tsx` (~558 行) | `use-studio-stats-fab.ts` + `studio-stats-fab-parts.tsx` + 瘦容器 `studio-stats-fab.tsx` |

### F-10 续：account + hero

| 原文件 | 拆分结果 |
|--------|----------|
| `account.go` 主文件 | 保留类型/`NewAccountService`；抽出 `account_repository.go` / `account_crud.go` / `account_scheduler.go` / `account_refresh.go` |
| `hero-sphere-canvas.tsx` | `hero-sphere-types.ts` + `hero-sphere-math.ts` + `hero-sphere-draw.ts` + 瘦容器 canvas |

## 收尾批次（F-01 / F-02 / F-12）

| 项 | 状态 |
|----|------|
| 测试隔离脚本 | `scripts/verify-test-isolation.ps1`（默认 count=2；httpapi 已稳定） |
| 净包 | `scripts/package-release-allowlist.ps1` → `dist-clean/chatgpt2api-3.4-*-clean-*` |
| 干净部署文档 | `docs/CLEAN_DEPLOY.md` |

## 仍可选

| 编号 | 说明 |
|------|------|
| F-10 余量 | 其它超限文件（config_normalize、image_task_runner 等） |
| F-01 严格 | 夜间 CI `count=20`（本机可用 `-Count 20`） |
| F-02 人工 | 旧发行目录仍可能含 data；交付只用 dist-clean |
| F-12 人工 | 在空机器按 CLEAN_DEPLOY 实跑一遍 Compose |

## 验证快照

- `go test ./internal/protocol ./internal/service` 通过
- `go build ./cmd/chatgpt2api` 通过
- `TestGrokProxyGenerationDownloadsAuthedMedia` 通过（TempDir 隔离）
- `npm run lint` 0 error / 0 warning
- `tsc -b` 通过
