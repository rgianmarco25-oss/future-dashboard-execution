import React, { useMemo } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    negative: "#ef4444",
    cardBg: "rgba(15, 23, 42, 0.72)",
    tableHead: "rgba(15, 23, 42, 0.92)",
    rowAlt: "rgba(15, 23, 42, 0.35)",
};

function formatNumber(value, decimals = 2) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0.00";
    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

export default function JournalPanel(props) {
    const { fills = [], accountId = "", title = "Journal" } = props || {};

    const analytics = useMemo(() => {
        return buildFillAnalytics({ fills: Array.isArray(fills) ? fills : [], accountId });
    }, [fills, accountId]);

    const closedTrades = Array.isArray(analytics.closedTrades) ? analytics.closedTrades : [];
    const fillCount = analytics?.summary?.fillCount ?? 0;
    const netPnl = analytics?.summary?.netPnl ?? 0;

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 24,
                padding: 24,
                boxShadow: COLORS.shadow,
                color: COLORS.text,
                width: "100%",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <div>
                    <h2 style={{ margin: 0, color: COLORS.title, fontSize: 22, fontWeight: 700 }}>{title}</h2>
                    <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 13 }}>Account: {accountId || "kein Account gewählt"}</div>
                </div>

                <div style={{ color: COLORS.muted, fontSize: 13, textAlign: "right" }}>
                    <div>Closed Trades: {closedTrades.length}</div>
                    <div>Fills gesamt: {fillCount}</div>
                    <div>Net PnL: {formatNumber(netPnl, 2)}</div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 }}>
                <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8 }}>Closed Trades</div>
                    <div style={{ color: COLORS.text, fontSize: 22, fontWeight: 700 }}>{closedTrades.length}</div>
                </div>

                <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8 }}>Fills gesamt</div>
                    <div style={{ color: COLORS.text, fontSize: 22, fontWeight: 700 }}>{fillCount}</div>
                </div>

                <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16 }}>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8 }}>Net PnL</div>
                    <div style={{ color: netPnl > 0 ? COLORS.positive : netPnl < 0 ? COLORS.negative : COLORS.text, fontSize: 22, fontWeight: 700 }}>{formatNumber(netPnl, 2)}</div>
                </div>
            </div>

            <div style={{ color: COLORS.title, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Closed Trades</div>

            {closedTrades.length === 0 ? (
                <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20, color: COLORS.muted, fontSize: 14 }}>Keine Closed Trades gefunden.</div>
            ) : (
                <div style={{ overflowX: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 18 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                        <thead style={{ background: COLORS.tableHead }}>
                            <tr>
                                <th style={headerCellStyle}>Entry Time</th>
                                <th style={headerCellStyle}>Exit Time</th>
                                <th style={headerCellStyle}>Symbol</th>
                                <th style={headerCellStyle}>Side</th>
                                <th style={headerCellStyle}>Entry Qty</th>
                                <th style={headerCellStyle}>Closed Qty</th>
                                <th style={headerCellStyle}>Realized P/L</th>
                                <th style={headerCellStyle}>Commission</th>
                                <th style={headerCellStyle}>Net P/L</th>
                                <th style={headerCellStyle}>Trade ID</th>
                                <th style={headerCellStyle}>Entry Fill IDs</th>
                                <th style={headerCellStyle}>Exit Fill IDs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {closedTrades.map((trade, idx) => (
                                <tr key={trade.tradeId || `${trade.symbol}_${idx}`} style={{ background: idx % 2 === 0 ? "transparent" : COLORS.rowAlt }}>
                                    <td style={bodyCellStyle}>{formatDateTime(trade.entryTime)}</td>
                                    <td style={bodyCellStyle}>{formatDateTime(trade.exitTime)}</td>
                                    <td style={bodyCellStyle}>{trade.symbol || "–"}</td>
                                    <td style={bodyCellStyle}>{trade.side || "–"}</td>
                                    <td style={bodyCellStyle}>{formatNumber(trade.entryQty, 4)}</td>
                                    <td style={bodyCellStyle}>{formatNumber(trade.closedQty, 4)}</td>
                                    <td style={{ ...bodyCellStyle, color: trade.realizedPnlGross > 0 ? COLORS.positive : trade.realizedPnlGross < 0 ? COLORS.negative : COLORS.text, fontWeight: 700 }}>{formatNumber(trade.realizedPnlGross, 2)}</td>
                                    <td style={bodyCellStyle}>{formatNumber(trade.totalCommission, 2)}</td>
                                    <td style={{ ...bodyCellStyle, color: trade.realizedPnlNet > 0 ? COLORS.positive : trade.realizedPnlNet < 0 ? COLORS.negative : COLORS.text, fontWeight: 700 }}>{formatNumber(trade.realizedPnlNet, 2)}</td>
                                    <td style={bodyCellStyle}>{trade.tradeId || "–"}</td>
                                    <td style={bodyCellStyle}>{Array.isArray(trade.entryFillIds) ? trade.entryFillIds.join(", ") : "–"}</td>
                                    <td style={bodyCellStyle}>{Array.isArray(trade.exitFillIds) ? trade.exitFillIds.join(", ") : "–"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

const headerCellStyle = {
    textAlign: "left",
    padding: "14px 14px",
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 700,
    borderBottom: `1px solid ${COLORS.borderStrong}`,
    whiteSpace: "nowrap",
};

const bodyCellStyle = {
    padding: "14px 14px",
    color: COLORS.text,
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
};
