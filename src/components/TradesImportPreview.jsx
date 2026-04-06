import React, { useEffect, useState } from "react";
import { parseTradesImport } from "../utils/csvImportUtils";

const panelStyle = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(125, 211, 252, 0.18)",
    borderRadius: "24px",
    padding: "20px",
    boxShadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
};

const titleStyle = {
    margin: 0,
    marginBottom: "14px",
    color: "#7dd3fc",
    fontSize: "20px",
    fontWeight: "700",
    textAlign: "center",
};

const statusGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "16px",
};

const statusCardStyle = {
    gridColumn: "span 3",
    background: "rgba(11, 18, 32, 0.96)",
    border: "1px solid rgba(125, 211, 252, 0.14)",
    borderRadius: "18px",
    padding: "14px",
    minWidth: 0,
};

const statusLabelStyle = {
    color: "#8fa8c7",
    fontSize: "12px",
    marginBottom: "6px",
};

const statusValueStyle = {
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
    wordBreak: "break-word",
};

const infoBoxStyle = {
    background: "rgba(11, 18, 32, 0.96)",
    border: "1px solid rgba(125, 211, 252, 0.14)",
    borderRadius: "18px",
    padding: "14px",
    marginBottom: "16px",
};

const infoLabelStyle = {
    color: "#8fa8c7",
    fontSize: "12px",
    marginBottom: "8px",
};

const infoValueStyle = {
    color: "#dbeafe",
    fontSize: "14px",
    lineHeight: 1.5,
    wordBreak: "break-word",
};

const tableWrapStyle = {
    width: "100%",
    overflowX: "auto",
    border: "1px solid rgba(125, 211, 252, 0.14)",
    borderRadius: "18px",
    background: "rgba(11, 18, 32, 0.96)",
};

const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "820px",
};

const thStyle = {
    textAlign: "left",
    padding: "12px",
    color: "#7dd3fc",
    fontSize: "13px",
    borderBottom: "1px solid rgba(125, 211, 252, 0.14)",
    background: "rgba(125, 211, 252, 0.06)",
};

const tdStyle = {
    padding: "12px",
    color: "#dbeafe",
    fontSize: "13px",
    borderBottom: "1px solid rgba(125, 211, 252, 0.08)",
};

const emptyStyle = {
    padding: "18px",
    color: "#8fa8c7",
    fontSize: "14px",
    textAlign: "center",
};

function formatDateTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("de-CH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatMoney(value) {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) ? parsed : 0;

    return `${safeValue.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

export default function TradesImportPreview() {
    const [, setVersion] = useState(0);

    useEffect(() => {
        const handleRefresh = () => {
            setVersion((prev) => prev + 1);
        };

        window.addEventListener("tradovate-csv-imports-updated", handleRefresh);

        return () => {
            window.removeEventListener(
                "tradovate-csv-imports-updated",
                handleRefresh
            );
        };
    }, []);

    const parsed = parseTradesImport();
    const previewRows = parsed.rows.slice(0, 6);
    const headerText =
        parsed.headers.length > 0 ? parsed.headers.join(", ") : "-";

    const totalPnl = parsed.rows.reduce((sum, row) => sum + (row.pnl || 0), 0);

    return (
        <section style={panelStyle}>
            <h3 style={titleStyle}>Trades Import Vorschau</h3>

            <div style={statusGridStyle}>
                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Status</div>
                    <div style={statusValueStyle}>
                        {parsed.meta ? "Trades CSV geladen" : "Noch keine Trades CSV"}
                    </div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Datei</div>
                    <div style={statusValueStyle}>
                        {parsed.meta?.fileName || "-"}
                    </div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Import Zeit</div>
                    <div style={statusValueStyle}>
                        {formatDateTime(parsed.meta?.uploadedAt)}
                    </div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Trades erkannt</div>
                    <div style={statusValueStyle}>{parsed.rows.length}</div>
                </div>
            </div>

            <div style={statusGridStyle}>
                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Total PnL</div>
                    <div style={statusValueStyle}>{formatMoney(totalPnl)}</div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Gewinner</div>
                    <div style={statusValueStyle}>
                        {parsed.rows.filter((row) => (row.pnl || 0) > 0).length}
                    </div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Verlierer</div>
                    <div style={statusValueStyle}>
                        {parsed.rows.filter((row) => (row.pnl || 0) < 0).length}
                    </div>
                </div>

                <div style={statusCardStyle}>
                    <div style={statusLabelStyle}>Flat</div>
                    <div style={statusValueStyle}>
                        {parsed.rows.filter((row) => (row.pnl || 0) === 0).length}
                    </div>
                </div>
            </div>

            <div style={infoBoxStyle}>
                <div style={infoLabelStyle}>Erkannte CSV Spalten</div>
                <div style={infoValueStyle}>{headerText}</div>
            </div>

            <div style={tableWrapStyle}>
                {previewRows.length === 0 ? (
                    <div style={emptyStyle}>
                        Noch keine Trades CSV importiert.
                    </div>
                ) : (
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Date</th>
                                <th style={thStyle}>Time</th>
                                <th style={thStyle}>Title</th>
                                <th style={thStyle}>Symbol</th>
                                <th style={thStyle}>Side</th>
                                <th style={thStyle}>Qty</th>
                                <th style={thStyle}>PnL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewRows.map((row) => (
                                <tr key={row.id}>
                                    <td style={tdStyle}>{row.date || "-"}</td>
                                    <td style={tdStyle}>{row.time || "-"}</td>
                                    <td style={tdStyle}>{row.title || "-"}</td>
                                    <td style={tdStyle}>{row.symbol || "-"}</td>
                                    <td style={tdStyle}>{row.side || "-"}</td>
                                    <td style={tdStyle}>{row.quantity ?? 0}</td>
                                    <td style={tdStyle}>{formatMoney(row.pnl || 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}