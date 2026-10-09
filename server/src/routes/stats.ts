import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { assetFilter, isGlobalAdmin, projectFilter } from '../scope';

export const statsRouter = Router();
statsRouter.use(requireAuth);

/**
 * 仪表盘统计：全部按「当前用户权限内」计算
 * - 项目总数 / 模板总数 / 模板使用次数 / 素材总数
 * - 近 7 天新增（模板 / 素材 / 项目）
 * - 按类型拆分（素材：底图/产品图/贴纸；模板：通用/专属）
 */
statsRouter.get('/dashboard', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const pf = projectFilter(u);
  const af = assetFilter(u);

  const num = (sql: string, params: (string | number | null)[] = []) => {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined;
    return row?.n ?? 0;
  };

  const projWhere = pf.sql === '1=0' ? '1=0' : pf.sql.replace(/^1=1$/, '1=1');
  const assetWhere = af.sql;

  const projectTotal = pf.sql === '1=0' ? 0 : num(`SELECT COUNT(*) AS n FROM projects p WHERE ${projWhere}`, pf.params);
  const projectNew7 = pf.sql === '1=0' ? 0 : num(`SELECT COUNT(*) AS n FROM projects p WHERE ${projWhere} AND p.created_at >= datetime('now','-7 day')`, pf.params);

  const templateTotal = num(`SELECT COUNT(*) AS n FROM reference_images r WHERE ${assetWhere}`, af.params);
  const templateNew7 = num(
    `SELECT COUNT(*) AS n FROM reference_images r WHERE ${assetWhere} AND r.created_at >= datetime('now','-7 day')`,
    af.params
  );
  const templateUses = num(`SELECT COALESCE(SUM(r.usage_count), 0) AS n FROM reference_images r WHERE ${assetWhere}`, af.params);
  const templateGeneric = num(`SELECT COUNT(*) AS n FROM reference_images r WHERE ${assetWhere} AND r.project_id IS NULL`, af.params);
  const templateExclusive = templateTotal - templateGeneric;

  const assetTotal = num(`SELECT COUNT(*) AS n FROM assets a WHERE ${assetWhere}`, af.params);
  const assetNew7 = num(`SELECT COUNT(*) AS n FROM assets a WHERE ${assetWhere} AND a.created_at >= datetime('now','-7 day')`, af.params);
  const assetsByType = db
    .prepare(`SELECT a.type, COUNT(*) AS n FROM assets a WHERE ${assetWhere} GROUP BY a.type`)
    .all(...af.params) as { type: string; n: number }[];

  const userTotal = isGlobalAdmin(u) ? num('SELECT COUNT(*) AS n FROM users') : 0;
  const designTotal = pf.sql === '1=0' ? 0 : num(`SELECT COUNT(*) AS n FROM designs d WHERE d.project_id IN (SELECT p.id FROM projects p WHERE ${projWhere})`, pf.params);

  // 最近使用/新增的模板（前 5 个）
  const topTemplates = db
    .prepare(
      `SELECT r.id, r.name, r.url, COALESCE(r.usage_count, 0) AS usage_count, b.name AS brand_name, p.name AS project_name
         FROM reference_images r JOIN brands b ON b.id = r.brand_id LEFT JOIN projects p ON p.id = r.project_id
        WHERE ${assetWhere} ORDER BY COALESCE(r.usage_count, 0) DESC, r.id DESC LIMIT 5`
    )
    .all(...af.params);

  // 最近新增素材（前 5 个）
  const recentAssets = db
    .prepare(
      `SELECT a.id, a.name, a.url, a.type, a.created_at FROM assets a WHERE ${assetWhere} ORDER BY a.id DESC LIMIT 5`
    )
    .all(...af.params);

  res.json({
    scope: isGlobalAdmin(u) ? 'all' : 'own',
    projects: { total: projectTotal, new7: projectNew7 },
    templates: { total: templateTotal, new7: templateNew7, uses: templateUses, generic: templateGeneric, exclusive: templateExclusive },
    assets: {
      total: assetTotal,
      new7: assetNew7,
      scene: assetsByType.find((x) => x.type === 'scene')?.n ?? 0,
      product: assetsByType.find((x) => x.type === 'product')?.n ?? 0,
      sticker: assetsByType.find((x) => x.type === 'sticker')?.n ?? 0,
    },
    users: { total: userTotal },
    designs: { total: designTotal },
    topTemplates,
    recentAssets,
  });
});
