"use client";

import { Input } from "@/components/ui/input";

/** A native colour picker paired with an editable hex box, so colours can be typed or picked. */
export function ColorField({ label, value, onChange, id }: { label: string; value: string; onChange: (hex: string) => void; id: string }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="text-sm">
      <label htmlFor={`${id}-hex`} className="mb-1 block font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1"
        />
        <Input id={`${id}-hex`} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className="w-28 font-mono" aria-invalid={!valid} />
      </div>
      {!valid && <p className="mt-1 text-xs text-destructive">Use a colour like #0f766e.</p>}
    </div>
  );
}
