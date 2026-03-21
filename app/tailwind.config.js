/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#060a14",
          800: "#0a0e1a",
          700: "#0f1525",
          600: "#151d33",
          500: "#1a2344",
        },
        accent: {
          cyan: "#00d4ff",
          gold: "#c9a84c",
        },
      },
    },
  },
  plugins: [],
};
