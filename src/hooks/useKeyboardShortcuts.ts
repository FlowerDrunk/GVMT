import { useEffect } from "react";

interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  action: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      for (const s of shortcuts) {
        if (s.enabled === false) continue;
        if (event.key.toLowerCase() !== s.key.toLowerCase()) continue;
        if ((s.ctrl ?? false) !== (event.ctrlKey || event.metaKey)) continue;
        if ((s.shift ?? false) !== event.shiftKey) continue;

        // Don't trigger when typing in input/textarea
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") continue;

        event.preventDefault();
        s.action();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
