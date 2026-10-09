import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'app.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  brand_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  category_id INTEGER,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_models (
  project_id INTEGER NOT NULL,
  category_id INTEGER,
  model_id INTEGER,
  PRIMARY KEY (project_id, category_id, model_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  path_kind TEXT NOT NULL DEFAULT 'A',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_brands (  user_id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, brand_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_categories (
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, category_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 素材标签（可增删改，多选勾选）
CREATE TABLE IF NOT EXISTS asset_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 素材类型（可增删改；code 与 assets.type 对应）
CREATE TABLE IF NOT EXISTS asset_types (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_tag_links (
  asset_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (asset_id, tag_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES asset_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  project_id INTEGER,
  type TEXT NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  tag TEXT,
  meta TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reference_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  project_id INTEGER,
  name TEXT,
  url TEXT NOT NULL,
  text_style_prompt TEXT NOT NULL,
  scene_prompt TEXT,
  kind TEXT NOT NULL DEFAULT 'A',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  name TEXT,
  canvas_width INTEGER NOT NULL DEFAULT 1080,
  canvas_height INTEGER NOT NULL DEFAULT 1440,
  layers_json TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  endpoint TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'tt-image-2',
  timeout_ms INTEGER NOT NULL DEFAULT 180000,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER,
  project_id INTEGER,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  url TEXT NOT NULL,
  size TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_title TEXT NOT NULL DEFAULT '小红书素材设计',
  page_title TEXT DEFAULT '封面三层设计工具',
  logo_url TEXT,
  footer_text TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// 迁移：模板新增「背景提示词 scene_prompt」与「路径 kind」
function hasColumn(table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}
if (!hasColumn('reference_images', 'scene_prompt')) {
  db.exec('ALTER TABLE reference_images ADD COLUMN scene_prompt TEXT');
}
if (!hasColumn('reference_images', 'kind')) {
  db.exec("ALTER TABLE reference_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'A'");
}
if (!hasColumn('assets', 'tag')) {
  db.exec('ALTER TABLE assets ADD COLUMN tag TEXT');
}
// 迁移：网页名称（浏览器标签上的名字，可在「站点设置」改）
if (!hasColumn('settings', 'page_title')) {
  db.exec("ALTER TABLE settings ADD COLUMN page_title TEXT DEFAULT '封面三层设计工具'");
}
// 迁移：素材 / 模板回收站（删除后进回收站，36 小时后连文件清理；只有超管能恢复）
if (!hasColumn('assets', 'deleted_at')) db.exec('ALTER TABLE assets ADD COLUMN deleted_at TEXT');
if (!hasColumn('reference_images', 'deleted_at')) db.exec('ALTER TABLE reference_images ADD COLUMN deleted_at TEXT');
if (!hasColumn('projects', 'category_id')) {
  db.exec('ALTER TABLE projects ADD COLUMN category_id INTEGER');
}
if (!hasColumn('brands', 'logo_url')) db.exec('ALTER TABLE brands ADD COLUMN logo_url TEXT');
if (!hasColumn('brands', 'description')) db.exec('ALTER TABLE brands ADD COLUMN description TEXT');
if (!hasColumn('projects', 'start_date')) db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
if (!hasColumn('projects', 'end_date')) db.exec('ALTER TABLE projects ADD COLUMN end_date TEXT');
if (!hasColumn('projects', 'pm_id')) db.exec('ALTER TABLE projects ADD COLUMN pm_id INTEGER');
if (!hasColumn('projects', 'pm_name')) db.exec('ALTER TABLE projects ADD COLUMN pm_name TEXT');
if (!hasColumn('projects', 'parent_id')) db.exec('ALTER TABLE projects ADD COLUMN parent_id INTEGER');
if (!hasColumn('assets', 'path_type')) db.exec('ALTER TABLE assets ADD COLUMN path_type TEXT');
if (!hasColumn('users', 'email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT');
// 迁移：素材标签按大类区分（产品类 / 贴图类；null = 两类都显示）
if (!hasColumn('asset_tags', 'kind')) db.exec('ALTER TABLE asset_tags ADD COLUMN kind TEXT');
// 迁移：模板使用次数（画布打开模板时 +1，用于后台仪表盘统计）
if (!hasColumn('reference_images', 'usage_count')) db.exec('ALTER TABLE reference_images ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0');
// 迁移：素材归属型号（null = 不限型号/品牌通用）
if (!hasColumn('assets', 'model_id')) db.exec('ALTER TABLE assets ADD COLUMN model_id INTEGER');
// 迁移：模板归属「模板标签类型」（模板类型可由用户增删改）
if (!hasColumn('reference_images', 'template_type_id')) db.exec('ALTER TABLE reference_images ADD COLUMN template_type_id INTEGER');
// 迁移：项目权限（0=仅查看 1=可修改）
if (!hasColumn('project_members', 'can_edit')) db.exec('ALTER TABLE project_members ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 0');
// 迁移：品牌级 / 类别级权限也带查看-修改（品牌授权 = 该品牌下全部项目，含以后新增）
if (!hasColumn('user_brands', 'can_edit')) db.exec('ALTER TABLE user_brands ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 0');
if (!hasColumn('user_categories', 'can_edit')) db.exec('ALTER TABLE user_categories ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 0');

// 迁移：成员归属负责人（项目成员 → 项目经理；部门成员 → 部门主管）
if (!hasColumn('users', 'leader_id')) db.exec('ALTER TABLE users ADD COLUMN leader_id INTEGER');
// 迁移：给「没有归属负责人」的存量成员补一个能唯一确定的负责人
{
  // 项目成员：其所在项目的项目经理（项目上的 pm_id，或该项目里「项目经理」角色的成员）
  const koses = db.prepare("SELECT id FROM users WHERE role = 'kos' AND leader_id IS NULL").all() as { id: number }[];
  for (const k of koses) {
    const pmIds = db
      .prepare(
        `SELECT DISTINCT u.id FROM users u
          WHERE u.role = 'pm' AND (
            u.id IN (SELECT p.pm_id FROM projects p WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = ?))
            OR u.id IN (SELECT pm.user_id FROM project_members pm JOIN users pu ON pu.id = pm.user_id
                          WHERE pu.role = 'pm' AND pm.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?))
          )`
      )
      .all(k.id, k.id) as { id: number }[];
    if (pmIds.length === 1) db.prepare('UPDATE users SET leader_id = ? WHERE id = ?').run(pmIds[0].id, k.id);
  }
  // 部门成员：系统里只有一位部门主管时直接归属给他
  const heads = db.prepare("SELECT id FROM users WHERE role = 'dept_head'").all() as { id: number }[];
  if (heads.length === 1) {
    db.prepare("UPDATE users SET leader_id = ? WHERE role = 'dept_member' AND leader_id IS NULL").run(heads[0].id);
  }
}
// 迁移：新用户默认密码需要标记（仅用于展示），这里无需额外字段

// 角色表：内置角色 + 超管自定义角色（权限矩阵：查看 / 修改）
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 3,
    builtin INTEGER NOT NULL DEFAULT 0,
    perms TEXT NOT NULL DEFAULT '{}',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// 内置角色权限矩阵（首次写入；之后由超管在「管理角色权限」里维护）
// perms = 该角色能拥有的「上限」；default_perms = 默认拥有（未单独授权时）
if (!(db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }).n) {
  const M = ['products', 'projects', 'users', 'assets', 'templates'];
  const mk = (v: Record<string, string>) => JSON.stringify(Object.fromEntries(M.map((m) => [m, v[m] || 'none'])));
  const builtins: [string, string, number, string, string][] = [
    ['super_admin', '超管', 1, mk({ products: 'edit', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' }), mk({ products: 'edit', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' })],
    ['senior_manager', '高级管理者', 2, mk({ products: 'edit', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' }), mk({ products: 'edit', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' })],
    ['pm', '项目经理', 2, mk({ products: 'view', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' }), mk({ products: 'view', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' })],
    ['dept_head', '部门主管', 2, mk({ products: 'view', projects: 'view', users: 'edit', assets: 'edit', templates: 'edit' }), mk({ products: 'view', projects: 'view', users: 'edit', assets: 'edit', templates: 'edit' })],
    // 部门成员：默认「只有查看权限」
    ['dept_member', '部门成员', 3, mk({ products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' }), mk({ products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' })],
    // 项目成员：默认「后台暂无任何模块权限」；上限给到素材/模板可修改，便于项目经理授权
    ['kos', '项目成员', 3, mk({ products: 'view', projects: 'view', assets: 'edit', templates: 'edit' }), mk({})],
    ['user', '普通用户', 3, mk({}), mk({})],
  ];
  builtins.forEach(([key, name, level, perms, defaults], i) => {
    db.prepare('INSERT OR IGNORE INTO roles (key, name, level, builtin, perms, sort, default_perms) VALUES (?, ?, ?, 1, ?, ?, ?)')
      .run(key, name, level, perms, i, defaults);
  });
}

// 迁移：角色表增加「默认权限」列（老库补齐；项目成员默认无权限，部门成员默认只读）
if (!hasColumn('roles', 'default_perms')) {
  db.exec("ALTER TABLE roles ADD COLUMN default_perms TEXT NOT NULL DEFAULT '{}'");
  const dm = JSON.stringify({ products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' });
  db.prepare("UPDATE roles SET default_perms = perms WHERE key IN ('super_admin','senior_manager','pm','dept_head')").run();
  db.prepare("UPDATE roles SET default_perms = ? WHERE key = 'dept_member'").run(dm);
  db.prepare("UPDATE roles SET perms = ? WHERE key = 'kos'").run(JSON.stringify({ products: 'view', projects: 'view', assets: 'edit', templates: 'edit' }));
  db.prepare("UPDATE roles SET default_perms = '{}' WHERE key IN ('kos','user')").run();
}

// 迁移：修正历史数据里「背景提示词 / 文字样式提示词」写反的模板标签
// （判据：文字样式字段里是背景类文案，且背景字段里是文字样式类文案 → 交换回来）
{
  const rows = db.prepare('SELECT id, name, prompt_text, prompt_scene FROM template_types').all() as
    { id: number; name: string; prompt_text: string | null; prompt_scene: string | null }[];
  const looksBg = (s: string) => /换背景|背景|场景|环境|光线|光线|背景图|reference.*background/i.test(s);
  const looksText = (s: string) => /文字样式|完全透明|Alpha\s*=\s*0|字体|配色|排版|压字|文字清晰/i.test(s);
  for (const r of rows) {
    const text = r.prompt_text || '';
    const scene = r.prompt_scene || '';
    if (!text || !scene) continue;
    if (looksBg(text) && !looksText(text) && looksText(scene) && !looksBg(scene)) {
      db.prepare('UPDATE template_types SET prompt_text = ?, prompt_scene = ? WHERE id = ?').run(scene, text, r.id);
      console.log(`[migrate] 模板标签「${r.name}」的内置背景/文字提示词已纠正顺序`);
    }
  }
}

// 提示语 / 引导语：超管可自定义（覆盖前端与后端的默认文案）
db.exec(`
  CREATE TABLE IF NOT EXISTS ui_texts (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// 用户级模块权限（由项目经理 / 部门主管 / 超管勾选分配；不得超过该角色上限）
db.exec(`
  CREATE TABLE IF NOT EXISTS user_perms (
    user_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    perm TEXT NOT NULL DEFAULT 'none',
    PRIMARY KEY (user_id, module),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);


// 迁移：模板标签类型可配置「默认文字提示词 / 默认背景提示词 / 是否拼图」
if (!hasColumn('template_types', 'prompt_text')) db.exec('ALTER TABLE template_types ADD COLUMN prompt_text TEXT');
if (!hasColumn('template_types', 'prompt_scene')) db.exec('ALTER TABLE template_types ADD COLUMN prompt_scene TEXT');
if (!hasColumn('template_types', 'puzzle')) db.exec('ALTER TABLE template_types ADD COLUMN puzzle INTEGER NOT NULL DEFAULT 0');
// 背景提示词里配置的画面比例（供后台下拉设置，如 3:4 / 1:1 / 16:9 / 9:16）
// 模板标签的比例设置已移除：所有 AI 生图统一以画布比例为准

/** 透明 PNG 说明（拼图 / 底图压字等需要抠字透明的标签用；大字报不追加） */
const TRANSPARENT_CLAUSE =
  '参考图1为文字样式模板（对照其字体、配色、排版风格），参考图2为底图/产品主体（用于适配构图与色彩）；' +
  '生成与参考图1风格一致、并和谐适配参考图2的文字排版 PNG。' +
  '输出为透明背景 PNG：除文字本身外，所有区域必须为完全透明（Alpha=0），不得出现背景色块、白色底、渐变底色或水印。' +
  '文字清晰锐利、笔画完整、风格突出。';
const SCENE_CLAUSE_WITH_PRODUCT =
  '图生图：以参考图片中的产品为主体，生成一张完整场景背景图（含该产品与环境）。' +
  '产品需保持在参考图中的外观与画面位置，其余部分绘制为环境背景（地面、墙面、光影、阴影、道具等），' +
  '画面中不得出现额外文字、Logo、水印或第二个主体。';

// 预置模板标签类型（用户可增删改）：名称、画布界面（A=底图界面 / B=产品+AI背景界面）、默认文字提示词、默认背景提示词、是否拼图
const DEFAULT_TEMPLATE_TYPES: [string, string, string, string, number][] = [
  ['底图+压字', 'A', TRANSPARENT_CLAUSE, '', 0],
  ['产品+AI背景+压字', 'B', TRANSPARENT_CLAUSE, SCENE_CLAUSE_WITH_PRODUCT, 0],
  ['大字报', 'A', '', '', 0],
  ['拼图+压字', 'A', TRANSPARENT_CLAUSE, '', 1],
  ['AI背景', 'B', '', SCENE_CLAUSE_WITH_PRODUCT, 0],
  ['实拍背景', 'A', '', '', 0],
  ['棚拍效果', 'A', '', '', 0],
];
// 旧标签名 → 新标签名（保持已有模板的归属不丢）
const RENAMED_TYPES: [string, string][] = [
  ['底图压字', '底图+压字'],
  ['产品+背景+压字', '产品+AI背景+压字'],
  ['拼图压字', '拼图+压字'],
];
for (const [from, to] of RENAMED_TYPES) {
  const dup = db.prepare('SELECT id FROM template_types WHERE name = ?').get(to) as { id: number } | undefined;
  const old = db.prepare('SELECT id FROM template_types WHERE name = ?').get(from) as { id: number } | undefined;
  if (old && !dup) db.prepare('UPDATE template_types SET name = ? WHERE id = ?').run(to, old.id);
  else if (old && dup) {
    db.prepare('UPDATE reference_images SET template_type_id = ? WHERE template_type_id = ?').run(dup.id, old.id);
    db.prepare('DELETE FROM template_types WHERE id = ?').run(old.id);
  }
}
// 只在「表里一条标签都没有」时预置默认标签：
// 之后用户在后台删除的标签不会被重新创建（用户反馈：删掉实拍背景/棚拍效果，重启后又出现）
{
  const existing = (db.prepare('SELECT COUNT(*) AS c FROM template_types').get() as { c: number }).c;
  if (existing === 0) {
    DEFAULT_TEMPLATE_TYPES.forEach(([name, kind, promptText, promptScene, puzzle], i) => {
      db.prepare('INSERT INTO template_types (name, path_kind, sort, prompt_text, prompt_scene, puzzle) VALUES (?, ?, ?, ?, ?, ?)').run(
        name, kind, i, promptText, promptScene, puzzle
      );
    });
  } else {
    // 老库补齐：仅补「界面 / 拼图标记」与空提示词的默认值，不新增用户已删除的标签
    DEFAULT_TEMPLATE_TYPES.forEach(([name, kind, promptText, promptScene, puzzle]) => {
      const row = db.prepare('SELECT id FROM template_types WHERE name = ?').get(name) as { id: number } | undefined;
      if (!row) return;
      db.prepare('UPDATE template_types SET path_kind = ?, puzzle = ? WHERE id = ?').run(kind, puzzle, row.id);
      if (promptText) db.prepare("UPDATE template_types SET prompt_text = ? WHERE id = ? AND (prompt_text IS NULL OR prompt_text = '')").run(promptText, row.id);
      if (promptScene) db.prepare("UPDATE template_types SET prompt_scene = ? WHERE id = ? AND (prompt_scene IS NULL OR prompt_scene = '')").run(promptScene, row.id);
    });
  }
}
// 模板：把旧的 kind(A/B) 映射到标签类型
{
  const a = db.prepare("SELECT id FROM template_types WHERE path_kind = 'A' ORDER BY sort, id LIMIT 1").get() as { id: number } | undefined;
  const b = db.prepare("SELECT id FROM template_types WHERE path_kind = 'B' ORDER BY sort, id LIMIT 1").get() as { id: number } | undefined;
  if (a) db.prepare("UPDATE reference_images SET template_type_id = ? WHERE template_type_id IS NULL AND kind <> 'B'").run(a.id);
  if (b) db.prepare("UPDATE reference_images SET template_type_id = ? WHERE template_type_id IS NULL AND kind = 'B'").run(b.id);
}

// 迁移：素材归属支持「类别」（2 级品牌：品牌-类别，无型号）
if (!hasColumn('assets', 'category_id')) {
  db.exec('ALTER TABLE assets ADD COLUMN category_id INTEGER');
  db.exec(
    'UPDATE assets SET category_id = (SELECT category_id FROM models WHERE models.id = assets.model_id) WHERE category_id IS NULL AND model_id IS NOT NULL'
  );
}

// 迁移：品牌产品层级（2 = 品牌-类别；3 = 品牌-类别-型号）
if (!hasColumn('brands', 'product_level')) db.exec('ALTER TABLE brands ADD COLUMN product_level INTEGER NOT NULL DEFAULT 3');
// 迁移：项目内产品也支持二级产品（category_id + 可空 model_id）
if (!hasColumn('project_models', 'category_id')) {
  db.exec('ALTER TABLE project_models ADD COLUMN category_id INTEGER');
  db.exec('UPDATE project_models SET category_id = (SELECT category_id FROM models WHERE models.id = project_models.model_id) WHERE category_id IS NULL');
}
// 迁移：旧表 model_id 为 NOT NULL（二级产品需要为空）→ 重建表
{
  const cols = db.prepare('PRAGMA table_info(project_models)').all() as { name: string; notnull: number }[];
  const modelCol = cols.find((c) => c.name === 'model_id');
  if (modelCol && modelCol.notnull) {
    db.exec(`
      CREATE TABLE project_models_new (
        project_id INTEGER NOT NULL,
        category_id INTEGER,
        model_id INTEGER,
        PRIMARY KEY (project_id, category_id, model_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO project_models_new (project_id, category_id, model_id)
        SELECT project_id, category_id, model_id FROM project_models;
      DROP TABLE project_models;
      ALTER TABLE project_models_new RENAME TO project_models;
    `);
  }
}
// 迁移：补齐行内产品 category_id，并按 (项目, 类别, 型号) 去重（NULL 在唯一索引中视为不同值，需显式处理）
db.exec(`
  DROP INDEX IF EXISTS idx_project_products;
  DELETE FROM project_models
   WHERE category_id IS NULL AND model_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM project_models x
        WHERE x.project_id = project_models.project_id
          AND x.model_id = project_models.model_id
          AND x.category_id = (SELECT category_id FROM models WHERE models.id = project_models.model_id)
     );
  UPDATE project_models SET category_id = (SELECT category_id FROM models WHERE models.id = project_models.model_id)
   WHERE category_id IS NULL AND model_id IS NOT NULL;
  DELETE FROM project_models WHERE rowid NOT IN (
    SELECT MIN(rowid) FROM project_models GROUP BY project_id, IFNULL(category_id, 0), IFNULL(model_id, 0)
  );
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_products ON project_models (project_id, IFNULL(category_id, 0), IFNULL(model_id, 0))');

// 迁移：把旧的单标签 assets.tag 转成素材标签表 + 关联
{
  const rows = db.prepare("SELECT id, tag FROM assets WHERE tag IS NOT NULL AND tag <> ''").all() as { id: number; tag: string }[];
  for (const r of rows) {
    const names = String(r.tag).split(/[,，、/]/).map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      let tag = db.prepare('SELECT id FROM asset_tags WHERE name = ?').get(name) as { id: number } | undefined;
      if (!tag) {
        const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM asset_tags').get() as { s: number };
        tag = { id: Number(db.prepare('INSERT INTO asset_tags (name, sort) VALUES (?, ?)').run(name, max.s + 1).lastInsertRowid) };
      }
      db.prepare('INSERT OR IGNORE INTO asset_tag_links (asset_id, tag_id) VALUES (?, ?)').run(r.id, tag.id);
    }
  }
}

// 迁移：为每个品牌建「默认类别」，把其下暂无类别的项目挂进去
const brandsAll = db.prepare('SELECT id FROM brands').all() as { id: number }[];
for (const b of brandsAll) {
  const cat = db.prepare('SELECT id FROM categories WHERE brand_id = ? AND name = ?').get(b.id, '默认类别') as { id: number } | undefined;
  let catId: number;
  if (cat) {
    catId = cat.id;
  } else {
    const ins = db.prepare('INSERT INTO categories (brand_id, name) VALUES (?, ?)').run(b.id, '默认类别');
    catId = Number(ins.lastInsertRowid);
  }
  db.prepare('UPDATE projects SET category_id = ? WHERE brand_id = ? AND category_id IS NULL').run(catId, b.id);
}

// 迁移：为每个类别建「默认型号」，把该类别下的项目挂上（项目 ↔ 型号 多对多）
{
  const catsAll = db.prepare('SELECT id FROM categories').all() as { id: number }[];
  for (const c of catsAll) {
    const m = db.prepare('SELECT id FROM models WHERE category_id = ? AND name = ?').get(c.id, '默认型号') as { id: number } | undefined;
    const modelId = m
      ? m.id
      : Number(db.prepare('INSERT INTO models (category_id, name) VALUES (?, ?)').run(c.id, '默认型号').lastInsertRowid);
    const projs = db.prepare('SELECT id FROM projects WHERE category_id = ?').all(c.id) as { id: number }[];
    for (const p of projs) {
      db.prepare('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)').run(p.id, modelId);
    }
  }
}

// 迁移：原有项目成员默认为「可修改」（管理员/项目经理），其余保持「仅查看」
db.exec(`
  UPDATE project_members SET can_edit = 1
  WHERE can_edit = 0 AND user_id IN (SELECT id FROM users WHERE role IN ('super_admin','admin','pm'))
`);

// 迁移：角色体系调整（普通管理员 → 部门主管）
db.exec("UPDATE users SET role = 'dept_head' WHERE role = 'admin'");

// 预置素材类型（用户可增删改）
[['scene', '底图'], ['product', '产品图'], ['sticker', '贴纸']].forEach(([code, name], i) => {
  const row = db.prepare('SELECT code FROM asset_types WHERE code = ?').get(code);
  if (!row) db.prepare('INSERT INTO asset_types (code, name, sort) VALUES (?, ?, ?)').run(code, name, i);
});

// 迁移：清理指向已删除项目的脏数据（素材/模板转为通用）
db.exec(`
  UPDATE assets SET project_id = NULL
   WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);
  UPDATE reference_images SET project_id = NULL
   WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);
  DELETE FROM project_models WHERE project_id NOT IN (SELECT id FROM projects);
  DELETE FROM project_members WHERE project_id NOT IN (SELECT id FROM projects);
`);

export function now(): string {
  return new Date().toISOString();
}
