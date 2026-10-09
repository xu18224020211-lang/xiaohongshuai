# 小红书封面「三层无损叠加」AI 设计工具

深色模式的设计网站：首页瀑布流展示文字样式参考图，点击进入三层画布编辑器进行设计。

## 架构

- **前端** `client/`：React + Vite + TypeScript + TailwindCSS（深色）+ Konva 画布 + Zustand
- **后端** `server/`：Express + TypeScript + node:sqlite（免原生编译）
- **AI 网关**：巧匠AI `tt-image-2`（`/v1/media/generate` 创建任务 + `/v1/media/status` 轮询）

## 三层图层结构

| 层 | 内容 | 来源 | 可编辑 |
|---|---|---|---|
| Layer 1 | 场景底层（实拍图 / AI 环境背景） | 上传 / 素材库 / AI | 锁定 |
| Layer 2 | 产品中间层（PNG 透明产品图，路径B专属） | 素材库 | 锁定（像素/位置/角度不可变） |
| Layer 3 | 文字样式 PNG + 贴纸（多张） | AI / 贴纸库 | 移动/缩放/旋转/删除/复制/透明度/排序 |

## 角色与数据隔离

- 超管 `super_admin`：全局管理（品牌/项目/用户/AI配置/素材/参考图）
- 项目经理 `pm`：品牌内管理（项目/用户/素材/参考图）
- 普通用户 `user`：项目内操作（看参考图、做设计）

数据按 **品牌 → 项目** 两级隔离。

## 启动

```bash
npm install          # 安装所有依赖（workspace）
npm run seed         # 初始化数据库 + 示例数据（首次）
npm run dev          # 同时启动 server(4000) 与 client(5173)
```

打开 http://localhost:5173

## 默认账号（seed 生成）

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | 超管 |
| pm | pm123 | 项目经理（示例品牌） |
| user | user123 | 普通用户（示例项目） |

## 环境变量（server/.env）

```
PORT=4000
JWT_SECRET=...
AI_ENDPOINT=https://api.lk888.ai
AI_API_KEY=sk-...
AI_MODEL=tt-image-2
AI_TIMEOUT_MS=180000
```

AI 服务配置也可在后台「AI 配置」页运行时修改（存 DB，优先于 .env）。

## 说明

- AI 上游（tt-image-2）已于 2026-07 停止透明背景输出，文字层可能不含 Alpha。设计器内置「去白底」开关，可在导出前对文字/贴纸做白底转透明后处理。
- 合成导出以 Layer 1 原始分辨率输出。
