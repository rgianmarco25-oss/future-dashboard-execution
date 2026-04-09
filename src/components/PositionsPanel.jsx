import { useEffect, useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import * as csvImportUtils from "../utils/csvImportUtils";
import { getFills } from "../utils/storage";
import {
    emitTradeSelection,
    subscribeTradeSelection,
} from "../utils/tradeSelection";

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
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const textValue = cleanString(value);

    if (!textValue) {
        return null;
    }

    let text = textValue
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    const negativeByParens = text.startsWith("(") && text.endsWith(")");
    text = text.replace(/[()]/g, "");

    if (!text) {
        return null;
    }

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (hasComma && !hasDot) {
        const lastPart = text.split(",").pop() || "";

        if (lastPart.length === 1 || lastPart.length === 2) {
            text = text.replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    }

    const parsed = Number(text);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return negativeByParens ? -Math.abs(parsed) : parsed;
}

function toNumber(value, fallback = 0) {
    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : fallback;
}

function formatNumber(value, decimals = 2) {
    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(toNumber(value, 0));
}

function tradeMatchesFilter(trade, filterText) {
    const normalizedFilter = cleanString(filterText).toLowerCase();

    if (!normalizedFilter) {
        return true;
    }

    const haystack = [
        trade?.tradeId,
        trade?.symbol,
        trade?.side,
        trade?.entryTime,
        trade?.exitTime,
    ]
        .map((value) => cleanString(value).toLowerCase())
        .join(" ");

    return haystack.includes(normalizedFilter);
}

function positionMatchesFilter(position, filterText) {
    const normalizedFilter = cleanString(filterText).toLowerCase();

    if (!normalizedFilter) {
        return true;
    }

    const haystack = [
        position?.tradeId,
        position?.symbol,
        position?.side,
        position?.openedAt,
    ]
        .map((value) => cleanString(value).toLowerCase())
        .join(" ");

    return haystack.includes(normalizedFilter);
}

function positionHistoryMatchesFilter(entry, filterText) {
    const normalizedFilter = cleanString(filterText).toLowerCase();

    if (!normalizedFilter) {
        return true;
    }

    const haystack = [
        entry?.positionId,
        entry?.pairId,
        entry?.account,
        entry?.contract,
        entry?.product,
        entry?.tradeDate,
        entry?.timestamp,
        entry?.buyFillId,
        entry?.sellFillId,
    ]
        .map((value) => cleanString(value).toLowerCase())
        .join(" ");

    return haystack.includes(normalizedFilter);
}

function getSideColor(side) {
    if (side === "long") {
        return COLORS.positive;
    }

    if (side === "short") {
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

function TradeIdButton({ tradeId, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(tradeId)}
            style={{
                width: "100%",
                background: COLORS.buttonBg,
                color: COLORS.buttonText,
                border: "none",
                borderRadius: 12,
                padding: "10px 12px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            }}
            title={tradeId || ""}
        >
            {tradeId || "–"}
        </button>
    );
}

function OpenTradeCard({ trade, onSelectTradeId }) {
    const sideColor = trade.side === "long" ? COLORS.positive : COLORS.negative;

    return (
        <div
            style={{
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 16,
                minWidth: 260,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 10,
                }}
            >
                <div
                    style={{
                        color: COLORS.title,
                        fontWeight: 700,
                        fontSize: 16,
                    }}
                >
                    {trade.symbol || "–"}
                </div>
                <div
                    style={{
                        color: sideColor,
                        fontWeight: 700,
                        fontSize: 13,
                        textTransform: "uppercase",
                    }}
                >
                    {trade.side || "–"}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 6,
                    color: COLORS.text,
                    fontSize: 13,
                    marginBottom: 12,
                }}
            >
                <div>Offen seit: {formatDateTime(trade.entryTime)}</div>
                <div>Offene Menge: {formatNumber(trade.remainingQty, 4)}</div>
                <div>Ø Entry: {formatNumber(trade.avgEntryPrice, 4)}</div>
                <div>Closed Qty: {formatNumber(trade.closedQty, 4)}</div>
            </div>

            <TradeIdButton tradeId={trade.tradeId || ""} onSelect={onSelectTradeId} />
        </div>
    );
}

export default function PositionsPanel({
    accountId = "",
    resolvedAccountId: resolvedAccountIdProp = "",
    selectedAccountId = "",
    activeAccountId = "",
    account = null,
    importedFills = [],
    fills = [],
    csvFills = [],
    title = "Positions",
}) {
    const [tradeFilter, setTradeFilter] = useState("");
    const [imports, setImports] = useState(() => {
        return typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : {};
    });

    useEffect(() => {
        const unsubscribe = subscribeTradeSelection((tradeId) => {
            setTradeFilter(tradeId);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        const eventName =
            typeof csvImportUtils.getCsvImportEventName === "function"
                ? csvImportUtils.getCsvImportEventName()
                : "tradovate-csv-imports-updated";

        const loadImports = () => {
            const nextImports =
                typeof csvImportUtils.getAllParsedImports === "function"
                    ? csvImportUtils.getAllParsedImports()
                    : {};

            setImports(nextImports);
        };

        loadImports();

        window.addEventListener(eventName, loadImports);
        window.addEventListener("storage", loadImports);
        window.addEventListener("focus", loadImports);

        return () => {
            window.removeEventListener(eventName, loadImports);
            window.removeEventListener("storage", loadImports);
            window.removeEventListener("focus", loadImports);
        };
    }, []);

    const resolvedAccountId = cleanString(
        accountId ||
        resolvedAccountIdProp ||
        selectedAccountId ||
        activeAccountId ||
        account?.id ||
        account?.accountId
    );

    const directFills = useMemo(() => {
        if (Array.isArray(importedFills) && importedFills.length > 0) {
            return importedFills.map((fill) => ({ ...fill }));
        }

        if (Array.isArray(fills) && fills.length > 0) {
            return fills.map((fill) => ({ ...fill }));
        }

        if (Array.isArray(csvFills) && csvFills.length > 0) {
            return csvFills.map((fill) => ({ ...fill }));
        }

        return [];
    }, [importedFills, fills, csvFills]);

    const storedFills = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        const nextFills = getFills(resolvedAccountId);
        return Array.isArray(nextFills) ? nextFills : [];
    }, [resolvedAccountId]);

    const effectiveFills = useMemo(() => {
        return directFills.length > 0 ? directFills : storedFills;
    }, [directFills, storedFills]);

    const analytics = useMemo(() => {
        return buildFillAnalytics({
            fills: effectiveFills,
            accountId: resolvedAccountId,
        });
    }, [effectiveFills, resolvedAccountId]);

    const positionHistoryData = useMemo(() => {
        return typeof csvImportUtils.buildPositionHistoryData === "function"
            ? csvImportUtils.buildPositionHistoryData(imports, resolvedAccountId)
            : {
                readOnly: false,
                fileName: "",
                importedAt: "",
                stats: { total: 0, totalPnl: 0 },
                entries: [],
            };
    }, [imports, resolvedAccountId]);

    const filteredOpenTrades = useMemo(() => {
        return [...analytics.openTrades]
            .filter((trade) => tradeMatchesFilter(trade, tradeFilter))
            .sort((a, b) => {
                const aTime = new Date(a?.entryTime || 0).getTime();
                const bTime = new Date(b?.entryTime || 0).getTime();
                return bTime - aTime;
            });
    }, [analytics.openTrades, tradeFilter]);

    const filteredPositions = useMemo(() => {
        return [...analytics.positions]
            .filter((position) => positionMatchesFilter(position, tradeFilter))
            .sort((a, b) => {
                return String(a.symbol || "").localeCompare(String(b.symbol || ""));
            });
    }, [analytics.positions, tradeFilter]);

    const filteredPositionHistory = useMemo(() => {
        return [...(positionHistoryData.entries || [])]
            .filter((entry) => positionHistoryMatchesFilter(entry, tradeFilter))
            .sort((a, b) => {
                const aTime = new Date(a?.timestamp || a?.tradeDate || 0).getTime();
                const bTime = new Date(b?.timestamp || b?.tradeDate || 0).getTime();
                return bTime - aTime;
            });
    }, [positionHistoryData.entries, tradeFilter]);

    const openTradesById = useMemo(() => {
        const map = {};

        filteredOpenTrades.forEach((trade) => {
            const tradeId = cleanString(trade.tradeId);

            if (tradeId) {
                map[tradeId] = trade;
            }
        });

        return map;
    }, [filteredOpenTrades]);

    const totalOpenQty = useMemo(() => {
        return filteredPositions.reduce((sum, position) => {
            return sum + Math.abs(toNumber(position.quantity, 0));
        }, 0);
    }, [filteredPositions]);

    const totalHistoryPnl = useMemo(() => {
        return filteredPositionHistory.reduce((sum, entry) => {
            return sum + toNumber(entry.pnl, 0);
        }, 0);
    }, [filteredPositionHistory]);

    function updateTradeFilter(value) {
        const nextValue = cleanString(value);
        setTradeFilter(nextValue);
        emitTradeSelection(nextValue);
    }

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
                        {title}
                    </h2>
                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 8,
                            fontSize: 13,
                        }}
                    >
                        Account: {resolvedAccountId || "kein Account gewählt"}
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 4,
                            fontSize: 13,
                        }}
                    >
                        Fill Quelle: {effectiveFills.length} Fills
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 4,
                            fontSize: 13,
                        }}
                    >
                        Position History Datei: {positionHistoryData.fileName || "keine Datei"}
                    </div>
                </div>

                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 13,
                        textAlign: "right",
                    }}
                >
                    <div>Offene Positionen: {filteredPositions.length}</div>
                    <div>Offene Trades: {filteredOpenTrades.length}</div>
                    <div>History Rows: {filteredPositionHistory.length}</div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(240px, 1fr) auto",
                    gap: 12,
                    alignItems: "end",
                    marginBottom: 22,
                }}
            >
                <div>
                    <label
                        style={{
                            display: "block",
                            color: COLORS.muted,
                            fontSize: 12,
                            marginBottom: 8,
                        }}
                    >
                        Gemeinsamer Trade ID Filter
                    </label>
                    <input
                        type="text"
                        value={tradeFilter}
                        onChange={(event) => updateTradeFilter(event.target.value)}
                        placeholder="Trade ID, Symbol, Side, Position ID oder Fill ID"
                        style={{
                            width: "100%",
                            background: "#000",
                            color: COLORS.text,
                            border: `1px solid ${COLORS.borderStrong}`,
                            borderRadius: 14,
                            padding: "12px 14px",
                            boxSizing: "border-box",
                            outline: "none",
                        }}
                    />
                </div>

                <button
                    type="button"
                    onClick={() => updateTradeFilter("")}
                    style={{
                        background: COLORS.buttonBg,
                        color: COLORS.buttonText,
                        border: "none",
                        borderRadius: 14,
                        padding: "12px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                        minHeight: 46,
                    }}
                >
                    Filter löschen
                </button>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 22,
                }}
            >
                <SummaryCard label="Positionen" value={filteredPositions.length} />
                <SummaryCard label="Offene Menge" value={formatNumber(totalOpenQty, 4)} />
                <SummaryCard label="Offene Trades" value={filteredOpenTrades.length} />
                <SummaryCard label="Fills gesamt" value={analytics.summary.fillCount} />
                <SummaryCard label="History Rows" value={filteredPositionHistory.length} />
                <SummaryCard
                    label="History PnL"
                    value={formatNumber(totalHistoryPnl, 2)}
                    tone={
                        totalHistoryPnl > 0
                            ? "positive"
                            : totalHistoryPnl < 0
                                ? "negative"
                                : "default"
                    }
                />
            </div>

            {filteredOpenTrades.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 16,
                            fontWeight: 700,
                            marginBottom: 12,
                        }}
                    >
                        Offene Trades
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 12,
                            overflowX: "auto",
                            paddingBottom: 4,
                        }}
                    >
                        {filteredOpenTrades.map((trade) => (
                            <OpenTradeCard
                                key={trade.tradeId || `${trade.symbol}_${trade.entryTime}`}
                                trade={trade}
                                onSelectTradeId={updateTradeFilter}
                            />
                        ))}
                    </div>
                </div>
            )}

            {filteredPositions.length === 0 ? (
                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 18,
                        padding: 20,
                        color: COLORS.muted,
                        fontSize: 14,
                        marginBottom: 22,
                    }}
                >
                    Keine offenen Positionen für den aktuellen Filter gefunden.
                </div>
            ) : (
                <div
                    style={{
                        overflowX: "auto",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 18,
                        marginBottom: 22,
                    }}
                >
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: 1220,
                        }}
                    >
                        <thead
                            style={{
                                background: COLORS.tableHead,
                            }}
                        >
                            <tr>
                                <th style={headerCellStyle}>Symbol</th>
                                <th style={headerCellStyle}>Side</th>
                                <th style={headerCellStyle}>Qty</th>
                                <th style={headerCellStyle}>Signed Qty</th>
                                <th style={headerCellStyle}>Ø Price</th>
                                <th style={headerCellStyle}>Opened</th>
                                <th style={headerCellStyle}>Trade ID</th>
                                <th style={headerCellStyle}>Entry Qty</th>
                                <th style={headerCellStyle}>Closed Qty</th>
                                <th style={headerCellStyle}>Scale In</th>
                                <th style={headerCellStyle}>Scale Out</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredPositions.map((position, index) => {
                                const sideColor = getSideColor(position.side);
                                const linkedTrade =
                                    openTradesById[cleanString(position.tradeId)] || null;

                                return (
                                    <tr
                                        key={position.tradeId || `${position.symbol}_${index}`}
                                        style={{
                                            background:
                                                index % 2 === 0
                                                    ? "transparent"
                                                    : COLORS.rowAlt,
                                        }}
                                    >
                                        <td style={bodyCellStyle}>
                                            <div style={{ fontWeight: 700 }}>
                                                {position.symbol || "–"}
                                            </div>
                                        </td>
                                        <td
                                            style={{
                                                ...bodyCellStyle,
                                                color: sideColor,
                                                fontWeight: 700,
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            {position.side || "–"}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {formatNumber(position.quantity, 4)}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {formatNumber(position.signedQuantity, 4)}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {formatNumber(position.avgPrice, 4)}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {formatDateTime(position.openedAt)}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            <TradeIdButton
                                                tradeId={position.tradeId || ""}
                                                onSelect={updateTradeFilter}
                                            />
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {linkedTrade
                                                ? formatNumber(linkedTrade.entryQty, 4)
                                                : "–"}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {linkedTrade
                                                ? formatNumber(linkedTrade.closedQty, 4)
                                                : "–"}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {linkedTrade
                                                ? toNumber(linkedTrade.scaleInCount, 0)
                                                : "–"}
                                        </td>
                                        <td style={bodyCellStyle}>
                                            {linkedTrade
                                                ? toNumber(linkedTrade.scaleOutCount, 0)
                                                : "–"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ marginTop: 8 }}>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 16,
                        fontWeight: 700,
                        marginBottom: 12,
                    }}
                >
                    Position History
                </div>

                {filteredPositionHistory.length === 0 ? (
                    <div
                        style={{
                            background: COLORS.cardBg,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 18,
                            padding: 20,
                            color: COLORS.muted,
                            fontSize: 14,
                        }}
                    >
                        Keine Position History für den aktuellen Filter gefunden.
                    </div>
                ) : (
                    <div
                        style={{
                            overflowX: "auto",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 18,
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 1800,
                            }}
                        >
                            <thead
                                style={{
                                    background: COLORS.tableHead,
                                }}
                            >
                                <tr>
                                    <th style={headerCellStyle}>Trade Date</th>
                                    <th style={headerCellStyle}>Timestamp</th>
                                    <th style={headerCellStyle}>Contract</th>
                                    <th style={headerCellStyle}>Product</th>
                                    <th style={headerCellStyle}>Net Pos</th>
                                    <th style={headerCellStyle}>Net Price</th>
                                    <th style={headerCellStyle}>Bought</th>
                                    <th style={headerCellStyle}>Avg Buy</th>
                                    <th style={headerCellStyle}>Sold</th>
                                    <th style={headerCellStyle}>Avg Sell</th>
                                    <th style={headerCellStyle}>Paired Qty</th>
                                    <th style={headerCellStyle}>Buy Price</th>
                                    <th style={headerCellStyle}>Sell Price</th>
                                    <th style={headerCellStyle}>P/L</th>
                                    <th style={headerCellStyle}>Buy Fill ID</th>
                                    <th style={headerCellStyle}>Sell Fill ID</th>
                                    <th style={headerCellStyle}>Position ID</th>
                                    <th style={headerCellStyle}>Pair ID</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredPositionHistory.map((entry, index) => {
                                    const pnlValue = toNumber(entry.pnl, 0);
                                    const pnlColor =
                                        pnlValue > 0
                                            ? COLORS.positive
                                            : pnlValue < 0
                                                ? COLORS.negative
                                                : COLORS.text;

                                    return (
                                        <tr
                                            key={entry.id || `${entry.positionId}_${index}`}
                                            style={{
                                                background:
                                                    index % 2 === 0
                                                        ? "transparent"
                                                        : COLORS.rowAlt,
                                            }}
                                        >
                                            <td style={bodyCellStyle}>
                                                {entry.tradeDate || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatDateTime(entry.timestamp)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.contract || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.product || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.netPos, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.netPrice, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.bought, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.avgBuy, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.sold, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.avgSell, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.pairedQty, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.buyPrice, 4)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {formatNumber(entry.sellPrice, 4)}
                                            </td>
                                            <td
                                                style={{
                                                    ...bodyCellStyle,
                                                    color: pnlColor,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {formatNumber(entry.pnl, 2)}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.buyFillId || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.sellFillId || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.positionId || "–"}
                                            </td>
                                            <td style={bodyCellStyle}>
                                                {entry.pairId || "–"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
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