import { memo, useEffect, useRef } from "react";

interface DraggableCardProps {
  cardId: string;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  registerCardRef: (id: string, el: HTMLDivElement | null) => void;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  children: React.ReactNode;
}

export const DraggableCard = memo(function DraggableCard({
  cardId,
  index,
  isDragging,
  isDropTarget,
  registerCardRef,
  onMouseDown,
  children,
}: DraggableCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerCardRef(cardId, ref.current);
    return () => registerCardRef(cardId, null);
  }, [cardId, registerCardRef]);

  return (
    <div
      ref={ref}
      data-card-id={cardId}
      className={`draggable-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
    >
      <div className="card-header-bar">
        <span
          className="card-drag-handle"
          title="拖拽排序"
          onMouseDown={(e) => onMouseDown(e, cardId)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="5" r="2" />
            <circle cx="15" cy="5" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="9" cy="19" r="2" />
            <circle cx="15" cy="19" r="2" />
          </svg>
        </span>
      </div>
        {children}
    </div>
  );
});
