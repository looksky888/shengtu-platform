# grok-runtime vendored upstream 本地补丁清单

对应 `UPSTREAM_PATCH_BOUNDARY.md` 第 18-23 行的要求（"修改前记录上游文件和行为，修改后运行对应 pytest"）。
本文件只做记录，**不改动 `upstream/` 代码**。

## 快照基线

- `upstream-manifest.json`：`source=gptGrok2api-main`、`source_version=1.2.1-go`、`snapshot_date=2026-09-06`、`file_count=328`。
- 当前工作树实测：`upstream/` 共 439 个文件，其中 293 个 `.py`（均排除 `upstream/services/register/node_modules`）。
- 仓库内没有上游原始副本，因此下面记录的是"在当前树中可直接验证的本地痕迹"；除 `upstream/api/grok_oauth.py` 外均不影响结论。
  （核对方式：`grep -i shengtu` 遍历 `upstream/**/*.py`，命中集合即为下列文件。）

## 补丁

### P1 新增 `upstream/services/shengtu_pool_sync.py`

- 文件：`upstream/services/shengtu_pool_sync.py`（91 行，shengtu 新增，上游无此文件）
- 改动要点：`sync_openai_tokens()` 把 access_token 批量 POST 到
  `{SHENGTU_BASE_URL:-http://app}/internal/v1/accounts/import`，请求头带 `X-Internal-Token`，
  body 为 `{"tokens": [...], "source": ..., "refresh": bool}`；`sync_openai_account_item()`
  从注册结果字典里取 `access_token`/`accessToken`。开关来自
  `SHENGTU_POOL_SYNC_ENABLED`（未设置时"有 INTERNAL_SERVICE_TOKEN 即启用"）、
  `SHENGTU_POOL_SYNC_REFRESH`（默认 true）、`SHENGTU_BASE_URL`（默认 `http://app`）。
  所有 HTTP/解析异常都收敛为 `{"ok": False, ...}` 返回值，**不向上抛**（第 45-51、70-83 行）。
- 原因（shengtu 与 upstream 的接口缺口）：Go 主站 3.5 起要求注册产物进入主站号池
  （`internal/httpapi/internal_accounts.go` 的 `/internal/v1/accounts/import`，仅 `X-Internal-Token` 鉴权），
  上游 gptGrok2api 没有对应出口。
- 验证方式：**没有同模块定向测试**（见"未覆盖项"）。间接执行覆盖：
  `upstream/services/register/openai_register_test.py:358 test_worker_defaults_to_traditional_chatgpt_registrar`
  会走到 P2 的调用点；测试环境未设置 `INTERNAL_SERVICE_TOKEN`，因此 `_enabled()` 为假并返回 `skipped`，不发起 HTTP。
- 同步策略：上游若提供等价导入出口则整文件删除（不保留双路径）。

### P2 `upstream/services/register/openai_register.py:2918-2932`

- 改动要点：`worker()` 内、`account_service.add_account_items([result])`（2917 行）之后插入 3.5 号池同步：
  局部导入 `from services.shengtu_pool_sync import sync_openai_account_item`，调用
  `sync_openai_account_item(result, source="register-openai")`；`ok` 时 `step(..., "green")`，
  非 `skipped` 的失败记 `yellow`；整段由 `try/except Exception`（`# noqa: BLE001 — never fail registration on pool sync`）包裹。
- 原因（功能衔接）：注册机产出的账号要自动进入生图号池；同步是附加步骤，不能把注册流程变成失败。
- 验证方式：执行覆盖同上（`openai_register_test.py:358`），但成功/失败分支 **没有断言**。
- 同步策略：上游若自带号池回调，直接删除这段。

### P3 `upstream/api/__init__.py`（整文件替换为 slim 版本，7 行）

- 改动要点：`try: from api.app import create_app`，`except ImportError` 时提供
  `def create_app(*_a, **_k): raise RuntimeError("api.app is not available in shengtu grok-runtime slim package")`。
- 原因（接口缺口）：vendored 快照按需裁剪，完整 FastAPI 应用 `api/app.py` 不在树内；
  但 `api` 是包，`from api import grok` 会先执行 `api/__init__.py`。若此处不兜底，
  `runtime/main.py`、`runtime/video_api.py`、`upstream/services/grok_runtime.py` 的导入全部失败，
  整个逆向栈不可用（`/health` 的 `image_generations` 会恒为 false）。
- 验证方式：间接且充分——`upstream/api/grok_test.py:5` 以及
  `runtime/test_main_routes.py`、`runtime/test_provider_media_routes.py` 都执行 `from api import grok`。
  没有直接断言 stub 抛错。
- 同步策略：上游包结构不变就保留。

### P4 `upstream/api/grok_oauth.py:1-6`（文件头 docstring）

- 改动要点：文件头 docstring 说明 shengtu 部署下的首选入口是 `runtime.oauth_bridge`（`X-Internal-Token` 鉴权），
  本模块保留上游的 Bearer-admin router 仅作 gptGrok2api parity 与直连调试。
- 原因：避免运维误用未经 Go 网关保护的 admin router。路由实现与鉴权依赖（`api.support.require_admin`）在本文件内未改动。
- 验证方式：`runtime/oauth_bridge.py` 是与本 router 对应的 shengtu 适配层（已挂 `require_internal`）；
  本文件当前无定向测试，改动仅限文档字符串。
- 置信度：仓库内无上游原文可比对；`grep -i shengtu upstream/**/*.py` 在本文件只命中第 3 行 docstring，
  未发现其他本地痕迹。

### P5 `upstream/utils/ssl_cert_fix.py:20-70`（去掉机器专属绝对路径）

- 改动要点：删除模块常量 `_DEFAULT_ASCII_CERT_DIR = r"D:\BaiduNetdiskDownload\gptgrok2api-certs"`
  （原开发者机器上的路径），新增 `_default_ascii_cert_dir()`：按 `LOCALAPPDATA` → `XDG_CACHE_HOME` →
  `TMPDIR/TEMP/TMP` 顺序取第一个 ASCII 路径，回落 `~/.cache/gptgrok2api-certs`；两处引用（默认值分支与
  "默认值仍非 ASCII"兜底分支）改为调用它。
- 原因：这是**可复现的缺陷**而非风格问题。原默认值是 Windows 绝对路径，在 Linux 上 `Path(...)` 会把
  `D:\BaiduNetdiskDownload\...` 当成带反斜杠的**相对路径**，`mkdir(parents=True)` 会在进程工作目录下
  创建怪目录；而外层 `except Exception: return None` 会把失败静默吞掉，表现为"证书路径问题查不出来"。
- 验证方式：`python -m compileall -q services/grok-runtime/upstream/utils/ssl_cert_fix.py` 通过；
  行为差异仅在"certifi 路径非 ASCII 且未设 `GPTGROK_CERT_DIR`/`CHATGPT2API_CERT_DIR`"时，
  证书副本落点从 D 盘固定路径变为用户缓存目录（副本本身可重新生成，无数据风险）。
- 已知边界：`ensure_ascii_ssl_cert()` 在本快照内**没有任何调用点**（全仓 grep 仅命中定义），
  因此按 `UPSTREAM_PATCH_BOUNDARY.md:21`"无可测边界时不得修改"的要求，本次**未新增**定向测试，
  仅记录于此。若后续上游调用它，应按边界规则补同模块测试。

## `upstream-manifest.json` 的 `content_sha256` 目前不可验证

- **没有生成或校验入口**：全仓库（2221 个文件，含隐藏目录，排除 `node_modules` 与 >2MB 文件）检索
  `content_sha256|upstream-manifest`，唯一命中是 `upstream-manifest.json:6` 自身；无脚本、无 CI、无 pytest 引用。
- **数值本身也对不上**：清单记 `file_count: 328`，当前树 439 文件 / 293 `.py`；即便算法正确，
  P1-P4 的本地补丁也会改变内容摘要。因此现在落地一个严格校验脚本必然是失败的。
- **最小校验方案（本文件只描述算法，不实现）**，建议落到 `scripts/verify-upstream-manifest.py`：
  1. 枚举 `services/grok-runtime/upstream/` 下全部文件，排除 `services/register/node_modules/**`；
  2. 每个文件取 `sha256(file_bytes)`；键为相对 `upstream/` 的 POSIX 路径（`/` 分隔）；
  3. 按路径字典序排序，UTF-8 拼接 `f"{relpath}\0{digest}\n"`；
  4. 对拼接结果取 `sha256` 十六进制即 `content_sha256`；`file_count` 取同一集合的文件数；
  5. 校验时重算比对。**先决条件**：该字段必须先在"无本地补丁"的基线上重新生成
     （或在此脚本内把 P1-P4 列入显式白名单后重算），否则只要有本地补丁就必然不匹配——这正是本次不实现脚本的原因。
  6. 执行位置放在发布/CI 步骤（README 的"本地验证"之外），不作为 `pytest` 用例，避免"上游一打补丁就红"。

## 未覆盖项（follow-up，本次未改 upstream）

1. P1 无同模块定向测试，与 `UPSTREAM_PATCH_BOUNDARY.md:21`（"在同模块补定向测试"）不符。
   可选做法：新增 `upstream/services/shengtu_pool_sync_test.py`，用假 `requests.post` 覆盖
   `enabled/disabled`、`非 2xx`、`网络异常` 三个分支；或把该适配模块迁到 `runtime/`，upstream 只留调用点。
2. P2 的同步成功/失败分支只有执行覆盖、没有断言。
3. P3 的 stub 分支无独立断言（仅由导入路径间接覆盖）。
