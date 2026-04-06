import { useEffect, useState } from "react";
import { getPositions, savePositions } from "../utils/storage";
import { syncStoredAccountBalance } from "../utils/accountBalance";
import * as csvImportUtils from "../utils/csvImportUtils";
import { formatDate, formatTime } from "../utils/dateFormat";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    label: "#94a3b8",
    neutral: "#dbeafe",
    cyan: "#22d3ee",
    orange: "#fb923c",
    inputBg: "#000",
    cardBg: "rgba(255, 255, 255, 0.03)",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
    okBg: "rgba(34, 211, 238, 0.16)",
    okBorder: "rgba(34, 211, 238, 0.35)",
    okText: "#67e8f9",
};

const wrapperStyle = {
    width: "100%",
};

const summaryGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginBottom: "16px",
};

const summaryCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "14px",
    background: COLORS.cardBg,
    textAlign: "center",
    minHeight: "88px",
};

const summaryLabelStyle = {
    color: COLORS.label,
    fontSize: "13px",
    marginBottom: "6px",
    lineHeight: 1.35,
};

const buttonRowStyle = {
    marginBottom: "16px",
};

const buttonStyle = {
    width: "100%",
    background: COLORS.buttonBg,
    color: COLORS.buttonText,
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: "700",
    cursor: "pointer",
};

const deleteButtonStyle = {
    ...buttonStyle,
    width: "auto",
    padding: "10px 16px",
};

const emptyStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "18px",
    textAlign: "center",
    color: COLORS.label,
    background: COLORS.cardBg,
};

const positionsListStyle = {
    display: "grid",
    gap: "12px",
};

const cardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "16px",
    background: COLORS.cardBg,
    display: "grid",
    gap: "12px",
};

const formRowLargeStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
};

const formRowMediumStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const labelStyle = {
    display: "block",
    color: COLORS.label,
    fontSize: "14px",
    marginBottom: "8px",
    textAlign: "center",
};

const inputStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    outline: "none",
};

const readonlyValueStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    wordBreak: "break-word",
};

const noticeStyle = {
    borderRadius: "16px",
    padding: "14px 16px",
    marginBottom: "16px",
    lineHeight: 1.45,
    border: `1px solid ${COLORS.okBorder}`,
    background: COLORS.okBg,
    color: COLORS.okText,
};

function createId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `pos_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyPosition() {
    return {
        id: createId(),
        symbol: "",
        side: "Long",
        quantity: 1,
        entry: "",
        stopLoss: "",
        takeProfit: "",
        status: "Open",
        unrealizedPnl: "0",
    };
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const raw = normalizeText(value);

    if (!raw) {
        return null;
    }

    const negative = raw.includes("(") && raw.includes(")");
    let text = raw
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/[()]/g, "")
        .replace(/−/g, "-")
        .replace(/–/g, "-")
        .replace(/USD|EUR|CHF/gi, "");

    if (text.includes(",") && text.includes(".")) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (text.includes(",") && !text.includes(".")) {
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

    return negative ? -Math.abs(parsed) : parsed;
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getTotalUnrealizedPnl(positions) {
    return positions.reduce((sum, position) => {
        if (String(position.status || "").toLowerCase() === "closed") {
            return sum;
        }

        return sum + toNumber(position.unrealizedPnl);
    }, 0);
}

function formatMoney(value) {
    const parsed = parseFlexibleNumber(value);

    if (parsed === null) {
        return "0.00 $";
    }

    return `${parsed.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function getValueColor(value) {
    const numericValue = parseFlexibleNumber(value);

    if (numericValue !== null) {
        if (numericValue > 0) {
            return COLORS.cyan;
        }

        if (numericValue < 0) {
            return COLORS.orange;
        }
    }

    return COLORS.neutral;
}

function getSummaryValueStyle(value) {
    return {
        color: getValueColor(value),
        fontSize: "18px",
        fontWeight: "700",
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    };
}

function normalizeImportedPosition(entry, index) {
    return {
        id: entry?.id || `import_position_${index + 1}`,
        symbol:
            normalizeText(entry?.instrument) ||
            normalizeText(entry?.contract) ||
            normalizeText(entry?.product) ||
            "-",
        side: "Closed",
        quantity:
            parseFlexibleNumber(entry?.contracts) ??
            parseFlexibleNumber(entry?.quantity) ??
            0,
        entry:
            parseFlexibleNumber(entry?.buyPrice) ??
            parseFlexibleNumber(entry?.entryPrice) ??
            parseFlexibleNumber(entry?.avgEntryPrice) ??
            "",
        stopLoss: "",
        takeProfit: "",
        status: "Closed",
        unrealizedPnl: "0",
        realizedPnl: parseFlexibleNumber(entry?.result) ?? 0,
        tradeDate:
            normalizeText(entry?.tradeDate) ||
            normalizeText(entry?.date) ||
            normalizeText(entry?.tradingDate) ||
            normalizeText(entry?.closeDate) ||
            normalizeText(entry?.exitDate) ||
            normalizeText(entry?.timestamp) ||
            "",
        entryTime:
            normalizeText(entry?.entryTime) ||
            normalizeText(entry?.openTime) ||
            normalizeText(entry?.buyTime) ||
            normalizeText(entry?.entryTimestamp) ||
            normalizeText(entry?.openTimestamp) ||
            "",
        exitTime:
            normalizeText(entry?.exitTime) ||
            normalizeText(entry?.closeTime) ||
            normalizeText(entry?.sellTime) ||
            normalizeText(entry?.exitTimestamp) ||
            normalizeText(entry?.closeTimestamp) ||
            "",
    };
}

export default function PositionsPanel({
    accountId,
    positions: positionsProp,
    onAccountUpdated,
}) {
    const resolvedAccountId = accountId || "";
    const [positionsByAccount, setPositionsByAccount] = useState({});
    const [, setRefreshVersion] = useState(0);

    useEffect(() => {
        const handleRefresh = () => {
            setRefreshVersion((prev) => prev + 1);
        };

        window.addEventListener("tradovate-csv-imports-updated", handleRefresh);
        window.addEventListener("storage", handleRefresh);
        window.addEventListener("focus", handleRefresh);

        return () => {
            window.removeEventListener("tradovate-csv-imports-updated", handleRefresh);
            window.removeEventListener("storage", handleRefresh);
            window.removeEventListener("focus", handleRefresh);
        };
    }, []);

    const localPositions = resolvedAccountId
        ? positionsByAccount[resolvedAccountId] ||
        positionsProp ||
        getPositions(resolvedAccountId)
        : [];

    const importData =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : null;

    const importedPositionRows =
        importData?.positionHistory?.byAccount?.[resolvedAccountId] || [];

    const importedMeta = importData?.positionHistory?.meta || null;

    const importedPositions = Array.isArray(importedPositionRows)
        ? importedPositionRows.map(normalizeImportedPosition)
        : [];

    const isCsvMode = importedPositions.length > 0;

    const positions = isCsvMode ? importedPositions : localPositions;

    const totalUnrealizedPnl = isCsvMode ? 0 : getTotalUnrealizedPnl(positions);

    const totalImportedRealizedPnl = isCsvMode
        ? importedPositions.reduce(
            (sum, position) => sum + (parseFlexibleNumber(position.realizedPnl) ?? 0),
            0
        )
        : 0;

    const totalImportedContracts = isCsvMode
        ? importedPositions.reduce(
            (sum, position) => sum + (parseFlexibleNumber(position.quantity) ?? 0),
            0
        )
        : 0;

    function persistPositions(updated) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        setPositionsByAccount((prev) => ({
            ...prev,
            [resolvedAccountId]: updated,
        }));

        savePositions(resolvedAccountId, updated);
        syncStoredAccountBalance(resolvedAccountId);

        if (typeof onAccountUpdated === "function") {
            onAccountUpdated();
        }
    }

    function handleAddPosition() {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        persistPositions([...positions, createEmptyPosition()]);
    }

    function handleDeletePosition(positionId) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        persistPositions(
            positions.filter((position) => position.id !== positionId)
        );
    }

    function handleChange(positionId, field, value) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        const updated = positions.map((position) =>
            position.id === positionId
                ? {
                    ...position,
                    [field]: field === "quantity" ? Number(value) || 0 : value,
                }
                : position
        );

        persistPositions(updated);
    }

    if (!resolvedAccountId) {
        return <div style={emptyStyle}>Kein Account gewählt.</div>;
    }

    if (isCsvMode) {
        return (
            <div style={wrapperStyle}>
                <div style={summaryGridStyle}>
                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Position History Datei</div>
                        <div style={getSummaryValueStyle(0)}>
                            {importedMeta?.fileName || "-"}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Importierte Positionen</div>
                        <div style={getSummaryValueStyle(importedPositions.length)}>
                            {importedPositions.length}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Gesamt Contracts</div>
                        <div style={getSummaryValueStyle(totalImportedContracts)}>
                            {totalImportedContracts}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Total Realized PnL</div>
                        <div style={getSummaryValueStyle(totalImportedRealizedPnl)}>
                            {formatMoney(totalImportedRealizedPnl)}
                        </div>
                    </div>
                </div>

                <div style={noticeStyle}>
                    Position History CSV Import ist aktiv. Positions zeigt jetzt historische Positionen read only an.
                </div>

                {positions.length === 0 ? (
                    <div style={emptyStyle}>Noch keine importierten Positionen vorhanden.</div>
                ) : (
                    <div style={positionsListStyle}>
                        {positions.map((position, index) => (
                            <div key={position.id} style={cardStyle}>
                                <div
                                    style={{
                                        color: COLORS.neutral,
                                        fontSize: "15px",
                                        fontWeight: "700",
                                        lineHeight: 1.35,
                                    }}
                                >
                                    Position {index + 1}
                                    {position.symbol ? ` · ${position.symbol}` : ""}
                                </div>

                                <div style={formRowLargeStyle}>
                                    <div>
                                        <label style={labelStyle}>Symbol</label>
                                        <div style={readonlyValueStyle}>
                                            {position.symbol || "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Status</label>
                                        <div style={readonlyValueStyle}>
                                            {position.status || "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Contracts</label>
                                        <div style={readonlyValueStyle}>
                                            {position.quantity || 0}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Entry</label>
                                        <div style={readonlyValueStyle}>
                                            {position.entry !== "" ? String(position.entry) : "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Realized PnL</label>
                                        <div style={readonlyValueStyle}>
                                            {formatMoney(position.realizedPnl)}
                                        </div>
                                    </div>
                                </div>

                                <div style={formRowMediumStyle}>
                                    <div>
                                        <label style={labelStyle}>Trade Datum</label>
                                        <div style={readonlyValueStyle}>
                                            {formatDate(
                                                position.tradeDate ||
                                                position.entryTime ||
                                                position.exitTime
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Entry Zeit</label>
                                        <div style={readonlyValueStyle}>
                                            {formatTime(position.entryTime)}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Exit Zeit</label>
                                        <div style={readonlyValueStyle}>
                                            {formatTime(position.exitTime)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>Total Unrealized PnL</div>
                <div style={getSummaryValueStyle(totalUnrealizedPnl)}>
                    {formatMoney(totalUnrealizedPnl)}
                </div>
            </div>

            <div style={buttonRowStyle}>
                <button style={buttonStyle} onClick={handleAddPosition}>
                    Add Position
                </button>
            </div>

            {positions.length === 0 ? (
                <div style={emptyStyle}>Noch keine Positionen vorhanden.</div>
            ) : (
                <div style={positionsListStyle}>
                    {positions.map((position, index) => (
                        <div key={position.id} style={cardStyle}>
                            <div
                                style={{
                                    color: COLORS.neutral,
                                    fontSize: "15px",
                                    fontWeight: "700",
                                    lineHeight: 1.35,
                                }}
                            >
                                Position {index + 1}{" "}
                                {position.symbol ? `· ${position.symbol}` : ""}
                            </div>

                            <div style={formRowLargeStyle}>
                                <div>
                                    <label style={labelStyle}>Symbol</label>
                                    <input
                                        style={inputStyle}
                                        type="text"
                                        value={position.symbol}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "symbol",
                                                e.target.value
                                            )
                                        }
                                        placeholder="ES"
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Side</label>
                                    <select
                                        style={inputStyle}
                                        value={position.side}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "side",
                                                e.target.value
                                            )
                                        }
                                    >
                                        <option value="Long">Long</option>
                                        <option value="Short">Short</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={labelStyle}>Quantity</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        min="1"
                                        value={position.quantity}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "quantity",
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Status</label>
                                    <select
                                        style={inputStyle}
                                        value={position.status}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "status",
                                                e.target.value
                                            )
                                        }
                                    >
                                        <option value="Open">Open</option>
                                        <option value="Closed">Closed</option>
                                        <option value="Partial">Partial</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={labelStyle}>Unrealized PnL</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        step="0.01"
                                        value={position.unrealizedPnl ?? "0"}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "unrealizedPnl",
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                            </div>

                            <div style={formRowMediumStyle}>
                                <div>
                                    <label style={labelStyle}>Entry</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        step="0.01"
                                        value={position.entry}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "entry",
                                                e.target.value
                                            )
                                        }
                                        placeholder="0.00"
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Stop Loss</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        step="0.01"
                                        value={position.stopLoss}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "stopLoss",
                                                e.target.value
                                            )
                                        }
                                        placeholder="0.00"
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Take Profit</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        step="0.01"
                                        value={position.takeProfit}
                                        onChange={(e) =>
                                            handleChange(
                                                position.id,
                                                "takeProfit",
                                                e.target.value
                                            )
                                        }
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    style={deleteButtonStyle}
                                    onClick={() => handleDeletePosition(position.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}