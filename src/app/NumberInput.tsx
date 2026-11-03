// A number field the GM can type into freely (an empty field, a minus sign, "0." on the way to "0.5"): it hands on
// only numbers in range, and on leaving the field settles on the nearest number allowed.
import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = { value: number; min: number; max: number; step?: number | "any"; onChange: (value: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step" | "type">;

export function NumberInput({ value, min, max, step, onChange, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText((current) => (current.trim() !== "" && Number(current) === value ? current : String(value))), [value]);
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const n = Number(next);
        if (next.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text);
        const settled = text.trim() === "" || !Number.isFinite(n) ? value : Math.max(min, Math.min(max, n));
        setText(String(settled));
        if (settled !== value) onChange(settled);
      }}
    />
  );
}
