import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors — disesuaikan dengan Hummer brand
        primary: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        // Indicator warna untuk yield
        indicator: {
          normal: "#2E7D32",   // hijau — dalam range
          warning: "#F57C00",  // kuning — perhatian
          error: "#C62828",    // merah — di luar range
        },
      },
      spacing: {
        "88": "22rem",
        "120": "30rem",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
  ],
};

export default config;
