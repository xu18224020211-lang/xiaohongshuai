import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT_DIR } from './config';
import { authRouter } from './routes/auth';
import { brandsRouter } from './routes/brands';
import { projectsRouter } from './routes/projects';
import { categoriesRouter } from './routes/categories';
import { modelsRouter } from './routes/models';
import { templateTypesRouter } from './routes/templateTypes';
import { usersRouter } from './routes/users';
import { rolesRouter } from './routes/roles';
import { uiTextsRouter } from './routes/uiTexts';
import { assetsRouter } from './routes/assets';
import { assetTagsRouter } from './routes/assetTags';
import { referencesRouter } from './routes/references';
import { designsRouter } from './routes/designs';
import { aiConfigRouter } from './routes/aiConfig';
import { aiRouter } from './routes/ai';
import { uploadRouter } from './routes/upload';
import { generationsRouter } from './routes/generations';
import { settingsRouter } from './routes/settings';
import { statsRouter } from './routes/stats';
import { trashRouter } from './routes/trash';
import { purgeExpiredTrash, purgeOrphanFiles } from './storage';

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// 上传文件静态服务
app.use('/uploads', express.static(config.uploadDir));

/**
 * 子目录部署支持。
 * 前端部署在 /test/ 时，页面会请求 /test/api/...，
 * 因此把所有 API 路由同时挂载到 `/api` 和 `${basePath}/api` 两处。
 *
 * 注意：不能用「改写 req.url 再 next()」的中间件 —— Express 在中间件返回后
 * 会恢复原始 url，导致匹配失败（实测 404）。挂载同一 router 两次才可靠。
 */
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, ''); // '' 或 '/test'

/** 把一组 (路径, router) 同时挂载到根前缀和子目录前缀下 */
function mountApi(routes: [string, express.Router][]) {
  const prefixes = ['/api', ...(basePath ? [`${basePath}/api`] : [])];
  for (const prefix of prefixes) {
    for (const [p, r] of routes) app.use(`${prefix}${p}`, r);
  }
}

// 上传文件静态服务（同样支持子目录）
app.use('/uploads', express.static(config.uploadDir));
if (basePath) app.use(`${basePath}/uploads`, express.static(config.uploadDir));

for (const prefix of ['/api', ...(basePath ? [`${basePath}/api`] : [])]) {
  app.get(`${prefix}/health`, (_req, res) => res.json({ ok: true, service: 'xhsc-overlay-server' }));
}

mountApi([
  ['/auth', authRouter],
  ['/brands', brandsRouter],
  ['/projects', projectsRouter],
  ['/categories', categoriesRouter],
  ['/models', modelsRouter],
  ['/template-types', templateTypesRouter],
  ['/users', usersRouter],
  ['/roles', rolesRouter],
  ['/ui-texts', uiTextsRouter],
  ['/assets', assetsRouter],
  ['/asset-tags', assetTagsRouter],
  ['/references', referencesRouter],
  ['/designs', designsRouter],
  ['/ai-config', aiConfigRouter],
  ['/ai', aiRouter],
  ['/upload', uploadRouter],
  ['/generations', generationsRouter],
  ['/settings', settingsRouter],
  ['/stats', statsRouter],
  ['/trash', trashRouter],
]);

/**
 * 生产环境：由后端直接托管前端构建产物（单服务部署，前后端同源）。
 * 前端产物位于 client/dist；只有该目录存在时才启用，本地开发不受影响。
 *
 * 子目录部署见文件上方 BASE_PATH 处理（/test/api → /api）。
 */
const clientDist = path.resolve(ROOT_DIR, '..', 'client', 'dist');

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  const serveIndex = (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  };

  if (basePath) {
    app.use(basePath, express.static(clientDist));
    // 子目录下的前端路由回落（/test/login、/test/designer …）
    app.get(new RegExp(`^${basePath}(?!/api/|/uploads/).*`), serveIndex);
    // 根路径跳到子目录，避免用户访问到空目录
    app.get('/', (_req, res) => res.redirect(`${basePath}/`));
    console.log(`[static] 已托管前端构建产物: ${clientDist}（子目录 ${basePath}/）`);
  } else {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/|uploads\/).*/, serveIndex);
    console.log('[static] 已托管前端构建产物:', clientDist);
  }
} else {
  console.log('[static] 未找到 client/dist，仅提供 API（本地开发由 Vite 提供前端）');
}

// 定时维护：回收站 36 小时到期清理 + 清理没有被引用的孤儿图片（每天一次，启动时也跑一次）
function maintain() {
  try {
    const trashed = purgeExpiredTrash();
    const orphans = purgeOrphanFiles(24);
    if (trashed.assets || trashed.templates || orphans) {
      console.log(`[maintain] 回收站清理 素材${trashed.assets}/模板${trashed.templates}，孤儿图片 ${orphans} 个`);
    }
  } catch (e) {
    console.error('[maintain] 失败', e);
  }
}
maintain();
setInterval(maintain, 6 * 60 * 60 * 1000).unref();

// 全局错误处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log(`[server] 已启动: http://localhost:${config.port}`);
});
