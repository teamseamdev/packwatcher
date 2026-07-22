"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";

type LocationPostalCodeFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onLocated?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
};

export function LocationPostalCodeField({
  name,
  value,
  defaultValue = "",
  onChange,
  onLocated,
  placeholder = "ZIP",
  className = "",
  inputClassName = "",
  buttonClassName = ""
}: LocationPostalCodeFieldProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [message, setMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const currentValue = value ?? internalValue;

  function update(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  }

  function locate() {
    setMessage("");
    if (!("geolocation" in navigator)) {
      setMessage("Location is not supported on this device.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude)
          });
          const response = await fetch(`/api/location/postal-code?${params.toString()}`);
          const data = await response.json() as { ok?: boolean; postalCode?: string; error?: string };
          if (!response.ok || !data.postalCode) throw new Error(data.error ?? "Could not locate ZIP.");
          update(data.postalCode);
          onLocated?.(data.postalCode);
          setMessage(`Located ${data.postalCode}.`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not locate ZIP.");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setMessage(error.message || "Location permission was not granted.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 1000 * 60 * 10 }
    );
  }

  return (
    <div className={className}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          name={name}
          value={currentValue}
          onChange={(event) => update(event.target.value)}
          inputMode="numeric"
          placeholder={placeholder}
          className={`h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300 ${inputClassName}`}
        />
        <button
          type="button"
          disabled={isLocating}
          onClick={locate}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-semibold text-slate-200 disabled:opacity-60 ${buttonClassName}`}
        >
          {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Locate me
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
