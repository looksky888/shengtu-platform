# 干净部署与净包验收（F-02 / F-12）

对应审计项：发行包不得夹带运行数据；文档与 Compose 端口/版本一致。

## 1. 版本与端口（单一事实）

| 项 | 值 |
|----|-----|
| 版本标记 | `4.5-20260925-ui-workspace` |
| Compose 镜像 | `shengtu:4.5-20260925-ui-workspace` |
| 宿主端口 | `127.0.0.1:3004` → 容器 `80` |
| 配置模板 | `.env.example`（不要提交真实 `.env`） |

R2 媒体配置属于生产密钥，只写入部署环境或设置页，不进入净包。切换到 R2 前先完成设置页连接测试和旧图迁移；迁移不会删除本地回滚副本。

## 2. 打净包（允许列表）

在 `source/` 目录：

```powershell
powershell -File scripts/package-release-allowlist.ps1 -OutDir ..\dist-clean
```

脚本会：

- 只复制允许的源码/模板/文档
- 排除 `.env`、`data/`、`.codex/`、`node_modules/`、`*.db*`、`bootstrap-admin.txt` 等
- 生成 `RELEASE_MANIFEST.txt`（SHA-256）

### 手工抽查禁入项

```powershell
$stage = Get-ChildItem ..\dist-clean -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-ChildItem -Recurse $stage.FullName -Force |
  Where-Object {
    $_.Name -eq '.env' -or
    $_.Name -eq 'bootstrap-admin.txt' -or
    $_.Name -like '*.db' -or
    $_.FullName -match '\\data\\' -or
    $_.FullName -match '\\node_modules\\' -or
    $_.FullName -match '\\.codex\\'
  }
```

应无输出。

## 3. 干净环境从零启动（Compose）

```bash
# 1) 解压净包到空目录
cd /opt/chatgpt2api-clean

# 2) 配置
cp .env.example .env
# 编辑 .env：至少填写 INTERNAL_SERVICE_TOKEN；再配置管理员密码、代理、存储等
# INTERNAL_SERVICE_TOKEN 可用 `openssl rand -hex 32` 生成

# 3) 启动
docker compose up -d --build

# 4) 访问
# http://127.0.0.1:3004

# 5) 首次管理员密码
# 若未设置 CHATGPT2API_ADMIN_PASSWORD，查看：
cat ./data/bootstrap-admin.txt
# 登录后立即改密；改密成功后该文件会自动删除
```

本地开发数据目录可用变量覆盖：

```bash
# docker-compose.local.yml
export COMPOSE_DATA_DIR=./data
docker compose -f docker-compose.local.yml up -d --build
```

## 4. 测试隔离验收（F-01）

```powershell
# 在 source/ 下；默认 count=3，监视 .env 与 data/
powershell -File scripts/verify-test-isolation.ps1 -Count 3

# 更严格（耗时）：
powershell -File scripts/verify-test-isolation.ps1 -Count 20
```

要求：测试前后 `.env` 与 `data/` 指纹不变。

## 5. 运维对照

- 更细的生产运维：`docs/SHENGTU_3X_OPS.md`
- 审计进度：`docs/AUDIT_FIX_PROGRESS_2026-07-15.md`
