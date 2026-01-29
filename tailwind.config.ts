import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--bg-primary)",
                foreground: "var(--text-primary)",
                primary: {
                    DEFAULT: "var(--accent-primary)",
                    foreground: "#ffffff",
                },
                secondary: {
                    DEFAULT: "var(--bg-tertiary)",
                    foreground: "var(--text-primary)",
                },
                muted: {
                    DEFAULT: "var(--bg-secondary)",
                    foreground: "var(--text-secondary)",
                },
                accent: {
                    DEFAULT: "var(--accent-primary)",
                    foreground: "#ffffff",
                },
                card: {
                    DEFAULT: "var(--bg-secondary)",
                    foreground: "var(--text-primary)",
                },
            },
            fontFamily: {
                sans: ["var(--font-sans)", "sans-serif"],
            },
        },
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
    },
    plugins: [],
};
export default config;
