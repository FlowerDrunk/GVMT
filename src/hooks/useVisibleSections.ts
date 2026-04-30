import { useState } from "react";

export interface VisibleSections {
  repositories: boolean;
  files: boolean;
  changes: boolean;
  review: boolean;
}

export function useVisibleSections() {
  const [visibleSections, setVisibleSections] = useState<VisibleSections>({
    repositories: true,
    files: true,
    changes: true,
    review: true,
  });

  const toggleSection = (section: keyof VisibleSections) => {
    setVisibleSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return { visibleSections, toggleSection };
}
