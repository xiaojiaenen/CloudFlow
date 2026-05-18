# CloudFlow 生产部署指南

## 架构概览

```
                    ┌──────────────────────────┐
                    │     Nginx (:10003)        │
                    │  /api/*  → Backend        │
                    │  /socket.io/* → Backend   │
                    │  /*      → SPA            │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼────────┐  ┌───▼──────────┐  ┌──▼────────┐
     │  Backend :10004 │  │  外部 MySQL  │  │ 外部 Redis│
     │  NestJS API     │  │              │  │           │
     └────────┬────────┘  └──────────────┘  └───────────┘
              │
     ┌────────▼────────┐
     │  Worker          │
     │  Playwright 浏览器│
     └──────────────────┘
```

## 前置条件

- **Docker 20.10+** 和 **Docker Compose 2.0+**
- **MySQL 8.0**（已部署可访问）
- **Redis 6.0+**（已部署可访问）
- **Node.js 22+**（仅本地打包时需要）

## 1. 初始化 MySQL 数据库

```sql
CREATE DATABASE IF NOT EXISTS cloudflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cloudflow'@'%' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON cloudflow.* TO 'cloudflow'@'%';
FLUSH PRIVILEGES;
```

## 2. 本地打包

在开发机上执行：

```powershell
cd deploy
.\package.ps1
```

脚本会：
1. 本地构建前端（`npm run build` → `frontend/dist/`）
2. 本地构建后端（`npm run build` + tsc）
3. 将 deploy 配置、后端源码（含构建产物）、前端 dist 打包为 zip

## 3. 传输到内网

```
cloudflow-deploy-<timestamp>.zip → 内网服务器 /opt/cloudflow/
```

## 4. 部署到内网

```bash
# 解压
unzip cloudflow-deploy-*.zip -d /opt/cloudflow
cd /opt/cloudflow/cloudflow-deploy-*

# 配置环境变量
cp deploy/.env.example deploy/.env
vim deploy/.env  # 修改 DATABASE_URL, REDIS_URL 等

# 启动
docker compose -f deploy/docker-compose.yml up -d --build

# 首次启动，数据库迁移会自动执行
```

## 5. 验证服务

```bash
# 前端页面
curl -I http://localhost:10003/

# 后端健康检查（通过 nginx 代理）
curl http://localhost:10003/api/
```

浏览器访问 `http://服务器IP:10003` 进入系统。

## 数据持久化

- `cloudflow-runtime` Docker volume — 挂载到 `/app/runtime/`，存放运行时任务数据
- MySQL — 所有业务数据（工作流、任务、数据记录等）
- Redis — 任务队列和实时事件

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| DATABASE_URL | 是 | - | MySQL 连接字符串 |
| REDIS_URL | 是 | - | Redis 连接字符串 |
| NPM_REGISTRY | 否 | https://registry.npmjs.org | npm 镜像源（内网可设私有源） |
| PLAYWRIGHT_IMAGE | 否 | mcr.microsoft.com/playwright:v1.58.2-noble | Playwright 镜像 |
| BACKEND_PORT | 否 | 10004 | 后端暴露端口 |
| FRONTEND_PORT | 否 | 10003 | 前端暴露端口 |
| WORKER_CONCURRENCY | 否 | 2 | Worker 并发任务数 |
| SUPER_ADMIN_EMAILS | 否 | admin@cloudflow.local | 管理员邮箱 |

## 更新部署

代码变更后重新打包：

```powershell
# 开发机上
cd deploy
.\package.ps1

# 传输 zip 到内网，解压覆盖
# 然后重建容器
docker compose -f deploy/docker-compose.yml up -d --build
```

只更新前端：

```bash
# 开发机上
cd frontend && npm run build
# 复制 dist/ 到内网前端目录，然后：
docker compose -f deploy/docker-compose.yml up -d --build frontend
```

只更新后端：

```bash
# 开发机上
cd deploy && .\package.ps1
# 传输 zip 到内网，然后：
docker compose -f deploy/docker-compose.yml up -d --build backend worker
```

## 常用命令

```bash
# 查看日志
docker compose -f deploy/docker-compose.yml logs -f

# 只看后端
docker compose -f deploy/docker-compose.yml logs -f backend

# 重启
docker compose -f deploy/docker-compose.yml restart

# 停止
docker compose -f deploy/docker-compose.yml down

# 进入容器
docker compose -f deploy/docker-compose.yml exec backend sh
```

## 故障排查

### Worker 启动失败 (浏览器问题)

确保服务器支持 seccomp 和 shm：

```bash
# 检查 seccomp 支持
docker info | grep seccomp

# 如果 Worker 一直崩溃，检查日志
docker compose -f deploy/docker-compose.yml logs worker
```

### Docker 构建时 npm 网络超时

设置 `.env` 中的 npm 镜像：

```env
NPM_REGISTRY=https://registry.npmmirror.com
```

### 数据库连接失败

确认 MySQL 可访问：

```bash
docker compose -f deploy/docker-compose.yml exec backend node -e "
  console.log(process.env.DATABASE_URL)
"
```

### 端口冲突

修改 `.env`：

```env
BACKEND_PORT=10014
FRONTEND_PORT=10013
```
