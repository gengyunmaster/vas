import { type CSSProperties, useEffect, useState } from "react";
import { normalizeHex } from "../model/color";

export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-field">
      <label
        className="color-picker"
        style={{ "--value": value } as CSSProperties}
        title="Custom color"
      >
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <HexInput value={value} onCommit={onChange} />
    </div>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = () => {
    const normalized = normalizeHex(text);
    if (normalized && normalized !== value) onCommit(normalized);
    setText(normalized ?? value);
  };

  return (
    <input
      className="hex-input"
      value={text}
      aria-label="Hex color value"
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
