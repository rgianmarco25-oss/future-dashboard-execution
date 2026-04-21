import { useEffect, useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    buildCashDayValidation,
    buildOrderFillValidation,
    compareNumbers,
    createMissingBaseResult,
    getValidationStatusColors,
    STATUS,
    summarizeValidationResults,
} from "../utils/validationStatus";
import {
    getAccountBalanceHistory,
    getFills,
    getImportedOrders,
    getOrders,
} from "../utils/storage";

const COLORS = {
    panelBg: "#050816",
    cardBg: "rgba(255, 255, 255, 0.035)",
    cardBgStrong: "rgba(255, 255, 255, 0.045)",
    border: "rgba(125, 211, 252, 0.16)",
    borderStrong: "rgba(125, 211, 252, 0.24)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    ok: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeLookupKey(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildFlexibleSource(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = normalizeLookupKey(key);

        if (!normalizedKey) {
            return;
        }

        if (map[normalizedKey] === undefined) {
            map[normalizedKey] = source[key];
        }
    });

    return map;
}

function pickFlexibleValue(source, keys) {
    for (const key of keys) {
        const normalizedKey = normalizeLookupKey(key);

        if (!normalizedKey) {
            continue;
        }

        const value = source[normalizedKey];

        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }

    return "";
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function pickBestArray(...sources) {
    return sources.reduce((best, current) => {
        const safeBest = toArray(best);
        const safeCurrent = toArray(current);
        return safeCurrent.length > safeBest.length ? safeCurrent : safeBest;
    }, []);
}

function toNumber(value, fallback = 0) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    const text = cleanString(value)
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    if (!text) {
        return fallback;
    }

    if (text.includes(",") && text.includes(".")) {
        const normalized =
            text.lastIndexOf(",") > text.lastIndexOf(".")
                ? text.replace(/\./g, "").replace(/,/g, ".")
                : text.replace(/,/g, "");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    const parsed = Number(text.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, digits = 0) {
    return toNumber(value, 0).toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatMoney(value) {
    return toNumber(value, 0).toLocaleString("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatMaybeMoney(value) {
    if (value === null || value === undefined) {
        return "–";
    }

    return formatMoney(value);
}

function formatDateKey(dateKey) {
    const text = cleanString(dateKey);

    if (!text) {
        return "–";
    }

    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return text;
    }

    return `${match[3]}.${match[2]}.${match[1]}`;
}

function compactMeta(parts) {
    return parts
        .map((part) => cleanString(part))
        .filter(Boolean)
        .join(". ");
}

function getStatusMeta(status) {
    const colors = getValidationStatusColors(status, {
        positive: COLORS.ok,
        positiveSoft: "rgba(34, 197, 94, 0.24)",
        positiveBg: "rgba(34, 197, 94, 0.08)",
        warning: COLORS.warn,
        warningSoft: "rgba(245, 158, 11, 0.22)",
        warningBg: "rgba(245, 158, 11, 0.06)",
        danger: COLORS.danger,
        dangerSoft: "rgba(239, 68, 68, 0.24)",
        dangerBg: "rgba(239, 68, 68, 0.07)",
    });

    if (status === STATUS.OK) {
        return {
            color: colors.tone,
            border: colors.border,
            bg: colors.background,
            label: "OK",
        };
    }

    if (status === STATUS.WARNING) {
        return {
            color: colors.tone,
            border: colors.border,
            bg: colors.background,
            label: "Prüfen",
        };
    }

    return {
        color: colors.tone,
        border: colors.border,
        bg: colors.background,
        label: "Abweichung",
    };
}

function getComparableTimestamp(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    const text = cleanString(value);

    if (!text) {
        return 0;
    }

    const isoParsed = Date.parse(text);
    if (Number.isFinite(isoParsed)) {
        return isoParsed;
    }

    const match = text.match(
        /^(\d{2})\.(\d{2})\.(\d{4})(?:,\s*|\s+)?(\d{2})?:(\d{2})?(?::(\d{2}))?/
    );

    if (match) {
        const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = match;
        const parsed = new Date(
            Number(yyyy),
            Number(mm) - 1,
            Number(dd),
            Number(hh),
            Number(mi),
            Number(ss)
        ).getTime();

        return Number.isFinite(parsed) ? parsed : 0;
    }

    const dateOnlyMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (dateOnlyMatch) {
        const [, dd, mm, yyyy] = dateOnlyMatch;
        const parsed = new Date(
            Number(yyyy),
            Number(mm) - 1,
            Number(dd),
            0,
            0,
            0
        ).getTime();

        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function extractDateKey(value) {
    const text = cleanString(value);

    if (!text) {
        return "";
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const dotMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dotMatch) {
        return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
    }

    const parsed = getComparableTimestamp(text);
    if (!parsed) {
        return "";
    }

    const date = new Date(parsed);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getEntryDateKey(entry) {
    if (!entry || typeof entry !== "object") {
        return "";
    }

    const source = buildFlexibleSource(entry);

    const directValue = pickFlexibleValue(source, [
        "tradeDate",
        "tradingDate",
        "businessDate",
        "date",
        "timestamp",
        "timestampIso",
        "entryTime",
        "exitTime",
        "time",
        "fillTime",
        "filledTime",
        "executionTime",
        "createdAt",
        "updatedAt",
        "filledAt",
    ]);

    const directDateKey = extractDateKey(directValue);
    if (directDateKey) {
        return directDateKey;
    }

    const datePart = pickFlexibleValue(source, [
        "tradeDate",
        "tradingDate",
        "businessDate",
        "date",
    ]);

    const timePart = pickFlexibleValue(source, [
        "timestamp",
        "entryTime",
        "exitTime",
        "time",
        "fillTime",
        "filledTime",
        "executionTime",
        "createdAt",
        "updatedAt",
        "filledAt",
    ]);

    const combinedDateKey = extractDateKey(
        [datePart, timePart].map((part) => cleanString(part)).filter(Boolean).join(" ")
    );

    if (combinedDateKey) {
        return combinedDateKey;
    }

    return "";
}

function sortNewestFirst(list) {
    return [...list].sort((a, b) => {
        const aTime = getComparableTimestamp(
            a?.timestamp || a?.date || a?.tradeDate || a?.exitTime || a?.entryTime || 0
        );
        const bTime = getComparableTimestamp(
            b?.timestamp || b?.date || b?.tradeDate || b?.exitTime || b?.entryTime || 0
        );
        return bTime - aTime;
    });
}

function sortOldestFirst(list) {
    return [...list].sort((a, b) => {
        const aTime = getComparableTimestamp(
            a?.timestamp || a?.date || a?.tradeDate || a?.exitTime || a?.entryTime || 0
        );
        const bTime = getComparableTimestamp(
            b?.timestamp || b?.date || b?.tradeDate || b?.exitTime || b?.entryTime || 0
        );
        return aTime - bTime;
    });
}

function readBalanceValue(entry) {
    if (!entry || typeof entry !== "object") {
        return 0;
    }

    const source = buildFlexibleSource(entry);

    return toNumber(
        pickFlexibleValue(source, [
            "currentBalance",
            "endingBalance",
            "endBalance",
            "balance",
            "accountBalance",
            "netLiq",
            "cashBalance",
            "totalAmount",
        ]),
        0
    );
}

function readStartingBalanceValue(entry) {
    if (!entry || typeof entry !== "object") {
        return 0;
    }

    const source = buildFlexibleSource(entry);

    return toNumber(
        pickFlexibleValue(source, [
            "startingBalance",
            "startBalance",
            "balance",
            "accountBalance",
            "netLiq",
            "cashBalance",
            "totalAmount",
        ]),
        0
    );
}

function getOrderId(order) {
    if (!order || typeof order !== "object") {
        return "";
    }

    const source = buildFlexibleSource(order);

    return cleanString(
        pickFlexibleValue(source, [
            "orderId",
            "order_id",
            "id",
            "orderNumber",
            "ordId",
            "orderNo",
        ])
    );
}

function getFillOrderId(fill) {
    if (!fill || typeof fill !== "object") {
        return "";
    }

    const source = buildFlexibleSource(fill);

    return cleanString(
        pickFlexibleValue(source, [
            "orderId",
            "_orderid",
            "order_id",
            "ordId",
            "orderNumber",
            "orderNo",
        ])
    );
}

function getOrderStatusText(order) {
    if (!order || typeof order !== "object") {
        return "";
    }

    const source = buildFlexibleSource(order);

    return cleanString(
        pickFlexibleValue(source, [
            "status",
            "orderStatus",
            "state",
            "order_state",
        ])
    ).toLowerCase();
}

function isCanceledOrder(order) {
    const status = getOrderStatusText(order);
    return status.includes("cancel");
}

function isFilledOrder(order) {
    const status = getOrderStatusText(order);

    if (!status) {
        return false;
    }

    return (
        status.includes("fill") ||
        status.includes("execut") ||
        status.includes("complete")
    );
}

function getLatestDateKey(dateKeys) {
    const safe = toArray(dateKeys).filter(Boolean).sort();
    return safe.length ? safe[safe.length - 1] : "";
}

function buildLatestBalanceByDateMap(entries) {
    const map = {};

    entries.forEach((entry) => {
        const dateKey = getEntryDateKey(entry);

        if (!dateKey) {
            return;
        }

        const currentTimestamp = getComparableTimestamp(
            entry?.timestamp || entry?.date || entry?.tradeDate || 0
        );

        const previous = map[dateKey];

        if (!previous) {
            map[dateKey] = { entry, timestamp: currentTimestamp };
            return;
        }

        if (currentTimestamp >= previous.timestamp) {
            map[dateKey] = { entry, timestamp: currentTimestamp };
        }
    });

    const result = {};

    Object.keys(map).forEach((dateKey) => {
        result[dateKey] = readBalanceValue(map[dateKey].entry);
    });

    return result;
}

function buildSummaryHighlight(summary, checks) {
    if (summary.criticalCount > 0) {
        const criticalTitles = checks
            .filter((item) => item.status === STATUS.ERROR)
            .slice(0, 2)
            .map((item) => item.title);

        if (criticalTitles.length === 0) {
            return "Echte Abweichungen offen.";
        }

        return `Kritisch offen: ${criticalTitles.join(", ")}.`;
    }

    if (summary.warningCount > 0) {
        const warningKeys = checks
            .filter((item) => item.status === STATUS.WARNING)
            .map((item) => item.key);

        const hasCashDayWarning = warningKeys.includes("journal-day-vs-cash-history-day");
        const hasBalanceMoveWarning = warningKeys.includes("balance-movement-vs-journal");

        if (
            summary.warningCount === 2 &&
            hasCashDayWarning &&
            hasBalanceMoveWarning
        ) {
            return "2 offen. Grund: zweiter Cash History Tagesstand fehlt.";
        }

        return `${summary.warningCount} offen. Datenbasis fehlt noch teilweise.`;
    }

    return "Alle Prüfungen sauber.";
}

function StatCard({ label, value, note = "" }) {
    return (
        <div
            style={{
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 10,
                minHeight: 58,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: COLORS.text,
                    fontSize: 17,
                    fontWeight: 800,
                    lineHeight: 1.02,
                }}
            >
                {value}
            </div>

            {note ? (
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 10,
                        marginTop: 6,
                        lineHeight: 1.35,
                    }}
                >
                    {note}
                </div>
            ) : null}
        </div>
    );
}

function CheckRow({ title, description, status, meta = "" }) {
    const statusMeta = getStatusMeta(status);

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${statusMeta.border}`,
                background: statusMeta.bg,
            }}
        >
            <div style={{ minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 13.5,
                        fontWeight: 800,
                        marginBottom: 3,
                    }}
                >
                    {title}
                </div>
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 12,
                        lineHeight: 1.4,
                    }}
                >
                    {description}
                </div>

                {meta ? (
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 10.5,
                            marginTop: 6,
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                        }}
                    >
                        {meta}
                    </div>
                ) : null}
            </div>

            <div
                style={{
                    border: `1px solid ${statusMeta.border}`,
                    color: statusMeta.color,
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    minWidth: 60,
                    textAlign: "center",
                    alignSelf: "center",
                    flexShrink: 0,
                }}
            >
                {statusMeta.label}
            </div>
        </div>
    );
}

function SummaryCard({ summary }) {
    const statusMeta = getStatusMeta(summary.overallStatus);

    return (
        <div
            style={{
                display: "grid",
                gap: 12,
                padding: 12,
                borderRadius: 14,
                border: `1px solid ${statusMeta.border}`,
                background: statusMeta.bg,
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
                            color: COLORS.muted,
                            fontSize: 11,
                            marginBottom: 5,
                        }}
                    >
                        Gesamtbewertung
                    </div>
                    <div
                        style={{
                            color: statusMeta.color,
                            fontSize: 21,
                            fontWeight: 900,
                            lineHeight: 1.02,
                            marginBottom: 5,
                        }}
                    >
                        {summary.overallLabel}
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 12,
                            lineHeight: 1.4,
                            marginBottom: 7,
                        }}
                    >
                        {summary.note}
                    </div>

                    {summary.highlight ? (
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: `1px solid ${statusMeta.border}`,
                                background: "rgba(255,255,255,0.03)",
                                color: COLORS.text,
                                fontSize: 11,
                                fontWeight: 700,
                                lineHeight: 1.3,
                            }}
                        >
                            {summary.highlight}
                        </div>
                    ) : null}
                </div>

                <div
                    style={{
                        border: `1px solid ${statusMeta.border}`,
                        color: statusMeta.color,
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 11,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                    }}
                >
                    {statusMeta.label}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                }}
            >
                <StatCard
                    label="Kritische Fehler"
                    value={formatNumber(summary.criticalCount, 0)}
                />
                <StatCard
                    label="Prüfpunkte offen"
                    value={formatNumber(summary.warningCount, 0)}
                />
                <StatCard
                    label="Saubere Checks"
                    value={formatNumber(summary.okCount, 0)}
                />
                <StatCard
                    label="Checks gesamt"
                    value={formatNumber(summary.totalCount, 0)}
                />
            </div>
        </div>
    );
}

export default function ValidationPanel({
    activeAccount = null,
    resolvedAccountId = "",
    imports = {},
    orders = [],
    fills = [],
    accountBalanceHistory = [],
}) {
    const [localImports, setLocalImports] = useState(() => {
        return typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports(resolvedAccountId)
            : {};
    });

    useEffect(() => {
        const eventName =
            typeof csvImportUtils.getCsvImportEventName === "function"
                ? csvImportUtils.getCsvImportEventName()
                : "tradovate-csv-imports-updated";

        const loadImports = () => {
            const nextImports =
                typeof csvImportUtils.getAllParsedImports === "function"
                    ? csvImportUtils.getAllParsedImports(resolvedAccountId)
                    : {};

            setLocalImports(nextImports);
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
    }, [resolvedAccountId]);

    const effectiveImports = useMemo(() => {
        return resolveAccountImportsFromSources(
            localImports,
            activeAccount?.imports,
            imports
        );
    }, [localImports, activeAccount?.imports, imports]);

    const ordersFromStorageImported = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        return toArray(getImportedOrders(resolvedAccountId));
    }, [resolvedAccountId]);

    const ordersFromStorage = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        return toArray(getOrders(resolvedAccountId));
    }, [resolvedAccountId]);

    const ordersFromImports = useMemo(() => {
        if (Array.isArray(effectiveImports?.orders?.rows) && effectiveImports.orders.rows.length > 0) {
            return effectiveImports.orders.rows;
        }

        if (typeof csvImportUtils.buildOrdersData === "function") {
            const built = csvImportUtils.buildOrdersData(effectiveImports, resolvedAccountId);
            return toArray(built?.entries);
        }

        return [];
    }, [effectiveImports, resolvedAccountId]);

    const safeOrders = useMemo(() => {
        return pickBestArray(
            orders,
            ordersFromStorageImported,
            ordersFromStorage,
            ordersFromImports
        );
    }, [orders, ordersFromStorageImported, ordersFromStorage, ordersFromImports]);

    const fillsFromStorage = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        return toArray(getFills(resolvedAccountId));
    }, [resolvedAccountId]);

    const fillsFromImports = useMemo(() => {
        if (typeof csvImportUtils.buildFillsData === "function") {
            const built = csvImportUtils.buildFillsData(effectiveImports, resolvedAccountId);
            return toArray(built?.entries);
        }

        if (Array.isArray(effectiveImports?.trades?.rows)) {
            return effectiveImports.trades.rows;
        }

        return [];
    }, [effectiveImports, resolvedAccountId]);

    const safeFills = useMemo(() => {
        return pickBestArray(
            fills,
            fillsFromStorage,
            fillsFromImports
        );
    }, [fills, fillsFromStorage, fillsFromImports]);

    const cashHistoryFromStorage = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        return toArray(getAccountBalanceHistory(resolvedAccountId));
    }, [resolvedAccountId]);

    const cashHistoryFromImports = useMemo(() => {
        if (typeof csvImportUtils.buildCashHistoryData === "function") {
            const built = csvImportUtils.buildCashHistoryData(
                effectiveImports,
                resolvedAccountId
            );
            return toArray(built?.entries);
        }

        if (typeof csvImportUtils.buildDailySummaryData === "function") {
            const built = csvImportUtils.buildDailySummaryData(
                effectiveImports,
                resolvedAccountId
            );
            return toArray(built?.entries);
        }

        if (Array.isArray(effectiveImports?.cashHistory?.rows)) {
            return effectiveImports.cashHistory.rows;
        }

        return [];
    }, [effectiveImports, resolvedAccountId]);

    const safeCashHistory = useMemo(() => {
        return pickBestArray(
            accountBalanceHistory,
            cashHistoryFromStorage,
            cashHistoryFromImports
        );
    }, [accountBalanceHistory, cashHistoryFromStorage, cashHistoryFromImports]);

    const journalAnalytics = useMemo(() => {
        return buildFillAnalytics({
            fills: safeFills,
            accountId: resolvedAccountId,
        });
    }, [safeFills, resolvedAccountId]);

    const performanceData = useMemo(() => {
        return typeof csvImportUtils.buildPerformanceData === "function"
            ? csvImportUtils.buildPerformanceData(effectiveImports, resolvedAccountId)
            : { entries: [], stats: { total: 0, totalPnl: 0 } };
    }, [effectiveImports, resolvedAccountId]);

    const positionHistoryData = useMemo(() => {
        return typeof csvImportUtils.buildPositionHistoryData === "function"
            ? csvImportUtils.buildPositionHistoryData(effectiveImports, resolvedAccountId)
            : { entries: [], stats: { total: 0, totalPnl: 0 } };
    }, [effectiveImports, resolvedAccountId]);

    const cashHistorySnapshot = useMemo(() => {
        if (typeof csvImportUtils.deriveCashHistorySnapshot === "function") {
            return csvImportUtils.deriveCashHistorySnapshot(
                effectiveImports,
                resolvedAccountId
            );
        }

        return null;
    }, [effectiveImports, resolvedAccountId]);

    const latestBalanceEntry = useMemo(() => {
        if (!safeCashHistory.length) {
            return null;
        }

        return sortNewestFirst(safeCashHistory)[0];
    }, [safeCashHistory]);

    const firstBalanceEntry = useMemo(() => {
        if (!safeCashHistory.length) {
            return null;
        }

        return sortOldestFirst(safeCashHistory)[0];
    }, [safeCashHistory]);

    const metrics = useMemo(() => {
        const positionHistoryEntries = toArray(positionHistoryData?.entries);

        const ordersCount = safeOrders.length;
        const fillsCount = safeFills.length;

        const closedTrades = toNumber(journalAnalytics?.summary?.closedTradeCount, 0);
        const openTrades = toArray(journalAnalytics?.openTrades).length;
        const openPositions = toArray(journalAnalytics?.positions).length;

        const journalGross = toNumber(journalAnalytics?.summary?.grossPnl, 0);
        const journalNet = toNumber(journalAnalytics?.summary?.netPnl, 0);
        const journalCommission = toNumber(journalAnalytics?.summary?.commissions, 0);

        const performanceRows = toNumber(performanceData?.stats?.total, 0);
        const performancePnl = toNumber(performanceData?.stats?.totalPnl, 0);

        const positionHistoryRows = toNumber(positionHistoryData?.stats?.total, 0);
        const positionHistoryPnl = toNumber(positionHistoryData?.stats?.totalPnl, 0);

        const currentBalanceStorage = toNumber(activeAccount?.currentBalance, 0);
        const startingBalanceStorage = toNumber(activeAccount?.startingBalance, 0);

        const latestBalanceValue = cashHistorySnapshot?.hasValues
            ? toNumber(cashHistorySnapshot.currentBalance, 0)
            : readBalanceValue(latestBalanceEntry);

        const firstBalanceValue = cashHistorySnapshot?.hasValues
            ? toNumber(cashHistorySnapshot.startingBalance, 0)
            : readStartingBalanceValue(firstBalanceEntry);

        const balanceMovement = latestBalanceValue - firstBalanceValue;

        const currentBalanceDelta = latestBalanceValue - currentBalanceStorage;
        const startingBalanceDelta = firstBalanceValue - startingBalanceStorage;

        const filledOrders = safeOrders.filter(isFilledOrder);
        const canceledOrders = safeOrders.filter(isCanceledOrder);
        const otherOrders = safeOrders.filter((order) => {
            return !isFilledOrder(order) && !isCanceledOrder(order);
        });

        const orderIds = new Set(
            safeOrders.map(getOrderId).filter(Boolean)
        );

        const filledOrderIds = new Set(
            filledOrders.map(getOrderId).filter(Boolean)
        );

        const fillOrderIds = new Set(
            safeFills.map(getFillOrderId).filter(Boolean)
        );

        let matchedFilledOrderIdsCount = 0;
        filledOrderIds.forEach((id) => {
            if (fillOrderIds.has(id)) {
                matchedFilledOrderIdsCount += 1;
            }
        });

        let filledOrdersWithoutFillCount = 0;
        filledOrderIds.forEach((id) => {
            if (!fillOrderIds.has(id)) {
                filledOrdersWithoutFillCount += 1;
            }
        });

        let fillOrderIdsWithoutOrderCount = 0;
        fillOrderIds.forEach((id) => {
            if (!orderIds.has(id)) {
                fillOrderIdsWithoutOrderCount += 1;
            }
        });

        const normalizedJournalFills = toArray(journalAnalytics?.normalizedFills);

        const journalDateKeys = Array.from(
            new Set(
                normalizedJournalFills
                    .map((fill) => getEntryDateKey(fill))
                    .filter(Boolean)
            )
        );

        const positionHistoryDateKeys = Array.from(
            new Set(
                positionHistoryEntries
                    .map((entry) => getEntryDateKey(entry))
                    .filter(Boolean)
            )
        );

        const cashHistoryDateKeys = Array.from(
            new Set(
                safeCashHistory
                    .map((entry) => getEntryDateKey(entry))
                    .filter(Boolean)
            )
        );

        const latestJournalDate = getLatestDateKey(journalDateKeys);
        const latestPositionHistoryDate = getLatestDateKey(positionHistoryDateKeys);
        const latestCashHistoryDate = getLatestDateKey(cashHistoryDateKeys);

        const fillsForLatestDate = safeFills.filter((fill) => {
            return getEntryDateKey(fill) === latestJournalDate;
        });

        const dayJournalAnalytics = buildFillAnalytics({
            fills: fillsForLatestDate,
            accountId: resolvedAccountId,
        });

        const journalGrossForLatestDate = toNumber(
            dayJournalAnalytics?.summary?.grossPnl,
            0
        );

        const journalNetForLatestDate = toNumber(
            dayJournalAnalytics?.summary?.netPnl,
            0
        );

        const journalCommissionForLatestDate = toNumber(
            dayJournalAnalytics?.summary?.commissions,
            0
        );

        const positionHistoryForLatestDate = positionHistoryEntries.filter((entry) => {
            return getEntryDateKey(entry) === latestJournalDate;
        });

        const positionHistoryPnlForLatestDate = positionHistoryForLatestDate.reduce((sum, entry) => {
            return sum + toNumber(entry?.pnl, 0);
        }, 0);

        const balanceByDate = buildLatestBalanceByDateMap(safeCashHistory);
        const sortedBalanceDates = Object.keys(balanceByDate).sort();

        let balanceDeltaForLatestJournalDate = null;

        if (latestJournalDate && sortedBalanceDates.includes(latestJournalDate)) {
            const currentIndex = sortedBalanceDates.indexOf(latestJournalDate);

            if (currentIndex > 0) {
                const currentDate = sortedBalanceDates[currentIndex];
                const previousDate = sortedBalanceDates[currentIndex - 1];

                balanceDeltaForLatestJournalDate =
                    toNumber(balanceByDate[currentDate], 0) -
                    toNumber(balanceByDate[previousDate], 0);
            }
        }

        return {
            ordersCount,
            fillsCount,
            closedTrades,
            openTrades,
            openPositions,
            journalGross,
            journalNet,
            journalCommission,
            performanceRows,
            performancePnl,
            positionHistoryRows,
            positionHistoryPnl,
            currentBalanceStorage,
            startingBalanceStorage,
            latestBalanceValue,
            firstBalanceValue,
            balanceMovement,
            currentBalanceDelta,
            startingBalanceDelta,
            cashHistoryRows: safeCashHistory.length,
            filledOrdersCount: filledOrders.length,
            canceledOrdersCount: canceledOrders.length,
            otherOrdersCount: otherOrders.length,
            distinctFillOrderIdsCount: fillOrderIds.size,
            matchedFilledOrderIdsCount,
            filledOrdersWithoutFillCount,
            fillOrderIdsWithoutOrderCount,
            latestJournalDate,
            latestPositionHistoryDate,
            latestCashHistoryDate,
            journalGrossForLatestDate,
            journalNetForLatestDate,
            journalCommissionForLatestDate,
            positionHistoryPnlForLatestDate,
            positionHistoryRowsForLatestDate: positionHistoryForLatestDate.length,
            balanceDeltaForLatestJournalDate,
        };
    }, [
        activeAccount,
        cashHistorySnapshot,
        firstBalanceEntry,
        journalAnalytics,
        latestBalanceEntry,
        performanceData,
        positionHistoryData,
        resolvedAccountId,
        safeCashHistory,
        safeFills,
        safeOrders,
    ]);

    const checks = useMemo(() => {
        const orderFillResult = {
            ...buildOrderFillValidation({
                filledOrdersCount: metrics.filledOrdersCount,
                fillsCount: metrics.fillsCount,
                filledWithoutFillCount: metrics.filledOrdersWithoutFillCount,
                fillsWithoutOrderCount: metrics.fillOrderIdsWithoutOrderCount,
            }),
            title: "Filled Orders gegen Fills",
            meta: compactMeta([
                `Orders ${formatNumber(metrics.ordersCount, 0)}`,
                `Filled ${formatNumber(metrics.filledOrdersCount, 0)}`,
                `Canceled ${formatNumber(metrics.canceledOrdersCount, 0)}`,
                `Andere ${formatNumber(metrics.otherOrdersCount, 0)}`,
                `IDs ${formatNumber(metrics.distinctFillOrderIdsCount, 0)}`,
                `Ohne Fill ${formatNumber(metrics.filledOrdersWithoutFillCount, 0)}`,
                `Ohne Order ${formatNumber(metrics.fillOrderIdsWithoutOrderCount, 0)}`,
            ]),
        };

        const performanceResult =
            metrics.performanceRows > 0
                ? compareNumbers({
                    key: "journal-vs-performance",
                    title: "Journal gegen Performance",
                    expected: metrics.journalGross,
                    actual: metrics.performancePnl,
                    epsilon: 0.01,
                    okMessage: "Performance passt zu Journal Gross.",
                    errorMessage: "Performance weicht von Journal Gross ab.",
                    missingMessage: "Performance Basis fehlt.",
                })
                : createMissingBaseResult({
                    key: "journal-vs-performance",
                    title: "Journal gegen Performance",
                    message: "Performance CSV fehlt oder ist leer.",
                    expected: metrics.journalGross,
                    actual: null,
                });

        performanceResult.meta = compactMeta([
            `Gross ${formatMoney(metrics.journalGross)}`,
            `Net ${formatMoney(metrics.journalNet)}`,
            `Perf ${formatMoney(metrics.performancePnl)}`,
            `Delta ${formatMaybeMoney(performanceResult.delta)}`,
            `Rows ${formatNumber(metrics.performanceRows, 0)}`,
        ]);

        const positionHistoryResult =
            metrics.positionHistoryRows > 0
                ? compareNumbers({
                    key: "journal-vs-position-history",
                    title: "Journal gegen Position History",
                    expected: metrics.journalGross,
                    actual: metrics.positionHistoryPnl,
                    epsilon: 0.01,
                    okMessage: "Position History passt zu Journal Gross.",
                    errorMessage: "Position History weicht von Journal Gross ab.",
                    missingMessage: "Position History Basis fehlt.",
                })
                : createMissingBaseResult({
                    key: "journal-vs-position-history",
                    title: "Journal gegen Position History",
                    message: "Position History fehlt oder ist leer.",
                    expected: metrics.journalGross,
                    actual: null,
                });

        positionHistoryResult.meta = compactMeta([
            `Gross ${formatMoney(metrics.journalGross)}`,
            `Net ${formatMoney(metrics.journalNet)}`,
            `Pos ${formatMoney(metrics.positionHistoryPnl)}`,
            `Delta ${formatMaybeMoney(positionHistoryResult.delta)}`,
            `Rows ${formatNumber(metrics.positionHistoryRows, 0)}`,
        ]);

        let latestDayPositionResult;

        if (!metrics.latestJournalDate) {
            latestDayPositionResult = createMissingBaseResult({
                key: "journal-day-vs-position-history-day",
                title: "Tagesabgleich Journal gegen Position History",
                message: "Kein Journal Handelstag gefunden.",
                expected: null,
                actual: null,
            });
        } else if (metrics.positionHistoryRowsForLatestDate <= 0) {
            latestDayPositionResult = createMissingBaseResult({
                key: "journal-day-vs-position-history-day",
                title: "Tagesabgleich Journal gegen Position History",
                message: "Für den letzten Handelstag fehlt Position History.",
                expected: metrics.journalGrossForLatestDate,
                actual: null,
            });
        } else {
            latestDayPositionResult = compareNumbers({
                key: "journal-day-vs-position-history-day",
                title: "Tagesabgleich Journal gegen Position History",
                expected: metrics.journalGrossForLatestDate,
                actual: metrics.positionHistoryPnlForLatestDate,
                epsilon: 0.01,
                okMessage: "Letzter Handelstag passt.",
                errorMessage: "Letzter Handelstag weicht ab.",
                missingMessage: "Tagesbasis fehlt.",
            });
        }

        latestDayPositionResult.meta = compactMeta([
            `Tag ${formatDateKey(metrics.latestJournalDate)}`,
            `Pos Tag ${formatDateKey(metrics.latestPositionHistoryDate)}`,
            `Gross ${formatMoney(metrics.journalGrossForLatestDate)}`,
            `Net ${formatMoney(metrics.journalNetForLatestDate)}`,
            `Pos ${formatMoney(metrics.positionHistoryPnlForLatestDate)}`,
            `Rows ${formatNumber(metrics.positionHistoryRowsForLatestDate, 0)}`,
            `Delta ${formatMaybeMoney(latestDayPositionResult.delta)}`,
        ]);

        let latestDayCashResult;

        if (!metrics.latestJournalDate) {
            latestDayCashResult = createMissingBaseResult({
                key: "journal-day-vs-cash-history-day",
                title: "Tagesabgleich Journal gegen Cash History",
                message: "Kein Journal Handelstag gefunden.",
                expected: null,
                actual: null,
            });
        } else {
            latestDayCashResult = buildCashDayValidation({
                key: "journal-day-vs-cash-history-day",
                title: "Tagesabgleich Journal gegen Cash History",
                expectedDayMove: metrics.journalGrossForLatestDate,
                actualDayMove: metrics.balanceDeltaForLatestJournalDate,
                cashHistoryRowCount: metrics.cashHistoryRows,
                okMessage: "Cash History Tag passt.",
                errorMessage: "Cash History Tag weicht ab.",
                missingMessage: "Zweiter Cash History Tagesstand fehlt.",
                epsilon: 1,
            });
        }

        latestDayCashResult.meta = compactMeta([
            `Tag ${formatDateKey(metrics.latestJournalDate)}`,
            `Cash Tag ${formatDateKey(metrics.latestCashHistoryDate)}`,
            `Balance ${formatMaybeMoney(metrics.balanceDeltaForLatestJournalDate)}`,
            `Gross ${formatMoney(metrics.journalGrossForLatestDate)}`,
            `Net ${formatMoney(metrics.journalNetForLatestDate)}`,
            `Delta ${formatMaybeMoney(latestDayCashResult.delta)}`,
        ]);

        const balanceMovementResult =
            metrics.cashHistoryRows > 1
                ? compareNumbers({
                    key: "balance-movement-vs-journal",
                    title: "Balance Bewegung gegen Journal",
                    expected: metrics.journalGross,
                    actual: metrics.balanceMovement,
                    epsilon: 1,
                    okMessage: "Balance Bewegung passt.",
                    errorMessage: "Balance Bewegung weicht ab.",
                    missingMessage: "Cash History Basis fehlt.",
                })
                : createMissingBaseResult({
                    key: "balance-movement-vs-journal",
                    title: "Balance Bewegung gegen Journal",
                    message: "Zweiter Cash History Stand fehlt.",
                    expected: metrics.journalGross,
                    actual: null,
                });

        balanceMovementResult.meta = compactMeta([
            `Rows ${formatNumber(metrics.cashHistoryRows, 0)}`,
            `Start ${formatMoney(metrics.firstBalanceValue)}`,
            `Ende ${formatMoney(metrics.latestBalanceValue)}`,
            `Balance ${formatMoney(metrics.balanceMovement)}`,
            `Gross ${formatMoney(metrics.journalGross)}`,
            `Net ${formatMoney(metrics.journalNet)}`,
            `Delta ${formatMaybeMoney(balanceMovementResult.delta)}`,
        ]);

        const currentBalanceResult =
            metrics.cashHistoryRows > 0
                ? compareNumbers({
                    key: "current-balance-vs-cash-history",
                    title: "Current Balance gegen Cash History",
                    expected: metrics.latestBalanceValue,
                    actual: metrics.currentBalanceStorage,
                    epsilon: 1,
                    okMessage: "Current Balance passt.",
                    errorMessage: "Current Balance weicht ab.",
                    missingMessage: "Cash History Basis fehlt.",
                })
                : createMissingBaseResult({
                    key: "current-balance-vs-cash-history",
                    title: "Current Balance gegen Cash History",
                    message: "Cash History Basis fehlt.",
                    expected: null,
                    actual: metrics.currentBalanceStorage,
                });

        currentBalanceResult.meta = compactMeta([
            `Account ${formatMoney(metrics.currentBalanceStorage)}`,
            `Cash ${formatMoney(metrics.latestBalanceValue)}`,
            `Delta ${formatMaybeMoney(currentBalanceResult.delta)}`,
        ]);

        const startingBalanceResult =
            metrics.cashHistoryRows > 0
                ? compareNumbers({
                    key: "start-balance-vs-cash-history",
                    title: "Start Balance gegen Cash History",
                    expected: metrics.firstBalanceValue,
                    actual: metrics.startingBalanceStorage,
                    epsilon: 1,
                    okMessage: "Start Balance passt.",
                    errorMessage: "Start Balance weicht ab.",
                    missingMessage: "Cash History Basis fehlt.",
                })
                : createMissingBaseResult({
                    key: "start-balance-vs-cash-history",
                    title: "Start Balance gegen Cash History",
                    message: "Cash History Basis fehlt.",
                    expected: null,
                    actual: metrics.startingBalanceStorage,
                });

        startingBalanceResult.meta = compactMeta([
            `Account ${formatMoney(metrics.startingBalanceStorage)}`,
            `Cash ${formatMoney(metrics.firstBalanceValue)}`,
            `Delta ${formatMaybeMoney(startingBalanceResult.delta)}`,
        ]);

        return [
            orderFillResult,
            performanceResult,
            positionHistoryResult,
            latestDayPositionResult,
            latestDayCashResult,
            balanceMovementResult,
            currentBalanceResult,
            startingBalanceResult,
        ];
    }, [metrics]);

    const summary = useMemo(() => {
        const baseSummary = summarizeValidationResults(checks);

        let note = "Alle Prüfungen sauber.";

        if (baseSummary.criticalCount > 0) {
            note = "Echte Abweichung erkannt.";
        } else if (baseSummary.warningCount > 0) {
            note = "Einzelne Prüfungen warten auf Daten.";
        }

        return {
            ...baseSummary,
            note,
            highlight: buildSummaryHighlight(baseSummary, checks),
        };
    }, [checks]);

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 18,
                boxShadow: COLORS.shadow,
                padding: 14,
                display: "grid",
                gap: 12,
            }}
        >
            <div>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 18,
                        fontWeight: 800,
                        marginBottom: 5,
                    }}
                >
                    Validation Panel
                </div>
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 12,
                        lineHeight: 1.4,
                    }}
                >
                    Zentrale Prüfung für Orders, Fills, Journal, Positions, Performance und Cash History.
                </div>
            </div>

            <SummaryCard summary={summary} />

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))",
                    gap: 8,
                }}
            >
                <StatCard
                    label="Orders"
                    value={formatNumber(metrics.ordersCount, 0)}
                    note={`Filled: ${formatNumber(metrics.filledOrdersCount, 0)}. Canceled: ${formatNumber(metrics.canceledOrdersCount, 0)}`}
                />
                <StatCard
                    label="Fills"
                    value={formatNumber(metrics.fillsCount, 0)}
                    note={`Distinct Order IDs: ${formatNumber(metrics.distinctFillOrderIdsCount, 0)}`}
                />
                <StatCard
                    label="Closed Trades"
                    value={formatNumber(metrics.closedTrades, 0)}
                    note={`Tag: ${formatDateKey(metrics.latestJournalDate)}`}
                />
                <StatCard
                    label="Open Trades"
                    value={formatNumber(metrics.openTrades, 0)}
                />
                <StatCard
                    label="Open Positions"
                    value={formatNumber(metrics.openPositions, 0)}
                />
                <StatCard
                    label="Cash History Rows"
                    value={formatNumber(metrics.cashHistoryRows, 0)}
                    note={`Balance Delta: ${formatMoney(metrics.balanceMovement)}`}
                />
                <StatCard
                    label="Journal Gross"
                    value={formatMoney(metrics.journalGross)}
                    note={`Tag: ${formatMoney(metrics.journalGrossForLatestDate)}`}
                />
                <StatCard
                    label="Journal Net"
                    value={formatMoney(metrics.journalNet)}
                    note={`Commission: ${formatMoney(metrics.journalCommission)}`}
                />
                <StatCard
                    label="Performance PnL"
                    value={formatMoney(metrics.performancePnl)}
                    note={`Rows: ${formatNumber(metrics.performanceRows, 0)}`}
                />
                <StatCard
                    label="Position History PnL"
                    value={formatMoney(metrics.positionHistoryPnl)}
                    note={`Tag: ${formatMoney(metrics.positionHistoryPnlForLatestDate)}`}
                />
                <StatCard
                    label="Current Balance"
                    value={formatMoney(metrics.currentBalanceStorage)}
                    note={`Cash History: ${formatMoney(metrics.latestBalanceValue)}`}
                />
                <StatCard
                    label="Start Balance"
                    value={formatMoney(metrics.startingBalanceStorage)}
                    note={`Cash History: ${formatMoney(metrics.firstBalanceValue)}`}
                />
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 8,
                    padding: 10,
                    borderRadius: 14,
                    border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.cardBgStrong,
                }}
            >
                {checks.map((item) => (
                    <CheckRow
                        key={item.key}
                        title={item.title}
                        description={item.message}
                        status={item.status}
                        meta={item.meta}
                    />
                ))}
            </div>
        </section>
    );
}