/**
 * 「智能参考」标签的识别与规则（系统里唯一的特例标签）：
 * - 后台/前端都按标签名识别（超管可改名字，改完这里也跟着走）
 * - 该标签只允许有 1 个模板；前端首页排第一；画布中不能「换一个」
 * - 该模板可以配一张「遮罩层图片」：前端预览与画布图1 用遮罩盖住真实参考图，提交 AI 仍用原图
 */
export const SMART_REF_NAME = '智能参考';

/** 名称是否属于「智能参考」标签 */
export function isSmartRefName(name?: string | null): boolean {
  return !!name && name.includes(SMART_REF_NAME);
}

/** 模板标签对象是否为「智能参考」 */
export function isSmartRefType(t?: { name?: string | null } | null): boolean {
  return isSmartRefName(t?.name);
}
