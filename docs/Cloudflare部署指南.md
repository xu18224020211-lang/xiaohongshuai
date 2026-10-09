# Cloudflare Pages 部署指南（前端）

**架构**：前端放 Cloudflare Pages（全球 CDN、国内访问比 Vercel 稳定），后端放阿里云。

```
用户浏览器
   │
   ├── 网页 (HTML/JS/CSS) ──→ Cloudflare Pages      ← 本指南
   │
   └── 接口 (/api/...)    ──→ 阿里云服务器:4000      ← 见《阿里云部署指南.md》
```

---

## 一、先回答：为什么之前 /login 会 404

你的前端用 `BrowserRouter`（真实 URL 路径）。直接访问或刷新 `/login` 时，
Cloudflare 会在构建产物里找名为 `login` 的文件，找不到就返回 404。

**修复方式**：让所有找不到的路径统一返回 `index.html`，交给前端路由处理。
本项目已内置 `client/public/_redirects`，构建时会自动复制到产物根目录，**无需额外配置**：

```
/*  /index.html  200
```

---

## 二、部署步骤

### 1. 创建 Pages 项目

登录 https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**

选择仓库 `xiaohongshu-cover-designer`。

### 2. 填写构建设置（关键，不要用默认值）

因为这是 npm workspaces 多包项目，**必须改这几项**：

| 配置项 | 值 |
|---|---|
| Framework preset | `None`（或 Vite，但要检查下面几项） |
| **Build command** | `npm run build -w client` |
| **Build output directory** | `client/dist` |
| **Root directory** | 留空（保持仓库根目录） |

> ⚠️ 如果 Build command 用默认的 `npm run build`，会走根 package.json，
> 多包环境下可能报你之前遇到的 workspace 错误。

### 3. 配置环境变量（关键）

在 **Settings → Environment variables** 添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `VITE_API_BASE` | `http://你的阿里云IP:4000` | 后端地址，**末尾不要加斜杠** |

> 这个变量在**构建时**注入，改完必须**重新部署**才生效。
>
> 如果以后绑了域名并配了 HTTPS，这里要改成 `https://api.你的域名.com`，
> 否则浏览器会拦截「HTTPS 页面请求 HTTP 接口」的混合内容。

### 4. 部署

点击 **Save and Deploy**。完成后会得到一个地址，形如：

```
https://xiaohongshu-cover-designer.pages.dev
```

---

## 三、后端必须放行 CORS（已内置）

前端在 `pages.dev`、后端在阿里云 IP，属于**跨域请求**。

后端代码里已有 `app.use(cors())`（`server/src/index.ts`），
默认允许所有来源，**开箱即用，无需额外配置**。

> 如果以后想收紧到只允许自己的域名，可以改成：
> ```ts
> app.use(cors({ origin: ['https://你的前端域名.pages.dev'] }));
> ```

---

## 四、验证清单

部署完成后依次确认：

| 检查项 | 怎么做 | 预期 |
|---|---|---|
| 页面能打开 | 访问 `https://xxx.pages.dev` | 显示首页 |
| 路由不 404 | 直接访问 `https://xxx.pages.dev/login` 并**刷新** | 正常显示登录页 |
| 接口连通 | 打开登录页，按 F12 → Network，随便登录一次 | 请求打到你的阿里云 IP，返回 200 |
| 图片能显示 | 登录后进入设计页，上传一张底图 | 图片正常显示 |
| AI 能生图 | 配置好密钥后点生成 | 正常出图 |

**如果登录报 CORS 错误** → 检查阿里云安全组是否放行 4000 端口。
**如果登录报 404** → 检查 `VITE_API_BASE` 是否填对、是否重新部署过。
**如果图片裂开** → 确认后端已重启（`pm2 restart`），让 `apiUrl()` 生效。

---

## 五、与 Vercel 的对比

| | Cloudflare Pages | Vercel |
|---|---|---|
| 国内访问 | ⚠️ 尚可（比 Vercel 好） | ❌ 基本打不开 |
| 免费额度 | 无限带宽 | 100GB/月 |
| 自定义域名 | 支持 | 支持 |
| SPA 路由 | 支持（本项目已配） | 支持 |

仓库里两个平台的配置文件都放好了（`client/public/_redirects` + `vercel.json`），
**用哪个平台都不用改代码**。

---

## 六、自定义域名（可选）

Cloudflare Pages → 你的项目 → **Custom domains** → **Set up a domain**

- 域名 DNS 若也在 Cloudflare：一键接入
- 域名在阿里云：在阿里云添加 CNAME 记录指向 `xxx.pages.dev`

**注意**：前端域名不需要备案（Cloudflare 是境外服务）。
但**后端**如果绑域名且服务器在国内，则需要备案 —— 所以后端建议一直用 `IP:端口`。
