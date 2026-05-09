import { type ReactNode } from "react";
import {
  ContextMenu as ShadcnContextMenu,
  ContextMenuContent,
  ContextMenuItem as ShadcnContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";

interface ContextMenuProps {
  trigger: ReactNode;
  children: ReactNode;
}

export function ContextMenu({ trigger, children }: ContextMenuProps) {
  return (
    <ShadcnContextMenu>
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent>{children}</ContextMenuContent>
    </ShadcnContextMenu>
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
    <ShadcnContextMenuItem className={className} onSelect={onSelect}>
      {children}
    </ShadcnContextMenuItem>
  );
}
