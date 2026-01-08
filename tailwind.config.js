/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary: Terracotta/Rust
        primary: {
          50: '#fdf4f3',
          100: '#fce8e6',
          200: '#f9d5d1',
          300: '#f4b5ad',
          400: '#eb8a7d',
          500: '#dd6b5b',
          600: '#c94d3c',
          700: '#a83d2e',
          800: '#8c3529',
          900: '#763228',
        },
        // Accent: Forest/Sage Green
        accent: {
          50: '#f4f7f4',
          100: '#e4ebe4',
          200: '#c9d7c9',
          300: '#a3bca3',
          400: '#7a9e7a',
          500: '#5c7c5c',
          600: '#4a6b4a',
          700: '#3d573d',
          800: '#334733',
          900: '#2a3a2a',
        },
        // Warm Neutrals
        warm: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
      },
    },
  },
  plugins: [],
}
