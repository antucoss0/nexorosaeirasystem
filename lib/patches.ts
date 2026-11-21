export function flattenPatch(patch: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(patch).flatMap(([key, value]) =>
      key === "form_data" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
        ? Object.entries(value).map(([k, v]) => [`form_data.${k}`, v])
        : [[key, value]],
    ),
  );
}
export function fieldValue(record: Record<string, any> | null, path: string) {
  return path.startsWith("form_data.")
    ? record?.form_data?.[path.slice(10)]
    : record?.[path];
}
export function expandPatch(flat: Record<string, any>) {
  const patch: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith("form_data.")) {
      patch.form_data = { ...patch.form_data, [key.slice(10)]: value };
    } else patch[key] = value;
  }
  return patch;
}
