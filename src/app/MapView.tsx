// The map viewport: wheel or pinch to zoom around the cursor, drag to pan (or, for a globe, to turn it), click to pick a
// place, double-click to open the map of what is there, right-click for what can be done there. A tooltip names what is
// under the cursor, a ruler measures between two clicks, a minimap shows where the view is, and each map keeps its own
// zoom and place while the page is open. The SVG is drawn once per render and moved with a CSS transform, so panning
// stays smooth on large maps; a very large one is shown as a single picture, which the browser draws far faster than
// tens of thousands of shapes.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

interface View {
  x: number;
  y: number;
  k: number;
}

export interface Focus {
  x: number;
  y: number;
  nonce: number;
}

export interface MenuItem {
  label: string;
  run: () => void;
}

/** Each map's zoom and place, by its key, for as long as the page is open. */
const remembered = new Map<string, View>();

/** ponytail: above this the map is shown as a picture (no per-shape hover); a WebGL renderer is the upgrade path. */
const PICTURE_ABOVE = 3_000_000;

interface Props {
  svg: string;
  overlay: string;
  width: number;
  height: number;
  focus: Focus | null;
  onPick: (x: number, y: number) => void;
  onDrag?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
  zoomRange?: [number, number];
  /** What lies under the cursor, in words, for the tooltip. */
  hover?: (x: number, y: number) => string | null;
  /** Double-click: open the map of what is there. */
  open?: (x: number, y: number) => void;
  /** Right-click: what can be done there. */
  menu?: (x: number, y: number) => MenuItem[];
  /** A distance on this map, in words. */
  measure?: (x0: number, y0: number, x1: number, y1: number) => string;
  /** The key the view is remembered under. */
  memory?: string;
  labels?: { zoomIn: string; zoomOut: string; fit: string; ruler?: string; minimap?: string };
}

export function MapView({ svg, overlay, width, height, focus, onPick, onDrag, onDragEnd, zoomRange = [0.8, 40], hover, open, menu, measure, memory, labels = { zoomIn: "+", zoomOut: "−", fit: "fit" } }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [fit, setFit] = useState(1);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // Fingers (or pen and finger) on the map, for a pinch.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tipFrame = useRef(0);
  const [items, setItems] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [ruler, setRuler] = useState<{ on: boolean; from?: [number, number]; to?: [number, number] }>({ on: false });
  const [minimap, setMinimap] = useState(true);

  // The picture of the map, for a very large one and for the minimap.
  const picture = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : ""), [svg]);
  useEffect(() => () => URL.revokeObjectURL(picture), [picture]);
  const asPicture = svg.length > PICTURE_ABOVE;

  const zoomAround = (px: number, py: number, factor: number) =>
    setView((current) => {
      const k = Math.min(fit * zoomRange[1], Math.max(fit * zoomRange[0], current.k * factor));
      return { k, x: px - ((px - current.x) / current.k) * k, y: py - ((py - current.y) / current.k) * k };
    });
  const zoomCentre = (factor: number) => box.current && zoomAround(box.current.clientWidth / 2, box.current.clientHeight / 2, factor);

  const fitView = () => {
    const el = box.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / width, el.clientHeight / height);
    setFit(k);
    setView({ k, x: (el.clientWidth - width * k) / 2, y: (el.clientHeight - height * k) / 2 });
  };
  useLayoutEffect(() => {
    fitView();
    const saved = memory ? remembered.get(memory) : undefined;
    if (saved) setView(saved);
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (memory) remembered.set(memory, view);
  }, [view, memory]);
  useEffect(() => {
    const onResize = () => fitView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only jumps asked for while this map is shown; an older one must not move a freshly opened map.
  const applied = useRef(focus?.nonce);
  useEffect(() => {
    const el = box.current;
    if (!focus || !el || focus.nonce === applied.current) return;
    applied.current = focus.nonce;
    const k = Math.max(view.k, fit * 3);
    setView({ k, x: el.clientWidth / 2 - focus.x * k, y: el.clientHeight / 2 - focus.y * k });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAround(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit, zoomRange[0], zoomRange[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keys on the map: + and − zoom, 0 fits, arrows pan, R takes the ruler, M the minimap, Esc puts tools down.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as Element | null)?.closest?.("input, textarea, select, [contenteditable], dialog")) return;
      const step = 80;
      const key = event.key;
      if (key === "+" || key === "=") zoomCentre(1.4);
      else if (key === "-" || key === "_") zoomCentre(1 / 1.4);
      else if (key === "0") fitView();
      else if (key === "ArrowLeft") setView((v) => ({ ...v, x: v.x + step }));
      else if (key === "ArrowRight") setView((v) => ({ ...v, x: v.x - step }));
      else if (key === "ArrowUp") setView((v) => ({ ...v, y: v.y + step }));
      else if (key === "ArrowDown") setView((v) => ({ ...v, y: v.y - step }));
      else if ((key === "r" || key === "к") && measure) setRuler((r) => ({ on: !r.on }));
      else if (key === "m" || key === "ь") setMinimap((on) => !on);
      else if (key === "Escape") {
        setRuler({ on: false });
        setItems(null);
        return;
      } else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const toMap = (clientX: number, clientY: number): [number, number] => {
    const rect = box.current!.getBoundingClientRect();
    return [(clientX - rect.left - view.x) / view.k, (clientY - rect.top - view.y) / view.k];
  };
  const zoom = view.k / fit;
  const rect = box.current;
  // The part of the map in view, for the minimap's frame.
  const seen = rect ? { x: -view.x / view.k, y: -view.y / view.k, w: rect.clientWidth / view.k, h: rect.clientHeight / view.k } : null;
  const ink = 1.6 / view.k;
  return (
    <div
      ref={box}
      className={ruler.on ? "map ruling" : "map"}
      data-zoom={zoom < 1.8 ? "far" : zoom < 4 ? "mid" : "near"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        setItems(null);
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        drag.current = { x: event.clientX, y: event.clientY, moved: false };
        try {
          (event.target as Element).setPointerCapture?.(event.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the drag still works without capture.
        }
      }}
      onPointerMove={(event) => {
        const fingers = touches.current;
        if (fingers.size === 2 && fingers.has(event.pointerId) && box.current) {
          // A pinch: zoom by how the fingers spread, around the point between them.
          const [a, b] = [...fingers.values()];
          const before = Math.hypot(a.x - b.x, a.y - b.y);
          fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const [c, d] = [...fingers.values()];
          const after = Math.hypot(c.x - d.x, c.y - d.y);
          const r = box.current.getBoundingClientRect();
          if (before > 0) zoomAround((c.x + d.x) / 2 - r.left, (c.y + d.y) / 2 - r.top, after / before);
          if (drag.current) drag.current.moved = true;
          return;
        }
        const start = drag.current;
        if (!start) {
          if (!hover || !box.current) return;
          const { clientX, clientY } = event;
          cancelAnimationFrame(tipFrame.current);
          tipFrame.current = requestAnimationFrame(() => {
            if (!box.current) return;
            const r = box.current.getBoundingClientRect();
            const [x, y] = toMap(clientX, clientY);
            const text = x >= 0 && y >= 0 && x <= width && y <= height ? hover(x, y) : null;
            setTip(text ? { x: clientX - r.left, y: clientY - r.top, text } : null);
          });
          return;
        }
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        setTip(null);
        drag.current = { x: event.clientX, y: event.clientY, moved: true };
        if (onDrag) onDrag(dx / view.k, dy / view.k);
        else setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }}
      onPointerUp={(event) => {
        touches.current.delete(event.pointerId);
        const start = drag.current;
        drag.current = null;
        if (start?.moved) onDragEnd?.();
        if (!start || start.moved || !box.current || touches.current.size) return;
        const at = toMap(event.clientX, event.clientY);
        if (ruler.on) setRuler((r) => (r.from && !r.to ? { ...r, to: at } : { on: true, from: at }));
        else onPick(at[0], at[1]);
      }}
      onPointerCancel={(event) => {
        touches.current.delete(event.pointerId);
        drag.current = null;
      }}
      onPointerLeave={() => setTip(null)}
      onDoubleClick={(event) => {
        if (!open || ruler.on) return;
        const [x, y] = toMap(event.clientX, event.clientY);
        open(x, y);
      }}
      onContextMenu={(event) => {
        if (!menu || !box.current) return;
        event.preventDefault();
        const [x, y] = toMap(event.clientX, event.clientY);
        const list = menu(x, y);
        const r = box.current.getBoundingClientRect();
        setItems(list.length ? { x: event.clientX - r.left, y: event.clientY - r.top, items: list } : null);
      }}
    >
      <div className="map-canvas" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {asPicture ? <img src={picture} width={width} height={height} alt="" draggable={false} /> : <div dangerouslySetInnerHTML={{ __html: svg }} />}
        {overlay ? <svg className="map-overlay" viewBox={`0 0 ${width} ${height}`} width={width} height={height} dangerouslySetInnerHTML={{ __html: overlay }} /> : null}
        {ruler.from ? (
          <svg className="map-overlay map-ruler" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
            <circle cx={ruler.from[0]} cy={ruler.from[1]} r={ink * 3} />
            {ruler.to ? (
              <>
                <line x1={ruler.from[0]} y1={ruler.from[1]} x2={ruler.to[0]} y2={ruler.to[1]} strokeWidth={ink * 1.5} strokeDasharray={`${ink * 6} ${ink * 3}`} />
                <circle cx={ruler.to[0]} cy={ruler.to[1]} r={ink * 3} />
                <text x={(ruler.from[0] + ruler.to[0]) / 2} y={(ruler.from[1] + ruler.to[1]) / 2 - ink * 6} fontSize={ink * 13} strokeWidth={ink * 3}>
                  {measure?.(ruler.from[0], ruler.from[1], ruler.to[0], ruler.to[1])}
                </text>
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
      {tip && !items ? (
        <div className="map-tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          {tip.text}
        </div>
      ) : null}
      {items ? (
        <div className="map-menu" role="menu" style={{ left: items.x, top: items.y }} onPointerDown={(event) => event.stopPropagation()}>
          {items.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setItems(null);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {minimap && zoom > 1.6 && seen && picture ? (
        <div
          className="minimap"
          style={{ aspectRatio: `${width} / ${height}` }}
          title={labels.minimap}
          onPointerDown={(event) => {
            event.stopPropagation();
            const r = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - r.left) / r.width) * width;
            const y = ((event.clientY - r.top) / r.height) * height;
            setView((v) => ({ ...v, x: box.current!.clientWidth / 2 - x * v.k, y: box.current!.clientHeight / 2 - y * v.k }));
          }}
        >
          <img src={picture} alt="" draggable={false} />
          <span style={{ left: `${(seen.x / width) * 100}%`, top: `${(seen.y / height) * 100}%`, width: `${(seen.w / width) * 100}%`, height: `${(seen.h / height) * 100}%` }} />
        </div>
      ) : null}
      <div className="map-tools">
        <button type="button" onClick={() => zoomCentre(1.4)} aria-label={labels.zoomIn} title={`${labels.zoomIn} (+)`}>
          +
        </button>
        <button type="button" onClick={() => zoomCentre(1 / 1.4)} aria-label={labels.zoomOut} title={`${labels.zoomOut} (−)`}>
          −
        </button>
        <button type="button" onClick={fitView} aria-label={labels.fit} title={`${labels.fit} (0)`}>
          ⤢
        </button>
        {measure ? (
          <button type="button" aria-pressed={ruler.on} onClick={() => setRuler((r) => ({ on: !r.on }))} aria-label={labels.ruler} title={`${labels.ruler ?? ""} (R)`}>
            📏
          </button>
        ) : null}
      </div>
    </div>
  );
}
