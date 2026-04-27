import { useEffect, useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";
import { getLiveAccountSnapshot } from "../utils/storage";
import {
    getActiveProvider,
    getStrictProviderAccountId,
    getStrictProviderDisplayName,
    getStrictProviderTradingRef,
    shouldUseAtasZeroState,
} from "../utils/providerDisplay";
import {
    fetchAtasHistoryTrades,
    getAtasHistoryStartDate,
} from "../utils/atasBridgeApi";

const EMPTY_LIST = [];
const ATAS_HISTORY_START_DATE = getAtasHistoryStartDate();

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
    cyan: "#22d3ee",
    purple: "#a78bfa",
    cardBg: "rgba(15, 23, 42, 0.72)",
    cardBgSoft: "rgba(15, 23, 42, 0.5)",
    cardBgStrong: "rgba(15, 23, 42, 0.9)",
    tableHead: "rgba(15, 23, 42, 0.92)",
    rowAlt: "rgba(15, 23, 42, 0.35)",
    accentGlow: "rgba(125, 211, 252, 0.12)",
};

const MICRO_CONTRACT_PREFIXES = [
    "MNQ",
    "MES",
    "MYM",
    "M2K",
    "MCL",
    "MGC",
    "M6E",
    "M6B",
    "M6A",
    "M6J",
];

const CONTRACT_PREFIXES = [
    "MNQ",
    "NQ",
    "MES",
    "ES",
    "MYM",
    "YM",
    "M2K",
    "RTY",
    "MCL",
    "CL",
    "MGC",
    "GC",
    "M6E",
    "6E",
    "M6B",
    "6B",
    "M6A",
    "6A",
    "M6J",
    "6J",
];

const MICRO_TO_FULL_PREFIX = {
    MNQ: "NQ",
    MES: "ES",
    MYM: "YM",
    M2K: "RTY",
    MCL: "CL",
    MGC: "GC",
    M6E: "6E",
    M6B: "6B",
    M6A: "6A",
    M6J: "6J",
};

const FULL_TO_MICRO_PREFIX = Object.fromEntries(
    Object.entries(MICRO_TO_FULL_PREFIX).map(([micro, full]) => [full, micro])
);

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

function resolvePanelProvider(props, resolvedAccount, liveSnapshot) {
    const fallback =
        props?.provider ||
        props?.activeProvider ||
        props?.dataProvider ||
        props?.sourceProvider ||
        "tradovate";

    return getActiveProvider(resolvedAccount, liveSnapshot, fallback);
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function formatNumber(value, decimals = 2) {
    const num = Number(value ?? 0);

    if (!Number.isFinite(num)) {
        return "0.00";
    }

    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

function formatInteger(value) {
    const num = Number(value ?? 0);

    if (!Number.isFinite(num)) {
        return "0";
    }

    return new Intl.NumberFormat("de-CH", {
        maximumFractionDigits: 0,
    }).format(num);
}

function formatDateLabel(value) {
    if (!value) {
        return "–";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return cleanString(value) || "–";
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function toTimeMs(value) {
    const text = cleanString(value);

    if (!text) {
        return 0;
    }

    const time = new Date(text).getTime();

    return Number.isFinite(time) ? time : 0;
}

function normalizeContractText(value) {
    const text = cleanString(value).toUpperCase();

    if (!text) {
        return "";
    }

    return text
        .replace("@CME", "")
        .replace("@CBOT", "")
        .replace("@NYMEX", "")
        .replace("@COMEX", "")
        .replace("@ICE", "")
        .replace("@SIM", "")
        .replace(".SIM", "")
        .replace("-SIM", "")
        .replace("_SIM", "")
        .replace(/\s+/g, "")
        .trim();
}

function extractContractSymbol(value) {
    const normalized = normalizeContractText(value);

    if (!normalized) {
        return "";
    }

    const contractMatch = normalized.match(
        /(MNQ|NQ|MES|ES|MYM|YM|M2K|RTY|MCL|CL|MGC|GC|M6E|6E|M6B|6B|M6A|6A|M6J|6J)[A-Z]\d{1,2}/
    );

    if (contractMatch) {
        return contractMatch[0];
    }

    const directPrefix = CONTRACT_PREFIXES.find((prefix) =>
        normalized.startsWith(prefix)
    );

    if (directPrefix) {
        return normalized;
    }

    return normalized;
}

function getContractPrefix(value) {
    const normalized = extractContractSymbol(value);

    if (!normalized) {
        return "";
    }

    return CONTRACT_PREFIXES.find((prefix) =>
        normalized.startsWith(prefix)
    ) || "";
}

function getContractFamilyKey(value) {
    const prefix = getContractPrefix(value);

    if (!prefix) {
        return "";
    }

    return MICRO_TO_FULL_PREFIX[prefix] || prefix;
}

function isMicroContract(value) {
    const normalized = extractContractSymbol(value);

    return MICRO_CONTRACT_PREFIXES.some((prefix) =>
        normalized.startsWith(prefix)
    );
}

function reduceContractsWithMicroPriority(values) {
    const contracts = values
        .map(extractContractSymbol)
        .filter(Boolean)
        .filter((value) => value !== "–");

    if (!contracts.length) {
        return EMPTY_LIST;
    }

    const uniqueContracts = [...new Set(contracts)];

    const microFamilies = new Set(
        uniqueContracts
            .filter(isMicroContract)
            .map(getContractFamilyKey)
            .filter(Boolean)
    );

    return uniqueContracts.filter((contract) => {
        const prefix = getContractPrefix(contract);
        const family = getContractFamilyKey(contract);

        if (!prefix || !family) {
            return true;
        }

        if (!microFamilies.has(family)) {
            return true;
        }

        if (isMicroContract(contract)) {
            return true;
        }

        return !FULL_TO_MICRO_PREFIX[prefix];
    });
}

function pickBestContract(values) {
    const contracts = reduceContractsWithMicroPriority(values);

    if (!contracts.length) {
        return "";
    }

    const microContract = contracts.find(isMicroContract);

    if (microContract) {
        return microContract;
    }

    return contracts[0];
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

function callImportBuilder(builderName, imports, accountId, provider) {
    const builder = csvImportUtils?.[builderName];

    if (typeof builder !== "function") {
        return { entries: EMPTY_LIST };
    }

    const attempts = [
        () => builder(imports, accountId, { provider }),
        () => builder(imports, accountId, provider),
        () => builder(imports, accountId),
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

    return { entries: EMPTY_LIST };
}
function resolveLastTradeTime(closedTrades, fills) {
    const tradeTimes = Array.isArray(closedTrades)
        ? closedTrades
            .map((trade) => trade?.exitTime || trade?.entryTime || "")
            .filter(Boolean)
        : EMPTY_LIST;

    const fillTimes = Array.isArray(fills)
        ? fills
            .map(
                (fill) =>
                    fill?.timestamp ||
                    fill?.time ||
                    fill?.fillTime ||
                    fill?.createdAt ||
                    fill?.dateTime ||
                    ""
            )
            .filter(Boolean)
        : EMPTY_LIST;

    const allTimes = [...tradeTimes, ...fillTimes]
        .map((value) => {
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? time : null;
        })
        .filter((value) => value !== null);

    if (allTimes.length === 0) {
        return "";
    }

    return new Date(Math.max(...allTimes)).toISOString();
}

function resolveSymbolSummary(closedTrades, fills) {
    const symbols = [];

    if (Array.isArray(closedTrades)) {
        for (const trade of closedTrades) {
            const symbol = pickBestContract([
                trade?.symbol,
                trade?.instrument,
                trade?.contract,
                trade?.product,
            ]);

            if (symbol) {
                symbols.push(symbol);
            }
        }
    }

    if (Array.isArray(fills)) {
        for (const fill of fills) {
            const symbol = pickBestContract([
                fill?.symbol,
                fill?.instrument,
                fill?.contract,
                fill?.product,
                fill?.securityId,
                fill?.SecurityId,
                fill?.SecurityID,
            ]);

            if (symbol) {
                symbols.push(symbol);
            }
        }
    }

    const uniqueSymbols = reduceContractsWithMicroPriority(symbols);

    if (uniqueSymbols.length === 0) {
        return "Keine Symbole";
    }

    if (uniqueSymbols.length <= 3) {
        return uniqueSymbols.join(", ");
    }

    return `${uniqueSymbols.slice(0, 3).join(", ")} +${uniqueSymbols.length - 3}`;
}

function resolveNetColor(value) {
    if (value > 0) {
        return COLORS.positive;
    }

    if (value < 0) {
        return COLORS.negative;
    }

    return COLORS.text;
}

function resolveWinRate(closedTrades) {
    if (!Array.isArray(closedTrades) || closedTrades.length === 0) {
        return 0;
    }

    const wins = closedTrades.filter(
        (trade) => toNumber(trade?.realizedPnlNet, 0) > 0
    ).length;

    return (wins / closedTrades.length) * 100;
}

function resolveBestTrade(closedTrades) {
    if (!Array.isArray(closedTrades) || closedTrades.length === 0) {
        return 0;
    }

    return closedTrades.reduce((best, trade) => {
        const value = toNumber(trade?.realizedPnlNet, 0);
        return value > best ? value : best;
    }, Number.NEGATIVE_INFINITY);
}

function resolveWorstTrade(closedTrades) {
    if (!Array.isArray(closedTrades) || closedTrades.length === 0) {
        return 0;
    }

    return closedTrades.reduce((worst, trade) => {
        const value = toNumber(trade?.realizedPnlNet, 0);
        return value < worst ? value : worst;
    }, Number.POSITIVE_INFINITY);
}

function resolveStatusLabel(provider, fillCount, closedTradeCount, historyLoading) {
    const providerLabel = formatProviderLabel(provider);

    if (historyLoading) {
        return `${providerLabel} History lädt`;
    }

    if (closedTradeCount > 0) {
        return `${providerLabel} Daten aktiv`;
    }

    if (fillCount > 0) {
        return `${providerLabel} Fills geladen`;
    }

    return `Warte auf ${providerLabel}`;
}

function resolveStatusColor(provider, fillCount, closedTradeCount, historyLoading) {
    if (historyLoading) {
        return COLORS.warning;
    }

    if (closedTradeCount <= 0 && fillCount <= 0) {
        return COLORS.muted;
    }

    if (closedTradeCount <= 0) {
        return COLORS.warning;
    }

    return normalizeProvider(provider) === "atas"
        ? COLORS.purple
        : COLORS.title;
}

function resolveSideTone(side) {
    const text = cleanString(side).toLowerCase();

    if (text.includes("buy") || text.includes("long")) {
        return COLORS.positive;
    }

    if (text.includes("sell") || text.includes("short")) {
        return COLORS.warning;
    }

    return COLORS.text;
}

function truncateMiddle(value, maxLength = 24) {
    const text = cleanString(value);

    if (!text) {
        return "–";
    }

    if (text.length <= maxLength) {
        return text;
    }

    const left = Math.ceil((maxLength - 3) / 2);
    const right = Math.floor((maxLength - 3) / 2);

    return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}

function normalizeLiveClosedTrade(entry, index) {
    const gross =
        entry?.realizedPnlGross ??
        entry?.grossPnL ??
        entry?.grossPnl ??
        entry?.gross ??
        entry?.pnlGross ??
        0;

    const commission =
        entry?.totalCommission ??
        entry?.commission ??
        entry?.commissions ??
        0;

    const net =
        entry?.realizedPnlNet ??
        entry?.netPnL ??
        entry?.netPnl ??
        entry?.net ??
        (toNumber(gross, 0) - toNumber(commission, 0));

    const symbol = pickBestContract([
        entry?.symbol,
        entry?.instrument,
        entry?.contract,
        entry?.product,
        entry?.securityId,
        entry?.SecurityId,
        entry?.SecurityID,
    ]) || "–";

    return {
        tradeId:
            cleanString(entry?.tradeId) ||
            cleanString(entry?.id) ||
            cleanString(entry?.positionId) ||
            `live-closed-trade-${index}`,
        symbol,
        side:
            cleanString(entry?.side) ||
            cleanString(entry?.direction) ||
            cleanString(entry?.action) ||
            "–",
        entryTime:
            entry?.entryTime ||
            entry?.openTime ||
            entry?.openedAt ||
            entry?.createdAt ||
            entry?.timestamp ||
            entry?.time ||
            "",
        exitTime:
            entry?.exitTime ||
            entry?.closeTime ||
            entry?.closedAt ||
            entry?.updatedAt ||
            entry?.timestamp ||
            entry?.time ||
            "",
        entryQty:
            entry?.entryQty ??
            entry?.qty ??
            entry?.quantity ??
            entry?.contracts ??
            0,
        closedQty:
            entry?.closedQty ??
            entry?.exitQty ??
            entry?.qty ??
            entry?.quantity ??
            entry?.contracts ??
            0,
        realizedPnlGross: gross,
        totalCommission: commission,
        realizedPnlNet: net,
        source: cleanString(entry?.source || "live"),
    };
}

function normalizeAtasHistoryTrade(entry, index) {
    const gross =
        entry?.realizedPnlGross ??
        entry?.grossPnL ??
        entry?.grossPnl ??
        entry?.pnl ??
        entry?.PnL ??
        0;

    const commission =
        entry?.totalCommission ??
        entry?.commission ??
        entry?.Commission ??
        0;

    const net =
        entry?.realizedPnlNet ??
        entry?.netPnL ??
        entry?.netPnl ??
        (toNumber(gross, 0) - toNumber(commission, 0));

    const qty =
        entry?.closedQty ??
        entry?.entryQty ??
        entry?.qty ??
        entry?.quantity ??
        0;

    const symbol = pickBestContract([
        entry?.symbol,
        entry?.instrument,
        entry?.contract,
        entry?.product,
        entry?.securityId,
        entry?.SecurityId,
        entry?.SecurityID,
    ]) || "–";

    return {
        tradeId:
            cleanString(entry?.tradeId) ||
            cleanString(entry?.id) ||
            `atas-history-trade-${index}`,
        symbol,
        side:
            cleanString(entry?.side) ||
            cleanString(entry?.direction) ||
            "–",
        entryTime:
            entry?.entryTime ||
            entry?.openTime ||
            entry?.OpenTime ||
            "",
        exitTime:
            entry?.exitTime ||
            entry?.closeTime ||
            entry?.CloseTime ||
            entry?.timestamp ||
            "",
        entryQty: qty,
        closedQty: qty,
        realizedPnlGross: gross,
        totalCommission: commission,
        realizedPnlNet: net,
        source: cleanString(entry?.source || "atas-history"),
    };
}

function dedupeClosedTrades(trades) {
    const map = new Map();

    trades.forEach((trade, index) => {
        if (!trade) {
            return;
        }

        const key =
            cleanString(trade.tradeId) ||
            [
                cleanString(trade.symbol),
                cleanString(trade.side),
                cleanString(trade.entryTime),
                cleanString(trade.exitTime),
                cleanString(trade.closedQty),
                cleanString(trade.realizedPnlNet),
                index,
            ].join("|");

        if (!key) {
            return;
        }

        map.set(key, trade);
    });

    return Array.from(map.values());
}

function sortClosedTradesDesc(trades) {
    return [...trades].sort((a, b) => {
        const timeA = toTimeMs(a?.exitTime || a?.entryTime);
        const timeB = toTimeMs(b?.exitTime || b?.entryTime);

        return timeB - timeA;
    });
}

function getLiveSnapshotFills(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.fills,
        snapshot.fillHistory,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source;
        }
    }

    return EMPTY_LIST;
}

function getLiveSnapshotClosedTrades(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.closedTrades,
        snapshot.trades,
        snapshot.tradeHistory,
        snapshot.journalTrades,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source.map((entry, index) => normalizeLiveClosedTrade(entry, index));
        }
    }

    return EMPTY_LIST;
}

function getDefaultEndDate() {
    return new Date().toISOString().slice(0, 10);
}

export default function JournalPanel({
    fills = EMPTY_LIST,
    importedFills = EMPTY_LIST,
    csvFills = EMPTY_LIST,
    imports: importsProp = null,
    effectiveImports: effectiveImportsProp = null,
    provider: providerProp = "",
    activeProvider = "",
    accountId = "",
    activeAccountId = "",
    selectedAccountId = "",
    resolvedAccountId = "",
    activeAccount = null,
    account = null,
    selectedAccount = null,
    title = "Journal",
}) {
    const resolvedAccount =
        account ||
        activeAccount ||
        selectedAccount ||
        null;

    const resolvedAppAccountId =
        cleanString(resolvedAccountId) ||
        cleanString(accountId) ||
        cleanString(activeAccountId) ||
        cleanString(selectedAccountId) ||
        cleanString(resolvedAccount?.resolvedAccountId) ||
        cleanString(resolvedAccount?.id) ||
        "";

    const liveSnapshot = useMemo(() => {
        if (!resolvedAppAccountId) {
            return null;
        }

        return getLiveAccountSnapshot(resolvedAppAccountId) || null;
    }, [resolvedAppAccountId]);

    const provider = resolvePanelProvider(
        {
            provider: providerProp,
            activeProvider,
        },
        resolvedAccount,
        liveSnapshot
    );

    const providerLabel = formatProviderLabel(provider);
    const isAtasProvider = normalizeProvider(provider) === "atas";

    const forceAtasZeroState = useMemo(() => {
        return shouldUseAtasZeroState(resolvedAccount, liveSnapshot, provider);
    }, [resolvedAccount, liveSnapshot, provider]);

    const scopeAccountId = useMemo(() => {
        if (forceAtasZeroState) {
            return "";
        }

        return (
            getStrictProviderAccountId(
                resolvedAccount,
                liveSnapshot,
                provider
            ) || cleanString(resolvedAppAccountId)
        );
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider, resolvedAppAccountId]);

    const accountLabel = useMemo(() => {
        if (forceAtasZeroState) {
            return "Kein ATAS Account";
        }

        return (
            getStrictProviderDisplayName(
                resolvedAccount,
                liveSnapshot,
                provider
            ) || "kein Account gewählt"
        );
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider]);

    const tradingRef = useMemo(() => {
        if (forceAtasZeroState) {
            return "Kein ATAS Account";
        }

        return (
            getStrictProviderTradingRef(
                resolvedAccount,
                liveSnapshot,
                provider
            ) || "Keine Trading Ref"
        );
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider]);

    const [historyStartDate, setHistoryStartDate] = useState(ATAS_HISTORY_START_DATE);
    const [historyEndDate, setHistoryEndDate] = useState(getDefaultEndDate);
    const [atasHistoryState, setAtasHistoryState] = useState({
        loading: false,
        error: "",
        trades: EMPTY_LIST,
        readAt: "",
    });

    const [localImports, setLocalImports] = useState(() => {
        return loadParsedImportsForProvider(resolvedAppAccountId, provider);
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const loadImports = () => {
            const nextImports = loadParsedImportsForProvider(resolvedAppAccountId, provider);
            setLocalImports(nextImports);
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
    }, [resolvedAppAccountId, provider]);

    useEffect(() => {
        if (!isAtasProvider || forceAtasZeroState || !scopeAccountId) {
            setAtasHistoryState({
                loading: false,
                error: "",
                trades: EMPTY_LIST,
                readAt: "",
            });
            return undefined;
        }

        const controller = new AbortController();

        setAtasHistoryState((current) => ({
            ...current,
            loading: true,
            error: "",
        }));

        fetchAtasHistoryTrades(
            {
                accountId: scopeAccountId,
                start: historyStartDate || ATAS_HISTORY_START_DATE,
                end: historyEndDate || getDefaultEndDate(),
            },
            controller.signal
        )
            .then((result) => {
                const trades = Array.isArray(result?.trades)
                    ? result.trades.map((trade, index) =>
                        normalizeAtasHistoryTrade(trade, index)
                    )
                    : EMPTY_LIST;

                setAtasHistoryState({
                    loading: false,
                    error: "",
                    trades,
                    readAt: result?.readAt || "",
                });
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                setAtasHistoryState({
                    loading: false,
                    error: cleanString(error?.message) || "ATAS History konnte nicht geladen werden.",
                    trades: EMPTY_LIST,
                    readAt: "",
                });
            });

        return () => {
            controller.abort();
        };
    }, [
        isAtasProvider,
        forceAtasZeroState,
        scopeAccountId,
        historyStartDate,
        historyEndDate,
    ]);

    const resolvedAccountImports = useMemo(() => {
        return resolveImportsForProvider(provider, resolvedAccount?.imports);
    }, [provider, resolvedAccount?.imports]);

    const directImports = useMemo(() => {
        return resolveImportsForProvider(provider, importsProp);
    }, [provider, importsProp]);

    const directEffectiveImports = useMemo(() => {
        return resolveImportsForProvider(provider, effectiveImportsProp);
    }, [provider, effectiveImportsProp]);

    const effectiveImports = useMemo(() => {
        if (hasImportCollectionContent(directEffectiveImports)) {
            return directEffectiveImports;
        }

        return resolveAccountImportsFromSources(
            localImports,
            resolvedAccountImports,
            hasImportCollectionContent(directImports) ? directImports : importsProp
        );
    }, [
        localImports,
        resolvedAccountImports,
        directImports,
        directEffectiveImports,
        importsProp,
    ]);

    const importedFillsData = useMemo(() => {
        if (forceAtasZeroState) {
            return { entries: EMPTY_LIST };
        }

        return callImportBuilder(
            "buildFillsData",
            effectiveImports,
            scopeAccountId || resolvedAppAccountId,
            provider
        );
    }, [forceAtasZeroState, effectiveImports, scopeAccountId, resolvedAppAccountId, provider]);

    const importedFillList = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        if (Array.isArray(importedFills) && importedFills.length > 0) {
            return importedFills;
        }

        if (Array.isArray(fills) && fills.length > 0) {
            return fills;
        }

        if (Array.isArray(csvFills) && csvFills.length > 0) {
            return csvFills;
        }

        if (Array.isArray(importedFillsData?.entries) && importedFillsData.entries.length > 0) {
            return importedFillsData.entries;
        }

        return EMPTY_LIST;
    }, [forceAtasZeroState, importedFills, fills, csvFills, importedFillsData]);

    const liveSnapshotFills = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotFills(liveSnapshot);
    }, [liveSnapshot, forceAtasZeroState]);

    const liveSnapshotClosedTrades = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotClosedTrades(liveSnapshot);
    }, [liveSnapshot, forceAtasZeroState]);

    const effectiveFillList = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        if (isAtasProvider) {
            if (liveSnapshotFills.length > 0) {
                return liveSnapshotFills;
            }

            return importedFillList;
        }

        if (importedFillList.length > 0) {
            return importedFillList;
        }

        return liveSnapshotFills;
    }, [
        forceAtasZeroState,
        isAtasProvider,
        liveSnapshotFills,
        importedFillList,
    ]);

    const analytics = useMemo(() => {
        const safeFills = Array.isArray(effectiveFillList) ? effectiveFillList : EMPTY_LIST;

        return buildFillAnalytics({
            fills: safeFills,
            accountId: resolvedAppAccountId,
        });
    }, [effectiveFillList, resolvedAppAccountId]);

    const analyticsClosedTrades = useMemo(() => {
        const trades = analytics?.closedTrades;
        return Array.isArray(trades) ? trades : EMPTY_LIST;
    }, [analytics?.closedTrades]);

    const historyClosedTrades = useMemo(() => {
        if (!isAtasProvider || forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return Array.isArray(atasHistoryState.trades)
            ? atasHistoryState.trades
            : EMPTY_LIST;
    }, [isAtasProvider, forceAtasZeroState, atasHistoryState.trades]);

    const closedTrades = useMemo(() => {
    if (forceAtasZeroState) {
        return EMPTY_LIST;
    }

    if (isAtasProvider) {
        if (historyClosedTrades.length > 0) {
            return sortClosedTradesDesc(dedupeClosedTrades(historyClosedTrades));
        }

        return sortClosedTradesDesc(
            dedupeClosedTrades([
                ...liveSnapshotClosedTrades,
                ...analyticsClosedTrades,
            ])
        );
    }

    if (analyticsClosedTrades.length > 0) {
        return sortClosedTradesDesc(analyticsClosedTrades);
    }

    return sortClosedTradesDesc(liveSnapshotClosedTrades);
}, [
    forceAtasZeroState,
    isAtasProvider,
    historyClosedTrades,
    liveSnapshotClosedTrades,
    analyticsClosedTrades,
]);

    const displayedHistoryTradeCount = isAtasProvider
        ? closedTrades.length
        : historyClosedTrades.length;

    const fillCount = Array.isArray(effectiveFillList) ? effectiveFillList.length : 0;

    const netPnl = useMemo(() => {
        if (closedTrades.length > 0) {
            return closedTrades.reduce(
                (sum, trade) => sum + toNumber(trade?.realizedPnlNet, 0),
                0
            );
        }

        return toNumber(analytics?.summary?.netPnl, 0);
    }, [closedTrades, analytics?.summary?.netPnl]);

    const grossPnl = useMemo(() => {
        if (closedTrades.length > 0) {
            return closedTrades.reduce(
                (sum, trade) => sum + toNumber(trade?.realizedPnlGross, 0),
                0
            );
        }

        return toNumber(
            analytics?.summary?.grossPnl ??
                analytics?.summary?.realizedPnlGross ??
                analytics?.summary?.pnlGross,
            0
        );
    }, [closedTrades, analytics?.summary]);

    const totalCommission = useMemo(() => {
        if (closedTrades.length > 0) {
            return closedTrades.reduce(
                (sum, trade) => sum + toNumber(trade?.totalCommission, 0),
                0
            );
        }

        return toNumber(
            analytics?.summary?.totalCommission ??
                analytics?.summary?.commission ??
                analytics?.summary?.commissions,
            0
        );
    }, [closedTrades, analytics?.summary]);

    const averageNetPerTrade =
        closedTrades.length > 0 ? netPnl / closedTrades.length : 0;

    const averageCommissionPerTrade =
        closedTrades.length > 0 ? totalCommission / closedTrades.length : 0;

    const lastTradeTime = useMemo(() => {
        return resolveLastTradeTime(closedTrades, effectiveFillList);
    }, [closedTrades, effectiveFillList]);

    const symbolSummary = useMemo(() => {
        return resolveSymbolSummary(closedTrades, effectiveFillList);
    }, [closedTrades, effectiveFillList]);

    const winRate = useMemo(() => {
        return resolveWinRate(closedTrades);
    }, [closedTrades]);

    const bestTrade = useMemo(() => {
        return resolveBestTrade(closedTrades);
    }, [closedTrades]);

    const worstTrade = useMemo(() => {
        return resolveWorstTrade(closedTrades);
    }, [closedTrades]);

    const statusLabel = forceAtasZeroState
        ? "Warte auf ATAS"
        : resolveStatusLabel(
            provider,
            fillCount,
            closedTrades.length,
            atasHistoryState.loading
        );

    const statusColor = forceAtasZeroState
        ? COLORS.muted
        : resolveStatusColor(
            provider,
            fillCount,
            closedTrades.length,
            atasHistoryState.loading
        );

    const recentTrades = useMemo(() => {
        return closedTrades.slice(0, 5);
    }, [closedTrades]);
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
                    marginBottom: 18,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ minWidth: 0 }}>
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
                            lineHeight: 1.45,
                        }}
                    >
                        Closed Trades aus ATAS History, Live Fills und CSV Daten für den aktiven Account.
                    </div>

                    <div
                        style={{
                            color: COLORS.text,
                            marginTop: 10,
                            fontSize: 13,
                            lineHeight: 1.45,
                            wordBreak: "break-word",
                        }}
                    >
                        Account: {accountLabel}
                    </div>

                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 4,
                            fontSize: 12,
                            lineHeight: 1.45,
                            wordBreak: "break-word",
                        }}
                    >
                        Trading Ref: {tradingRef}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    <div
                        style={{
                            ...badgeStyle,
                            color: statusColor,
                        }}
                    >
                        {statusLabel}
                    </div>

                    <div
                        style={{
                            ...badgeStyle,
                            color: isAtasProvider
                                ? COLORS.purple
                                : COLORS.cyan,
                        }}
                    >
                        {providerLabel}
                    </div>

                    <div style={badgeStyle}>
                        {formatInteger(closedTrades.length)} Trades
                    </div>

                    {isAtasProvider ? (
                        <div style={badgeStyle}>
                            History ab {formatDateLabel(historyStartDate)}
                        </div>
                    ) : null}
                </div>
            </div>

            {isAtasProvider ? (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: 10,
                        marginBottom: 18,
                        padding: 14,
                        borderRadius: 18,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.cardBgSoft,
                    }}
                >
                    <label style={filterLabelStyle}>
                        Startdatum
                        <input
                            type="date"
                            value={historyStartDate}
                            min={ATAS_HISTORY_START_DATE}
                            onChange={(event) => setHistoryStartDate(event.target.value)}
                            style={filterInputStyle}
                        />
                    </label>

                    <label style={filterLabelStyle}>
                        Enddatum
                        <input
                            type="date"
                            value={historyEndDate}
                            min={ATAS_HISTORY_START_DATE}
                            onChange={(event) => setHistoryEndDate(event.target.value)}
                            style={filterInputStyle}
                        />
                    </label>

                    <div style={filterInfoStyle}>
                        <div style={filterInfoLabelStyle}>History Trades</div>
                        <div style={filterInfoValueStyle}>
                            {atasHistoryState.loading
                                ? "Lädt..."
                                : formatInteger(displayedHistoryTradeCount)}
                        </div>
                    </div>

                    <div style={filterInfoStyle}>
                        <div style={filterInfoLabelStyle}>Quelle</div>
                        <div style={filterInfoValueStyle}>
                            HistoryMyTrade.cdb
                        </div>
                    </div>

                    {atasHistoryState.error ? (
                        <div
                            style={{
                                ...filterInfoStyle,
                                borderColor: "rgba(239, 68, 68, 0.28)",
                                color: COLORS.negative,
                            }}
                        >
                            {atasHistoryState.error}
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                }}
            >
                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Closed Trades</div>
                    <div style={summaryValueStyle}>
                        {formatInteger(closedTrades.length)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Net PnL</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: resolveNetColor(netPnl),
                        }}
                    >
                        {formatNumber(netPnl, 2)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Ø Net pro Trade</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: resolveNetColor(averageNetPerTrade),
                        }}
                    >
                        {formatNumber(averageNetPerTrade, 2)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Letzter Trade</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            fontSize: 16,
                            lineHeight: 1.35,
                        }}
                    >
                        {lastTradeTime ? formatDateTime(lastTradeTime) : "–"}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.7fr) minmax(300px, 0.95fr)",
                    gap: 16,
                    alignItems: "start",
                }}
            >
                <div
                    style={{
                        background: `linear-gradient(180deg, ${COLORS.cardBgStrong} 0%, rgba(8, 15, 35, 0.94) 100%)`,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 22,
                        overflow: "hidden",
                        minWidth: 0,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: 18,
                            borderBottom: `1px solid ${COLORS.border}`,
                            flexWrap: "wrap",
                            background: "rgba(255, 255, 255, 0.02)",
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 17,
                                    fontWeight: 700,
                                }}
                            >
                                Closed Trades
                            </div>
                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 12,
                                    marginTop: 4,
                                }}
                            >
                                Zeit, Symbol, Side, Qty, Gross, Commission und Net
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            <span style={tableMetaPillStyle}>
                                Provider {providerLabel}
                            </span>
                            <span style={tableMetaPillStyle}>
                                Live Fills {formatInteger(fillCount)}
                            </span>
                            <span style={tableMetaPillStyle}>
                                History {formatInteger(displayedHistoryTradeCount)}
                            </span>
                            <span style={tableMetaPillStyle}>
                                Win Rate {formatNumber(winRate, 1)}%
                            </span>
                            <span style={tableMetaPillStyle}>
                                Kommission {formatNumber(totalCommission, 2)}
                            </span>
                        </div>
                    </div>

                    {closedTrades.length === 0 ? (
                        <div
                            style={{
                                padding: 20,
                                color: COLORS.muted,
                                fontSize: 14,
                            }}
                        >
                            Keine Closed Trades gefunden.
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
                                    minWidth: 1040,
                                }}
                            >
                                <thead
                                    style={{
                                        background: COLORS.tableHead,
                                    }}
                                >
                                    <tr>
                                        <th style={headerCellStyle}>Exit Time</th>
                                        <th style={headerCellStyle}>Symbol</th>
                                        <th style={headerCellStyle}>Side</th>
                                        <th style={headerCellStyle}>Qty</th>
                                        <th style={headerCellStyle}>Gross</th>
                                        <th style={headerCellStyle}>Commission</th>
                                        <th style={headerCellStyle}>Net</th>
                                        <th style={headerCellStyle}>Quelle</th>
                                        <th style={headerCellStyle}>Trade ID</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {closedTrades.map((trade, idx) => (
                                        <tr
                                            key={trade.tradeId || `${trade.symbol}_${idx}`}
                                            style={{
                                                background:
                                                    idx % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                            }}
                                        >
                                            <td style={bodyCellStyle}>
                                                {formatDateTime(trade.exitTime || trade.entryTime)}
                                            </td>

                                            <td style={bodyCellStyle}>
                                                <span style={instrumentTextStyle}>
                                                    {trade.symbol || "–"}
                                                </span>
                                            </td>

                                            <td style={bodyCellStyle}>
                                                <span
                                                    style={{
                                                        ...inlinePillStyle,
                                                        color: resolveSideTone(trade.side),
                                                    }}
                                                >
                                                    {trade.side || "–"}
                                                </span>
                                            </td>

                                            <td style={bodyCellStyle}>
                                                {formatNumber(
                                                    trade.closedQty ?? trade.entryQty,
                                                    0
                                                )}
                                            </td>

                                            <td
                                                style={{
                                                    ...bodyCellStyle,
                                                    color: resolveNetColor(
                                                        toNumber(trade.realizedPnlGross, 0)
                                                    ),
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {formatNumber(trade.realizedPnlGross, 2)}
                                            </td>

                                            <td style={bodyCellStyle}>
                                                {formatNumber(trade.totalCommission, 2)}
                                            </td>

                                            <td
                                                style={{
                                                    ...bodyCellStyle,
                                                    color: resolveNetColor(
                                                        toNumber(trade.realizedPnlNet, 0)
                                                    ),
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {formatNumber(trade.realizedPnlNet, 2)}
                                            </td>

                                            <td style={bodyCellStyle}>
                                                <span style={miniTagStyle}>
                                                    {trade.source || "–"}
                                                </span>
                                            </td>

                                            <td style={bodyCellStyle}>
                                                <span style={monoTextStyle}>
                                                    {truncateMiddle(trade.tradeId, 26)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 14,
                        minWidth: 0,
                    }}
                >
                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Journal Überblick</div>

                        <div style={metaListStyle}>
                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Account</span>
                                <span style={metaValueStyle}>{accountLabel}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Trading Ref</span>
                                <span style={metaValueStyle}>{tradingRef}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Provider</span>
                                <span style={metaValueStyle}>{providerLabel}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Symbole</span>
                                <span style={metaValueStyle}>{symbolSummary}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Live Fills</span>
                                <span style={metaValueStyle}>{formatInteger(fillCount)}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>History Trades</span>
                                <span style={metaValueStyle}>{formatInteger(displayedHistoryTradeCount)}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Zeitraum</span>
                                <span style={metaValueStyle}>
                                    {formatDateLabel(historyStartDate)} bis {formatDateLabel(historyEndDate)}
                                </span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Letzter Trade</span>
                                <span style={metaValueStyle}>
                                    {lastTradeTime ? formatDateTime(lastTradeTime) : "–"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Performance Fokus</div>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Gross PnL</span>
                                    <span
                                        style={{
                                            ...statusRowValueStyle,
                                            color: resolveNetColor(grossPnl),
                                        }}
                                    >
                                        {formatNumber(grossPnl, 2)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Vor Kommission
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Kommission</span>
                                    <span style={statusRowValueStyle}>
                                        {formatNumber(totalCommission, 2)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Summe aller Closed Trades
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Win Rate</span>
                                    <span style={statusRowValueStyle}>
                                        {formatNumber(winRate, 1)}%
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Gewinn Trades im Verhältnis
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Ø Kommission</span>
                                    <span style={statusRowValueStyle}>
                                        {formatNumber(averageCommissionPerTrade, 2)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Pro Closed Trade
                                </div>
                            </div>
                        </div>
                    </div>
                              <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Letzte Trades</div>

                        {recentTrades.length === 0 ? (
                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 13,
                                }}
                            >
                                Keine Aktivität vorhanden.
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 10,
                                }}
                            >
                                {recentTrades.map((trade, index) => {
                                    const recentKey =
                                        trade.tradeId ||
                                        `${trade.symbol || "trade"}_${trade.exitTime || trade.entryTime || index}`;

                                    return (
                                        <div
                                            key={recentKey}
                                            style={recentItemStyle}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    gap: 10,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        color: COLORS.text,
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {trade.symbol || "–"}
                                                </div>

                                                <span
                                                    style={{
                                                        ...inlinePillStyle,
                                                        color: resolveNetColor(
                                                            toNumber(trade.realizedPnlNet, 0)
                                                        ),
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {formatNumber(trade.realizedPnlNet, 2)}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    marginTop: 8,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        alignItems: "center",
                                                        flexWrap: "wrap",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            ...miniTagStyle,
                                                            color: resolveSideTone(trade.side),
                                                        }}
                                                    >
                                                        {trade.side || "–"}
                                                    </span>

                                                    <span style={miniTagStyle}>
                                                        Qty {formatNumber(trade.closedQty ?? trade.entryQty, 0)}
                                                    </span>

                                                    <span style={miniTagStyle}>
                                                        {trade.source || "–"}
                                                    </span>
                                                </div>

                                                <div
                                                    style={{
                                                        color: COLORS.muted,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {formatDateTime(trade.exitTime || trade.entryTime)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Extremwerte</div>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Bester Trade</span>
                                <span
                                    style={{
                                        ...metaValueStyle,
                                        color: resolveNetColor(bestTrade),
                                    }}
                                >
                                    {formatNumber(bestTrade, 2)}
                                </span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Schlechtester Trade</span>
                                <span
                                    style={{
                                        ...metaValueStyle,
                                        color: resolveNetColor(worstTrade),
                                    }}
                                >
                                    {formatNumber(worstTrade, 2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

const filterLabelStyle = {
    display: "grid",
    gap: 6,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 700,
};

const filterInputStyle = {
    width: "100%",
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.04)",
    color: COLORS.text,
    padding: "9px 10px",
    outline: "none",
    fontSize: 12,
};

const filterInfoStyle = {
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.03)",
    padding: 10,
    display: "grid",
    gap: 4,
};

const filterInfoLabelStyle = {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: 700,
};

const filterInfoValueStyle = {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 800,
};

const badgeStyle = {
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 700,
};

const summaryCardStyle = {
    background: COLORS.cardBg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 16,
    minHeight: 94,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
};

const summaryLabelStyle = {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 8,
};

const summaryValueStyle = {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.15,
};

const tableMetaPillStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(15, 23, 42, 0.58)",
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 600,
};

const headerCellStyle = {
    textAlign: "left",
    padding: "13px 14px",
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 700,
    borderBottom: `1px solid ${COLORS.borderStrong}`,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: COLORS.tableHead,
};

const bodyCellStyle = {
    padding: "13px 14px",
    color: COLORS.text,
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
    whiteSpace: "nowrap",
};

const inlinePillStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(15, 23, 42, 0.58)",
    fontSize: 12,
    fontWeight: 700,
};

const instrumentTextStyle = {
    color: COLORS.text,
    fontWeight: 600,
};

const monoTextStyle = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: COLORS.muted,
    fontSize: 12,
};

const sideCardStyle = {
    background: `linear-gradient(180deg, ${COLORS.cardBgStrong} 0%, rgba(10, 18, 38, 0.94) 100%)`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    padding: 16,
    boxShadow: `inset 0 1px 0 ${COLORS.accentGlow}`,
};

const sideCardTitleStyle = {
    color: COLORS.title,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 14,
};

const metaListStyle = {
    display: "grid",
    gap: 10,
};

const metaRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
};

const metaKeyStyle = {
    color: COLORS.muted,
    fontSize: 12,
    flexShrink: 0,
};

const metaValueStyle = {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
    minWidth: 0,
    wordBreak: "break-word",
};

const statusRowCardStyle = {
    background: COLORS.cardBgSoft,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 12,
};

const statusRowHeadStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
};

const statusRowLabelStyle = {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 700,
};

const statusRowValueStyle = {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 700,
};

const statusRowSubTextStyle = {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 6,
};

const recentItemStyle = {
    background: COLORS.cardBgSoft,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 12,
};

const miniTagStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(15, 23, 42, 0.58)",
    color: COLORS.text,
    fontSize: 11,
    fontWeight: 700,
};          