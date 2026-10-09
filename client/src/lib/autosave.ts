import { api } from './api';
import { getMaskVersion } from './mask';
import { useDesign } from '../store/design';
import { useUi } from '../store/ui';

export async function nextDesignName(projectId: number): Promise<string> {
  try {
    const { designs } = await api.listDesigns(projectId);
    let max = 0;
    for (const d of designs) {
      const m = /^未命名设计(\d+)$/.exec(d.name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `未命名设计${max + 1}`;
  } catch {
    return '未命名设计1';
  }
}

/** 画布内容签名（不含选中/画笔等纯 UI 状态） */
export function designSig(): string {
  const st = useDesign.getState();
  const pos = (o: { url: string; x: number; y: number; width: number; height: number; rotation: number } | null) =>
    o ? [o.url, Math.round(o.x), Math.round(o.y), Math.round(o.width), Math.round(o.height), Math.round(o.rotation)] : null;
  return JSON.stringify({
    w: st.canvasWidth,
    h: st.canvasHeight,
    p: st.path,
    l1: pos(st.layer1),
    l2: pos(st.layer2),
    l3: st.layer3.map((i) => [...(pos(i) as unknown[]), i.z, i.opacity, i.removeWhite ? 1 : 0]),
    pz: st.puzzle
      ? [
          st.puzzle.count,
          Math.round(st.puzzle.x),
          Math.round(st.puzzle.y),
          Math.round(st.puzzle.width),
          Math.round(st.puzzle.height),
          st.puzzle.cells.map((c) => (c ? [c.url, Number(c.zoom.toFixed(3)), Math.round(c.offsetX), Math.round(c.offsetY)] : null)),
        ]
      : null,
    mask: getMaskVersion(),
  });
}

/** 上次保存（或刚载入）时的内容基线；null = 尚无基线 */
let savedSig: string | null = null;

/** 建立/更新保存基线：载入完成或保存成功后调用 */
export function markDesignSaved() {
  savedSig = designSig();
}

/** 清空基线（新建空白画布时调用） */
export function resetDesignBaseline() {
  savedSig = null;
}

/** 画布是否有内容（用于离开/切换提示） */
export function isDesignDirty(): boolean {
  const st = useDesign.getState();
  const hasContent = !!(st.layer1 || st.layer2 || st.layer3.length || st.puzzle);
  if (!hasContent) return false;
  if (savedSig === null) return true;
  return savedSig !== designSig();
}

/**
 * 立即保存当前设计。
 * - 从未保存过：自动取「未命名设计N」命名并创建（若用户已自定义名称则用自定义名）
 * - 已保存过：按当前名称更新
 */
export async function saveDesignNow(opts?: { defaultName?: boolean }): Promise<{ ok: boolean; msg?: string }> {
  const st = useDesign.getState();
  let projectId = st.projectId ?? useUi.getState().projectId;
  // 没选项目时：自动落到「自己权限内的第一个项目」，避免保存失败
  if (!projectId) {
    try {
      const r = await api.listProjects();
      projectId = r.projects[0]?.id ?? null;
      if (projectId) {
        st.setProjectId(projectId);
        useUi.getState().setProjectId(projectId);
      }
    } catch {
      projectId = null;
    }
  }
  if (!projectId) return { ok: false, msg: '请先返回首页选择项目后再保存' };
  try {
    let name = st.designName;
    if (!st.designId) {
      const isCustom = name !== '未命名设计1' && !/^未命名设计\d+$/.test(name);
      if (opts?.defaultName || !isCustom) {
        name = await nextDesignName(projectId);
      }
      st.setDesignName(name);
    }
    const snap = st.snapshot();
    if (st.designId) {
      await api.updateDesign(st.designId, {
        name,
        canvas_width: snap.canvasWidth,
        canvas_height: snap.canvasHeight,
        layers_json: snap.layers,
      });
    } else {
      const r = await api.createDesign({
        name,
        project_id: projectId,
        canvas_width: snap.canvasWidth,
        canvas_height: snap.canvasHeight,
        layers_json: snap.layers,
      });
      st.setDesignId(r.design.id);
    }
    markDesignSaved();
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '保存失败' };
  }
}
