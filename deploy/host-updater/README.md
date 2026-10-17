# Host Updater

Host Updater 是运行在宿主机上的独立服务。业务容器只通过带 Bearer 鉴权的 Unix Socket 读取状态和发起预检，业务容器不挂载 `/var/run/docker.sock`。

更新器按已验证的 Release 清单执行单任务事务：精确拉取 `image@sha256:digest`、排空写入与创作任务、仅停止应用服务、创建停写冷备份、切换托管 Compose 覆盖文件并连续验收目标版本。目标版本未通过验收时，会恢复冷备份和原镜像覆盖文件后重新验收原版本。

## 宿主配置

将 Release 中的 `shengtu-host-updater_linux_amd64` 安装为 `/usr/local/sbin/shengtu-host-updater`，并创建仅 root 可读的 `/etc/shengtu-host-updater.env`：

```dotenv
SHENGTU_UPDATER_TOKEN=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
SHENGTU_UPDATER_SOCKET=/run/shengtu-updater/updater.sock
SHENGTU_UPDATER_SOCKET_GID=10001
SHENGTU_UPDATER_INSTALL_DIR=/opt/chatgpt2api
SHENGTU_UPDATER_STATE_DIR=/opt/chatgpt2api/data/host-updater
SHENGTU_UPDATER_BACKUP_DIR=/opt/chatgpt2api/data/update-backups
SHENGTU_UPDATER_DATA_DIR=/opt/chatgpt2api/data
SHENGTU_UPDATER_COMPOSE_FILES=docker-compose.yml,docker-compose.runtime.override.yml
SHENGTU_UPDATER_COMPOSE_PROJECT=shengtu39prod
SHENGTU_UPDATER_APP_SERVICE=app
SHENGTU_UPDATER_MANAGED_OVERRIDE=/opt/chatgpt2api/data/host-updater/image.override.yml
SHENGTU_UPDATER_READINESS_URL=http://127.0.0.1:3004/ready
SHENGTU_UPDATER_APP_CONTROL_URL=http://127.0.0.1:8092
SHENGTU_UPDATER_REPOSITORY=looksky888/shengtu-platform
SHENGTU_UPDATER_GITHUB_TOKEN=替换为仅有仓库读取权限的细粒度令牌
SHENGTU_UPDATER_PLATFORM=linux/amd64
SHENGTU_UPDATER_MIN_FREE_BYTES=2147483648
SHENGTU_UPDATER_CHECK_TIMEOUT_SECONDS=10
SHENGTU_UPDATER_DRAIN_TIMEOUT_SECONDS=900
SHENGTU_UPDATER_UPDATE_TIMEOUT_SECONDS=1800
SHENGTU_UPDATER_READINESS_INTERVAL_SECONDS=2
SHENGTU_UPDATER_READINESS_STABLE_COUNT=3
```

`SHENGTU_UPDATER_GITHUB_TOKEN` 只保存在权限为 `0600` 的宿主机环境文件中，用于读取私有 Release 和 `update-manifest.json`；不要复用具备仓库写入权限的令牌。

同一密钥写入项目 `.env` 的 `SHENGTU_UPDATER_TOKEN`，并在启动 Compose 时增加覆盖文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.host-updater.yml up -d
```

该覆盖文件只把应用的 internal server 映射到宿主机回环地址
`127.0.0.1:${CHATGPT2API_INTERNAL_HOST_PORT:-8092}`。Host Updater 使用同一通信密钥调用排空、状态和恢复接口；这些接口不挂载到公网 Web 路由。若宿主机 8092 已被占用，应同时修改 `CHATGPT2API_INTERNAL_HOST_PORT` 与 `SHENGTU_UPDATER_APP_CONTROL_URL`。

生产安装时应先核对实际项目路径、Compose 文件、健康端口与 systemd 单元的 `ReadWritePaths`。
`SHENGTU_UPDATER_SOCKET_GID` 必须与业务容器内进程的 GID 一致；当前镜像固定使用 `10001:10001`。

## 事务边界与备份

- 更新器只执行 `docker compose stop app` 与 `docker compose up -d --no-deps app`，不会重启数据库、代理、邮件或其他旁路服务。
- 冷备份包含项目 `.env`、实际 Compose 文件和数据目录中的数据库/配置；图片、视频、缩略图、日志、侧车运行目录等大体积或独立持久化目录不重复打包。
- 备份 ZIP 在恢复前校验 SHA-256 与字节数；恢复路径同时拒绝目录穿越、符号链接和非普通文件。
- 托管覆盖文件必须位于更新器状态目录，内容只固定应用服务的不可变镜像摘要。
- 更新器重启后会识别未完成事务；若应用尚未停止则恢复接单并结束任务，否则自动进入回滚。

更新开始后管理页面会短暂失联，这是应用容器停止和替换期间的预期行为。前端保留任务状态并持续轮询；只有目标版本和存储结构版本连续满足配置次数，任务才标记为成功。

