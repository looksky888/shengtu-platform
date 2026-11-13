# grok-runtime vendored upstream 本地补丁清单

对应 `UPSTREAM_PATCH_BOUNDARY.md` 第 18-23 行的要求（"修改前记录上游文件和行为，修改后运行对应 pytest"）。
本文件只做记录，**不改动 `upstream/` 代码**。

## 快照基线

- `upstream-manifest.json`：`source=gptGrok2api-main`、`source_version=1.2.1-go`、`snapshot_date=2026-09-06`、`file_count=246`、`content_sha256=b92775562805f663191bf601b95556869e8259e0af441140e7cb95bb983f78b0`。
- 当前工作树实测：`upstream/` 裁剪已废弃的自动注册机模块后共 246 个有效文件（排除 `__pycache__`、`.pytest_cache`、`*.pyc` 与 `node_modules`）。

## 补丁

### P1 保留兼容适配文件 `upstream/services/shengtu_pool_sync.py`

- 文件：`upstream/services/shengtu_pool_sync.py`（91 行，shengtu 新增，上游无此文件）
- 改动要点：`sync_openai_tokens()` 把 access_token 批量 POST 到
  `{SHENGTU_BASE_URL:-http://app}/internal/v1/accounts/import`，请求头带 `X-Internal-Token`；
  所有 HTTP/解析异常都收敛为 `{"ok": False, ...}` 返回值，**不向上抛**。
- 现状说明：原自动注册机模块及对应调用点已在无头注册裁剪中移除；本模块当前无运行期调用点。

### P2 `upstream/api/__init__.py`（整文件替换为 slim 版本，7 行）

- 改动要点：`try: from api.app import create_app`，`except ImportError` 时提供
  `def create_app(*_a, **_k): raise RuntimeError("api.app is not available in shengtu grok-runtime slim package")`。
- 原因（接口缺口）：vendored 快照按需裁剪，完整 FastAPI 应用 `api/app.py` 不在树内；
  但 `api` 是包，`from api import grok` 会先执行 `api/__init__.py`。若此处不兜底，
  `runtime/main.py`、`runtime/video_api.py`、`upstream/services/grok_runtime.py` 的导入全部失败，
  整个逆向栈不可用（`/health` 的 `image_generations` 会恒为 false）。
- 验证方式：`upstream/api/grok_test.py` 以及 `runtime/test_main_routes.py`、`runtime/test_provider_media_routes.py` 都执行 `from api import grok`。

### P3 `upstream/services/xai_device_oauth_protocol.py` 与 `upstream/services/xai_cli_oauth_service.py`（无头协议入口同步拦截）

- 改动要点：`XaiDeviceOAuthProtocol.authorize` 在裁剪无头注册协议后固定抛出 `XaiDeviceOAuthProtocolError("Headless Grok registration protocol is unavailable")`；`XaiCliOAuthService.start_protocol_authorization` 与 `start_protocol_authorization_background` 同步抛出 `ValidationError`，不再创建注定失败的后台任务或线程。
- 验证方式：`upstream/services/xai_cli_oauth_service_test.py` 直接断言同步抛错且不产生后台任务/线程。

### P4 `upstream/utils/ssl_cert_fix.py:20-70`（去掉机器专属绝对路径）

- 改动要点：删除模块常量 `_DEFAULT_ASCII_CERT_DIR`（原开发者机器上的固定盘符路径），新增 `_default_ascii_cert_dir()`：按 `LOCALAPPDATA` → `XDG_CACHE_HOME` → `TMPDIR/TEMP/TMP` 顺序取第一个 ASCII 路径，回落 `~/.cache/gptgrok2api-certs`。
- 原因：避免在 Linux 容器内把带反斜杠的字符串当成相对路径创建异常目录。
- 验证方式：`python -m compileall -q services/grok-runtime/upstream/utils/ssl_cert_fix.py` 通过。

## `upstream-manifest.json` 校验算法

1. 枚举 `services/grok-runtime/upstream/` 下全部常规文件，排除 `__pycache__`、`.pytest_cache`、`node_modules` 及 `*.pyc`；
2. 每个文件取 `sha256(file_bytes)` 十六进制摘要；键为相对 `upstream/` 的 POSIX 路径（`/` 分隔）；
3. 按路径字典序排序，UTF-8 拼接 `f"{relpath}\0{digest}\n"`；
4. 对拼接结果取 `sha256` 十六进制即 `content_sha256`；`file_count` 取同一集合的文件数。
