export function manualOverrideValue(selected?: string | null, manual?: string | null) {
  const manualValue = manual?.trim();
  if (manualValue) return manualValue;
  const selectedValue = selected?.trim();
  return selectedValue || null;
}
