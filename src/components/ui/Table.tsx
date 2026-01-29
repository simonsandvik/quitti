import React from "react";

// For now, we will rely on standard HTML table elements styled by globals.css
// But we can export a TableWrapper for horizontal scroll

export const TableWrapper = ({ children }: { children: React.ReactNode }) => {
    return <div className="table-wrapper">{children}</div>;
};

export const Table = ({ children }: { children: React.ReactNode }) => {
    return <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>;
};

export const TableHeader = ({ children }: { children: React.ReactNode }) => {
    return <thead style={{ background: "var(--bg-tertiary)" }}>{children}</thead>;
};

export const TableBody = ({ children }: { children: React.ReactNode }) => {
    return <tbody>{children}</tbody>;
};

export const TableRow = ({ children }: { children: React.ReactNode }) => {
    return <tr style={{ borderBottom: "1px solid var(--bg-tertiary)" }}>{children}</tr>;
};

export const TableHead = ({ children }: { children: React.ReactNode }) => {
    return (
        <th
            style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "13px",
                color: "var(--text-secondary)",
                fontWeight: 600,
                textTransform: "uppercase",
            }}
        >
            {children}
        </th>
    );
};

export const TableCell = ({ children }: { children: React.ReactNode }) => {
    return <td style={{ padding: "16px", fontSize: "14px" }}>{children}</td>;
};
