import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

interface ToggleGroupProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  items: { value: string; label: string; disabled?: boolean }[];
}

export function ToggleGroup({ value, onValueChange, items }: ToggleGroupProps) {
  return (
    <ToggleGroupPrimitive.Root
      className="toggle-group"
      type="multiple"
      value={value}
      onValueChange={onValueChange}
    >
      {items.map((item) => (
        <ToggleGroupPrimitive.Item
          key={item.value}
          className="toggle-group-item"
          value={item.value}
          disabled={item.disabled}
        >
          {item.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
