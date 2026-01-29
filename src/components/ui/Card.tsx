import React from "react";

interface CardProps {
    children: React.ReactNode;
    className?: string;
    glass?: boolean;
    style?: React.CSSProperties;
}

export const Card = ({ children, className = "", glass = false, style = {} }: CardProps) => {
    return (
        <div
            className={`${glass ? "glass" : "card"} ${className}`}
            style={{
                ...(glass ? { padding: "24px", borderRadius: "var(--radius-md)" } : {}),
                ...style
            }}
        >
            {children}
        </div>
    );
};
