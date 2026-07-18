"use client";

import { useMemo, useState } from "react";

type SetComboboxProps = {
  value: string;
  onChange?: (value: string) => void;
  options: string[];
  name?: string;
  placeholder?: string;
  className?: string;
};

export function SetCombobox({
  value,
  onChange,
  options,
  name,
  placeholder = "Search set",
  className
}: SetComboboxProps) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);

  const visibleOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const filtered = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return filtered.slice(0, 80);
  }, [inputValue, options]);

  function commit(nextValue: string) {
    setInputValue(nextValue);
    onChange?.(nextValue);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {name ? <input type="hidden" name={name} value={inputValue} /> : null}
      <input
        value={inputValue}
        onChange={(event) => {
          commit(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
      />
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-slate-950 p-1 shadow-2xl">
          {visibleOptions.length ? visibleOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                commit(option);
                setOpen(false);
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
            >
              {option}
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-slate-500">No matching sets</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
