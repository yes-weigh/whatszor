/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                    950: '#172554',
                },
                // Semantic design tokens (reference CSS vars defined in globals.css)
                accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', dim: 'var(--accent-dim)' },
                success: 'var(--success)',
                warning: 'var(--warning)',
                danger: 'var(--danger)',
            },
            backgroundColor: {
                base: 'var(--bg-base)',
                surface: 'var(--bg-surface)',
                elevated: 'var(--bg-elevated)',
                hover: 'var(--bg-hover)',
            },
            textColor: {
                primary: 'var(--text-primary)',
                secondary: 'var(--text-secondary)',
                muted: 'var(--text-muted)',
            },
            borderColor: {
                theme: 'var(--border)',
                strong: 'var(--border-strong)',
            },
            fontFamily: {
                sans: ['var(--font-outfit)', 'Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
