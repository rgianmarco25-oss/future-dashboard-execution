import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "../utils/dateFormat";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    clearCashHistory,
    clearImportedFills,
    clearImportedOrders,
    syncImportedCashHistory,
    syncImportedFills,
    syncImportedOrders,
    updateAccount,
} from "../utils/storage";

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    cardBg: "rgba(15, 23, 42, 0.72)",
    headBg: "rgba(15, 23, 42, 0.92)",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
};

const IMPORT_SECTIONS = [
    {
        key: "orders",
        title: "Orders CSV",
        description: "Nutze hier deine Orders.csv.",
    },
    {
        key: "trades",
        title: "Fills CSV",
        description: "Nutze hier deine Fills.csv.",
    },
    {
        key: "cashHistory",
        title: "Account Balance History CSV",
        description:
            "Nutze hier deine Account Balance History.csv oder Cash History.csv.",
    },
    {
        key: "performance",
        title: "Performance CSV optional",
        description: "Zusatzquelle für PnL Kontrolle und Abgleich.",
    },
    {
        key: "positionHistory",
        title: "Position History CSV optional",
        description: "Zusatzquelle für Positions Historie und PnL Abgleich.",
    },
];

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));

        reader.readAsText(file);
    });
}

function formatCount(value) {
    return new Intl.NumberFormat("de-CH").format(Number(value || 0));
}

function formatWholeNumber(value) {
    return new Intl.NumberFormat("de-CH", {
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatMoney(value) {
    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(toFiniteNumber(value, 0));
}

function getStatusMeta(hasData) {
    if (hasData) {
        return {
            label: "Importiert",
            color: COLORS.positive,
            border: "rgba(34, 197, 94, 0.35)",
            background: "rgba(34, 197, 94, 0.12)",
        };
    }

    return {
        label: "Leer",
        color: COLORS.warning,
        border: "rgba(245, 158, 11, 0.35)",
        background: "rgba(245, 158, 11, 0.12)",
    };
}

function getNumberTone(value) {
    const safeValue = toFiniteNumber(value, 0);

    if (safeValue > 0) {
        return COLORS.positive;
    }

    if (safeValue < 0) {
        return COLORS.danger;
    }

    return COLORS.text;
}

function resolveImportEntry(imports, sectionKey) {
    if (!imports || typeof imports !== "object") {
        return null;
    }

    if (sectionKey === "cashHistory") {
        return imports.cashHistory || imports.dailySummary || null;
    }

    return imports[sectionKey] || null;
}

function buildScopedSectionData(imports, accountId) {
    const buildOrdersData =
        typeof csvImportUtils.buildOrdersData === "function"
            ? csvImportUtils.buildOrdersData(imports, accountId)
            : { entries: [] };

    const buildFillsData =
        typeof csvImportUtils.buildFillsData === "function"
            ? csvImportUtils.buildFillsData(imports, accountId)
            : { entries: [] };

    const buildCashHistoryData =
        typeof csvImportUtils.buildCashHistoryData === "function"
            ? csvImportUtils.buildCashHistoryData(imports, accountId)
            : typeof csvImportUtils.buildDailySummaryData === "function"
                ? csvImportUtils.buildDailySummaryData(imports, accountId)
                : { entries: [] };

    const buildPerformanceData =
        typeof csvImportUtils.buildPerformanceData === "function"
            ? csvImportUtils.buildPerformanceData(imports, accountId)
            : { entries: [], stats: { total: 0, totalPnl: 0 } };

    const buildPositionHistoryData =
        typeof csvImportUtils.buildPositionHistoryData === "function"
            ? csvImportUtils.buildPositionHistoryData(imports, accountId)
            : { entries: [], stats: { total: 0, totalPnl: 0 } };

    return {
        orders: buildOrdersData,
        trades: buildFillsData,
        cashHistory: buildCashHistoryData,
        performance: buildPerformanceData,
        positionHistory: buildPositionHistoryData,
    };
}

function getEntriesSignature(entries = []) {
    const safeEntries = Array.isArray(entries) ? entries : [];

    if (!safeEntries.length) {
        return "0";
    }

    const first = safeEntries[0] || {};
    const last = safeEntries[safeEntries.length - 1] || {};

    return [
        String(safeEntries.length),
        cleanString(first.fillId || first.id || first.orderId || first.date || first.timestamp),
        cleanString(last.fillId || last.id || last.orderId || last.date || last.timestamp),
    ].join("|");
}

function applyCashHistorySnapshotToAccount(imports, accountId) {
    const cleanAccountId = cleanString(accountId);

    if (!cleanAccountId) {
        return null;
    }

    const snapshot =
        typeof csvImportUtils.deriveCashHistorySnapshot === "function"
            ? csvImportUtils.deriveCashHistorySnapshot(imports, cleanAccountId)
            : null;

    if (!snapshot?.hasValues) {
        return null;
    }

    updateAccount(cleanAccountId, {
        accountSize: snapshot.accountSize,
        startingBalance: snapshot.startingBalance,
        currentBalance: snapshot.currentBalance,
    });

    return snapshot;
}

function saveParsedImportCompat(type, fileName, text, accountId) {
    if (typeof csvImportUtils.saveParsedImport !== "function") {
        return;
    }

    try {
        csvImportUtils.saveParsedImport(type, fileName, text, accountId);
    } catch (error) {
        if (type === "cashHistory") {
            csvImportUtils.saveParsedImport("dailySummary", fileName, text, accountId);
            return;
        }

        throw error;
    }
}

function clearParsedImportCompat(type, accountId) {
    if (typeof csvImportUtils.clearParsedImport !== "function") {
        return;
    }

    try {
        csvImportUtils.clearParsedImport(type, accountId);
    } catch (error) {
        if (type === "cashHistory") {
            csvImportUtils.clearParsedImport("dailySummary", accountId);
            return;
        }

        throw error;
    }

    if (type === "cashHistory") {
        try {
            csvImportUtils.clearParsedImport("dailySummary", accountId);
        } catch {
            return;
        }
    }
}

function InfoCell({ label, value, note = "" }) {
    return (
        <div
            style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 12,
                background: "rgba(255, 255, 255, 0.02)",
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 12,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: COLORS.text,
                    fontSize: 14,
                    fontWeight: 700,
                    wordBreak: "break-word",
                }}
            >
                {value || "-"}
            </div>

            {note ? (
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 11,
                        marginTop: 6,
                        lineHeight: 1.4,
                    }}
                >
                    {note}
                </div>
            ) : null}
        </div>
    );
}

function MetricCell({ label, value, note = "", color = COLORS.text }) {
    return (
        <div
            style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: 14,
                background: "rgba(255, 255, 255, 0.02)",
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
                    color,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>

            {note ? (
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 11,
                        marginTop: 8,
                        lineHeight: 1.4,
                    }}
                >
                    {note}
                </div>
            ) : null}
        </div>
    );
}

function PerformanceControlBlock({
    accountId,
    journalAnalytics,
    performanceData,
    positionHistoryData,
}) {
    const cleanAccountId = cleanString(accountId);

    const journalGrossPnl = toFiniteNumber(journalAnalytics?.summary?.grossPnl, 0);
    const journalNetPnl = toFiniteNumber(journalAnalytics?.summary?.netPnl, 0);
    const journalCommission = toFiniteNumber(journalAnalytics?.summary?.commissions, 0);
    const journalTradeCount = toFiniteNumber(
        journalAnalytics?.summary?.closedTradeCount,
        0
    );

    const performanceRowCount = toFiniteNumber(performanceData?.stats?.total, 0);
    const performanceTotalPnl = toFiniteNumber(performanceData?.stats?.totalPnl, 0);

    const positionHistoryRowCount = toFiniteNumber(
        positionHistoryData?.stats?.total,
        0
    );
    const positionHistoryTotalPnl = toFiniteNumber(
        positionHistoryData?.stats?.totalPnl,
        0
    );

    const deltaPerformanceToGross = performanceTotalPnl - journalGrossPnl;
    const deltaPerformanceToNet = performanceTotalPnl - journalNetPnl;
    const deltaPositionHistoryToGross = positionHistoryTotalPnl - journalGrossPnl;

    const hasComparisonData =
        journalTradeCount > 0 || performanceRowCount > 0 || positionHistoryRowCount > 0;

    return (
        <div
            style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 16,
                background: "rgba(125, 211, 252, 0.05)",
                display: "grid",
                gap: 14,
            }}
        >
            <div>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 16,
                        fontWeight: 700,
                        marginBottom: 6,
                    }}
                >
                    Performance Kontrollblock
                </div>
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 13,
                        lineHeight: 1.45,
                    }}
                >
                    Abgleich für Account {cleanAccountId || "kein Account gewählt"}.
                    Journal Gross und Net kommen aus den Fills. Performance und Position History kommen direkt aus der CSV.
                </div>
            </div>

            {!hasComparisonData ? (
                <div
                    style={{
                        border: `1px dashed ${COLORS.borderStrong}`,
                        borderRadius: 14,
                        padding: 14,
                        color: COLORS.muted,
                        fontSize: 13,
                    }}
                >
                    Noch keine Daten für den Performance Abgleich vorhanden.
                </div>
            ) : (
                <>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <MetricCell
                            label="Journal Gross PnL"
                            value={formatMoney(journalGrossPnl)}
                            color={getNumberTone(journalGrossPnl)}
                            note="Aus Fills berechnet"
                        />
                        <MetricCell
                            label="Journal Commission"
                            value={formatMoney(journalCommission)}
                            color={getNumberTone(-Math.abs(journalCommission))}
                            note="Gebühren aus Fills"
                        />
                        <MetricCell
                            label="Journal Net PnL"
                            value={formatMoney(journalNetPnl)}
                            color={getNumberTone(journalNetPnl)}
                            note="Gross minus Commission"
                        />
                        <MetricCell
                            label="Performance CSV P/L"
                            value={formatMoney(performanceTotalPnl)}
                            color={getNumberTone(performanceTotalPnl)}
                            note={`Rows: ${formatCount(performanceRowCount)}`}
                        />
                        <MetricCell
                            label="Position History P/L"
                            value={formatMoney(positionHistoryTotalPnl)}
                            color={getNumberTone(positionHistoryTotalPnl)}
                            note={`Rows: ${formatCount(positionHistoryRowCount)}`}
                        />
                        <MetricCell
                            label="Journal Closed Trades"
                            value={formatCount(journalTradeCount)}
                            color={COLORS.text}
                            note="Anzahl geschlossener Trades"
                        />
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCell
                            label="Delta Performance zu Journal Gross"
                            value={formatMoney(deltaPerformanceToGross)}
                            note="0.00 bedeutet gleicher Wert"
                        />
                        <InfoCell
                            label="Delta Performance zu Journal Net"
                            value={formatMoney(deltaPerformanceToNet)}
                            note="Hilft bei Brutto oder Netto Vergleich"
                        />
                        <InfoCell
                            label="Delta Position History zu Journal Gross"
                            value={formatMoney(deltaPositionHistoryToGross)}
                            note="0.00 bedeutet gleicher Gross Wert"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function SectionCard({
    section,
    accountId,
    importEntry,
    accountScopedCount,
    onUpload,
    onReset,
    snapshot,
    extraContent = null,
}) {
    const hasData = Array.isArray(importEntry?.rows) && importEntry.rows.length > 0;
    const status = getStatusMeta(hasData);
    const headers = Array.isArray(importEntry?.headers) ? importEntry.headers.slice(0, 6) : [];
    const previewRows = Array.isArray(importEntry?.previewRows)
        ? importEntry.previewRows.slice(0, 5)
        : [];

    const isCashHistory = section.key === "cashHistory";

    return (
        <div
            style={{
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 20,
                padding: 18,
                display: "grid",
                gap: 14,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 18,
                            fontWeight: 700,
                            marginBottom: 6,
                        }}
                    >
                        {section.title}
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 13,
                            lineHeight: 1.45,
                        }}
                    >
                        {section.description}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${status.border}`,
                        background: status.background,
                        color: status.color,
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                    }}
                >
                    {status.label}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 10,
                }}
            >
                <InfoCell label="Datei" value={importEntry?.fileName || "-"} />
                <InfoCell
                    label="Import Zeit"
                    value={formatDateTime(importEntry?.importedAt)}
                />
                <InfoCell
                    label="Aktiver App Account"
                    value={cleanString(accountId) || "kein Account gewählt"}
                    note="CSV Import geht in diesen Account"
                />
                <InfoCell
                    label="Datensätze gesamt"
                    value={formatCount(importEntry?.rows?.length || 0)}
                />
                <InfoCell
                    label="Datensätze Account"
                    value={
                        cleanString(accountId)
                            ? formatCount(accountScopedCount)
                            : formatCount(importEntry?.rows?.length || 0)
                    }
                />
            </div>

            {isCashHistory && snapshot?.hasValues ? (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: 10,
                    }}
                >
                    <InfoCell
                        label="Account Size"
                        value={formatWholeNumber(snapshot.accountSize)}
                    />
                    <InfoCell
                        label="Start Balance"
                        value={formatWholeNumber(snapshot.startingBalance)}
                    />
                    <InfoCell
                        label="Current Balance"
                        value={formatWholeNumber(snapshot.currentBalance)}
                    />
                    <InfoCell
                        label="Erste Zeile"
                        value={snapshot.firstDate || "-"}
                    />
                    <InfoCell
                        label="Letzte Zeile"
                        value={snapshot.lastDate || "-"}
                    />
                </div>
            ) : null}

            {extraContent}

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <label
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 160,
                        background: COLORS.buttonBg,
                        color: COLORS.buttonText,
                        borderRadius: 14,
                        padding: "12px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    CSV wählen
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: "none" }}
                        onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            onUpload(section.key, file);
                            event.target.value = "";
                        }}
                    />
                </label>

                <button
                    type="button"
                    onClick={() => onReset(section.key)}
                    style={{
                        minWidth: 140,
                        background: "transparent",
                        color: COLORS.danger,
                        border: `1px solid rgba(239, 68, 68, 0.35)`,
                        borderRadius: 14,
                        padding: "12px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Reset
                </button>
            </div>

            <div>
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 12,
                        marginBottom: 8,
                    }}
                >
                    Vorschau
                </div>

                {headers.length === 0 || previewRows.length === 0 ? (
                    <div
                        style={{
                            border: `1px dashed ${COLORS.borderStrong}`,
                            borderRadius: 16,
                            padding: 16,
                            color: COLORS.muted,
                            fontSize: 13,
                        }}
                    >
                        Keine Vorschau vorhanden.
                    </div>
                ) : (
                    <div
                        style={{
                            overflowX: "auto",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 16,
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 640,
                            }}
                        >
                            <thead
                                style={{
                                    background: COLORS.headBg,
                                }}
                            >
                                <tr>
                                    {headers.map((header) => (
                                        <th
                                            key={header}
                                            style={{
                                                textAlign: "left",
                                                padding: "12px 12px",
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                borderBottom: `1px solid ${COLORS.borderStrong}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {previewRows.map((row, rowIndex) => (
                                    <tr
                                        key={`${section.key}-${rowIndex}`}
                                        style={{
                                            background:
                                                rowIndex % 2 === 0
                                                    ? "transparent"
                                                    : "rgba(255, 255, 255, 0.03)",
                                        }}
                                    >
                                        {headers.map((header) => (
                                            <td
                                                key={`${section.key}-${rowIndex}-${header}`}
                                                style={{
                                                    padding: "12px 12px",
                                                    color: COLORS.text,
                                                    fontSize: 13,
                                                    borderBottom: `1px solid ${COLORS.border}`,
                                                    verticalAlign: "top",
                                                    wordBreak: "break-word",
                                                }}
                                            >
                                                {cleanString(row?.[header]) || "-"}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ImportCenterPanel({ accountId = "" }) {
    const [imports, setImports] = useState(() => {
        return typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports(accountId)
            : {};
    });

    const syncRef = useRef({
        fills: "",
        cashHistory: "",
        orders: "",
    });

    useEffect(() => {
        syncRef.current = {
            fills: "",
            cashHistory: "",
            orders: "",
        };
    }, [accountId]);

    useEffect(() => {
        const eventName =
            typeof csvImportUtils.getCsvImportEventName === "function"
                ? csvImportUtils.getCsvImportEventName()
                : "tradovate-csv-imports-updated";

        const loadImports = () => {
            const nextImports =
                typeof csvImportUtils.getAllParsedImports === "function"
                    ? csvImportUtils.getAllParsedImports(accountId)
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
    }, [accountId]);

    const scopedData = useMemo(() => {
        return buildScopedSectionData(imports, accountId);
    }, [imports, accountId]);

    const cashHistorySnapshot = useMemo(() => {
        if (!cleanString(accountId)) {
            return null;
        }

        if (typeof csvImportUtils.deriveCashHistorySnapshot !== "function") {
            return null;
        }

        return csvImportUtils.deriveCashHistorySnapshot(imports, accountId);
    }, [imports, accountId]);

    const journalAnalytics = useMemo(() => {
        const fillsEntries = Array.isArray(scopedData?.trades?.entries)
            ? scopedData.trades.entries
            : [];

        return buildFillAnalytics({
            fills: fillsEntries,
            accountId,
        });
    }, [scopedData, accountId]);

    useEffect(() => {
        const cleanAccountId = cleanString(accountId);

        if (!cleanAccountId) {
            return;
        }

        const fillsEntry = resolveImportEntry(imports, "trades");
        const fillsEntries = Array.isArray(scopedData?.trades?.entries)
            ? scopedData.trades.entries
            : [];
        const fillsSignature = [
            cleanAccountId,
            cleanString(fillsEntry?.importedAt),
            cleanString(fillsEntry?.fileName),
            getEntriesSignature(fillsEntries),
        ].join("|");

        if (syncRef.current.fills !== fillsSignature) {
            syncImportedFills(cleanAccountId, fillsEntries);
            syncRef.current.fills = fillsSignature;
        }

        const ordersEntry = resolveImportEntry(imports, "orders");
        const ordersEntries = Array.isArray(scopedData?.orders?.entries)
            ? scopedData.orders.entries
            : [];
        const ordersSignature = [
            cleanAccountId,
            cleanString(ordersEntry?.importedAt),
            cleanString(ordersEntry?.fileName),
            getEntriesSignature(ordersEntries),
        ].join("|");

        if (syncRef.current.orders !== ordersSignature) {
            syncImportedOrders(cleanAccountId, ordersEntries);
            syncRef.current.orders = ordersSignature;
        }

        const cashEntry = resolveImportEntry(imports, "cashHistory");
        const cashEntries = Array.isArray(scopedData?.cashHistory?.entries)
            ? scopedData.cashHistory.entries
            : [];
        const cashSignature = [
            cleanAccountId,
            cleanString(cashEntry?.importedAt),
            cleanString(cashEntry?.fileName),
            getEntriesSignature(cashEntries),
            String(cashHistorySnapshot?.accountSize || 0),
            String(cashHistorySnapshot?.currentBalance || 0),
        ].join("|");

        if (syncRef.current.cashHistory !== cashSignature) {
            syncImportedCashHistory(cleanAccountId, cashEntries);

            if (cashHistorySnapshot?.hasValues) {
                applyCashHistorySnapshotToAccount(imports, cleanAccountId);
            }

            syncRef.current.cashHistory = cashSignature;
        }
    }, [imports, scopedData, cashHistorySnapshot, accountId]);

    async function handleUpload(type, file) {
        if (!file) {
            return;
        }

        const cleanAccountId = cleanString(accountId);

        if (!cleanAccountId) {
            return;
        }

        const text = await readFileAsText(file);
        saveParsedImportCompat(type, file.name, text, cleanAccountId);

        const nextImports =
            typeof csvImportUtils.getAllParsedImports === "function"
                ? csvImportUtils.getAllParsedImports(cleanAccountId)
                : {};

        setImports(nextImports);
    }

    function handleReset(type) {
        const cleanAccountId = cleanString(accountId);

        clearParsedImportCompat(type, cleanAccountId);

        if (type === "cashHistory" && cleanAccountId) {
            clearCashHistory(cleanAccountId);
            syncRef.current.cashHistory = "";
        }

        if (type === "trades" && cleanAccountId) {
            clearImportedFills(cleanAccountId);
            syncRef.current.fills = "";
        }

        if (type === "orders" && cleanAccountId) {
            clearImportedOrders(cleanAccountId);
            syncRef.current.orders = "";
        }

        const nextImports =
            typeof csvImportUtils.getAllParsedImports === "function"
                ? csvImportUtils.getAllParsedImports(cleanAccountId)
                : {};

        setImports(nextImports);
    }

    const activeImportCount = IMPORT_SECTIONS.filter((section) => {
        const importEntry = resolveImportEntry(imports, section.key);
        return Array.isArray(importEntry?.rows) && importEntry.rows.length > 0;
    }).length;

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
                        Import Center
                    </h2>
                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 8,
                            fontSize: 13,
                        }}
                    >
                        Dein echtes CSV Setup mit Orders, Fills, Account Balance History, Performance und Position History.
                    </div>
                </div>

                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 13,
                        textAlign: "right",
                    }}
                >
                    <div>Aktiver App Account: {cleanString(accountId) || "kein Account gewählt"}</div>
                    <div>CSV Import geht in diesen Account</div>
                    <div>Aktive Imports: {activeImportCount}</div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 16,
                }}
            >
                {IMPORT_SECTIONS.map((section) => (
                    <SectionCard
                        key={section.key}
                        section={section}
                        accountId={accountId}
                        importEntry={resolveImportEntry(imports, section.key)}
                        accountScopedCount={scopedData?.[section.key]?.entries?.length || 0}
                        onUpload={handleUpload}
                        onReset={handleReset}
                        snapshot={section.key === "cashHistory" ? cashHistorySnapshot : null}
                        extraContent={
                            section.key === "performance" ? (
                                <PerformanceControlBlock
                                    accountId={accountId}
                                    journalAnalytics={journalAnalytics}
                                    performanceData={scopedData?.performance}
                                    positionHistoryData={scopedData?.positionHistory}
                                />
                            ) : null
                        }
                    />
                ))}
            </div>
        </section>
    );
}