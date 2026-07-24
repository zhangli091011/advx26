# NEXUS // FRC Team Hub

面向 FRC 赛队的深色科技风全栈工作台，包含：

- 账号注册、登录、退出、修改密码和头像
- 上下班打卡、计划/完成任务、累计工时与七日趋势
- 本周、本月和赛季苦力排行榜
- STEP / STP 图纸仓库与受保护下载
- 发票图片/PDF和购买记录 Excel 仓库
- AI 硬件识别：浏览器摄像头、图像质量检查、云端视觉识别、候选确认

## 本地启动

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

演示管理员：

```text
用户名：captain
密码：FRC2026!Demo
```

演示环境的邀请码为 `FRC2026`。正式部署前请复制 `.env.example` 为 `.env.local`，更换 `TEAM_INVITE_CODE`，并设置 `SEED_DEMO_DATA=false`，避免创建内置演示账号。

## AI 硬件识别

识别功能默认在未配置云端密钥时进入本地降级模式：仍会保存图片、检查图像质量，并根据人工提示匹配内置设备目录。配置服务端 `OPENAI_API_KEY` 后启用云端图片 OCR 与型号候选；密钥不能使用 `NEXT_PUBLIC_` 前缀。可通过 `OPENAI_BASE_URL` 切换到兼容 OpenAI Responses API 的自建网关，地址应包含 `/v1`。

## 数据目录

默认在项目根目录的 `data/` 保存 SQLite 数据库和受保护上传文件，该目录已加入 `.gitignore`。可以通过 `FRC_DATA_DIR` 指向服务器持久磁盘。

本方案适合单机、NAS 或一台长期运行的队内服务器。若部署到无持久磁盘的 Serverless 平台，需要把 SQLite 迁移到 PostgreSQL/Turso，并把上传文件迁移到 S3/R2。

## 常用命令

```bash
npm run lint
npm run build
npm start
```
