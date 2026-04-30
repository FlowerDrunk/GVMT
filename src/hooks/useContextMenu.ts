import { useCallback, useEffect, useState } from "react";

interface ContextMenuState<T> {
  data: T;
  x: number;
  y: number;
}

export function useContextMenu<T>() {
  const [menu, setMenu] = useState<ContextMenuState<T> | null>(null);

  const open = useCallback((data: T, x: number, y: number) => {
    setMenu({ data, x, y });
  }, []);

  const close = useCallback(() => {
    setMenu(null);
  }, []);

  useEffect(() => {
    if (!menu) return;

    function closeMenu() {
      setMenu(null);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [menu]);

  return { menu, open, close };
}
