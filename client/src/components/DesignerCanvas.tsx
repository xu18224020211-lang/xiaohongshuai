import { useEffect, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react';
import { Stage, Layer, Image as KImage, Rect, Transformer, Group } from 'react-konva';
import type Konva from 'konva';
import { useDesign, puzzleCellRects, puzzleCellGeometry } from '../store/design';
import { getDrawable } from '../lib/image';
import { brushStroke, createProductMask, setCurrentMask, type ProductMask } from '../lib/mask';
import type { OverlayItem, PuzzleCell } from '../lib/types';
import { useIsMobileLayout } from '../store/viewMode';
import EditableHint from './EditableHint';

/**
 * 画布「+」用的加号矢量图标。
 * 清晰度要点：
 * 1) 尺寸取整到偶数像素，避免半像素缩放导致发虚；
 * 2) 用 geometricPrecision + 圆形端点的粗描边，边缘锐利不发毛；
 * 3) 线条端点落在整数坐标上（4.5→4.75 之类会糊），这里用 12 与 5/19 的整数对称布局。
 */
function PlusGlyph({ size }: { size: number }) {
  const px = Math.max(8, Math.round(size / 2) * 2); // 取偶数像素
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className="pointer-events-none block shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <path d="M12 4.5v15M4.5 12h15" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function useDrawable(url: string | undefined, removeWhite: boolean) {
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (!url) return;
    getDrawable(url, removeWhite)
      .then((d) => {
        if (alive) setImg(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, removeWhite]);
  return img;
}

function OverlayNode({
  item,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  item: OverlayItem;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (id: string, e: Konva.KonvaEventObject<Event>) => void;
}) {
  const img = useDrawable(item.url, item.removeWhite);
  if (!img) return null;
  const canEdit = !item.locked && interactive;
  return (
    <KImage
      id={item.id}
      image={img}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rotation={item.rotation}
      opacity={item.opacity}
      visible={item.visible !== false}
      draggable={canEdit}
      listening={canEdit}
      shadowColor={selected ? '#6366f1' : undefined}
      shadowBlur={selected ? 6 : 0}
      shadowOpacity={selected ? 0.6 : 0}
      onClick={() => onSelect(item.id)}
      onTap={() => onSelect(item.id)}
      onDragStart={() => onSelect(item.id)}
      onDragEnd={(e) => onDragEnd(item.id, e)}
      onTransformEnd={(e) => onTransformEnd(item.id, e)}
    />
  );
}

/**
 * 拼图的一格：图片按「最小铺满」渲染，位置被夹在格内，
 * 拖动时实时夹紧 —— 图片可以移动/缩放，但永远被裁剪在容器格子里。
 */
function PuzzleCellNode({
  cell,
  index,
  rect,
  active,
  canvasScale,
  stageOffsetX,
  stageOffsetY,
  onSelect,
  onDragEnd,
  onResize,
}: {
  cell: PuzzleCell;
  index: number;
  rect: { x: number; y: number; w: number; h: number };
  active: boolean;
  canvasScale: number;
  stageOffsetX: number;
  stageOffsetY: number;
  onSelect: (id: string) => void;
  onDragEnd: (index: number, offsetX: number, offsetY: number) => void;
  onResize: (index: number, scale: number, offsetX: number, offsetY: number) => void;
}) {
  const img = useDrawable(cell.url, false);
  if (!img) return null;
  const natW = (img as HTMLImageElement).naturalWidth || img.width || rect.w;
  const natH = (img as HTMLImageElement).naturalHeight || img.height || rect.h;
  const geo = puzzleCellGeometry(cell, natW, natH, rect.w, rect.h);
  const id = `puzzle:${index}`;
  return (
    <Group clipX={rect.x} clipY={rect.y} clipWidth={rect.w} clipHeight={rect.h}>
      <Rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#101014" listening={false} />
      <KImage
        id={id}
        image={img}
        x={rect.x + geo.offsetX}
        y={rect.y + geo.offsetY}
        width={geo.width}
        height={geo.height}
        draggable={active}
        listening={active}
        onClick={() => onSelect(id)}
        onTap={() => onSelect(id)}
        onDragStart={() => onSelect(id)}
        dragBoundFunc={(pos) => {
          // pos 为舞台坐标：换算到画布坐标 → 夹紧到格子内 → 换算回舞台坐标
          const cx = (pos.x - stageOffsetX) / canvasScale;
          const cy = (pos.y - stageOffsetY) / canvasScale;
          const minX = rect.x + Math.min(0, rect.w - geo.width);
          const maxX = rect.x;
          const minY = rect.y + Math.min(0, rect.h - geo.height);
          const maxY = rect.y;
          return {
            x: Math.max(minX, Math.min(maxX, cx)) * canvasScale + stageOffsetX,
            y: Math.max(minY, Math.min(maxY, cy)) * canvasScale + stageOffsetY,
          };
        }}
        onDragEnd={(e) => onDragEnd(index, e.target.x() - rect.x, e.target.y() - rect.y)}
        onTransformEnd={(e) => {
          // 变换控件的缩放换算成 zoom（图片仍被裁剪在格内）
          const node = e.target as Konva.Image;
          const scale = Math.max(node.scaleX(), node.scaleY());
          node.scaleX(1);
          node.scaleY(1);
          onResize(index, scale, node.x() - rect.x, node.y() - rect.y);
        }}
      />
    </Group>
  );
}

/** 找到第 index 个拼图格子里的图片节点（按 id 匹配，避免前面格子为空时索引错位） */
function findPuzzleCellImage(stage: Konva.Stage | null | undefined, index: number) {
  if (!stage) return undefined;
  const want = `puzzle:${index}`;
  const images = stage.find('Image') as Konva.Image[];
  return images.find((n) => n.id() === want);
}

export default function DesignerCanvas() {
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const canvasHeight = useDesign((s) => s.canvasHeight);
  const layer1 = useDesign((s) => s.layer1);
  const layer2 = useDesign((s) => s.layer2);
  const layer3 = useDesign((s) => s.layer3);
  const puzzle = useDesign((s) => s.puzzle);
  const updatePuzzleCell = useDesign((s) => s.updatePuzzleCell);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const updateLayer1 = useDesign((s) => s.updateLayer1);
  const updateLayer2 = useDesign((s) => s.updateLayer2);
  const updateOverlay = useDesign((s) => s.updateOverlay);
  const brushMode = useDesign((s) => s.brushMode);
  const brushSize = useDesign((s) => s.brushSize);
  const setBrushSize = useDesign((s) => s.setBrushSize);
  const freeTransform = useDesign((s) => s.freeTransform);
  const zoom = useDesign((s) => s.zoom);
  const setZoom = useDesign((s) => s.setZoom);
  const path = useDesign((s) => s.path);
  /** 移动端：所有「+」号（A/B 类中心 + 拼图格子）统一缩小 */
  const isMobileLayout = useIsMobileLayout();
  // 画布上的「+」号：textOnly（大字报）不显示
  const onPlus = useDesign((s) => s.onPlus);
  const plusDisabled = useDesign((s) => s.plusDisabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const drawingRef = useRef(false);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [mask, setMask] = useState<ProductMask | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // 滚轮：按住 Ctrl（或 ⌘）只缩放画布（阻止浏览器缩放）；画笔模式下调笔刷大小
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const st = useDesign.getState();
        st.setZoom(st.zoom + (e.deltaY < 0 ? 10 : -10));
        return;
      }
      if (useDesign.getState().brushMode === 'select') return;
      e.preventDefault();
      const st = useDesign.getState();
      st.setBrushSize(Math.max(8, Math.min(240, st.brushSize + (e.deltaY < 0 ? 6 : -6))));
    };
    // passive: false —— 否则 ctrl+滚轮无法阻止浏览器整页缩放
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 开发/自测用：暴露画布 Stage，便于检查拼图裁剪与元素坐标
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__designStage = stageRef.current;
  });

  // 画布四周留一点距离（不要贴着边缘）
  const PAD = 28;
  const usableW = Math.max(80, box.w - PAD * 2);
  const usableH = Math.max(80, box.h - PAD * 2);
  // 自适应缩放（保证整块画布可见）× 用户缩放（20% ~ 200%）
  const fitScale = Math.max(0.05, Math.min(usableW / canvasWidth, usableH / canvasHeight, 1));
  const scale = Math.max(0.02, Math.min(4, fitScale * (zoom / 100)));
  const offsetX = (box.w - canvasWidth * scale) / 2;
  const offsetY = (box.h - canvasHeight * scale) / 2;

  /** 画布坐标 → 画布区域的 CSS 坐标（用于「+」号按钮等 HTML 浮层） */
  const toScreen = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });

  /** 单个「+」号按钮的显示条件：还没有底图 / 产品图（B 路径） */
  const isEmptyForPlus = !layer1 && !(layer2 && path === 'B');

  const bg = useDrawable(layer1?.url, false);
  const prod = useDrawable(layer2?.url, false);

  // 产品蒙版：layer2 变化时重建
  useEffect(() => {
    let alive = true;
    setMask(null);
    setCurrentMask(null);
    if (!layer2) return;
    createProductMask(layer2.url)
      .then((m) => {
        if (!alive) return;
        setMask(m);
        setCurrentMask(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [layer2?.url]);

  // Transformer 绑定选中节点：图片是异步加载的，节点还没画出来时自动重试（最多约 2 秒）
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    const bind = () => {
      if (cancelled) return;
      const stage = trRef.current?.getStage();
      let found: Konva.Node | undefined;
      if (selectedId === 'layer1') found = layer1 && !layer1.locked ? (stage?.findOne('#layer1') as Konva.Node) : undefined;
      else if (selectedId === 'layer2') found = layer2 && !layer2.locked ? (stage?.findOne('#layer2') as Konva.Node) : undefined;
      else if (selectedId === 'puzzle') found = undefined; // 拼图容器铺满画布：不显示变换控件
      else if (selectedId?.startsWith('puzzle:')) found = findPuzzleCellImage(stage, Number(selectedId.split(':')[1]));
      else if (selectedId) {
        const item = layer3.find((i) => i.id === selectedId);
        found = item && !item.locked ? (stage?.findOne(`#${selectedId}`) as Konva.Node) : undefined;
      }
      if (trRef.current) {
        trRef.current.nodes(found ? [found] : []);
        trRef.current.getLayer()?.batchDraw();
      }
      // 选中的图还没渲染出来（图片还在加载）→ 稍后重试，保证「加图即出现变换控件」
      if (selectedId && !found && tries < 40) {
        tries += 1;
        timer = window.setTimeout(bind, 150);
      }
    };
    bind();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [selectedId, layer1, layer2, layer3, puzzle, canvasWidth, canvasHeight]);

  function onDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    const patch = { x: e.target.x(), y: e.target.y() };
    if (id === 'layer1') updateLayer1(patch);
    else if (id === 'layer2') updateLayer2(patch);
    else updateOverlay(id, patch);
  }
  function onTransformEnd(id: string, e: Konva.KonvaEventObject<Event>) {
    const node = e.target as Konva.Image;
    const sx = node.scaleX();
    const sy = node.scaleY();
    // 拼图格子：把缩放换算成 zoom（图片仍被裁剪在格内）
    if (id.startsWith('puzzle:')) {
      const index = Number(id.split(':')[1]);
      const cell = puzzle?.cells[index];
      node.scaleX(1);
      node.scaleY(1);
      if (cell && puzzle) {
        const rects = puzzleCellRects(puzzle.count, puzzle.width, puzzle.height, puzzle.gap);
        const rect = rects[index];
        if (rect) {
          updatePuzzleCell(index, {
            zoom: Math.max(1, Math.min(8, (cell.zoom || 1) * Math.max(sx, sy))),
            offsetX: node.x() - rect.x,
            offsetY: node.y() - rect.y,
          });
        }
      }
      return;
    }
    const patch = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(10, node.width() * sx),
      height: Math.max(10, node.height() * sy),
    };
    node.scaleX(1);
    node.scaleY(1);
    if (id === 'layer1') updateLayer1(patch);
    else if (id === 'layer2') updateLayer2(patch);
    else updateOverlay(id, patch);
  }

  function applyBrush(stage: Konva.Stage | null) {
    if (brushMode === 'select' || !mask || !layer2 || !stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const canvasX = (pos.x - offsetX) / scale;
    const canvasY = (pos.y - offsetY) / scale;
    const sx = (layer2.naturalWidth || layer2.width) / layer2.width;
    const sy = (layer2.naturalHeight || layer2.height) / layer2.height;
    const nx = (canvasX - layer2.x) * sx;
    const ny = (canvasY - layer2.y) * sy;
    const radiusNatural = (brushSize / scale) * sx;
    brushStroke(mask, nx, ny, radiusNatural, brushMode);
    layerRef.current?.batchDraw();
  }

  const sorted = [...layer3].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#0a0a0b]"
      data-canvas-pad={PAD}
      data-offset-x={Math.round(offsetX)}
      data-offset-y={Math.round(offsetY)}
      data-scale={Number(scale.toFixed(4))}
      style={{
        cursor: brushMode !== 'select' ? 'none' : 'default',
        backgroundImage: 'radial-gradient(circle, #202024 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <Stage
        ref={stageRef}
        width={box.w}
        height={box.h}
        onMouseDown={(e) => {
          if (brushMode !== 'select') {
            drawingRef.current = true;
            applyBrush(e.target.getStage());
            return;
          }
          if (e.target === e.target.getStage()) select(null);
        }}
        onMouseMove={(e) => {
          const stage = e.target.getStage();
          const pos = stage?.getPointerPosition();
          if (pos) setPointer(pos);
          if (drawingRef.current) applyBrush(stage);
        }}
        onMouseUp={() => {
          drawingRef.current = false;
        }}
        onMouseLeave={() => setPointer(null)}
        onTouchStart={(e) => {
          if (brushMode !== 'select') {
            drawingRef.current = true;
            applyBrush(e.target.getStage());
            return;
          }
          if (e.target === e.target.getStage()) select(null);
        }}
        onTouchMove={(e) => {
          const stage = e.target.getStage();
          const pos = stage?.getPointerPosition();
          if (pos) setPointer(pos);
          if (drawingRef.current) {
            e.evt.preventDefault();
            applyBrush(stage);
          }
        }}
        onTouchEnd={() => {
          drawingRef.current = false;
          setPointer(null);
        }}
      >
        <Layer ref={layerRef}>
          <Group
            scaleX={scale}
            scaleY={scale}
            x={offsetX}
            y={offsetY}
            clipX={0}
            clipY={0}
            clipWidth={canvasWidth}
            clipHeight={canvasHeight}
          >
            <Rect width={canvasWidth} height={canvasHeight} fill="#1c1c20" listening={false} />
            {layer1 && bg && (
              <KImage
                id="layer1"
                image={bg}
                x={layer1.x}
                y={layer1.y}
                width={layer1.width}
                height={layer1.height}
                rotation={layer1.rotation}
                visible={layer1.visible !== false}
                draggable={!layer1.locked && brushMode === 'select'}
                listening={!layer1.locked && brushMode === 'select'}
                onClick={() => select('layer1')}
                onTap={() => select('layer1')}
                onDragStart={() => select('layer1')}
                onDragEnd={(e) => onDragEnd('layer1', e)}
                onTransformEnd={(e) => onTransformEnd('layer1', e)}
              />
            )}
            {puzzle && puzzle.visible !== false && (
              // 宫格容器：按比例铺满画布、格子无间隔，容器本身不可拖动/缩放
              <Group id="puzzle-box" x={puzzle.x} y={puzzle.y} listening={brushMode === 'select'}>
                <Rect width={puzzle.width} height={puzzle.height} fill="#101014" listening={false} />
                {puzzleCellRects(puzzle.count, puzzle.width, puzzle.height, puzzle.gap).map((rect, i) => {
                  const cell = puzzle.cells[i];
                  if (!cell) {
                    return (
                      <Group key={`empty-${i}`}>
                        <Rect
                          x={rect.x}
                          y={rect.y}
                          width={rect.w}
                          height={rect.h}
                          fill="#18181b"
                          stroke="#3f3f46"
                          dash={[8, 6]}
                          listening={false}
                        />
                      </Group>
                    );
                  }
                  return (
                    <PuzzleCellNode
                      key={`cell-${i}-${cell.url}`}
                      cell={cell}
                      index={i}
                      rect={rect}
                      active={brushMode === 'select'}
                      canvasScale={scale}
                      stageOffsetX={offsetX}
                      stageOffsetY={offsetY}
                      onSelect={select}
                      onDragEnd={(index, ox, oy) => updatePuzzleCell(index, { offsetX: ox, offsetY: oy })}
                      onResize={(index, scale, ox, oy) => {
                        const cur = puzzle.cells[index]?.zoom ?? 1;
                        updatePuzzleCell(index, {
                          zoom: Math.max(1, Math.min(8, cur * scale)),
                          offsetX: ox,
                          offsetY: oy,
                        });
                      }}
                    />
                  );
                })}
              </Group>
            )}
            {layer2 && (mask ? (
              <KImage
                id="layer2"
                image={mask.display}
                x={layer2.x}
                y={layer2.y}
                width={layer2.width}
                height={layer2.height}
                rotation={layer2.rotation}
                visible={layer2.visible !== false}
                draggable={!layer2.locked && brushMode === 'select'}
                listening={!layer2.locked && brushMode === 'select'}
                onClick={() => select('layer2')}
                onTap={() => select('layer2')}
                onDragStart={() => select('layer2')}
                onDragEnd={(e) => onDragEnd('layer2', e)}
                onTransformEnd={(e) => onTransformEnd('layer2', e)}
              />
            ) : prod ? (
              <KImage
                id="layer2"
                image={prod}
                x={layer2.x}
                y={layer2.y}
                width={layer2.width}
                height={layer2.height}
                rotation={layer2.rotation}
                visible={layer2.visible !== false}
                draggable={!layer2.locked && brushMode === 'select'}
                listening={!layer2.locked && brushMode === 'select'}
                onClick={() => select('layer2')}
                onTap={() => select('layer2')}
                onDragStart={() => select('layer2')}
                onDragEnd={(e) => onDragEnd('layer2', e)}
                onTransformEnd={(e) => onTransformEnd('layer2', e)}
              />
            ) : null)}
            {sorted.map((it) => (
              <OverlayNode
                key={it.id}
                item={it}
                selected={it.id === selectedId}
                interactive={brushMode === 'select'}
                onSelect={select}
                onDragEnd={onDragEnd}
                onTransformEnd={onTransformEnd}
              />
            ))}
          </Group>
          {/* 变换控件放在裁剪 Group 之外：贴到画布边缘时锚点/边框不会被裁掉 */}
          <Transformer
            ref={trRef}
            rotateEnabled={!selectedId?.startsWith('puzzle:')}
            keepRatio={selectedId?.startsWith('puzzle:') ? true : !freeTransform}
            anchorSize={14}
            anchorCornerRadius={4}
            anchorStroke="#ffffff"
            anchorFill="#ffffff"
            borderStroke="#ffffff"
            borderDash={[7, 4]}
            rotateAnchorOffset={24}
          />
        </Layer>
      </Stage>

      {/* 画布上的「+」号：
          - 普通界面：画布正中心一个（没有底图/产品图时），上方带提示语
          - 拼图界面：每个空格子的正中心各一个（4 宫格 = 4 个「+」）
          - 大字报等纯文字标签不显示
          z-30 高于画布上方的浮层，保证一定能点到。
          定位用 left/top 加负 margin（不用 transform），避免与按钮的 active 动效冲突导致跳动。 */}
      {!plusDisabled && onPlus && (
        <>
          {puzzle
            ? puzzleCellRects(puzzle.count, puzzle.width, puzzle.height, puzzle.gap).map((rect, i) => {
              if (puzzle.cells[i]) return null;
              // 格子中心（画布坐标）→ 屏幕坐标，按钮自身再居中，保证「+」落在格子正中
              const p = toScreen(puzzle.x + rect.x + rect.w / 2, puzzle.y + rect.y + rect.h / 2);
              // 格子越小，「+」按钮也越小，避免 4 宫格时按钮比格子还大
              const cellPx = Math.min(rect.w, rect.h) * scale;
              // 移动端画布更小，「+」按钮同步缩小
              const size = isMobileLayout
                ? Math.max(20, Math.min(34, cellPx * 0.3))
                : Math.max(30, Math.min(56, cellPx * 0.42));
              return (
                <button
                  key={`plus-cell-${i}`}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPlus(`cell:${i}`); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  title={`第 ${i + 1} 格：上传素材 / 从素材库选择`}
                  style={{ left: p.x - size / 2, top: p.y - size / 2, width: size, height: size }}
                  className="plus-btn absolute z-30 grid place-items-center rounded-full border-2 border-dashed"
                >
                  <PlusGlyph size={Math.round(size * 0.44)} />
                </button>
              );
            })
            : isEmptyForPlus && (() => {
              // 画布正中心：图标 + 上方提示语
              const p = toScreen(canvasWidth / 2, canvasHeight / 2);
              // 移动端画布更小，「+」按钮同步缩小
              const size = isMobileLayout
                ? Math.max(30, Math.min(46, Math.min(canvasWidth, canvasHeight) * scale * 0.11))
                : Math.max(44, Math.min(72, Math.min(canvasWidth, canvasHeight) * scale * 0.16));
              // 这个「+」只在底图位为空时出现，提示语固定为「请配置底图」（超管可就地改文案）
              return (
                <div
                  key="plus-center"
                  className="absolute z-30 flex flex-col items-center gap-2"
                  style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
                >
                  {/* 提示语：在「+」图标上方；超管鼠标悬停可点「修改」就地编辑 */}
                  <span className="whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-zinc-100 backdrop-blur-sm">
                    <EditableHint
                      k="designer.canvasHint.plusScene"
                      fallback="请配置底图"
                      inputClassName="input !py-0.5 !px-2 text-[11px] !w-40"
                    />
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPlus(layer1 ? 'product' : 'scene'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    title="上传素材 / 从素材库选择"
                    style={{ width: size, height: size }}
                    className="plus-btn grid place-items-center rounded-full border-2 border-dashed"
                  >
                    <PlusGlyph size={Math.round(size * 0.44)} />
                  </button>
                </div>
              );
            })()}
        </>
      )}
      {brushMode !== 'select' && pointer && (
        <div
          className="pointer-events-none absolute z-10 rounded-full border-2 border-white/90 bg-white/10"
          style={{ left: pointer.x - brushSize, top: pointer.y - brushSize, width: brushSize * 2, height: brushSize * 2 }}
        />
      )}
    </div>
  );
}
