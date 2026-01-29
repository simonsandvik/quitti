import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    helperText?: string;
    error?: string;
}

export const Input = ({ label, helperText, error, className = "", ...props }: InputProps) => {
    return (
        <div style={{ marginBottom: "16px", width: "100%" }}>
            {label && (
                <label
                    style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                    }}
                >
                    {label}
                </label>
            )}
            <input
                className={className}
                style={error ? { borderColor: "var(--error)" } : {}}
                {...props}
            />
            {error && <p style={{ color: "var(--error)", fontSize: "12px", marginTop: "4px" }}>{error}</p>}
            {helperText && !error && (
                <p style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: "4px" }}>{helperText}</p>
            )}
        </div>
    );
};
