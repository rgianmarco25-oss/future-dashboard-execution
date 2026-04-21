import { useEffect, useMemo, useState } from "react";
import { getLiveAccountSnapshot } from "../utils/storage";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";

const COLORS = {
    panelBg: "rgba(8, 15, 37, 0.92)",
    panelBgSoft: "rgba(255, 255, 255, 0.04)",
    panelBgStrong: "rgba(20, 30, 55, 0.96)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    title: "#e0f2fe",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    danger: "#ef4444",
    cyan: "#22d3ee",
    yellow: "#facc15",
    purple: "#a78bfa",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeProvider(value) {
    const lower = cleanString(value).toLowerCase();

    if (!lower) {
        return "";
    }

    if (lower.includes("atas")) {
        return "atas";
    }

    if (lower.includes("trado")) {
        return "tradovate";
    }

    return lower;
}

function formatProviderLabel(value) {
    const provider = normalizeProvider(value);

    if (provider === "atas") {
        return "ATAS";
    }

    if (provider === "tradovate") {
        return "Tradovate";
    }

    return provider ? provider.toUpperCase() : "Tradovate";
}

function resolvePanelProvider(props, account, snapshot) {
    const candidates = [
        props?.provider,
        props?.activeProvider,
        props?.dataProvider,
        props?.sourceProvider,
        snapshot?.dataProvider,
        account?.provider,
        account?.activeProvider,
        account?.dataProvider,
        account?.sourceProvider,
        account?.platform,
        account?.broker,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeProvider(candidate);

        if (normalized) {
            return normalized;
        }
    }

    return "tradovate";
}

function looksLikeInternalAccountId(value) {
    const text = cleanString(value);

    if (!text) {
        return false;
    }

    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
        /^acc-\d+-[a-z0-9]+$/i.test(text)
    );
}

function hasImportRows(importEntry) {
    if (!importEntry || typeof importEntry !== "object") {
        return false;
    }

    if (Array.isArray(importEntry.rows) && importEntry.rows.length) {
        return true;
    }

    if (Array.isArray(importEntry.previewRows) && importEntry.previewRows.length) {
        return true;
    }

    if (Array.isArray(importEntry.headers) && importEntry.headers.length) {
        return true;
    }

    if (cleanString(importEntry.rawText)) {
        return true;
    }

    return false;
}

function looksLikeImportCollection(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return (
        Object.prototype.hasOwnProperty.call(value, "orders") ||
        Object.prototype.hasOwnProperty.call(value, "trades") ||
        Object.prototype.hasOwnProperty.call(value, "cashHistory") ||
        Object.prototype.hasOwnProperty.call(value, "dailySummary") ||
        Object.prototype.hasOwnProperty.call(value, "performance") ||
        Object.prototype.hasOwnProperty.call(value, "positionHistory")
    );
}

function hasImportCollectionContent(value) {
    if (!looksLikeImportCollection(value)) {
        return false;
    }

    const keys = [
        "orders",
        "trades",
        "cashHistory",
        "dailySummary",
        "performance",
        "positionHistory",
    ];

    return keys.some((key) => hasImportRows(value?.[key]));
}

function resolveImportsForProvider(provider, ...sources) {
    const normalizedProvider = normalizeProvider(provider);

    for (const source of sources) {
        if (!source || typeof source !== "object") {
            continue;
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.[normalizedProvider])
        ) {
            return source[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.byProvider?.[normalizedProvider])
        ) {
            return source.byProvider[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.importsByProvider?.[normalizedProvider])
        ) {
            return source.importsByProvider[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.providers?.[normalizedProvider])
        ) {
            return source.providers[normalizedProvider];
        }

        if (hasImportCollectionContent(source)) {
            return source;
        }
    }

    for (const source of sources) {
        if (looksLikeImportCollection(source)) {
            return source;
        }
    }

    return {};
}

function loadParsedImportsForProvider(accountId, provider) {
    if (typeof csvImportUtils.getAllParsedImports !== "function") {
        return {};
    }

    const attempts = [
        () => csvImportUtils.getAllParsedImports(accountId, { provider }),
        () => csvImportUtils.getAllParsedImports(accountId, provider),
        () => csvImportUtils.getAllParsedImports(accountId),
    ];

    let fallback = {};

    for (const attempt of attempts) {
        try {
            const result = attempt();

            if (!result || typeof result !== "object") {
                continue;
            }

            const scoped = resolveImportsForProvider(provider, result);

            if (hasImportCollectionContent(scoped)) {
                return scoped;
            }

            if (hasImportCollectionContent(result)) {
                return result;
            }

            if (!Array.isArray(result) && Object.keys(result).length) {
                fallback = result;
            }
        } catch {
            continue;
        }
    }

    return fallback;
}

function getImportEventNames(provider) {
    const names = new Set([
        "tradovate-csv-imports-updated",
        "csv-imports-updated",
    ]);

    const normalizedProvider = normalizeProvider(provider);

    if (normalizedProvider) {
        names.add(`${normalizedProvider}-csv-imports-updated`);
    }

    if (typeof csvImportUtils.getCsvImportEventName === "function") {
        const attempts = [
            () => csvImportUtils.getCsvImportEventName({ provider: normalizedProvider }),
            () => csvImportUtils.getCsvImportEventName(normalizedProvider),
            () => csvImportUtils.getCsvImportEventName(),
        ];

        attempts.forEach((attempt) => {
            try {
                const value = cleanString(attempt());
                if (value) {
                    names.add(value);
                }
            } catch {
                return;
            }
        });
    }

    return Array.from(names);
}

function callBuildCashHistoryData(imports, accountId, provider) {
    if (typeof csvImportUtils.buildCashHistoryData !== "function") {
        return { entries: [], fileName: "", importedAt: "" };
    }

    const attempts = [
        () => csvImportUtils.buildCashHistoryData(imports, accountId, { provider }),
        () => csvImportUtils.buildCashHistoryData(imports, accountId, provider),
        () => csvImportUtils.buildCashHistoryData(imports, accountId),
    ];

    for (const attempt of attempts) {
        try {
            const result = attempt();

            if (result && typeof result === "object") {
                return result;
            }
        } catch {
            continue;
        }
    }

    return { entries: [], fileName: "", importedAt: "" };
}

function buildFlexibleSource(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

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
        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

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

function getExplicitStartingBalanceValue(row) {
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

function buildBaseBalanceEntries(rows) {
    const safeRows = sortBalanceRows(rows);
    let previousCurrent = null;

    return safeRows.map((row) => {
        const timestamp = getBalanceTimestamp(row);
        const explicitStart = getExplicitStartingBalanceValue(row);
        const netChange = getBalanceNetChange(row);

        let start = explicitStart;
        let current = getBalanceValue(row);

        if ((start === null || start === undefined) && previousCurrent !== null) {
            start = previousCurrent;
        }

        if (
            (current === null || current === undefined) &&
            start !== null &&
            start !== undefined &&
            netChange !== null
        ) {
            current = start + netChange;
        }

        if (
            (start === null || start === undefined) &&
            current !== null &&
            current !== undefined &&
            netChange !== null
        ) {
            start = current - netChange;
        }

        const delta =
            netChange !== null
                ? netChange
                : start !== null &&
                    start !== undefined &&
                    current !== null &&
                    current !== undefined
                    ? current - start
                    : null;

        if (current !== null && current !== undefined) {
            previousCurrent = current;
        }

        return {
            raw: row,
            timestamp,
            start,
            current,
            delta,
        };
    });
}

function resolveDisplayStartBalance(account, snapshot, entries) {
    for (const entry of entries) {
        if (entry.start !== null && entry.start !== undefined) {
            return entry.start;
        }
    }

    const snapshotStartingBalance = parseFlexibleNumber(snapshot?.startingBalance);
    if (snapshotStartingBalance !== null) {
        return snapshotStartingBalance;
    }

    const accountStartingBalance = parseFlexibleNumber(account?.startingBalance);
    if (accountStartingBalance !== null) {
        return accountStartingBalance;
    }

    const accountSize = parseFlexibleNumber(account?.accountSize);
    if (accountSize !== null) {
        return accountSize;
    }

    for (const entry of entries) {
        if (entry.current !== null && entry.current !== undefined) {
            return entry.current;
        }
    }

    return null;
}

function resolveDisplayCurrentBalance(account, snapshot, entries) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.current !== null && entry.current !== undefined) {
            return entry.current;
        }
    }

    const snapshotCurrentBalance = parseFlexibleNumber(snapshot?.currentBalance);
    if (snapshotCurrentBalance !== null) {
        return snapshotCurrentBalance;
    }

    const accountCurrentBalance = parseFlexibleNumber(account?.currentBalance);
    if (accountCurrentBalance !== null) {
        return accountCurrentBalance;
    }

    const accountStartingBalance = parseFlexibleNumber(account?.startingBalance);
    if (accountStartingBalance !== null) {
        return accountStartingBalance;
    }

    const accountSize = parseFlexibleNumber(account?.accountSize);
    if (accountSize !== null) {
        return accountSize;
    }

    return null;
}

function finalizeBalanceEntries(entries, fallbackStartBalance, fallbackCurrentBalance) {
    let previousCurrent = null;

    return entries.map((entry, index) => {
        let start = entry.start;
        let current = entry.current;
        let delta = entry.delta;

        if ((start === null || start === undefined) && previousCurrent !== null) {
            start = previousCurrent;
        }

        if ((start === null || start === undefined) && index === 0) {
            start = fallbackStartBalance;
        }

        if (
            (current === null || current === undefined) &&
            start !== null &&
            start !== undefined &&
            delta !== null &&
            delta !== undefined
        ) {
            current = start + delta;
        }

        if ((current === null || current === undefined) && index === entries.length - 1) {
            current = fallbackCurrentBalance;
        }

        if (
            (delta === null || delta === undefined) &&
            start !== null &&
            start !== undefined &&
            current !== null &&
            current !== undefined
        ) {
            delta = current - start;
        }

        if (current !== null && current !== undefined) {
            previousCurrent = current;
        }

        return {
            ...entry,
            start,
            current,
            delta,
        };
    });
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
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    const numeric = Number(value);
    const absolute = formatCurrency(Math.abs(numeric));

    return numeric >= 0 ? `+${absolute}` : `-${absolute}`;
}

function formatDateTimeLocal(value) {
    if (!value) {
        return "–";
    }

    const date = value instanceof Date ? value : toDateOrNull(value);

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

function getProviderAccountId(account, provider) {
    if (normalizeProvider(provider) === "atas") {
        return (
            cleanString(account?.atasAccountId) ||
            cleanString(account?.dataProviderAccountId) ||
            cleanString(account?.atasAccountName) ||
            cleanString(account?.dataProviderAccountName) ||
            cleanString(account?.displayName) ||
            cleanString(account?.id)
        );
    }

    const candidates = [
        account?.tradovateAccountId,
        account?.tradingAccountId,
        account?.tradovateAccountName,
        account?.tradingAccountName,
        account?.displayName,
        account?.accountName,
    ]
        .map(cleanString)
        .filter(Boolean)
        .filter((value) => !looksLikeInternalAccountId(value));

    return candidates[0] || cleanString(account?.id);
}

function getProviderAccountName(account, provider) {
    if (normalizeProvider(provider) === "atas") {
        return (
            cleanString(account?.atasAccountName) ||
            cleanString(account?.dataProviderAccountName) ||
            cleanString(account?.atasAccountId) ||
            cleanString(account?.dataProviderAccountId) ||
            cleanString(account?.displayName) ||
            cleanString(account?.id)
        );
    }

    const candidates = [
        account?.tradovateAccountName,
        account?.tradingAccountName,
        account?.tradovateAccountId,
        account?.tradingAccountId,
        account?.displayName,
        account?.accountName,
    ]
        .map(cleanString)
        .filter(Boolean)
        .filter((value) => !looksLikeInternalAccountId(value));

    return candidates[0] || cleanString(account?.id);
}

function getSnapshotProviderAccountId(snapshot, account, provider) {
    if (normalizeProvider(provider) === "atas") {
        return (
            cleanString(snapshot?.atasAccountId) ||
            cleanString(snapshot?.dataProviderAccountId) ||
            getProviderAccountId(account, provider)
        );
    }

    return (
        cleanString(snapshot?.tradovateAccountId) ||
        cleanString(snapshot?.tradingAccountId) ||
        getProviderAccountId(account, provider)
    );
}

function getSnapshotProviderAccountName(snapshot, account, provider) {
    if (normalizeProvider(provider) === "atas") {
        return (
            cleanString(snapshot?.atasAccountName) ||
            cleanString(snapshot?.dataProviderAccountName) ||
            cleanString(snapshot?.atasAccountId) ||
            cleanString(snapshot?.dataProviderAccountId) ||
            getProviderAccountName(account, provider)
        );
    }

    return (
        cleanString(snapshot?.tradovateAccountName) ||
        cleanString(snapshot?.tradingAccountName) ||
        cleanString(snapshot?.tradovateAccountId) ||
        cleanString(snapshot?.tradingAccountId) ||
        getProviderAccountName(account, provider)
    );
}

function resolveScopeAccountId(account, provider, snapshot) {
    const providerSpecific = getSnapshotProviderAccountId(snapshot, account, provider);

    if (providerSpecific && !looksLikeInternalAccountId(providerSpecific)) {
        return providerSpecific;
    }

    const candidates = [
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.tradingAccountKey,
        account?.resolvedAccountId,
        account?.apexId,
        account?.accountId,
        account?.displayName,
        account?.name,
    ]
        .map(cleanString)
        .filter(Boolean);

    for (const candidate of candidates) {
        if (looksLikeInternalAccountId(candidate)) {
            continue;
        }

        return candidate;
    }

    return "";
}

function getLiveBalanceRows(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return [];
    }

    const sources = [
        snapshot.balanceHistory,
        snapshot.cashHistory,
        snapshot.accountBalanceHistory,
        snapshot.balanceRows,
        snapshot.cashRows,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source;
        }
    }

    return [];
}

function MetricTile({
    label,
    value,
    hint = "",
    valueColor = COLORS.text,
    borderColor = COLORS.border,
    background = "rgba(15, 23, 42, 0.42)",
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
                    color: valueColor,
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

function EmptyState({ title, text }) {
    return (
        <div
            style={{
                borderRadius: 22,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBg,
                padding: 24,
                color: COLORS.text,
                boxShadow: COLORS.shadow,
            }}
        >
            <div style={{ color: COLORS.title, fontSize: 18, fontWeight: 800 }}>
                {title}
            </div>
            <div
                style={{
                    marginTop: 8,
                    color: COLORS.muted,
                    fontSize: 14,
                    lineHeight: 1.6,
                }}
            >
                {text}
            </div>
        </div>
    );
}

export default function AccountBalancePanel({
    account = null,
    accountBalanceHistory = [],
    localImports: localImportsProp = null,
    parentImports = null,
    effectiveImports: effectiveImportsProp = null,
    provider: providerProp = "",
    activeProvider = "",
}) {
    const accountId = cleanString(account?.id);

    const liveSnapshot = useMemo(() => {
        if (!accountId) {
            return null;
        }

        return getLiveAccountSnapshot(accountId) || null;
    }, [accountId]);

    const provider = useMemo(() => {
        return resolvePanelProvider(
            {
                provider: providerProp,
                activeProvider,
            },
            account,
            liveSnapshot
        );
    }, [providerProp, activeProvider, account, liveSnapshot]);

    const providerLabel = useMemo(() => {
        return formatProviderLabel(provider);
    }, [provider]);

    const displayAccountName = useMemo(() => {
        return (
            getSnapshotProviderAccountName(liveSnapshot, account, provider) ||
            "Kein Account"
        );
    }, [liveSnapshot, account, provider]);

    const displayTradingRef = useMemo(() => {
        return (
            getSnapshotProviderAccountId(liveSnapshot, account, provider) ||
            "Keine Trading Ref"
        );
    }, [liveSnapshot, account, provider]);

    const scopeAccountId = useMemo(() => {
        return resolveScopeAccountId(account, provider, liveSnapshot);
    }, [account, provider, liveSnapshot]);

    const [localImportState, setLocalImportState] = useState(() => {
        return loadParsedImportsForProvider(accountId, provider);
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const loadImports = () => {
            const nextImports = loadParsedImportsForProvider(accountId, provider);
            setLocalImportState(nextImports);
        };

        const eventNames = getImportEventNames(provider);

        loadImports();

        eventNames.forEach((eventName) => {
            window.addEventListener(eventName, loadImports);
        });

        window.addEventListener("storage", loadImports);
        window.addEventListener("focus", loadImports);

        return () => {
            eventNames.forEach((eventName) => {
                window.removeEventListener(eventName, loadImports);
            });

            window.removeEventListener("storage", loadImports);
            window.removeEventListener("focus", loadImports);
        };
    }, [accountId, provider]);

    const resolvedLocalImports = useMemo(() => {
        return resolveImportsForProvider(provider, localImportsProp, localImportState);
    }, [provider, localImportsProp, localImportState]);

    const resolvedParentImports = useMemo(() => {
        return resolveImportsForProvider(provider, parentImports);
    }, [provider, parentImports]);

    const resolvedEffectiveImports = useMemo(() => {
        return resolveImportsForProvider(provider, effectiveImportsProp);
    }, [provider, effectiveImportsProp]);

    const resolvedImports = useMemo(() => {
        if (hasImportCollectionContent(resolvedEffectiveImports)) {
            return resolvedEffectiveImports;
        }

        return resolveAccountImportsFromSources(
            resolvedLocalImports,
            resolveImportsForProvider(provider, account?.imports),
            hasImportCollectionContent(resolvedParentImports)
                ? resolvedParentImports
                : parentImports
        );
    }, [
        resolvedLocalImports,
        resolvedEffectiveImports,
        resolvedParentImports,
        parentImports,
        provider,
        account?.imports,
    ]);

    const importedCashHistoryData = useMemo(() => {
        return callBuildCashHistoryData(
            resolvedImports,
            scopeAccountId || accountId,
            provider
        );
    }, [resolvedImports, scopeAccountId, accountId, provider]);

    const importedRows = useMemo(() => {
        return Array.isArray(importedCashHistoryData?.entries)
            ? importedCashHistoryData.entries
            : [];
    }, [importedCashHistoryData]);

    const liveRows = useMemo(() => {
        return getLiveBalanceRows(liveSnapshot);
    }, [liveSnapshot]);

    const storedRows = useMemo(() => {
        return Array.isArray(accountBalanceHistory) ? accountBalanceHistory : [];
    }, [accountBalanceHistory]);

    const sourceLabel = useMemo(() => {
        if (liveRows.length > 0) {
            return `${providerLabel} Live`;
        }

        if (importedRows.length > 0) {
            return `${providerLabel} Import`;
        }

        if (storedRows.length > 0) {
            return "Storage";
        }

        return "Keine Daten";
    }, [liveRows, importedRows, storedRows, providerLabel]);

    const rawRows = useMemo(() => {
        if (liveRows.length > 0) {
            return liveRows;
        }

        if (importedRows.length > 0) {
            return importedRows;
        }

        return storedRows;
    }, [liveRows, importedRows, storedRows]);

    const baseEntries = useMemo(() => {
        return buildBaseBalanceEntries(rawRows);
    }, [rawRows]);

    const startBalance = useMemo(() => {
        return resolveDisplayStartBalance(account, liveSnapshot, baseEntries);
    }, [account, liveSnapshot, baseEntries]);

    const currentBalance = useMemo(() => {
        return resolveDisplayCurrentBalance(account, liveSnapshot, baseEntries);
    }, [account, liveSnapshot, baseEntries]);

    const rows = useMemo(() => {
        return finalizeBalanceEntries(baseEntries, startBalance, currentBalance);
    }, [baseEntries, startBalance, currentBalance]);

    const delta = useMemo(() => {
        return (
            startBalance !== null &&
                startBalance !== undefined &&
                currentBalance !== null &&
                currentBalance !== undefined
                ? currentBalance - startBalance
                : null
        );
    }, [startBalance, currentBalance]);

    const fileName = cleanString(importedCashHistoryData?.fileName);
    const importedAt = cleanString(importedCashHistoryData?.importedAt);
    const lastSyncAt = cleanString(liveSnapshot?.lastSyncAt || account?.lastSyncAt);

    if (!account?.id) {
        return (
            <EmptyState
                title="Kein aktiver Account"
                text="Wähle zuerst einen Account aus. Danach erscheint hier die Account Balance History."
            />
        );
    }

    return (
        <div
            style={{
                borderRadius: 22,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBg,
                boxShadow: COLORS.shadow,
                padding: 18,
                display: "grid",
                gap: 16,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 18,
                            fontWeight: 800,
                            lineHeight: 1.25,
                        }}
                    >
                        Account Balance
                    </div>

                    <div
                        style={{
                            marginTop: 4,
                            color: COLORS.text,
                            fontSize: 13,
                            lineHeight: 1.5,
                            wordBreak: "break-word",
                        }}
                    >
                        Account: {displayAccountName}
                    </div>

                    <div
                        style={{
                            marginTop: 4,
                            color: COLORS.muted,
                            fontSize: 13,
                            lineHeight: 1.5,
                            wordBreak: "break-word",
                        }}
                    >
                        Trading Ref: {displayTradingRef}
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
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: `1px solid ${COLORS.borderStrong}`,
                            background: "rgba(255,255,255,0.04)",
                            color: normalizeProvider(provider) === "atas" ? COLORS.purple : COLORS.cyan,
                            fontSize: 12,
                            fontWeight: 700,
                        }}
                    >
                        {providerLabel}
                    </div>

                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: `1px solid ${COLORS.borderStrong}`,
                            background: "rgba(255,255,255,0.04)",
                            color: COLORS.text,
                            fontSize: 12,
                            fontWeight: 700,
                        }}
                    >
                        {rows.length > 0 ? `Rows ${rows.length}` : "Keine Rows"}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                }}
            >
                <MetricTile
                    label="Start Balance"
                    value={formatCurrency(startBalance)}
                    hint={
                        rows.length > 0
                            ? `Erster Eintrag ${formatDateTimeLocal(rows[0]?.timestamp)}`
                            : "Kein Startwert"
                    }
                    valueColor={COLORS.yellow}
                    borderColor="rgba(250, 204, 21, 0.22)"
                    background="rgba(250, 204, 21, 0.04)"
                />

                <MetricTile
                    label="Aktuelle Balance"
                    value={formatCurrency(currentBalance)}
                    hint={
                        rows.length > 0
                            ? `Letzter Eintrag ${formatDateTimeLocal(
                                rows[rows.length - 1]?.timestamp
                            )}`
                            : lastSyncAt
                                ? `Sync ${formatDateTimeLocal(lastSyncAt)}`
                                : "Kein aktueller Wert"
                    }
                    valueColor={COLORS.cyan}
                    borderColor="rgba(34, 211, 238, 0.22)"
                    background="rgba(34, 211, 238, 0.04)"
                />

                <MetricTile
                    label="Delta"
                    value={formatSignedCurrency(delta)}
                    hint="Aktuell minus Start"
                    valueColor={delta !== null && delta < 0 ? COLORS.danger : COLORS.positive}
                    borderColor={
                        delta !== null && delta < 0
                            ? "rgba(239, 68, 68, 0.22)"
                            : "rgba(34, 197, 94, 0.22)"
                    }
                    background={
                        delta !== null && delta < 0
                            ? "rgba(239, 68, 68, 0.04)"
                            : "rgba(34, 197, 94, 0.04)"
                    }
                />

                <MetricTile
                    label="Quelle"
                    value={sourceLabel}
                    hint={
                        sourceLabel.includes("Import")
                            ? importedAt
                                ? formatDateTimeLocal(importedAt)
                                : "Kein Zeitstempel"
                            : lastSyncAt
                                ? `Sync ${formatDateTimeLocal(lastSyncAt)}`
                                : "Kein Zeitstempel"
                    }
                    valueColor={COLORS.text}
                    borderColor={COLORS.border}
                    background="rgba(255,255,255,0.03)"
                />

                <MetricTile
                    label="Datei"
                    value={fileName || "–"}
                    hint={fileName ? `${providerLabel} Cash History` : "Keine Importdatei"}
                    valueColor={COLORS.text}
                    borderColor={COLORS.border}
                    background="rgba(255,255,255,0.03)"
                />
            </div>

            <div
                style={{
                    borderRadius: 18,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.panelBgSoft,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        padding: "14px 16px",
                        borderBottom: `1px solid ${COLORS.border}`,
                        color: COLORS.title,
                        fontSize: 15,
                        fontWeight: 800,
                    }}
                >
                    Balance Verlauf
                </div>

                {rows.length === 0 ? (
                    <div
                        style={{
                            padding: 16,
                            color: COLORS.muted,
                            fontSize: 13,
                        }}
                    >
                        Keine Account Balance History vorhanden.
                    </div>
                ) : (
                    <div
                        style={{
                            overflowX: "auto",
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 760,
                            }}
                        >
                            <thead>
                                <tr>
                                    {["Zeit", "Start", "Aktuell", "Delta", "Quelle"].map((label) => (
                                        <th
                                            key={label}
                                            style={{
                                                textAlign: "left",
                                                padding: "10px 14px",
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((row, index) => (
                                    <tr key={`balance-row-${index}`}>
                                        <td
                                            style={{
                                                padding: "12px 14px",
                                                color: COLORS.text,
                                                fontSize: 13,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatDateTimeLocal(row.timestamp)}
                                        </td>

                                        <td
                                            style={{
                                                padding: "12px 14px",
                                                color: COLORS.yellow,
                                                fontSize: 13,
                                                fontWeight: 700,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatCurrency(row.start)}
                                        </td>

                                        <td
                                            style={{
                                                padding: "12px 14px",
                                                color: COLORS.cyan,
                                                fontSize: 13,
                                                fontWeight: 700,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatCurrency(row.current)}
                                        </td>

                                        <td
                                            style={{
                                                padding: "12px 14px",
                                                color:
                                                    row.delta !== null && row.delta < 0
                                                        ? COLORS.danger
                                                        : COLORS.positive,
                                                fontSize: 13,
                                                fontWeight: 700,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatSignedCurrency(row.delta)}
                                        </td>

                                        <td
                                            style={{
                                                padding: "12px 14px",
                                                color: COLORS.muted,
                                                fontSize: 13,
                                                borderBottom: `1px solid ${COLORS.border}`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {sourceLabel}
                                        </td>
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