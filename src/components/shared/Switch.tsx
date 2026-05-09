import { Switch as ShadcnSwitch } from "../ui/switch";

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({ id, checked, onCheckedChange, label }: SwitchProps) {
  const inner = (
    <ShadcnSwitch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  );

  if (!label) return inner;

  return (
    <label className="radix-switch-label" htmlFor={id}>
      {inner}
      <span>{label}</span>
    </label>
  );
}
