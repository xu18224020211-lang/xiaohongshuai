import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { config } from './config';
import { saveAiConfig } from './services/ai';

fs.mkdirSync(config.uploadDir, { recursive: true });

function writeSvg(name: string, svg: string): string {
  const file = path.join(config.uploadDir, name);
  fs.writeFileSync(file, svg, 'utf8');
  return `/uploads/${name}`;
}

const hasUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };

if (hasUsers.c === 0) {
  // 品牌 / 项目
  const brand = db.prepare('INSERT INTO brands (name) VALUES (?)').run('示例品牌');
  const brandId = Number(brand.lastInsertRowid);
  const project = db.prepare('INSERT INTO projects (brand_id, name) VALUES (?, ?)').run(brandId, '小红书封面项目');
  const projectId = Number(project.lastInsertRowid);

  // 用户
  const admin = db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run('admin', bcrypt.hashSync('admin123', 10), '超级管理员', 'super_admin');
  const pm = db.prepare('INSERT INTO users (username, password_hash, display_name, role, brand_id) VALUES (?, ?, ?, ?, ?)')
    .run('pm', bcrypt.hashSync('pm123', 10), '项目经理', 'pm', brandId);
  const user = db.prepare('INSERT INTO users (username, password_hash, display_name, role, brand_id) VALUES (?, ?, ?, ?, ?)')
    .run('user', bcrypt.hashSync('user123', 10), '设计师小王', 'user', brandId);
  const userId = Number(user.lastInsertRowid);
  db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(projectId, userId);

  console.log('[seed] 账号已创建: admin/admin123, pm/pm123, user/user123');

  // AI 配置（从 .env 初始化）
  saveAiConfig({
    endpoint: config.ai.endpoint,
    api_key: config.ai.apiKey,
    model: config.ai.model,
    timeout_ms: config.ai.timeoutMs,
  });
  console.log('[seed] AI 配置已写入（可用后台页面修改）');
} else {
  console.log('[seed] 账号已存在，跳过用户/品牌初始化');
  const p1 = db.prepare('SELECT id FROM brands ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (p1) {
    // 确保 ai_config 存在
    saveAiConfig({
      endpoint: config.ai.endpoint,
      api_key: config.ai.apiKey,
      model: config.ai.model,
      timeout_ms: config.ai.timeoutMs,
    });
  }
}

// 示例素材 + 参考图（幂等：以固定文件名写入，重复执行覆盖）
function ensureDemoAssets() {
  const brandId = (db.prepare('SELECT id FROM brands ORDER BY id LIMIT 1').get() as { id: number })?.id;
  if (!brandId) return;

  const scenes = [
    {
      name: '极简白工作室',
      url: writeSvg('demo-scene-studio.svg',
        `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2efe9"/><stop offset="1" stop-color="#d8cdbd"/></linearGradient></defs><rect width="1080" height="1440" fill="url(#g)"/><rect y="1150" width="1080" height="290" fill="#b9a786"/><rect y="1180" width="1080" height="14" fill="#a08d6f"/></svg>`),
    },
    {
      name: '木质暖光',
      url: writeSvg('demo-scene-wood.svg',
        `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"><rect width="1080" height="1440" fill="#3a2d24"/><rect y="900" width="1080" height="540" fill="#5a4636"/><g stroke="#2e221b" stroke-width="8"><line x1="0" y1="1000" x2="1080" y2="1000"/><line x1="0" y1="1120" x2="1080" y2="1120"/><line x1="0" y1="1260" x2="1080" y2="1260"/></g></svg>`),
    },
  ];
  for (const s of scenes) {
    db.prepare('INSERT OR IGNORE INTO assets (id, brand_id, type, name, url) VALUES (?, ?, ?, ?, ?)')
      .run(101 + scenes.indexOf(s), brandId, 'scene', s.name, s.url);
  }

  const productUrl = writeSvg('demo-product-bottle.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect x="320" y="160" width="160" height="460" rx="34" fill="#242424"/><rect x="350" y="110" width="100" height="76" rx="14" fill="#242424"/><rect x="340" y="280" width="120" height="220" rx="16" fill="#f4f1ea"/><text x="400" y="380" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="middle" fill="#333">精华</text></svg>`);
  db.prepare('INSERT OR IGNORE INTO assets (id, brand_id, type, name, url) VALUES (?, ?, ?, ?, ?)')
    .run(201, brandId, 'product', '示例精华液产品图(PNG透明)', productUrl);

  const stickers = [
    { name: '限时抢-红', url: writeSvg('demo-sticker-red.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="200" y="130" font-family="sans-serif" font-size="96" font-weight="900" text-anchor="middle" fill="#ff3b5c">限时抢</text></svg>`) },
    { name: '新品-金', url: writeSvg('demo-sticker-gold.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="200" y="130" font-family="sans-serif" font-size="96" font-weight="900" text-anchor="middle" fill="#d9a441">新品上市</text></svg>`) },
  ];
  for (const st of stickers) {
    db.prepare('INSERT OR IGNORE INTO assets (id, brand_id, type, name, url) VALUES (?, ?, ?, ?, ?)')
      .run(301 + stickers.indexOf(st), brandId, 'sticker', st.name, st.url);
  }

  const refs = [
    { name: '黑底大字标题', prompt: '黑色背景，超大白字粗体中文标题「夏日必备」，下方一行金色英文小字，居中排版，高级杂志风', url: writeSvg('demo-ref-1.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#16161a"/><text x="300" y="340" font-family="sans-serif" font-size="92" font-weight="900" fill="#ffffff" text-anchor="middle">夏日必备</text><text x="300" y="450" font-family="sans-serif" font-size="38" fill="#ffd166" text-anchor="middle">SUMMER MUST-HAVE</text></svg>`) },
    { name: '粉彩圆点风', prompt: '粉色渐变背景，白色圆润粗体中文「限时折扣」，加圆点装饰，甜美可爱风', url: writeSvg('demo-ref-2.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c1"/><stop offset="1" stop-color="#ff8fab"/></linearGradient></defs><rect width="600" height="800" fill="url(#p)"/><circle cx="90" cy="120" r="26" fill="#ffffff" opacity="0.5"/><circle cx="520" cy="200" r="18" fill="#ffffff" opacity="0.5"/><text x="300" y="430" font-family="sans-serif" font-size="78" font-weight="900" fill="#ffffff" text-anchor="middle">限时折扣</text></svg>`) },
    { name: '极简留白', prompt: '白色极简背景，黑色细体中文标题「新品首发」，大量留白，文艺简约风', url: writeSvg('demo-ref-3.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#ffffff"/><text x="300" y="380" font-family="serif" font-size="76" font-weight="300" fill="#1a1a1a" text-anchor="middle">新品首发</text><line x1="200" y1="430" x2="400" y2="430" stroke="#1a1a1a" stroke-width="2"/></svg>`) },
    { name: '荧光撞色', prompt: '荧光绿与黑撞色，夸张粗体中文「爆款推荐」，带斜切色块，潮流街头风', url: writeSvg('demo-ref-4.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#c9f31d"/><rect x="0" y="300" width="600" height="200" fill="#111111"/><text x="300" y="430" font-family="sans-serif" font-size="90" font-weight="900" fill="#c9f31d" text-anchor="middle">爆款推荐</text></svg>`) },
    { name: '磨砂蓝调', prompt: '深蓝磨砂质感背景，白色加粗中文「秋冬上新」，底部细英文，质感高级', url: writeSvg('demo-ref-5.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#0f2440"/><text x="300" y="390" font-family="sans-serif" font-size="80" font-weight="800" fill="#ffffff" text-anchor="middle">秋冬上新</text><text x="300" y="470" font-family="sans-serif" font-size="30" fill="#8fb7d9" text-anchor="middle">AUTUMN &amp; WINTER</text></svg>`) },
    { name: '红金喜庆', prompt: '中国红背景，金色立体大字「年货节」，喜庆促销风，有祥云装饰', url: writeSvg('demo-ref-6.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#c8102e"/><text x="300" y="430" font-family="sans-serif" font-size="86" font-weight="900" fill="#ffd700" text-anchor="middle">年货节</text><text x="300" y="520" font-family="sans-serif" font-size="32" fill="#ffe9a8" text-anchor="middle">新年大促</text></svg>`) },
    { name: '产品+场景·奶油风（路径B）', kind: 'B', scene: '奶油色极简桌面，柔和自然光，浅木纹背景，产品置于画面中央，带柔和投影', prompt: '奶白色圆润粗体中文「温和养护」，浅灰小字英文副标题，极简高级', url: writeSvg('demo-ref-7.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3ede4"/><stop offset="1" stop-color="#e2d5c2"/></linearGradient></defs><rect width="600" height="800" fill="url(#c)"/><rect y="560" width="600" height="240" fill="#d8c6a8"/><rect x="250" y="330" width="100" height="230" rx="20" fill="#3a3a3a"/><rect x="266" y="280" width="68" height="66" rx="10" fill="#3a3a3a"/><text x="300" y="620" font-family="sans-serif" font-size="46" font-weight="900" fill="#ffffff" text-anchor="middle">温和养护</text></svg>`) },
  ];
  for (const r of refs) {
    const scene = (r as { scene?: string }).scene ?? null;
    const kind = (r as { kind?: string }).kind ?? 'A';
    const existing = db.prepare('SELECT id FROM reference_images WHERE url = ?').get(r.url) as { id: number } | undefined;
    if (existing) {
      db.prepare('UPDATE reference_images SET name = ?, text_style_prompt = ?, scene_prompt = ?, kind = ? WHERE id = ?')
        .run(r.name, r.prompt, scene, kind, existing.id);
    } else {
      db.prepare('INSERT INTO reference_images (brand_id, name, url, text_style_prompt, scene_prompt, kind) VALUES (?, ?, ?, ?, ?, ?)')
        .run(brandId, r.name, r.url, r.prompt, scene, kind);
    }
  }

  console.log('[seed] 示例素材与参考图已就绪');
}

ensureDemoAssets();
console.log('[seed] 完成');
