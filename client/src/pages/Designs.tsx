import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../store/ui';
import { api } from '../lib/api';
import type { DesignMeta } from '../lib/types';

export default function Designs() {
  const projectId = useUi((s) => s.projectId);
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<DesignMeta[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    api
      .listDesigns(projectId ?? undefined)
      .then((r) => setDesigns(r.designs))
      .catch(() => setDesigns([]))
      .finally(() => setBusy(false));
  }, [projectId]);

  async function removeDesign(id: number) {
    if (!confirm('确认删除该设计稿？')) return;
    await api.deleteDesign(id);
    api.listDesigns(projectId ?? undefined).then((r) => setDesigns(r.designs)).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <h1 className="mb-6 text-2xl font-bold text-white">我的设计稿</h1>
        {busy ? (
          <div className="text-zinc-500">加载中…</div>
        ) : designs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-16 text-center text-zinc-500">
            暂无设计稿，点击右上角用户头像 →「新建设计」开始
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {designs.map((d) => (
              <div key={d.id} className="card p-4">
                <div className="grid h-24 place-items-center rounded-lg bg-zinc-950 text-4xl text-zinc-700">🖼</div>
                <div className="mt-3 truncate text-sm font-medium text-zinc-200">{d.name}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {d.canvas_width}×{d.canvas_height} · {d.updated_at?.slice(0, 16).replace('T', ' ')}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => navigate(`/designer?design_id=${d.id}`)} className="btn-primary flex-1 !py-1.5 text-xs">
                    打开
                  </button>
                  <button onClick={() => removeDesign(d.id)} className="btn-danger !px-3 !py-1.5 text-xs">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
