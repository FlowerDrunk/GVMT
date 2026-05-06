interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({ id, checked, onCheckedChange, label }: SwitchProps) {
  const inner = (
    <button
      className={`radix-switch${checked ? " checked" : ""}`}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="radix-switch-thumb" />
    </button>
  );

  if (!label) return inner;

  return (
    <label className="radix-switch-label" htmlFor={id}>
      {inner}
      <span>{label}</span>
    </label>
  );
}
