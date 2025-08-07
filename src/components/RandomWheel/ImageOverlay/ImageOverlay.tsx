import { CSSProperties, ChangeEvent, ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import './ImageOverlay.scss';

interface SavedOverlayState {
  dataUrl: string;
  x: number; // px relative to parent positioned container
  y: number; // px relative to parent positioned container
  // kept for backward-compat but not used when width/height are present
  scale?: number; // 0.2 - 3
  isVisible: boolean;
  isLocked: boolean;
  widthPx: number;
  heightPx: number;
  aspectRatio: number; // width / height
}

interface OverlayState extends SavedOverlayState {
  id: string;
}

const STORAGE_KEY = 'wheelOverlayImage';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ImageOverlay = (): ReactElement => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    overlayId: string;
  } | null>(null);

  const [overlays, setOverlays] = useState<OverlayState[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const toOverlay = (saved: Partial<SavedOverlayState>): OverlayState | null => {
        if (!saved?.dataUrl) return null;
        const defaultWidth = 240;
        const defaultHeight = 240;
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          dataUrl: saved.dataUrl,
          x: saved.x ?? 40,
          y: saved.y ?? 40,
          scale: saved.scale ?? 1,
          isVisible: saved.isVisible ?? true,
          isLocked: saved.isLocked ?? false,
          widthPx: saved.widthPx ?? defaultWidth,
          heightPx: saved.heightPx ?? defaultHeight,
          aspectRatio: saved.aspectRatio ?? defaultWidth / defaultHeight,
        };
      };
      if (Array.isArray(parsed)) {
        return parsed.map(toOverlay).filter(Boolean) as OverlayState[];
      }
      const single = toOverlay(parsed as Partial<SavedOverlayState>);
      return single ? [single] : [];
    } catch {
      return [];
    }
  });

  const parentRect = useRef<DOMRect | null>(null);

  const updateParentRect = useCallback(() => {
    const parent = containerRef.current?.parentElement as HTMLElement | null;
    parentRect.current = parent?.getBoundingClientRect() ?? null;
  }, []);

  useEffect(() => {
    updateParentRect();
    const onResize = () => updateParentRect();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateParentRect]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          overlays.map(({ id, ...rest }) => rest),
        ),
      );
    } catch {
      // ignore
    }
  }, [overlays]);

  const onUploadClick = useCallback(() => {
    // If there are any locked overlays, unlock them for editing
    if (overlays.length > 0 && overlays.some((o) => o.isLocked)) {
      setOverlays((prev) => prev.map((o) => ({ ...o, isLocked: false })));
      return;
    }
    if (overlays.length >= 4) return;
    replaceTargetIdRef.current = null;
    inputRef.current?.click();
  }, [overlays]);

  const replaceTargetIdRef = useRef<string | null>(null);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      updateParentRect();
      const rect = parentRect.current;
      const initialX = rect ? Math.round(rect.width * 0.05) : 40;
      const initialY = rect ? Math.round(rect.height * 0.05) : 40;

      const img = new Image();
      img.onload = () => {
        const maxDisplay = 320;
        const w = img.naturalWidth || maxDisplay;
        const h = img.naturalHeight || maxDisplay;
        const ratio = w / h || 1;
        const widthPx = Math.min(maxDisplay, w);
        const heightPx = Math.round(widthPx / ratio);
        if (replaceTargetIdRef.current) {
          const targetId = replaceTargetIdRef.current;
          setOverlays((prev) =>
            prev.map((o) =>
              o.id === targetId
                ? { ...o, dataUrl, widthPx, heightPx, aspectRatio: ratio || 1 }
                : o,
            ),
          );
          replaceTargetIdRef.current = null;
        } else if (overlays.length < 4) {
          setOverlays((prev) => [
            ...prev,
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              dataUrl,
              x: initialX,
              y: initialY,
              isVisible: true,
              isLocked: false,
              scale: 1,
              widthPx,
              heightPx,
              aspectRatio: ratio || 1,
            },
          ]);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // reset input so the same file can be selected again
    e.target.value = '';
  }, [updateParentRect, overlays.length]);

  const beginDrag = useCallback((overlayId: string, clientX: number, clientY: number) => {
    const overlay = overlays.find((o) => o.id === overlayId);
    if (!overlay || overlay.isLocked) return;
    dragStateRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      originX: overlay.x,
      originY: overlay.y,
      overlayId,
    };
    updateParentRect();
  }, [overlays, updateParentRect]);

  const onMouseDown = useCallback((overlayId: string, e: React.MouseEvent) => {
    e.preventDefault();
    beginDrag(overlayId, e.clientX, e.clientY);
  }, [beginDrag]);

  const onTouchStart = useCallback((overlayId: string, e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    beginDrag(overlayId, t.clientX, t.clientY);
  }, [beginDrag]);

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      if (!dragStateRef.current?.isDragging) return;
      const ds = dragStateRef.current;
      const dx = clientX - ds.startX;
      const dy = clientY - ds.startY;
      const nextX = ds.originX + dx;
      const nextY = ds.originY + dy;

      const rect = parentRect.current;
      const clampedX = rect ? clamp(nextX, 0, Math.max(0, rect.width - 20)) : nextX;
      const clampedY = rect ? clamp(nextY, 0, Math.max(0, rect.height - 20)) : nextY;
      const id = ds.overlayId;
      setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x: clampedX, y: clampedY } : o)));
    };

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    };
    const endDrag = () => {
      if (dragStateRef.current) dragStateRef.current.isDragging = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', endDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, []);

  const onWidthChange = useCallback((id: string, e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setOverlays((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const widthPx = clamp(Math.round(value), 40, 1200);
      const heightPx = Math.max(40, Math.round(widthPx / (o.aspectRatio || 1)));
      return { ...o, widthPx, heightPx };
    }));
  }, []);

  const onHeightChange = useCallback((id: string, e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setOverlays((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const heightPx = clamp(Math.round(value), 40, 1200);
      const widthPx = Math.max(40, Math.round(heightPx * (o.aspectRatio || 1)));
      return { ...o, widthPx, heightPx };
    }));
  }, []);

  // per-overlay handlers are inlined in JSX for clarity

  const getContainerStyle = useCallback((o: OverlayState): CSSProperties => ({
    transform: `translate(${o.x}px, ${o.y}px)`,
    pointerEvents: o.isLocked ? 'none' : 'auto',
  }), []);

  const onSave = useCallback((id: string) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, isLocked: true } : o)));
  }, []);

  return (
    <div className="wheel-image-overlay-root" ref={containerRef}>
      {overlays.length < 4 || overlays.some((o) => o.isLocked) ? (
        <button type="button" className="wheel-image-overlay-add" onClick={onUploadClick} title="Добавить картинку">
          + Картинка
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="wheel-image-overlay-file-input"
        onChange={onFileChange}
      />

      {overlays.map((o) => (
        <div key={o.id}>
          {o.isVisible && (
            <div
              className={classNames('wheel-image-overlay', { dragging: !!dragStateRef.current?.isDragging })}
              style={getContainerStyle(o)}
              onMouseDown={(e) => onMouseDown(o.id, e)}
              onTouchStart={(e) => onTouchStart(o.id, e)}
              role="button"
              tabIndex={0}
            >
              <img
                src={o.dataUrl}
                alt="overlay"
                className="wheel-image-overlay-img"
                style={{ width: o.widthPx, height: o.heightPx }}
                draggable={false}
              />
              {!o.isLocked && (
                <div className="wheel-image-overlay-toolbar" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      replaceTargetIdRef.current = o.id;
                      inputRef.current?.click();
                    }}
                  >
                    Заменить
                  </button>
                  <label className="size">
                    Ширина (px)
                    <input type="number" min={40} max={1200} step={1} value={o.widthPx} onChange={(e) => onWidthChange(o.id, e)} />
                  </label>
                  <label className="size">
                    Высота (px)
                    <input type="number" min={40} max={1200} step={1} value={o.heightPx} onChange={(e) => onHeightChange(o.id, e)} />
                  </label>
                  <button type="button" className="btn" onClick={() => setOverlays((prev) => prev.map((ol) => (ol.id === o.id ? { ...ol, isVisible: false } : ol)))}>Скрыть</button>
                  <button type="button" className="btn" onClick={() => onSave(o.id)}>Сохранить</button>
                  <button type="button" className="btn danger" onClick={() => setOverlays((prev) => prev.filter((ol) => ol.id !== o.id))}>Удалить</button>
                </div>
              )}
            </div>
          )}
          {!o.isVisible && (
            <button
              type="button"
              className="wheel-image-overlay-show"
              style={{ transform: `translate(${o.x}px, ${o.y}px)` }}
              onClick={() => setOverlays((prev) => prev.map((ol) => (ol.id === o.id ? { ...ol, isVisible: true } : ol)))}
            >
              Показать картинку
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default ImageOverlay;


