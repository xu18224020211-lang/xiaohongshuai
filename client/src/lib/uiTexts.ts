import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * 提示语 / 引导语：默认文案在这里，超管可在「后台 → 站点设置 → 提示语」里覆盖。
 * 用法：const T = useUiTexts(); ... {T('designer.canvasHint.product')}
 */
export const UI_TEXT_DEFAULTS: Record<string, string> = {
  // ===== 首页 =====
  'home.title': '挑模板，做封面',
  'home.subtitle': '挑一个模板 → 放进你的底图 / 产品图 → AI 出背景与文字 → 一键合成导出',
  'home.cta': '点击设计',
  'home.empty': '当前筛选下暂无模板，可放宽右上角筛选，或在「管理 → 模板库」上传',
  // ===== 画布 =====
  'designer.canvasHint.product': '请上传或从素材库中选择底图或者产品图',
  'designer.canvasHint.textOnly': '请修改文字样式提示词后AI生成',
  'designer.canvasHint.noScene': '无需设置底图，修改文案后直接生成',
  /** 画布中心「+」号上方的提示语（超管可就地修改） */
  'designer.canvasHint.plusScene': '请配置底图',
  'designer.slot.emptyScene': '尚未设置底图',
  'designer.slot.emptyProduct': '尚未设置产品图',
  /** 大字报等纯文字标签：底图位留空时的提示 */
  'designer.slot.textOnly': '可直接修改文案后生成',
  'designer.slot.scene2': '底图（图2）',
  'designer.slot.product2': '产品图（图2）',
  'designer.tagLabel': '模板标签（决定画布界面）',
  'designer.pathLabel.a': '路径A · 底图 + 文字',
  'designer.pathLabel.b': '路径B · 产品 + AI背景 + 文字',
  'designer.pathLabel.prefix': '当前界面：',
  'designer.layers.title': '图层（上→下，最下为最底层）',
  'designer.layers.empty': '画布暂无图层，请在左侧添加底图/产品/文字',
  'designer.picker.hint': '默认显示全部素材，请下拉选择专属项目精准选取素材。',
  'designer.tagSection.bgTitle': '已内置背景提示词',
  'designer.tagSection.textTitle': 'AI文案内容（可修改）',
  'designer.tagSection.tagTextTitle': '已内置文字样式提示词',
  'designer.editLink': '修改',
  'designer.sendBg': '本次发送：背景提示词 + 背景内置提示词（先生成背景）',
  'designer.sendText': '本次发送：文字样式提示词 + 文字内置提示词（后生成文字）',
  /** 切换模板标签（含 A/B 与同类标签内部切换）时的提示文案 */
  'designer.switch.title': '切换界面',
  'designer.switch.line1': '切换到「{path}」将清空当前画布的底图 / 产品 / 拼图 / 图层内容。',
  'designer.switch.line2': '离开当前界面会丢失画布数据。可选择「保存并切换」（先填名称保存设计稿），或「不保存，直接切换」丢弃当前内容。',
  'designer.switch.save': '保存并切换',
  'designer.switch.discard': '不保存，直接切换',
  /** 右侧素材栏：悬停提示 */
  'designer.pickLabel': '选用',
  /** 图1 预览：换一个模板 */
  'designer.swapTemplate': '换一个',
  /** 「智能参考」标签名；这是唯一的特例标签（只允许 1 个模板、预览盖遮罩、不能换一个、首页排第一） */
  'designer.smartRef': '智能参考',
  // ===== 素材大类 =====
  'asset.kind.product': '产品类',
  'asset.kind.sticker': '贴图类',
  'asset.tagPlaceholder.product': '选择标签',
  'asset.tagPlaceholder.sticker': '选择标签',
  'asset.pickHint': '选用（添加到画布中的上面一层，原画布中的图层不会删除）',
  // ===== 后台 =====
  'admin.users.desc': '层级：超管 → 高级管理者 → 项目经理 → 部门主管 → 部门成员 / 项目成员 / 普通用户。项目成员归属到某位项目经理、部门成员归属到某位部门主管；点左侧「▾」可展开成员，项目经理名下有多个项目时会先按项目分组。',
  'admin.assets.desc': '默认显示权限内的全部素材；先选大类（产品类 / 贴图类，只能二选一）：产品类按 品牌 → 产品 → 型号 → 标签 筛选，贴图类按 标签 筛选。点击素材即可修改。',
  'admin.products.desc': '品牌（1级）→ 类别（2级）→ 型号（3级）。有的品牌只有两级（如特斯拉：品牌-类别），有的三级（如格力：品牌-类别-型号）——在品牌里配置。',
  'admin.dashboard.desc': '看到的数字与内容都按你的权限范围统计。',
  'admin.settings.desc': '网页名称（浏览器标签上的名字）/ 首页标题 / Logo / 备案信息，以及可在线修改的提示语。',
  'admin.ai.desc': 'AI 网关（出图接口）配置：填 Key 与模型即可。',
  'admin.templates.desc': '模板分为「通用模板」与「项目专属模板」。可按模板标签筛选；专属模板按 品牌 → 产品 → 项目 三个下拉查看。',
  'admin.projects.desc': '每个项目：包含哪些产品（型号）+ 专属素材 + 专属模板。项目时间用日历选择。',
  'admin.profile.desc': '可修改自己的昵称、用户名（登录账号）与密码；角色与权限由上级管理员分配，不可自行修改。',
};

const CACHE: Record<string, string> = {};
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** 载入超管自定义的提示语（只覆盖有配置的键） */
export function loadUiTexts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = api.listUiTexts()
      .then((r) => {
        for (const [k, v] of Object.entries(r.texts || {})) if (v) CACHE[k] = v;
        loaded = true;
        listeners.forEach((fn) => fn());
      })
      .catch(() => { loaded = true; });
  }
  return loading;
}

/** 强制重新拉取提示语（超管就地改完文案后即时刷新） */
export function reloadUiTexts(): Promise<void> {
  loaded = false;
  loading = null;
  return loadUiTexts();
}

/** 取提示语（自定义优先，否则用默认） */
export function uiText(key: string): string {
  return CACHE[key] ?? UI_TEXT_DEFAULTS[key] ?? key;
}

/** 订阅式 hook：首次调用会触发载入，载入完成后自动刷新文案 */
export function useUiTexts(): (key: string) => string {
  const [, bump] = useState(0);
  useEffect(() => {
    void loadUiTexts();
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return uiText;
}
