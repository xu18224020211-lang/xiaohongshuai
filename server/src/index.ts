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

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'xhsc-overlay-server' }));

app.use('/api/auth', authRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/models', modelsRouter);
app.use('/api/template-types', templateTypesRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/ui-texts', uiTextsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/asset-tags', assetTagsRouter);
app.use('/api/references', referencesRouter);
app.use('/api/designs', designsRouter);
app.use('/api/ai-config', aiConfigRouter);
app.use('/api/ai', aiRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/generations', generationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/trash', trashRouter);

/**
 * 生产环境：由后端直接托管前端构建产物（单服务部署，前后端同源）。
 * 前端产物位于 client/dist；只有该目录存在时才启用，本地开发不受影响。
 * 非 /api、非 /uploads 的请求一律回落到 index.html，交给前端路由处理。
 */
const clientDist = path.resolve(ROOT_DIR, '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('[static] 已托管前端构建产物:', clientDist);
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
