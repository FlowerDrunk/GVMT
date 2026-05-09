import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "gvmt-card-order";
const DEFAULT_ORDER = ["repo-summary", "file-browser", "status", "operation"];

function readStoredOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const merged = [...parsed];
    for (const id of DEFAULT_ORDER) {
      if (!merged.includes(id)) merged.push(id);
    }
    return merged;
  } catch {
    return DEFAULT_ORDER;
  }
}

interface DragState {
  id: string;
  startIndex: number;
  yOffset: number;
}

export function useCardOrder() {
  const [order, setOrder] = useState<string[]>(readStoredOrder);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const persist = useCallback((newOrder: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
    setOrder(newOrder);
  }, []);

  // Register a card element so we can measure its position during drag
  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRectsRef.current.set(id, el.getBoundingClientRect());
    } else {
      cardRectsRef.current.delete(id);
    }
  }, []);

  // Refresh rects when order changes (re-render shifts positions)
  useEffect(() => {
    cardRectsRef.current.clear();
  }, [order]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      const index = order.indexOf(id);
      if (index === -1) return;

      // Refresh all card rects
      const container = (e.target as HTMLElement).closest(".main-thread");
      if (container) {
        const cards = container.querySelectorAll<HTMLDivElement>(".draggable-card");
        cards.forEach((card) => {
          const cardId = card.dataset.cardId;
          if (cardId) {
            cardRectsRef.current.set(cardId, card.getBoundingClientRect());
          }
        });
      }

      setDragState({ id, startIndex: index, yOffset: e.clientY });
      setDropIndex(index);
    },
    [order],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;

      // Find which card position the cursor is closest to
      let closestIndex = dragState.startIndex;
      let closestDistance = Infinity;

      for (const [cardId, rect] of cardRectsRef.current) {
        if (cardId === dragState.id) continue;
        const midY = rect.top + rect.height / 2;
        const distance = Math.abs(e.clientY - midY);
        if (distance < closestDistance) {
          closestDistance = distance;
          const idx = order.indexOf(cardId);
          if (idx !== -1) closestIndex = idx;
        }
      }

      // Also check if cursor is below all cards
      const allRects = [...cardRectsRef.current.values()];
      if (allRects.length > 0) {
        const lastRect = allRects.reduce((max, r) => (r.bottom > max.bottom ? r : max));
        if (e.clientY > lastRect.bottom) {
          closestIndex = order.length - 1;
        }
        const firstRect = allRects.reduce((min, r) => (r.top < min.top ? r : min));
        if (e.clientY < firstRect.top) {
          closestIndex = 0;
        }
      }

      setDropIndex(closestIndex);
    },
    [dragState, order],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragState || dropIndex === null) {
      setDragState(null);
      setDropIndex(null);
      return;
    }

    if (dropIndex !== dragState.startIndex) {
      const newOrder = order.filter((id) => id !== dragState.id);
      newOrder.splice(dropIndex, 0, dragState.id);
      persist(newOrder);
    }

    setDragState(null);
    setDropIndex(null);
  }, [dragState, dropIndex, order, persist]);

  // Attach global mousemove/mouseup listeners
  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => handleMouseMove(e);
    const onUp = () => handleMouseUp();

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  return {
    order,
    dragId: dragState?.id ?? null,
    dropIndex,
    registerCardRef,
    handleMouseDown,
  };
}
