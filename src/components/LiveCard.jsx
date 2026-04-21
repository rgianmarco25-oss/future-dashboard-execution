import { useEffect, useMemo, useState } from "react";
import { getAccountById, getLiveAccountSnapshot } from "../utils/storage";
import {
    getProviderLabel,
    getProviderStatusLabel,
    getProviderTypeLabel,
} from "../utils/providerModel";
import {
    getActiveProvider,
    getStrictProviderAccountName,
    getStrictProviderDisplayName,
    getStrictProviderTradingRef,
    shouldUseAtasZeroState,
} from "../utils/providerDisplay";

const COLORS = {
    panelBg: "rgba(8, 15, 37, 0.92)",
    panelBgSoft: "rgba(255, 255, 255, 0.04)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    accent: "#22d3ee",
    purple: "#a78bfa",
    yellow: "#facc15",
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

function formatCurrency(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return Number(value).toLocaleString("de-CH", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatSignedCurrency(value) {
    const numeric = toNumber(value, 0);
    const absolute = formatCurrency(Math.abs(numeric));

    return numeric >= 0 ? `+${absolute}` : `-${absolute}`;
}

function formatDateTimeLocal(value) {
    const date = toDateOrNull(value);

    if (!date) {
        return "–";
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function formatAccountSizeLabel(value) {
    const amount = toNumber(value, 0);

    if (!Number.isFinite(amount) || amount <= 0) {
        return "–";
    }

    if (amount >= 1000) {
        return `${Math.round(amount / 1000)}K`;
    }

    return String(amount);
}

function normalizePhase(value) {
    return cleanString(value).toLowerCase() === "pa" ? "PA" : "EVAL";
}

function normalizeProductType(value) {
    const raw = cleanString(value).toLowerCase();

    if (raw.includes("intra")) {
        return "Intraday";
    }

    return "EOD";
}

function formatStatusLabel(value) {
    const lower = cleanString(value).toLowerCase();

    if (!lower) {
        return "Offen";
    }

    if (lower === "open") {
        return "Offen";
    }

    if (lower === "active") {
        return "Aktiv";
    }

    if (lower === "passed") {
        return "Passed";
    }

    if (lower === "failed") {
        return "Failed";
    }

    if (lower === "archived") {
        return "Archiviert";
    }

    return cleanString(value);
}

function getStatusColors(status) {
    const lower = cleanString(status).toLowerCase();

    if (lower === "passed") {
        return {
            background: "rgba(34, 197, 94, 0.14)",
            border: "rgba(34, 197, 94, 0.26)",
            color: COLORS.positive,
        };
    }

    if (lower === "active") {
        return {
            background: "rgba(34, 211, 238, 0.12)",
            border: "rgba(34, 211, 238, 0.24)",
            color: COLORS.accent,
        };
    }

    if (lower === "failed") {
        return {
            background: "rgba(239, 68, 68, 0.12)",
            border: "rgba(239, 68, 68, 0.24)",
            color: COLORS.danger,
        };
    }

    if (lower === "archived") {
        return {
            background: "rgba(148, 163, 184, 0.12)",
            border: "rgba(148, 163, 184, 0.22)",
            color: COLORS.muted,
        };
    }

    return {
        background: "rgba(148, 163, 184, 0.12)",
        border: "rgba(148, 163, 184, 0.22)",
        color: COLORS.text,
    };
}

function getProviderStatusTone(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "connected" || normalized === "ready") {
        return "green";
    }

    if (normalized === "syncing") {
        return "yellow";
    }

    if (normalized === "error" || normalized === "disconnected") {
        return "red";
    }

    return "neutral";
}

function buildFlexibleSource(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = cleanString(key).toLowerCase().replace(/[^a-z0-9]/g, "");

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
        const normalizedKey = cleanString(key).toLowerCase().replace(/[^a-z0-9]/g, "");

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

function toDateOrNull(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    const direct = new Date(trimmed);

    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }

    const european = trimmed.match(
        /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!european) {
        return null;
    }

    const day = Number(european[1]);
    const month = Number(european[2]) - 1;
    const year = Number(european[3]);
    const hour = Number(european[4] || 0);
    const minute = Number(european[5] || 0);
    const second = Number(european[6] || 0);

    const date = new Date(year, month, day, hour, minute, second);

    return Number.isNaN(date.getTime()) ? null : date;
}

function getBalanceTimestamp(row) {
    const flexible = buildFlexibleSource(row);

    return (
        toDateOrNull(
            pickFlexibleValue(flexible, [
                "timestamp",
                "time",
                "dateTime",
                "datetime",
                "tradeDate",
                "transactionDate",
                "businessDate",
                "statementDate",
                "runDate",
                "date",
                "createdAt",
                "updatedAt",
            ])
        ) || null
    );
}

function getBalanceValue(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "currentBalance",
        "endingBalance",
        "endBalance",
        "closingBalance",
        "endOfDayBalance",
        "eodBalance",
        "balanceAfter",
        "endingCash",
        "cashAfter",
        "netLiq",
        "accountBalance",
        "cashBalance",
        "totalAmount",
        "balance",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getStartingBalanceValue(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "startingBalance",
        "startBalance",
        "beginningBalance",
        "openingBalance",
        "initialBalance",
        "balanceBefore",
        "cashBefore",
        "priorBalance",
        "previousBalance",
        "startOfDayBalance",
        "balance",
        "accountBalance",
        "netLiq",
        "cashBalance",
        "totalAmount",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getBalanceNetChange(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "netPnl",
        "netProfit",
        "netChange",
        "change",
        "dayChange",
        "dailyPnl",
        "realizedPnl",
        "profitLoss",
        "profit",
        "pnl",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function sortBalanceRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    return [...safeRows].sort((a, b) => {
        const aTime = (getBalanceTimestamp(a) || new Date(0)).getTime();
        const bTime = (getBalanceTimestamp(b) || new Date(0)).getTime();
        return aTime - bTime;
    });
}

function buildBalanceSummary(rows) {
    const safeRows = sortBalanceRows(rows);

    if (!safeRows.length) {
        return {
            startBalance: null,
            currentBalance: null,
            rowCount: 0,
            firstTimestamp: null,
            lastTimestamp: null,
        };
    }

    let startBalance = null;
    let currentBalance = null;

    safeRows.forEach((row) => {
        const rowStart = getStartingBalanceValue(row);
        let rowEnd = getBalanceValue(row);
        const rowChange = getBalanceNetChange(row);

        if ((rowEnd === null || rowEnd === undefined) && rowStart !== null && rowChange !== null) {
            rowEnd = rowStart + rowChange;
        }

        if ((startBalance === null || startBalance === undefined) && rowStart !== null) {
            startBalance = rowStart;
        }

        if ((startBalance === null || startBalance === undefined) && rowEnd !== null) {
            startBalance = rowEnd;
        }

        if (rowEnd !== null && rowEnd !== undefined) {
            currentBalance = rowEnd;
        } else if (rowStart !== null && rowStart !== undefined) {
            currentBalance = rowStart;
        }
    });

    return {
        startBalance,
        currentBalance,
        rowCount: safeRows.length,
        firstTimestamp: getBalanceTimestamp(safeRows[0]),
        lastTimestamp: getBalanceTimestamp(safeRows[safeRows.length - 1]),
    };
}

function InfoTile({
    label,
    value,
    hint = "",
    color = COLORS.text,
    borderColor = COLORS.border,
    background = COLORS.panelBgSoft,
}) {
    return (
        <div
            style={{
                borderRadius: 14,
                border: `1px solid ${borderColor}`,
                background,
                padding: 12,
                minHeight: 86,
                display: "grid",
                gap: 5,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.2,
                }}
            >
                {label}
            </div>

            <div
                style={{
                    color,
                    fontSize: 14,
                    fontWeight: 800,
                    lineHeight: 1.25,
                    wordBreak: "break-word",
                }}
            >
                {value || "–"}
            </div>

            {hint ? (
                <div
                    style={{
                        color: COLORS.muted,
                        fontSize: 10,
                        lineHeight: 1.35,
                    }}
                >
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

export default function LiveCard(props) {
    const {
        accountId = "",
        account: accountProp = null,
        activeAccount = null,
        accountBalanceHistory: accountBalanceHistoryProp = [],
        orders: ordersProp = [],
        fills: fillsProp = [],
    } = props || {};

    const resolvedAccountId =
        cleanString(accountId) ||
        cleanString(accountProp?.id) ||
        cleanString(activeAccount?.id) ||
        "";

    const [, setRefreshTick] = useState(0);

    useEffect(() => {
        const handleRefresh = () => {
            setRefreshTick((prev) => prev + 1);
        };

        if (typeof window === "undefined") {
            return undefined;
        }

        window.addEventListener("tradovate-csv-imports-updated", handleRefresh);
        window.addEventListener("storage", handleRefresh);
        window.addEventListener("focus", handleRefresh);

        return () => {
            window.removeEventListener("tradovate-csv-imports-updated", handleRefresh);
            window.removeEventListener("storage", handleRefresh);
            window.removeEventListener("focus", handleRefresh);
        };
    }, []);

    const storedAccount = useMemo(() => {
        if (!resolvedAccountId) {
            return {};
        }

        return getAccountById(resolvedAccountId) || {};
    }, [resolvedAccountId]);

    const liveSnapshot = useMemo(() => {
        if (!resolvedAccountId) {
            return null;
        }

        return getLiveAccountSnapshot(resolvedAccountId) || null;
    }, [resolvedAccountId]);

    const resolvedAccount = useMemo(() => {
        return {
            ...storedAccount,
            ...(activeAccount || {}),
            ...(accountProp || {}),
            id: resolvedAccountId || storedAccount?.id || accountProp?.id || activeAccount?.id || "",
        };
    }, [storedAccount, activeAccount, accountProp, resolvedAccountId]);

    const runtimeProvider = useMemo(() => {
        return getActiveProvider(
            resolvedAccount,
            liveSnapshot,
            resolvedAccount?.dataProvider
        );
    }, [resolvedAccount, liveSnapshot]);

    const isAtasZeroState = useMemo(() => {
        return shouldUseAtasZeroState(
            resolvedAccount,
            liveSnapshot,
            runtimeProvider
        );
    }, [resolvedAccount, liveSnapshot, runtimeProvider]);

    const rows = useMemo(() => {
        if (isAtasZeroState) {
            return [];
        }

        const propRows = Array.isArray(accountBalanceHistoryProp) ? accountBalanceHistoryProp : [];
        return sortBalanceRows(propRows);
    }, [accountBalanceHistoryProp, isAtasZeroState]);

    const balanceSummary = useMemo(() => {
        if (isAtasZeroState) {
            return {
                startBalance: 0,
                currentBalance: 0,
                rowCount: 0,
                firstTimestamp: null,
                lastTimestamp: null,
            };
        }

        return buildBalanceSummary(rows);
    }, [rows, isAtasZeroState]);

    const startBalance = useMemo(() => {
        if (isAtasZeroState) {
            return 0;
        }

        if (balanceSummary.startBalance !== null && balanceSummary.startBalance !== undefined) {
            return balanceSummary.startBalance;
        }

        const snapshotStartingBalance = parseFlexibleNumber(
            liveSnapshot?.startingBalance
        );

        if (snapshotStartingBalance !== null) {
            return snapshotStartingBalance;
        }

        const storedStartingBalance = parseFlexibleNumber(
            resolvedAccount?.startingBalance ?? resolvedAccount?.accountSize
        );

        return storedStartingBalance !== null ? storedStartingBalance : null;
    }, [balanceSummary.startBalance, liveSnapshot, resolvedAccount, isAtasZeroState]);

    const currentBalance = useMemo(() => {
        if (isAtasZeroState) {
            return 0;
        }

        if (balanceSummary.currentBalance !== null && balanceSummary.currentBalance !== undefined) {
            return balanceSummary.currentBalance;
        }

        const snapshotCurrentBalance = parseFlexibleNumber(
            liveSnapshot?.currentBalance
        );

        if (snapshotCurrentBalance !== null) {
            return snapshotCurrentBalance;
        }

        const storedCurrentBalance = parseFlexibleNumber(
            resolvedAccount?.currentBalance ?? resolvedAccount?.startingBalance ?? resolvedAccount?.accountSize
        );

        return storedCurrentBalance !== null ? storedCurrentBalance : null;
    }, [balanceSummary.currentBalance, liveSnapshot, resolvedAccount, isAtasZeroState]);

    const balanceDelta = useMemo(() => {
        if (isAtasZeroState) {
            return 0;
        }

        if (
            startBalance === null ||
            startBalance === undefined ||
            currentBalance === null ||
            currentBalance === undefined
        ) {
            return null;
        }

        return currentBalance - startBalance;
    }, [startBalance, currentBalance, isAtasZeroState]);

    const providerLabel = useMemo(() => {
        return getProviderLabel(runtimeProvider);
    }, [runtimeProvider]);

    const providerTypeLabel = useMemo(() => {
        return getProviderTypeLabel(
            cleanString(liveSnapshot?.dataProviderType || resolvedAccount?.dataProviderType),
            runtimeProvider
        );
    }, [liveSnapshot, resolvedAccount, runtimeProvider]);

    const providerStatusValue = useMemo(() => {
        return cleanString(
            liveSnapshot?.dataProviderStatus || resolvedAccount?.dataProviderStatus
        );
    }, [liveSnapshot, resolvedAccount]);

    const providerStatusLabel = useMemo(() => {
        return getProviderStatusLabel(providerStatusValue);
    }, [providerStatusValue]);

    const providerStatusTone = useMemo(() => {
        return getProviderStatusTone(providerStatusValue);
    }, [providerStatusValue]);

    const displayName = useMemo(() => {
        const value = cleanString(
            getStrictProviderDisplayName(
                resolvedAccount,
                liveSnapshot,
                runtimeProvider
            )
        );

        if (value) {
            return value;
        }

        if (isAtasZeroState) {
            return "Kein ATAS Account";
        }

        return "Kein aktiver Account";
    }, [resolvedAccount, liveSnapshot, runtimeProvider, isAtasZeroState]);

    const tradingRef = useMemo(() => {
        const value = cleanString(
            getStrictProviderTradingRef(
                resolvedAccount,
                liveSnapshot,
                runtimeProvider
            )
        );

        if (value) {
            return value;
        }

        if (isAtasZeroState) {
            return "Kein ATAS Account";
        }

        return "Keine Trading Ref";
    }, [resolvedAccount, liveSnapshot, runtimeProvider, isAtasZeroState]);

    const sourceName = useMemo(() => {
        const value = cleanString(
            getStrictProviderAccountName(
                resolvedAccount,
                liveSnapshot,
                runtimeProvider
            )
        );

        if (value) {
            return value;
        }

        if (isAtasZeroState) {
            return "Kein ATAS Account";
        }

        return "Offen";
    }, [resolvedAccount, liveSnapshot, runtimeProvider, isAtasZeroState]);

    const lastSyncLabel = useMemo(() => {
        return formatDateTimeLocal(
            cleanString(liveSnapshot?.lastSyncAt || resolvedAccount?.lastSyncAt)
        );
    }, [liveSnapshot, resolvedAccount]);

    const statusColors = useMemo(() => {
        return getStatusColors(resolvedAccount?.accountStatus);
    }, [resolvedAccount?.accountStatus]);

    const fillsCount = useMemo(() => {
        if (isAtasZeroState) {
            return 0;
        }

        if (Array.isArray(fillsProp) && fillsProp.length) {
            return fillsProp.length;
        }

        if (Array.isArray(liveSnapshot?.fills)) {
            return liveSnapshot.fills.length;
        }

        return 0;
    }, [fillsProp, liveSnapshot, isAtasZeroState]);

    const ordersCount = useMemo(() => {
        if (isAtasZeroState) {
            return 0;
        }

        if (Array.isArray(ordersProp) && ordersProp.length) {
            return ordersProp.length;
        }

        if (Array.isArray(liveSnapshot?.orders)) {
            return liveSnapshot.orders.length;
        }

        return 0;
    }, [ordersProp, liveSnapshot, isAtasZeroState]);

    const accountSizeLabel = useMemo(() => {
        if (isAtasZeroState) {
            return "0";
        }

        return formatAccountSizeLabel(resolvedAccount?.accountSize);
    }, [resolvedAccount, isAtasZeroState]);

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 20,
                padding: 18,
                boxShadow: COLORS.shadow,
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
                            fontWeight: 800,
                            marginBottom: 4,
                        }}
                    >
                        Live
                    </div>

                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1.4,
                        }}
                    >
                        {displayName}
                    </div>

                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                            marginTop: 4,
                        }}
                    >
                        Trading Ref: {tradingRef}
                    </div>

                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                            marginTop: 4,
                        }}
                    >
                        Quelle: {sourceName}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                    }}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: `1px solid ${statusColors.border}`,
                            background: statusColors.background,
                            color: statusColors.color,
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {formatStatusLabel(resolvedAccount?.accountStatus)}
                    </span>

                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: `1px solid ${COLORS.border}`,
                            background: "rgba(255,255,255,0.04)",
                            color: COLORS.text,
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {normalizePhase(resolvedAccount?.accountPhase)} {normalizeProductType(resolvedAccount?.productType)}
                    </span>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                }}
            >
                <InfoTile
                    label="Provider"
                    value={providerLabel}
                    hint={providerTypeLabel}
                    color={COLORS.accent}
                    borderColor="rgba(34, 211, 238, 0.22)"
                    background="rgba(34, 211, 238, 0.04)"
                />

                <InfoTile
                    label="Provider Status"
                    value={providerStatusLabel}
                    hint={`Sync ${lastSyncLabel}`}
                    color={
                        providerStatusTone === "green"
                            ? COLORS.positive
                            : providerStatusTone === "yellow"
                                ? COLORS.warning
                                : providerStatusTone === "red"
                                    ? COLORS.danger
                                    : COLORS.text
                    }
                    borderColor={
                        providerStatusTone === "green"
                            ? "rgba(34, 197, 94, 0.22)"
                            : providerStatusTone === "yellow"
                                ? "rgba(245, 158, 11, 0.22)"
                                : providerStatusTone === "red"
                                    ? "rgba(239, 68, 68, 0.22)"
                                    : COLORS.border
                    }
                    background={
                        providerStatusTone === "green"
                            ? "rgba(34, 197, 94, 0.04)"
                            : providerStatusTone === "yellow"
                                ? "rgba(245, 158, 11, 0.04)"
                                : providerStatusTone === "red"
                                    ? "rgba(239, 68, 68, 0.04)"
                                    : COLORS.panelBgSoft
                    }
                />

                <InfoTile
                    label="Kontogrösse"
                    value={accountSizeLabel}
                    hint="Account Grösse"
                    color={COLORS.purple}
                    borderColor="rgba(167, 139, 250, 0.22)"
                    background="rgba(167, 139, 250, 0.04)"
                />

                <InfoTile
                    label="Start Balance"
                    value={formatCurrency(startBalance)}
                    hint={
                        balanceSummary.firstTimestamp
                            ? `Erster Eintrag ${formatDateTimeLocal(balanceSummary.firstTimestamp)}`
                            : "Startwert"
                    }
                    color={COLORS.yellow}
                    borderColor="rgba(250, 204, 21, 0.22)"
                    background="rgba(250, 204, 21, 0.04)"
                />

                <InfoTile
                    label="Live Balance"
                    value={formatCurrency(currentBalance)}
                    hint={
                        balanceSummary.lastTimestamp
                            ? `Letzter Eintrag ${formatDateTimeLocal(balanceSummary.lastTimestamp)}`
                            : "Aktueller Wert"
                    }
                    color={COLORS.accent}
                    borderColor="rgba(34, 211, 238, 0.22)"
                    background="rgba(34, 211, 238, 0.04)"
                />

                <InfoTile
                    label="Delta"
                    value={balanceDelta === null ? "–" : formatSignedCurrency(balanceDelta)}
                    hint="Aktuell minus Start"
                    color={balanceDelta !== null && balanceDelta < 0 ? COLORS.danger : COLORS.positive}
                    borderColor={
                        balanceDelta !== null && balanceDelta < 0
                            ? "rgba(239, 68, 68, 0.22)"
                            : "rgba(34, 197, 94, 0.22)"
                    }
                    background={
                        balanceDelta !== null && balanceDelta < 0
                            ? "rgba(239, 68, 68, 0.04)"
                            : "rgba(34, 197, 94, 0.04)"
                    }
                />

                <InfoTile
                    label="Balance Rows"
                    value={String(isAtasZeroState ? 0 : rows.length)}
                    hint="Account Balance History"
                    color={COLORS.text}
                />

                <InfoTile
                    label="Orders / Fills"
                    value={`${ordersCount} / ${fillsCount}`}
                    hint="Aktive Datenbasis"
                    color={COLORS.text}
                />
            </div>
        </section>
    );
}