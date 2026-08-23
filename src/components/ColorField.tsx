import { type CSSProperties, useEffect, useState } from "react";
import { normalizeHex } from "../model/color";

export function ColorField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="color-field">
      <label
        className="color-picker"
        style={{ "--value": value } as CSSProperties}
        title="Custom color"
      >
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <HexInput value={value} onCommit={onChange} disabled={disabled} />
    </div>
  );
}

function HexInput({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (color: string) => void;
  disabled?: boolean;
}) {
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
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
