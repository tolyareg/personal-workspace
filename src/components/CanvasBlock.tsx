import React, { useRef, useState, useEffect, useCallback } from 'react';
import { CanvasData, DrawingPath } from '../types/models';
import styles from './CanvasBlock.module.css';

interface CanvasBlockProps {
  initialData?: CanvasData;
  onChange: (data: CanvasData) => void;
  readOnly?: boolean;
}

export const CanvasBlock: React.FC<CanvasBlockProps> = ({ initialData, onChange, readOnly = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#38bdf8'); // Электрический циан для темной темы
  const [width, setWidth] = useState(3);

  const [paths, setPaths] = useState<DrawingPath[]>(initialData?.paths || []);
  const [redoStack, setRedoStack] = useState<DrawingPath[]>([]);

  const isDrawing = useRef(false);
  const activePath = useRef<DrawingPath | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const p of paths) {
      if (p.points.length < 4) continue;

      ctx.save();
      if (p.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = p.width * 2;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
      }

      ctx.beginPath();
      ctx.moveTo(p.points[0] * w, p.points[1] * h);
      for (let i = 2; i < p.points.length; i += 2) {
        ctx.lineTo(p.points[i] * w, p.points[i + 1] * h);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [paths]);

  // Адаптация размера с учетом плотности пикселей и сохранение пропорций
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: displayW, height: displayH } = entry.contentRect;
        if (displayW === 0 || displayH === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;

        redraw();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;

    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    activePath.current = {
      id: crypto.randomUUID(),
      tool,
      color,
      width,
      points: [relX, relY]
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !activePath.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    activePath.current.points.push(relX, relY);

    // Мгновенная отрисовка последнего отрезка
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const w = canvas.width;
      const h = canvas.height;
      const pts = activePath.current.points;
      const len = pts.length;

      ctx.save();
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = width * 2;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[len - 4] * w, pts[len - 3] * h);
      ctx.lineTo(pts[len - 2] * w, pts[len - 1] * h);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing.current || !activePath.current) return;
    isDrawing.current = false;

    const updated = [...paths, activePath.current];
    setPaths(updated);
    setRedoStack([]); // Сброс redo при новом действии
    activePath.current = null;

    onChange({
      version: 1,
      paths: updated,
      aspectRatio: (canvasRef.current?.width || 800) / (canvasRef.current?.height || 400)
    });
  };

  const handleUndo = () => {
    if (paths.length === 0) return;
    const last = paths[paths.length - 1];
    const next = paths.slice(0, -1);
    setPaths(next);
    setRedoStack(prev => [...prev, last]);

    onChange({
      version: 1,
      paths: next,
      aspectRatio: (canvasRef.current?.width || 800) / (canvasRef.current?.height || 400)
    });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    const next = [...paths, restored];
    setRedoStack(prev => prev.slice(0, -1));
    setPaths(next);

    onChange({
      version: 1,
      paths: next,
      aspectRatio: (canvasRef.current?.width || 800) / (canvasRef.current?.height || 400)
    });
  };

  const handleClear = () => {
    if (paths.length === 0) return;
    if (window.confirm('Очистить холст? Это действие можно будет отменить через Undo.')) {
      setRedoStack(paths);
      setPaths([]);
      onChange({
        version: 1,
        paths: [],
        aspectRatio: (canvasRef.current?.width || 800) / (canvasRef.current?.height || 400)
      });
    }
  };

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      {!readOnly && (
        <div className={styles.toolbar}>
          <div className={styles.group}>
            <button
              type="button"
              className={tool === 'pen' ? styles.activeBtn : styles.toolBtn}
              onClick={() => setTool('pen')}
              title="Перо"
            >
              ✎ Перо
            </button>
            <button
              type="button"
              className={tool === 'eraser' ? styles.activeBtn : styles.toolBtn}
              onClick={() => setTool('eraser')}
              title="Ластик"
            >
              ⌫ Ластик
            </button>
          </div>

          {tool === 'pen' && (
            <div className={styles.group}>
              {['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171', '#f1f5f9'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={styles.colorDot}
                  style={{ backgroundColor: c, outline: color === c ? '2px solid #ffffff' : 'none' }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="range"
                min="1"
                max="16"
                value={width}
                onChange={e => setWidth(Number(e.target.value))}
                className={styles.slider}
              />
            </div>
          )}

          <div className={styles.group}>
            <button type="button" className={styles.toolBtn} onClick={handleUndo} disabled={paths.length === 0}>
              ↺ Назад
            </button>
            <button type="button" className={styles.toolBtn} onClick={handleRedo} disabled={redoStack.length === 0}>
              ↻ Вперед
            </button>
            <button type="button" className={styles.dangerBtn} onClick={handleClear} disabled={paths.length === 0}>
              ✕ Очистить
            </button>
          </div>
        </div>
      )}

      <div className={styles.viewport}>
        <canvas
          ref={canvasRef}
          className={styles.canvasSurface}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    </div>
  );
};