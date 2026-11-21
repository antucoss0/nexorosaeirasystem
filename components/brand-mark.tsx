import { HeartHandshake, Plus } from "lucide-react";
export function BrandMark() {
  return (
    <span className="brand-emblem" aria-hidden="true">
      <HeartHandshake size={35} strokeWidth={1.8} />
      <Plus className="brand-cross" size={13} strokeWidth={3} />
    </span>
  );
}
