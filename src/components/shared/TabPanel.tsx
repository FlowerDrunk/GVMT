import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export interface TabDef {
  key: string;
  label: string;
  visible: boolean;
  content: ReactNode;
}

interface TabPanelProps {
  tabs: TabDef[];
  activeTab?: string;
  onActiveTabChange?: (key: string) => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function TabPanel({
  tabs,
  activeTab: controlledTab,
  onActiveTabChange,
  defaultWidth = 320,
  minWidth = 300,
  maxWidth = 520,
}: TabPanelProps) {
  const visibleTabs = tabs.filter((t) => t.visible);
  const [internalTab, setInternalTab] = useState<string>("");
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const resizing = useRef(false);

  const isControlled = controlledTab !== undefined;
  const activeTab = isControlled ? controlledTab : internalTab;

  const setActiveTab = useCallback(
    (key: string) => {
      if (isControlled) {
        onActiveTabChange?.(key);
      } else {
        setInternalTab(key);
      }
    },
    [isControlled, onActiveTabChange],
  );

  // Sync internal tab when controlled from outside
  useEffect(() => {
    if (isControlled && activeTab && !visibleTabs.find((t) => t.key === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs.map((t) => t.key).join(","), activeTab, isControlled]);

  // Auto-select first tab when none selected
  useEffect(() => {
    if (visibleTabs.length > 0 && !activeTab) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs.length > 0 ? visibleTabs[0].key : null, activeTab]);

  const resolvedTab = activeTab && visibleTabs.find((t) => t.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key ?? "";

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizing.current = true;
      const startX = event.clientX;
      const startWidth = panelWidth;

      function onMouseMove(e: MouseEvent) {
        if (!resizing.current) return;
        const delta = startX - e.clientX;
        const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setPanelWidth(next);
      }

      function onMouseUp() {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth, minWidth, maxWidth],
  );

  if (visibleTabs.length === 0) return null;

  const activeContent = visibleTabs.find((t) => t.key === resolvedTab)?.content;

  return (
    <aside className="tab-panel" style={{ width: panelWidth }}>
      <div className="tab-resize-handle" onMouseDown={onMouseDown}>
        <span className="resize-grip" />
      </div>
      <Tabs value={resolvedTab} onValueChange={setActiveTab} className="tab-panel-tabs">
        {visibleTabs.length > 1 ? (
          <TabsList className="tab-bar h-auto rounded-none bg-transparent p-0">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={`tab-item ${resolvedTab === tab.key ? "active" : ""} data-[state=active]:bg-transparent data-[state=active]:shadow-none`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
        <TabsContent value={resolvedTab} className="tab-content mt-0">
          {activeContent}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
