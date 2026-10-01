'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VectorItem } from '@vectordb/core/types';
import { pca2D } from '@vectordb/core/pca';
import { useTheme } from './ThemeProvider';
export const COLORS: Record<string, string> = {
  cs: '#67cce7',
  math: '#bc9aef',
  food: '#e6b576',
  sports: '#7acaa8',
  doc: '#a8c789',
};
interface Props {
  items: VectorItem[];
  hitIds: number[];
  hoverId: number | null;
  queryLabel: string;
  loaded: boolean;
}
export default function ScatterPlot({ items, hitIds, hoverId, queryLabel, loaded }: Props) {
  const { theme } = useTheme();
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const locations = useRef<{ item: VectorItem; x: number; y: number }[]>([]);
  const [tooltip, setTooltip] = useState<{ item: VectorItem; x: number; y: number } | null>(null);

  const coords = useMemo(() => pca2D(items.map((v) => v.embedding)), [items]);

  useEffect(() => {
    const el = canvas.current,
      parent = host.current;
    if (!el || !parent) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    const palette = {
      bg: style.getPropertyValue('--plot-bg').trim(),
      grid: style.getPropertyValue('--plot-grid').trim(),
      axis: style.getPropertyValue('--plot-axis').trim(),
      query: style.getPropertyValue('--plot-query').trim(),
      link: style.getPropertyValue('--plot-link').trim(),
    };
    let frame = 0,
      width = 0,
      height = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(width * ratio);
      el.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    const xValues = coords.map((p) => p[0]),
      yValues = coords.map((p) => p[1]);
    const minX = Math.min(...xValues, 0),
      maxX = Math.max(...xValues, 0),
      minY = Math.min(...yValues, 0),
      maxY = Math.max(...yValues, 0);
    const rangeX = maxX - minX || 1,
      rangeY = maxY - minY || 1;
    const map = (point: [number, number]): [number, number] => {
      const padding = Math.min(70, width * 0.15);
      return [
        padding + ((point[0] - minX + rangeX * 0.18) / (rangeX * 1.36)) * (width - 2 * padding),
        height - 80 - ((point[1] - minY + rangeY * 0.18) / (rangeY * 1.36)) * (height - 145),
      ];
    };
    const hits = new Set(hitIds);
    function draw(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const x = 40 + (i / 8) * (width - 80),
          y = 60 + (i / 8) * (height - 135);
        ctx.beginPath();
        ctx.moveTo(x, 60);
        ctx.lineTo(x, height - 75);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
      }
      ctx.font = '10px "Courier New",monospace';
      ctx.fillStyle = palette.axis;
      ctx.fillText('2D PCA PROJECTION', 22, 30);
      ctx.fillStyle = palette.axis;
      ctx.fillText('PC₁ →', width / 2 - 20, height - 60);
      ctx.save();
      ctx.translate(18, height / 2 + 20);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('PC₂ →', 0, 0);
      ctx.restore();
      locations.current = items.map((item, i) => {
        const [x, y] = map(coords[i]);
        return { item, x, y };
      });
      let query: { x: number; y: number } | null = null;
      if (queryLabel && hitIds.length) {
        let x = 0,
          y = 0,
          w = 0;
        hitIds.slice(0, 3).forEach((id, i) => {
          const p = locations.current.find((p) => p.item.id === id);
          if (p) {
            const weight = 1 / (i + 1);
            x += p.x * weight;
            y += p.y * weight;
            w += weight;
          }
        });
        // Offset a single result so the query star does not cover its source dot.
        if (w)
          query = {
            x: Math.min(width - 55, x / w + (hitIds.length === 1 ? 28 : 0)),
            y: Math.max(65, y / w - (hitIds.length === 1 ? 28 : 0)),
          };
      }
      if (query) {
        for (const point of locations.current.filter((p) => hits.has(p.item.id))) {
          ctx.strokeStyle = palette.link;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(query.x, query.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      for (const point of locations.current) {
        const { x, y, item } = point,
          col = COLORS[item.category] || '#90a4ae',
          hit = hits.has(item.id),
          r = hit ? 9 : 6;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        glow.addColorStop(0, col + '77');
        glow.addColorStop(1, col + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (hit || hoverId === item.id || tooltip?.item.id === item.id) {
          ctx.strokeStyle = col + '88';
          ctx.beginPath();
          ctx.arc(x, y, r + 6 + (hit && !reduced ? Math.sin(time / 300) * 3 : 0), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (query) {
        ctx.save();
        ctx.translate(query.x, query.y);
        ctx.shadowColor = palette.query;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5 - Math.PI / 2,
            r = i % 2 === 0 ? 12 : 5;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fillStyle = palette.query;
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = palette.axis;
        ctx.fillText('query', query.x + 17, query.y + 4);
      }
      if (!items.length) {
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.axis;
        ctx.fillText(
          loaded ? 'No vectors. Insert one to begin.' : 'Connecting to VectorDB…',
          width / 2,
          height / 2,
        );
        ctx.textAlign = 'left';
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [items, coords, hitIds, hoverId, queryLabel, loaded, tooltip?.item.id, theme]);
  return (
    <div className="center-panel" ref={host}>
      <canvas
        ref={canvas}
        id="scatter"
        role="img"
        data-highlighted-ids={hitIds.join(',')}
        aria-label={`PCA scatter plot of ${items.length} vectors with ${hitIds.length} highlighted matches`}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect(),
            x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const point = locations.current.find((p) => Math.hypot(p.x - x, p.y - y) < 16);
          setTooltip(
            point
              ? {
                  item: point.item,
                  x: Math.min(x + 15, Math.max(8, rect.width - 245)),
                  y: Math.max(45, Math.min(y + 10, rect.height - 125)),
                }
              : null,
          );
        }}
      />
      <div className="map-count">{items.length} VECTORS</div>
      <div className="map-caption">
        Synthetic 16D demo space · documents appear as representative markers.
        <br />
        The query star marks the neighborhood of the nearest matches.
      </div>
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <span style={{ color: COLORS[tooltip.item.category] }}>
            [{tooltip.item.category}] #{tooltip.item.id}
          </span>
          <br />
          {tooltip.item.metadata}
        </div>
      )}
    </div>
  );
}
export function EmbeddingChart({ embedding }: { embedding: number[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const width = canvas.parentElement?.clientWidth || 280,
        ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = 76 * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, 76);
      if (!embedding) return;
      const colors = Object.values(COLORS),
        bar = (width - 4) / 16;
      embedding.forEach((v, i) => {
        ctx.fillStyle = colors[Math.floor(i / 4)];
        const h = Math.max(0, v) * 55;
        ctx.fillRect(3 + i * bar, 60 - h, Math.max(1, bar - 2), h);
      });
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ['CS', 'MATH', 'FOOD', 'SPORT'].forEach((text, i) => {
        ctx.fillStyle = colors[i];
        ctx.fillText(text, 2 + (i * 4 + 2) * bar, 73);
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [embedding]);
  return (
    <canvas
      id="vecCvs"
      ref={ref}
      className="h-[76px]"
      role="img"
      aria-label={
        embedding
          ? '16-dimensional query embedding, grouped by category'
          : 'Query embedding appears after search'
      }
    />
  );
}
