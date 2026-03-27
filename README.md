# CloudFlow

CloudFlow 是一个可视化网页自动化平台，当前仓库包含：

- `frontend`：工作流编辑器与监控界面
- `backend`：NestJS API、BullMQ 队列、Redis 通信、Prisma/MySQL 存储、WebSocket 推流

## 后端能力

- 创建和查询工作流，工作流内容以 JSON 存储
- 通过 `POST /api/tasks/run` 创建并执行任务
- BullMQ 将任务投递到 Redis 队列
- 独立 Worker 使用 Playwright 执行浏览器自动化
- Worker 将日志、状态、截图通过 Redis Pub/Sub 回推给 API
- API 层通过 WebSocket 将实时执行画面和日志推送给前端

## 目录结构

```text
backend/
  prisma/
    schema.prisma
  src/
    common/
    modules/
      execution/
      task/
      workflow/
    prisma/
    queue/
    ws/
    app.module.ts
    main.ts
  worker/
    worker.ts
frontend/
  ...
```

## 后端环境变量

参考 `backend/.env.example`：

```env
PORT=3001
REDIS_URL=redis://127.0.0.1:6379
DATABASE_URL=mysql://root:password@127.0.0.1:3306/cloudflow
WORKER_CONCURRENCY=2
BROWSER_HEADLESS=true
```

## 后端启动

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run start:dev
```

另开一个终端启动 Worker：

```bash
cd backend
npm run worker
```

## 前端实时订阅

WebSocket 命名空间为 `/tasks`，客户端连接后发送：

```json
{
  "event": "task:subscribe",
  "data": {
    "taskId": "your-task-id"
  }
}
```

服务端会通过 `task:event` 推送：

```json
{
  "taskId": "task_xxx",
  "type": "log",
  "data": {
    "message": "点击元素 #login",
    "level": "info",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

或：

```json
{
  "taskId": "task_xxx",
  "type": "screenshot",
  "data": {
    "imageBase64": "...",
    "mimeType": "image/jpeg",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```
