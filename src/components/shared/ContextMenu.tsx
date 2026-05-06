import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { type ReactNode } from "react";

interface ContextMenuProps {
  trigger: ReactNode;
  children: ReactNode;
}

export function ContextMenu({ trigger, children }: ContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>
        {trigger}
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className="context-menu">
          {children}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

export function ContextMenuItem({
  className,
  onSelect,
  children,
}: {
  className?: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenuPrimitive.Item
      className={className}
      onSelect={onSelect}
    >
      {children}
    </ContextMenuPrimitive.Item>
  );
}
