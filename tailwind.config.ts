import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#E4007C",
        hover: "#FF1E8A",
        ink: "#111111",
        surface: "#FFFFFF",
        muted: "#F4F4F5",
      },
    },
  },
  plugins: [],
} satisfies Config;
