# 公共视频 API

所有接口使用现有 `Authorization: Bearer <API_KEY>` 或登录会话鉴权，并沿用统一 JSON 错误结构。

## 提交

`POST /v1/videos` 支持 JSON 与 `multipart/form-data`，返回 `202 Accepted`。请求可使用 `Idempotency-Key`；若同时传 `client_task_id`，两者必须一致。相同键和相同参数重放会返回原任务；相同键但参数不同返回 `409 idempotency_conflict`。

## 查询列表

`GET /v1/videos?limit=20&after=<next_cursor>&status=queued|in_progress|completed|failed|cancelled` 返回游标分页对象 `{object:"list",data,total,has_more,next_cursor}`。列表只包含当前 API 身份创建的视频；管理员跨用户运维查询使用后台任务接口。

## 查询单任务

`GET /v1/videos/{id}` 返回异步状态：`queued`、`in_progress`、`completed`、`failed` 或 `cancelled`。完成后 `content_url` 指向受鉴权保护的内容接口。

## 取消

`DELETE /v1/videos/{id}` 取消当前身份拥有的排队或执行中任务；已完成/失败任务保持终态并原样返回。

## 内容

`GET /v1/videos/{id}/content` 返回 `video/mp4`。仅任务所属身份可读，管理员使用后台视频库权限；`?download=1` 请求附件下载。
