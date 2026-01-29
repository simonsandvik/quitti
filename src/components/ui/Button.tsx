import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
    isLoading?: boolean;
}

export const Button = ({
    children,
    className = "",
    variant = "primary",
    size = "md",
    isLoading,
    disabled,
    ...props
}: ButtonProps) => {
    const baseClass = "btn";
    const variantClass = variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "glass";

    const sizeClasses = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg"
    };

    return (
        <button
            className={`${baseClass} ${variantClass} ${sizeClasses[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? <span style={{ marginRight: "8px" }}>⏳</span> : null}
            {children}
        </button>
    );
};
