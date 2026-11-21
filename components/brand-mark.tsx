import { useId } from "react";
export function BrandMark({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={"brand-emblem " + className} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <defs>
          <linearGradient id={id + "a"} x1="20" y1="14" x2="100" y2="112">
            <stop offset="0" stopColor="#ff7cc0" />
            <stop offset="0.5" stopColor="#ff1e8a" />
            <stop offset="1" stopColor="#c4006b" />
          </linearGradient>
        </defs>
        <path
          className="bm-hand bm-hand-l"
          d="M9 55c-3 27 19 51 48 58C40 100 29 84 27 62c-1-9-16-15-18-7Z"
          fill={`url(#${id}a)`}
        />
        <path
          className="bm-hand bm-hand-r"
          d="M111 55c3 27-19 51-48 58 17-13 28-29 30-51 1-9 16-15 18-7Z"
          fill={`url(#${id}a)`}
        />
        <path
          className="bm-heart"
          d="M60 84C31 64 24 43 36 31c10-9 22-2 24 9 2-11 14-18 24-9 12 12 5 33-24 53Z"
          stroke={`url(#${id}a)`}
          strokeWidth="8.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
        />
        <path
          className="bm-cross"
          d="M56.5 42h7v8.500h8.500v7h-8.500v8.500h-7v-8.500h-8.500v-7h8.500Z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}
