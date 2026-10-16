# Host Updater（P2D1）

Host Updater 是运行在宿主机上的独立服务。业务容器只通过带 Bearer 鉴权的 Unix Socket 读取状态和发起预检，业务容器不挂载 `/var/run/docker.sock`。

当前阶段实现持久状态、Release 目标预检，以及更新前的内网排空控制面。镜像预拉取、停服冷备份、容器切换和失败回滚将在下一阶段接入。

## 宿主配置

将 Release 中的 `shengtu-host-updater_linux_amd64` 安装为 `/usr/local/sbin/shengtu-host-updater`，并创建仅 root 可读的 `/etc/shengtu-host-updater.env`：

```dotenv
SHENGTU_UPDATER_TOKEN=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
SHENGTU_UPDATER_SOCKET=/run/shengtu-updater/updater.sock
SHENGTU_UPDATER_SOCKET_GID=10001
SHENGTU_UPDATER_INSTALL_DIR=/opt/chatgpt2api
SHENGTU_UPDATER_STATE_DIR=/opt/chatgpt2api/data/host-updater
SHENGTU_UPDATER_BACKUP_DIR=/opt/chatgpt2api/data/update-backups
SHENGTU_UPDATER_COMPOSE_FILES=docker-compose.yml,docker-compose.runtime.override.yml
SHENGTU_UPDATER_READINESS_URL=http://127.0.0.1:3004/ready
SHENGTU_UPDATER_APP_CONTROL_URL=http://127.0.0.1:8092
SHENGTU_UPDATER_REPOSITORY=looksky888/shengtu-platform
SHENGTU_UPDATER_GITHUB_TOKEN=替换为仅有仓库读取权限的细粒度令牌
SHENGTU_UPDATER_PLATFORM=linux/amd64
SHENGTU_UPDATER_MIN_FREE_BYTES=2147483648
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
