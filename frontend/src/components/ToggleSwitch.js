import React from 'react';

export default function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label
      className={`toggle-switch${checked ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
