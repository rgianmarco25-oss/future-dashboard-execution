import { useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";

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
    warning: "#f59e0b",
    cardBg: "rgba(15, 23, 42, 0.72)",
    tableHead: "rgba(15, 23, 42, 0.92)",
    rowAlt: "rgba(15, 23, 42, 0.35)",
};

const TEST_CASES = [
    {
        id: "case_1",
        label: "Fall 1. Normaler Entry und kompletter Exit",
        description: "1 Buy, danach kompletter Sell Exit",
        fills: [
            {
                fillId: "f1",
                orderId: "o1",
                symbol: "NQM26",
                side: "buy",
                quantity: 1,
                price: 20000,
                commission: 1.2,
                timestamp: "2026-04-06T08:00:00Z",
            },
            {
                fillId: "f2",
                orderId: "o2",
                symbol: "NQM26",
                side: "sell",
                quantity: 1,
                price: 20020,
                commission: 1.2,
                timestamp: "2026-04-06T08:05:00Z",
            },
        ],
    },
    {
        id: "case_2",
        label: "Fall 2. Teilfill beim Entry",
        description: "Entry wird in 2 Fills ausgeführt, dann kompletter Exit",
        fills: [
            {
                fillId: "f3",
                orderId: "o3",
                symbol: "NQM26",
                side: "buy",
                quantity: 1,
                price: 20000,
                commission: 0.6,
                timestamp: "2026-04-06T09:00:00Z",
            },
            {
                fillId: "f4",
                orderId: "o3",
                symbol: "NQM26",
                side: "buy",
                quantity: 1,
                price: 20001,
                commission: 0.6,
                timestamp: "2026-04-06T09:00:02Z",
            },
            {
                fillId: "f5",
                orderId: "o4",
                symbol: "NQM26",
                side: "sell",
                quantity: 2,
                price: 20010,
                commission: 1.2,
                timestamp: "2026-04-06T09:06:00Z",
            },
        ],
    },
    {
        id: "case_3",
        label: "Fall 3. Scale In und kompletter Exit",
        description: "Long 1, nochmal Long 1, danach Exit 2",
        fills: [
            {
                fillId: "f6",
                orderId: "o5",
                symbol: "MNQM26",
                side: "buy",
                quantity: 1,
                price: 19800,
                commission: 0.5,
                timestamp: "2026-04-06T10:00:00Z",
            },
            {
                fillId: "f7",
                orderId: "o6",
                symbol: "MNQM26",
                side: "buy",
                quantity: 1,
                price: 19790,
                commission: 0.5,
                timestamp: "2026-04-06T10:03:00Z",
            },
            {
                fillId: "f8",
                orderId: "o7",
                symbol: "MNQM26",
                side: "sell",
                quantity: 2,
                price: 19820,
                commission: 1,
                timestamp: "2026-04-06T10:10:00Z",
            },
        ],
    },
    {
        id: "case_4",
        label: "Fall 4. Teilweises Schließen",
        description: "Long 3, Teil Exit 1, Position 2 bleibt offen",
        fills: [
            {
                fillId: "f9",
                orderId: "o8",
                symbol: "NQM26",
                side: "buy",
                quantity: 3,
                price: 20100,
                commission: 1.8,
                timestamp: "2026-04-06T11:00:00Z",
            },
            {
                fillId: "f10",
                orderId: "o9",
                symbol: "NQM26",
                side: "sell",
                quantity: 1,
                price: 20115,
                commission: 0.6,
                timestamp: "2026-04-06T11:08:00Z",
            },
        ],
    },
    {
        id: "case_5",
        label: "Fall 5. Richtungswechsel",
        description: "Long 1, danach Sell 2. Alter Trade wird geschlossen, neuer Short 1 wird geöffnet",
        fills: [
            {
                fillId: "f11",
                orderId: "o10",
                symbol: "MNQM26",
                side: "buy",
                quantity: 1,
                price: 19950,
                commission: 0.5,
                timestamp: "2026-04-06T12:00:00Z",
            },
            {
                fillId: "f12",
                orderId: "o11",
                symbol: "MNQM26",
                side: "sell",
                quantity: 2,
                price: 19940,
                commission: 1,
                timestamp: "2026-04-06T12:03:00Z",
            },
        ],
    },
];

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, decimals = 2) {
    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(toNumber(value, 0));
}

function formatDateTime(value) {
    if (!value) {
        return "–";
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return "–";
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

function getPnlColor(value) {
    const number = toNumber(value, 0);

    if (number > 0) {
        return COLORS.positive;
    }

    if (number < 0) {
        return COLORS.negative;
    }

    return COLORS.text;
}

function SummaryCard({ label, value, tone = "default" }) {
    const toneColor =
        tone === "positive"
            ? COLORS.positive
            : tone === "negative"
              ? COLORS.negative
              : tone === "warning"
                ? COLORS.warning
                : COLORS.text;

    return (
        <div
            style={{
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 16,
                minHeight: 86,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 12,
                    marginBottom: 8,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: toneColor,
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>
        </div>
    );
}

function SectionTitle({ children }) {
    return (
        <div
            style={{
                color: COLORS.title,
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 12,
            }}
        >
            {children}
        </div>
    );
}

function TableWrap({ children }) {
    return (
        <div
            style={{
                overflowX: "auto",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
            }}
        >
            {children}
        </div>
    );
}

const headerCellStyle = {
    textAlign: "left",
    padding: "12px 14px",
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 700,
    borderBottom: `1px solid ${COLORS.borderStrong}`,
    whiteSpace: "nowrap",
};

const bodyCellStyle = {
    padding: "12px 14px",
    color: COLORS.text,
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
};

export default function FillDiagnosticsPanel() {
    const [selectedCaseId, setSelectedCaseId] = useState(TEST_CASES[0].id);

    const selectedCase = useMemo(() => {
        return TEST_CASES.find((testCase) => testCase.id === selectedCaseId) || TEST_CASES[0];
    }, [selectedCaseId]);

    const analytics = useMemo(() => {
        return buildFillAnalytics({
            fills: selectedCase.fills,
            accountId: "DIAG-001",
        });
    }, [selectedCase]);

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
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 20,
                }}
            >
                <div>
                    <h2
                        style={{
                            margin: 0,
                            color: COLORS.title,
                            fontSize: 22,
                            fontWeight: 700,
                        }}
                    >
                        Fill Diagnostics
                    </h2>
                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 8,
                            fontSize: 13,
                        }}
                    >
                        Testpanel für Phase 2 Fill Matching
                    </div>
                </div>

                <div
                    style={{
                        minWidth: 320,
                    }}
                >
                    <label
                        style={{
                            display: "block",
                            color: COLORS.muted,
                            fontSize: 12,
                            marginBottom: 8,
                        }}
                    >
                        Testfall
                    </label>
                    <select
                        value={selectedCaseId}
                        onChange={(event) => setSelectedCaseId(event.target.value)}
                        style={{
                            width: "100%",
                            background: "rgba(15, 23, 42, 0.9)",
                            color: COLORS.text,
                            border: `1px solid ${COLORS.borderStrong}`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            outline: "none",
                        }}
                    >
                        {TEST_CASES.map((testCase) => (
                            <option key={testCase.id} value={testCase.id}>
                                {testCase.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div
                style={{
                    background: COLORS.cardBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 16,
                    marginBottom: 20,
                }}
            >
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 15,
                        fontWeight: 700,
                        marginBottom: 8,
                    }}
                >
                    {selectedCase.label}
                </div>
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 13,
                    }}
                >
                    {selectedCase.description}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 22,
                }}
            >
                <SummaryCard label="Fills" value={analytics.summary.fillCount} />
                <SummaryCard label="Closed Trades" value={analytics.summary.closedTradeCount} />
                <SummaryCard label="Open Trades" value={analytics.summary.openTradeCount} />
                <SummaryCard label="Open Positions" value={analytics.summary.openPositionCount} />
                <SummaryCard
                    label="Gross PnL"
                    value={formatNumber(analytics.summary.grossPnl, 2)}
                    tone={analytics.summary.grossPnl >= 0 ? "positive" : "negative"}
                />
                <SummaryCard
                    label="Net PnL"
                    value={formatNumber(analytics.summary.netPnl, 2)}
                    tone={analytics.summary.netPnl >= 0 ? "positive" : "negative"}
                />
            </div>

            <div style={{ marginBottom: 22 }}>
                <SectionTitle>Rohdaten Fills</SectionTitle>
                <TableWrap>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: 980,
                        }}
                    >
                        <thead style={{ background: COLORS.tableHead }}>
                            <tr>
                                <th style={headerCellStyle}>Zeit</th>
                                <th style={headerCellStyle}>Symbol</th>
                                <th style={headerCellStyle}>Side</th>
                                <th style={headerCellStyle}>Qty</th>
                                <th style={headerCellStyle}>Preis</th>
                                <th style={headerCellStyle}>Kommission</th>
                                <th style={headerCellStyle}>Order ID</th>
                                <th style={headerCellStyle}>Fill ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedCase.fills.map((fill, index) => (
                                <tr
                                    key={fill.fillId || index}
                                    style={{
                                        background: index % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                    }}
                                >
                                    <td style={bodyCellStyle}>{formatDateTime(fill.timestamp)}</td>
                                    <td style={bodyCellStyle}>{fill.symbol}</td>
                                    <td style={bodyCellStyle}>{fill.side}</td>
                                    <td style={bodyCellStyle}>{formatNumber(fill.quantity, 4)}</td>
                                    <td style={bodyCellStyle}>{formatNumber(fill.price, 4)}</td>
                                    <td style={bodyCellStyle}>{formatNumber(fill.commission, 2)}</td>
                                    <td style={bodyCellStyle}>{fill.orderId}</td>
                                    <td style={bodyCellStyle}>{fill.fillId}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TableWrap>
            </div>

            <div style={{ marginBottom: 22 }}>
                <SectionTitle>Geschlossene Trades</SectionTitle>
                {analytics.closedTrades.length === 0 ? (
                    <div
                        style={{
                            background: COLORS.cardBg,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 18,
                            padding: 18,
                            color: COLORS.muted,
                            fontSize: 14,
                        }}
                    >
                        Keine geschlossenen Trades in diesem Testfall.
                    </div>
                ) : (
                    <TableWrap>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 1280,
                            }}
                        >
                            <thead style={{ background: COLORS.tableHead }}>
                                <tr>
                                    <th style={headerCellStyle}>Trade ID</th>
                                    <th style={headerCellStyle}>Symbol</th>
                                    <th style={headerCellStyle}>Side</th>
                                    <th style={headerCellStyle}>Entry</th>
                                    <th style={headerCellStyle}>Exit</th>
                                    <th style={headerCellStyle}>Entry Qty</th>
                                    <th style={headerCellStyle}>Closed Qty</th>
                                    <th style={headerCellStyle}>Ø Entry</th>
                                    <th style={headerCellStyle}>Ø Exit</th>
                                    <th style={headerCellStyle}>Scale In</th>
                                    <th style={headerCellStyle}>Scale Out</th>
                                    <th style={headerCellStyle}>Gross</th>
                                    <th style={headerCellStyle}>Fees</th>
                                    <th style={headerCellStyle}>Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.closedTrades.map((trade, index) => (
                                    <tr
                                        key={trade.tradeId || index}
                                        style={{
                                            background: index % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                        }}
                                    >
                                        <td style={bodyCellStyle}>{trade.tradeId}</td>
                                        <td style={bodyCellStyle}>{trade.symbol}</td>
                                        <td style={bodyCellStyle}>{trade.side}</td>
                                        <td style={bodyCellStyle}>{formatDateTime(trade.entryTime)}</td>
                                        <td style={bodyCellStyle}>{formatDateTime(trade.exitTime)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.entryQty, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.closedQty, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.avgEntryPrice, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.avgExitPrice, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.scaleInCount, 0)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.scaleOutCount, 0)}</td>
                                        <td
                                            style={{
                                                ...bodyCellStyle,
                                                color: getPnlColor(trade.realizedPnlGross),
                                                fontWeight: 700,
                                            }}
                                        >
                                            {formatNumber(trade.realizedPnlGross, 2)}
                                        </td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.totalCommission, 2)}</td>
                                        <td
                                            style={{
                                                ...bodyCellStyle,
                                                color: getPnlColor(trade.realizedPnlNet),
                                                fontWeight: 700,
                                            }}
                                        >
                                            {formatNumber(trade.realizedPnlNet, 2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableWrap>
                )}
            </div>

            <div style={{ marginBottom: 22 }}>
                <SectionTitle>Offene Trades</SectionTitle>
                {analytics.openTrades.length === 0 ? (
                    <div
                        style={{
                            background: COLORS.cardBg,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 18,
                            padding: 18,
                            color: COLORS.muted,
                            fontSize: 14,
                        }}
                    >
                        Keine offenen Trades in diesem Testfall.
                    </div>
                ) : (
                    <TableWrap>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 1080,
                            }}
                        >
                            <thead style={{ background: COLORS.tableHead }}>
                                <tr>
                                    <th style={headerCellStyle}>Trade ID</th>
                                    <th style={headerCellStyle}>Symbol</th>
                                    <th style={headerCellStyle}>Side</th>
                                    <th style={headerCellStyle}>Entry</th>
                                    <th style={headerCellStyle}>Remaining Qty</th>
                                    <th style={headerCellStyle}>Ø Entry</th>
                                    <th style={headerCellStyle}>Closed Qty</th>
                                    <th style={headerCellStyle}>Scale In</th>
                                    <th style={headerCellStyle}>Scale Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.openTrades.map((trade, index) => (
                                    <tr
                                        key={trade.tradeId || index}
                                        style={{
                                            background: index % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                        }}
                                    >
                                        <td style={bodyCellStyle}>{trade.tradeId}</td>
                                        <td style={bodyCellStyle}>{trade.symbol}</td>
                                        <td style={bodyCellStyle}>{trade.side}</td>
                                        <td style={bodyCellStyle}>{formatDateTime(trade.entryTime)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.remainingQty, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.avgEntryPrice, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.closedQty, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.scaleInCount, 0)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(trade.scaleOutCount, 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableWrap>
                )}
            </div>

            <div>
                <SectionTitle>Offene Positionen</SectionTitle>
                {analytics.positions.length === 0 ? (
                    <div
                        style={{
                            background: COLORS.cardBg,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 18,
                            padding: 18,
                            color: COLORS.muted,
                            fontSize: 14,
                        }}
                    >
                        Keine offenen Positionen in diesem Testfall.
                    </div>
                ) : (
                    <TableWrap>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 980,
                            }}
                        >
                            <thead style={{ background: COLORS.tableHead }}>
                                <tr>
                                    <th style={headerCellStyle}>Trade ID</th>
                                    <th style={headerCellStyle}>Symbol</th>
                                    <th style={headerCellStyle}>Side</th>
                                    <th style={headerCellStyle}>Qty</th>
                                    <th style={headerCellStyle}>Signed Qty</th>
                                    <th style={headerCellStyle}>Ø Price</th>
                                    <th style={headerCellStyle}>Opened</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.positions.map((position, index) => (
                                    <tr
                                        key={position.tradeId || index}
                                        style={{
                                            background: index % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                        }}
                                    >
                                        <td style={bodyCellStyle}>{position.tradeId}</td>
                                        <td style={bodyCellStyle}>{position.symbol}</td>
                                        <td style={bodyCellStyle}>{position.side}</td>
                                        <td style={bodyCellStyle}>{formatNumber(position.quantity, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(position.signedQuantity, 4)}</td>
                                        <td style={bodyCellStyle}>{formatNumber(position.avgPrice, 4)}</td>
                                        <td style={bodyCellStyle}>{formatDateTime(position.openedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableWrap>
                )}
            </div>
        </section>
    );
}