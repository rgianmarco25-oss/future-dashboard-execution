import { useEffect, useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";
import { getFills, getLiveAccountSnapshot } from "../utils/storage";
import {
    emitTradeSelection,
    subscribeTradeSelection,
} from "../utils/tradeSelection";
import {
    getActiveProvider,
    getStrictProviderAccountId,
    getStrictProviderDisplayName,
    getStrictProviderTradingRef,
} from "../utils/providerDisplay";

const EMPTY_LIST = [];

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
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
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
        resolvedAccount?.dataProvider ||
        "tradovate";

    return getActiveProvider(resolvedAccount, liveSnapshot, fallback);
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

function formatInteger(value) {
    return new Intl.NumberFormat("de-CH", {
        maximumFractionDigits: 0,
    }).format(toNumber(value, 0));
}

function formatCurrency(value) {
    return toNumber(value, 0).toLocaleString("de-CH", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatSignedCurrency(value) {
    const numeric = toNumber(value, 0);
    const formatted = formatCurrency(Math.abs(numeric));

    return numeric >= 0 ? `+${formatted}` : `-${formatted}`;
}

function resolvePnlColor(value) {
    const number = toNumber(value, 0);

    if (number > 0) {
        return COLORS.positive;
    }

    if (number < 0) {
        return COLORS.negative;
    }

    return COLORS.text;
}

function getSideColor(side) {
    const text = cleanString(side).toLowerCase();

    if (text === "long" || text.includes("buy")) {
        return COLORS.positive;
    }

    if (text === "short" || text.includes("sell")) {
        return COLORS.warning;
    }

    return COLORS.text;
}

function getSideFromSignedQty(value) {
    const qty = toNumber(value, 0);

    if (qty > 0) {
        return "Long";
    }

    if (qty < 0) {
        return "Short";
    }

    return "Flat";
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
        .replace(/\s+/g, "")
        .trim();
}

function extractContractSymbol(value) {
    const normalized = normalizeContractText(value);

    if (!normalized) {
        return "";
    }

    const directPrefix = CONTRACT_PREFIXES.find((prefix) =>
        normalized.startsWith(prefix)
    );

    if (directPrefix) {
        return normalized;
    }

    const contractMatch = normalized.match(
        /(MNQ|NQ|MES|ES|MYM|YM|M2K|RTY|MCL|CL|MGC|GC|M6E|6E|M6B|6B|M6A|6A|M6J|6J)[A-Z]\d{1,2}/
    );

    if (contractMatch) {
        return contractMatch[0];
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

function collectContractCandidatesFromRow(row) {
    if (!row || typeof row !== "object") {
        return [];
    }

    return [
        row.symbol,
        row.instrument,
        row.contract,
        row.product,
        row.securityId,
        row.SecurityId,
        row.SecurityID,
    ];
}

function resolveSnapshotDisplayContract(snapshot, resolvedAccount = null) {
    const fillRows = [
        ...(Array.isArray(snapshot?.fills) ? snapshot.fills : EMPTY_LIST),
        ...(Array.isArray(snapshot?.fillHistory) ? snapshot.fillHistory : EMPTY_LIST),
    ];

    const orderRows = [
        ...(Array.isArray(snapshot?.orders) ? snapshot.orders : EMPTY_LIST),
        ...(Array.isArray(snapshot?.orderHistory) ? snapshot.orderHistory : EMPTY_LIST),
        ...(Array.isArray(snapshot?.openOrders) ? snapshot.openOrders : EMPTY_LIST),
    ];

    const positionRows = [
        ...(Array.isArray(snapshot?.positions) ? snapshot.positions : EMPTY_LIST),
        ...(Array.isArray(snapshot?.openPositions) ? snapshot.openPositions : EMPTY_LIST),
        ...(Array.isArray(snapshot?.livePositions) ? snapshot.livePositions : EMPTY_LIST),
    ];

    const historyRows = [
        ...(Array.isArray(snapshot?.positionHistory) ? snapshot.positionHistory : EMPTY_LIST),
        ...(Array.isArray(snapshot?.positionsHistory) ? snapshot.positionsHistory : EMPTY_LIST),
        ...(Array.isArray(snapshot?.historyEntries) ? snapshot.historyEntries : EMPTY_LIST),
    ];

    const rowCandidates = [
        snapshot?.lastFill,
        snapshot?.lastOrder,
        ...fillRows,
        ...positionRows,
        ...historyRows,
        ...orderRows,
    ].flatMap(collectContractCandidatesFromRow);

    const baseCandidates = [
        ...rowCandidates,
        snapshot?.symbol,
        snapshot?.instrument,
        snapshot?.contract,
        snapshot?.product,
        resolvedAccount?.symbol,
        resolvedAccount?.instrument,
        resolvedAccount?.contract,
        resolvedAccount?.product,
    ];

    return pickBestContract(baseCandidates);
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

function historyMatchesFilter(entry, filterText) {
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
        "future-dashboard-storage",
        "atas-bridge-accounts-updated",
        "atas-bridge-status-updated",
    ]);

    const normalizedProvider = normalizeProvider(provider);

    if (normalizedProvider) {
        names.add(`${normalizedProvider}-csv-imports-updated`);
    }

    return Array.from(names);
}

function callImportBuilder(builderName, imports, accountId, provider) {
    const builder = csvImportUtils?.[builderName];

    if (typeof builder !== "function") {
        return { entries: EMPTY_LIST, fileName: "" };
    }

    const attempts = [
        () => builder(imports, accountId, { provider }),
        () => builder(imports, accountId, provider),
        () => builder(imports, accountId),
        () => builder(imports),
    ];

    for (const attempt of attempts) {
        try {
            const result = attempt();

            if (result && typeof result === "object") {
                return {
                    entries: Array.isArray(result.entries) ? result.entries : EMPTY_LIST,
                    fileName: cleanString(result.fileName || result.name || ""),
                };
            }
        } catch {
            continue;
        }
    }

    return { entries: EMPTY_LIST, fileName: "" };
}

function normalizeLiveOpenTrade(entry, index, fallbackContract = "") {
    const symbol = pickBestContract([
        ...collectContractCandidatesFromRow(entry),
        fallbackContract,
    ]) || "–";

    return {
        tradeId:
            cleanString(entry?.tradeId) ||
            cleanString(entry?.positionId) ||
            cleanString(entry?.id) ||
            `live-trade-${index}`,
        symbol,
        side:
            cleanString(entry?.side) ||
            cleanString(entry?.direction) ||
            cleanString(entry?.action) ||
            "–",
        entryTime:
            entry?.entryTime ||
            entry?.openedAt ||
            entry?.timestamp ||
            entry?.time ||
            entry?.createdAt ||
            "",
        exitTime:
            entry?.exitTime ||
            entry?.closedAt ||
            entry?.updatedAt ||
            "",
        remainingQty:
            entry?.remainingQty ??
            entry?.openQty ??
            entry?.quantity ??
            entry?.qty ??
            entry?.contracts ??
            0,
        avgEntryPrice:
            entry?.avgEntryPrice ??
            entry?.entryPrice ??
            entry?.avgPrice ??
            entry?.price ??
            0,
        scaleInCount:
            entry?.scaleInCount ??
            entry?.scaleIn ??
            0,
        scaleOutCount:
            entry?.scaleOutCount ??
            entry?.scaleOut ??
            0,
        entryQty:
            entry?.entryQty ??
            entry?.quantity ??
            entry?.qty ??
            entry?.contracts ??
            0,
        closedQty:
            entry?.closedQty ??
            entry?.exitQty ??
            0,
    };
}

function normalizeLivePosition(entry, index, fallbackContract = "") {
    const rawSignedQuantity =
        entry?.signedQuantity ??
        entry?.netQty ??
        entry?.netPosition ??
        entry?.positionQty ??
        null;

    const baseQuantity =
        entry?.quantity ??
        entry?.qty ??
        entry?.openQty ??
        entry?.contracts ??
        (rawSignedQuantity !== null && rawSignedQuantity !== undefined
            ? Math.abs(toNumber(rawSignedQuantity, 0))
            : 0);

    const sideText = cleanString(
        entry?.side ||
        entry?.direction ||
        entry?.action
    ).toLowerCase();

    let signedQuantity = rawSignedQuantity;

    if (signedQuantity === null || signedQuantity === undefined) {
        const quantityValue = toNumber(baseQuantity, 0);

        if (sideText.includes("short") || sideText.includes("sell")) {
            signedQuantity = -Math.abs(quantityValue);
        } else {
            signedQuantity = Math.abs(quantityValue);
        }
    }

    const finalSignedQty = toNumber(signedQuantity, 0);

    const symbol = pickBestContract([
        ...collectContractCandidatesFromRow(entry),
        fallbackContract,
    ]) || "–";

    return {
        tradeId:
            cleanString(entry?.tradeId) ||
            cleanString(entry?.positionId) ||
            cleanString(entry?.id) ||
            `live-position-${index}`,
        symbol,
        side:
            cleanString(entry?.side) ||
            cleanString(entry?.direction) ||
            getSideFromSignedQty(finalSignedQty),
        quantity: Math.abs(toNumber(baseQuantity, Math.abs(finalSignedQty))),
        signedQuantity: finalSignedQty,
        avgPrice:
            entry?.avgPrice ??
            entry?.avgEntryPrice ??
            entry?.entryPrice ??
            entry?.price ??
            0,
        unrealizedPnL:
            entry?.unrealizedPnL ??
            entry?.unrealizedPnl ??
            entry?.openPnl ??
            0,
        openedAt:
            entry?.openedAt ||
            entry?.entryTime ||
            entry?.timestamp ||
            entry?.time ||
            entry?.createdAt ||
            "",
        source: cleanString(entry?.source || "live-snapshot"),
    };
}

function normalizeAtasSnapshotPosition(snapshot, fallbackContract = "") {
    const positionQty = toNumber(
        snapshot?.positionQty ?? snapshot?.qty ?? snapshot?.quantity ?? snapshot?.netQty,
        0
    );

    if (positionQty === 0) {
        return null;
    }

    const symbol = pickBestContract([
        fallbackContract,
        snapshot?.symbol,
        snapshot?.instrument,
        snapshot?.contract,
        snapshot?.product,
        snapshot?.lastFill?.symbol,
        snapshot?.lastFill?.instrument,
        snapshot?.lastFill?.contract,
        snapshot?.lastFill?.product,
    ]) || "–";

    return normalizeLivePosition(
        {
            id: `atas-${symbol}-${positionQty}`,
            tradeId: `ATAS-${symbol}`,
            symbol,
            signedQuantity: positionQty,
            quantity: Math.abs(positionQty),
            side: getSideFromSignedQty(positionQty),
            avgPrice: snapshot?.avgPrice ?? snapshot?.averagePrice ?? 0,
            unrealizedPnL: snapshot?.unrealizedPnL ?? snapshot?.unrealizedPnl ?? 0,
            timestamp: snapshot?.lastSyncAt || snapshot?.timestamp || snapshot?.receivedAt || "",
            source: "atas-snapshot",
        },
        0,
        symbol
    );
}

function normalizeLiveHistoryEntry(entry, index, fallbackContract = "") {
    const contract = pickBestContract([
        ...collectContractCandidatesFromRow(entry),
        fallbackContract,
    ]) || "–";

    return {
        id:
            cleanString(entry?.id) ||
            cleanString(entry?.positionId) ||
            `live-history-${index}`,
        positionId:
            cleanString(entry?.positionId) ||
            cleanString(entry?.id) ||
            `live-position-${index}`,
        pairId:
            cleanString(entry?.pairId) ||
            cleanString(entry?.matchId) ||
            cleanString(entry?.tradeId) ||
            "",
        account:
            cleanString(entry?.account) ||
            "",
        contract,
        product:
            pickBestContract([
                entry?.product,
                entry?.market,
                entry?.symbol,
                contract,
            ]) || contract,
        tradeDate:
            cleanString(entry?.tradeDate) ||
            cleanString(entry?.date) ||
            "",
        timestamp:
            entry?.timestamp ||
            entry?.time ||
            entry?.createdAt ||
            entry?.updatedAt ||
            entry?.tradeDate ||
            "",
        netPos:
            entry?.netPos ??
            entry?.position ??
            entry?.quantity ??
            entry?.qty ??
            0,
        avgBuy:
            entry?.avgBuy ??
            entry?.buyAvg ??
            entry?.avgBuyPrice ??
            0,
        avgSell:
            entry?.avgSell ??
            entry?.sellAvg ??
            entry?.avgSellPrice ??
            0,
        pairedQty:
            entry?.pairedQty ??
            entry?.closedQty ??
            entry?.matchQty ??
            0,
        pnl:
            entry?.pnl ??
            entry?.netPnl ??
            entry?.realizedPnl ??
            0,
        buyFillId:
            cleanString(entry?.buyFillId) ||
            "",
        sellFillId:
            cleanString(entry?.sellFillId) ||
            "",
    };
}

function getLiveSnapshotOpenTrades(snapshot, fallbackContract = "") {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.openTrades,
        snapshot.liveOpenTrades,
        snapshot.activeTrades,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source.map((entry, index) =>
                normalizeLiveOpenTrade(entry, index, fallbackContract)
            );
        }
    }

    return EMPTY_LIST;
}

function getLiveSnapshotPositions(snapshot, fallbackContract = "") {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.positions,
        snapshot.openPositions,
        snapshot.livePositions,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            const normalizedPositions = source
                .map((entry, index) =>
                    normalizeLivePosition(entry, index, fallbackContract)
                )
                .filter((position) => {
                    return toNumber(position?.signedQuantity, 0) !== 0;
                });

            if (normalizedPositions.length > 0) {
                return normalizedPositions;
            }
        }
    }

    const atasPosition = normalizeAtasSnapshotPosition(snapshot, fallbackContract);

    return atasPosition ? [atasPosition] : EMPTY_LIST;
}

function getLiveSnapshotHistory(snapshot, fallbackContract = "") {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.positionHistory,
        snapshot.positionsHistory,
        snapshot.historyEntries,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source.map((entry, index) =>
                normalizeLiveHistoryEntry(entry, index, fallbackContract)
            );
        }
    }

    return EMPTY_LIST;
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

function hasLiveAtasIdentity(snapshot) {
    return Boolean(
        cleanString(snapshot?.atasAccountId) ||
        cleanString(snapshot?.atasAccountName) ||
        cleanString(snapshot?.dataProviderAccountId) ||
        cleanString(snapshot?.dataProviderAccountName) ||
        cleanString(snapshot?.symbol)
    );
}

function resolveFeedLabel(provider, fillCount, openPositionCount, historyCount, hasSnapshotIdentity) {
    const providerLabel = formatProviderLabel(provider);

    if (openPositionCount > 0) {
        return "Live Position aktiv";
    }

    if (historyCount > 0) {
        return `${providerLabel} History aktiv`;
    }

    if (fillCount > 0) {
        return `${providerLabel} Fills aktiv`;
    }

    if (normalizeProvider(provider) === "atas" && hasSnapshotIdentity) {
        return "ATAS Snapshot aktiv";
    }

    return "Keine Positionsdaten";
}

function resolveFeedColor(provider, fillCount, openPositionCount, historyCount, hasSnapshotIdentity) {
    if (openPositionCount > 0) {
        return COLORS.title;
    }

    if (historyCount > 0) {
        return normalizeProvider(provider) === "atas"
            ? COLORS.purple
            : COLORS.cyan;
    }

    if (fillCount > 0) {
        return COLORS.warning;
    }

    if (normalizeProvider(provider) === "atas" && hasSnapshotIdentity) {
        return COLORS.positive;
    }

    return COLORS.muted;
}

function resolveLastActivityTime(openTrades, positions, historyEntries, liveSnapshot) {
    const values = [
        liveSnapshot?.lastSyncAt,
        liveSnapshot?.timestamp,
        liveSnapshot?.receivedAt,
        ...(Array.isArray(openTrades)
            ? openTrades.map((trade) => trade?.entryTime || trade?.exitTime || "")
            : EMPTY_LIST),
        ...(Array.isArray(positions)
            ? positions.map((position) => position?.openedAt || "")
            : EMPTY_LIST),
        ...(Array.isArray(historyEntries)
            ? historyEntries.map((entry) => entry?.timestamp || entry?.tradeDate || "")
            : EMPTY_LIST),
    ]
        .map((value) => {
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? time : null;
        })
        .filter((value) => value !== null);

    if (values.length === 0) {
        return "";
    }

    return new Date(Math.max(...values)).toISOString();
}

function resolveSymbolSummary(openTrades, positions, historyEntries, liveSnapshot, resolvedAccount, displayContract = "") {
    const values = [
        displayContract,
        liveSnapshot?.symbol,
        liveSnapshot?.instrument,
        liveSnapshot?.contract,
        liveSnapshot?.product,
        resolvedAccount?.symbol,
        resolvedAccount?.instrument,
        resolvedAccount?.contract,
        resolvedAccount?.product,
        ...(Array.isArray(openTrades)
            ? openTrades.map((trade) => trade?.symbol)
            : EMPTY_LIST),
        ...(Array.isArray(positions)
            ? positions.map((position) => position?.symbol)
            : EMPTY_LIST),
        ...(Array.isArray(historyEntries)
            ? historyEntries.map((entry) => entry?.contract || entry?.product)
            : EMPTY_LIST),
    ];

    const uniqueValues = reduceContractsWithMicroPriority(values);

    if (uniqueValues.length === 0) {
        return "Keine Symbole";
    }

    if (uniqueValues.length <= 3) {
        return uniqueValues.join(", ");
    }

    return `${uniqueValues.slice(0, 3).join(", ")} +${uniqueValues.length - 3}`;
}

function applyDisplayContractToOpenTrades(openTrades, displayContract) {
    const contract = extractContractSymbol(displayContract);

    if (!contract) {
        return openTrades;
    }

    return openTrades.map((trade) => ({
        ...trade,
        symbol: pickBestContract([trade?.symbol, contract]) || trade?.symbol,
    }));
}

function applyDisplayContractToPositions(positions, displayContract) {
    const contract = extractContractSymbol(displayContract);

    if (!contract) {
        return positions;
    }

    return positions.map((position) => ({
        ...position,
        symbol: pickBestContract([position?.symbol, contract]) || position?.symbol,
    }));
}

function applyDisplayContractToHistory(historyEntries, displayContract) {
    const contract = extractContractSymbol(displayContract);

    if (!contract) {
        return historyEntries;
    }

    return historyEntries.map((entry) => {
        const nextContract = pickBestContract([
            entry?.contract,
            entry?.product,
            contract,
        ]);

        return {
            ...entry,
            contract: nextContract || entry?.contract,
            product: nextContract || entry?.product,
        };
    });
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
                borderRadius: 10,
                padding: "8px 10px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 11,
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
    const sideColor = getSideColor(trade.side);

    return (
        <div
            style={{
                background: COLORS.cardBgSoft,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: 12,
                display: "grid",
                gap: 8,
            }}
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
                        fontWeight: 700,
                        fontSize: 13,
                        minWidth: 0,
                    }}
                >
                    {trade.symbol || "–"}
                </div>

                <span
                    style={{
                        ...inlinePillStyle,
                        color: sideColor,
                        flexShrink: 0,
                    }}
                >
                    {trade.side || "–"}
                </span>
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 4,
                    color: COLORS.text,
                    fontSize: 12,
                    lineHeight: 1.35,
                }}
            >
                <div>Offen seit {formatDateTime(trade.entryTime)}</div>
                <div>Offene Menge {formatNumber(trade.remainingQty, 4)}</div>
                <div>Ø Entry {formatNumber(trade.avgEntryPrice, 4)}</div>
                <div>
                    Scale {formatInteger(trade.scaleInCount)} / {formatInteger(trade.scaleOutCount)}
                </div>
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
    activeAccount = null,
    selectedAccount = null,
    imports: importsProp = null,
    effectiveImports: effectiveImportsProp = null,
    importedFills = [],
    fills = [],
    csvFills = [],
    provider: providerProp = "",
    activeProvider = "",
    title = "Positions",
}) {
    const resolvedAccount =
        account ||
        activeAccount ||
        selectedAccount ||
        null;

    const resolvedAppAccountId = cleanString(
        resolvedAccountIdProp ||
        accountId ||
        selectedAccountId ||
        activeAccountId ||
        resolvedAccount?.id ||
        resolvedAccount?.resolvedAccountId ||
        ""
    );

    const [refreshTick, setRefreshTick] = useState(0);
    const [tradeFilter, setTradeFilter] = useState("");
    const [localImports, setLocalImports] = useState({});

    const liveSnapshot = useMemo(() => {
        if (!resolvedAppAccountId) {
            return null;
        }

        return getLiveAccountSnapshot(resolvedAppAccountId) || null;
    }, [resolvedAppAccountId, refreshTick]);

    const displayContract = useMemo(() => {
        return resolveSnapshotDisplayContract(liveSnapshot, resolvedAccount);
    }, [liveSnapshot, resolvedAccount]);

    const provider = resolvePanelProvider(
        {
            provider: providerProp,
            activeProvider,
        },
        resolvedAccount,
        liveSnapshot
    );

    const providerLabel = formatProviderLabel(provider);

    const providerStatus = cleanString(
        liveSnapshot?.dataProviderStatus ||
        liveSnapshot?.connectionStatus ||
        resolvedAccount?.dataProviderStatus ||
        ""
    ).toLowerCase();

    const forceAtasZeroState = useMemo(() => {
        if (normalizeProvider(provider) !== "atas") {
            return false;
        }

        if (hasLiveAtasIdentity(liveSnapshot)) {
            return false;
        }

        return (
            !providerStatus ||
            providerStatus === "disconnected" ||
            providerStatus === "error" ||
            providerStatus === "not_connected" ||
            providerStatus === "offline"
        );
    }, [provider, liveSnapshot, providerStatus]);

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

    useEffect(() => {
        const unsubscribe = subscribeTradeSelection((tradeId) => {
            setTradeFilter(cleanString(tradeId));
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const handleRefresh = () => {
            setRefreshTick((current) => current + 1);
        };

        window.addEventListener("future-dashboard-storage", handleRefresh);
        window.addEventListener("atas-bridge-accounts-updated", handleRefresh);
        window.addEventListener("atas-bridge-status-updated", handleRefresh);
        window.addEventListener("storage", handleRefresh);
        window.addEventListener("focus", handleRefresh);

        return () => {
            window.removeEventListener("future-dashboard-storage", handleRefresh);
            window.removeEventListener("atas-bridge-accounts-updated", handleRefresh);
            window.removeEventListener("atas-bridge-status-updated", handleRefresh);
            window.removeEventListener("storage", handleRefresh);
            window.removeEventListener("focus", handleRefresh);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const loadImports = () => {
            const nextImports = loadParsedImportsForProvider(resolvedAppAccountId, provider);
            setLocalImports(nextImports);
            setRefreshTick((current) => current + 1);
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

    const positionHistoryData = useMemo(() => {
        if (forceAtasZeroState) {
            return { entries: EMPTY_LIST, fileName: "" };
        }

        return callImportBuilder(
            "buildPositionHistoryData",
            effectiveImports,
            scopeAccountId || resolvedAppAccountId,
            provider
        );
    }, [forceAtasZeroState, effectiveImports, scopeAccountId, resolvedAppAccountId, provider]);

    const liveSnapshotFills = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotFills(liveSnapshot);
    }, [liveSnapshot, forceAtasZeroState]);

    const directFills = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        if (Array.isArray(importedFills) && importedFills.length > 0) {
            return importedFills.map((fill) => ({ ...fill }));
        }

        if (Array.isArray(fills) && fills.length > 0) {
            return fills.map((fill) => ({ ...fill }));
        }

        if (Array.isArray(csvFills) && csvFills.length > 0) {
            return csvFills.map((fill) => ({ ...fill }));
        }

        return EMPTY_LIST;
    }, [forceAtasZeroState, importedFills, fills, csvFills]);

    const storedFills = useMemo(() => {
        if (forceAtasZeroState || !resolvedAppAccountId) {
            return EMPTY_LIST;
        }

        const nextFills = getFills(resolvedAppAccountId);
        return Array.isArray(nextFills) ? nextFills : EMPTY_LIST;
    }, [forceAtasZeroState, resolvedAppAccountId, refreshTick]);

    const effectiveFills = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        if (normalizeProvider(provider) === "atas") {
            if (liveSnapshotFills.length > 0) {
                return liveSnapshotFills;
            }

            if (directFills.length > 0) {
                return directFills;
            }

            return EMPTY_LIST;
        }

        if (directFills.length > 0) {
            return directFills;
        }

        if (storedFills.length > 0) {
            return storedFills;
        }

        return liveSnapshotFills;
    }, [forceAtasZeroState, provider, liveSnapshotFills, directFills, storedFills]);

    const analytics = useMemo(() => {
        return buildFillAnalytics({
            fills: effectiveFills,
            accountId: resolvedAppAccountId,
        });
    }, [effectiveFills, resolvedAppAccountId]);

    const analyticsOpenTrades = Array.isArray(analytics?.openTrades)
        ? analytics.openTrades
        : EMPTY_LIST;

    const analyticsPositions = Array.isArray(analytics?.positions)
        ? analytics.positions
        : EMPTY_LIST;

    const liveOpenTrades = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotOpenTrades(liveSnapshot, displayContract);
    }, [liveSnapshot, forceAtasZeroState, displayContract]);

    const livePositions = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotPositions(liveSnapshot, displayContract);
    }, [liveSnapshot, forceAtasZeroState, displayContract]);

    const liveHistoryEntries = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return getLiveSnapshotHistory(liveSnapshot, displayContract);
    }, [liveSnapshot, forceAtasZeroState, displayContract]);

    const importedHistoryEntries = useMemo(() => {
        if (!Array.isArray(positionHistoryData?.entries)) {
            return EMPTY_LIST;
        }

        return positionHistoryData.entries.map((entry, index) => {
            const flexible = buildFlexibleSource(entry);
            const contract = pickBestContract([
                pickFlexibleValue(flexible, [
                    "contract",
                    "instrument",
                    "symbol",
                    "securityid",
                    "product",
                ]),
                displayContract,
            ]);

            return normalizeLiveHistoryEntry(
                {
                    ...entry,
                    contract: contract || entry?.contract,
                    product: contract || entry?.product,
                },
                index,
                displayContract
            );
        });
    }, [positionHistoryData?.entries, displayContract]);

    const openTrades = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        let rows = EMPTY_LIST;

        if (normalizeProvider(provider) === "atas") {
            rows = liveOpenTrades.length > 0 ? liveOpenTrades : analyticsOpenTrades;
        } else {
            rows = analyticsOpenTrades.length > 0 ? analyticsOpenTrades : liveOpenTrades;
        }

        return applyDisplayContractToOpenTrades(rows, displayContract);
    }, [
        forceAtasZeroState,
        provider,
        liveOpenTrades,
        analyticsOpenTrades,
        displayContract,
    ]);

    const positions = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        let rows = EMPTY_LIST;

        if (normalizeProvider(provider) === "atas") {
            rows = livePositions;
        } else {
            rows = analyticsPositions.length > 0 ? analyticsPositions : livePositions;
        }

        return applyDisplayContractToPositions(rows, displayContract);
    }, [
        forceAtasZeroState,
        provider,
        livePositions,
        analyticsPositions,
        displayContract,
    ]);

    const historyEntries = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        let rows = EMPTY_LIST;

        if (normalizeProvider(provider) === "atas") {
            rows = liveHistoryEntries.length > 0
                ? liveHistoryEntries
                : importedHistoryEntries;
        } else {
            rows = importedHistoryEntries.length > 0
                ? importedHistoryEntries
                : liveHistoryEntries;
        }

        return applyDisplayContractToHistory(rows, displayContract);
    }, [
        forceAtasZeroState,
        provider,
        liveHistoryEntries,
        importedHistoryEntries,
        displayContract,
    ]);

    const fillCount = Array.isArray(effectiveFills) ? effectiveFills.length : 0;

    const filteredOpenTrades = useMemo(() => {
        return [...openTrades]
            .filter((trade) => tradeMatchesFilter(trade, tradeFilter))
            .sort((a, b) => {
                const aTime = new Date(a?.entryTime || 0).getTime();
                const bTime = new Date(b?.entryTime || 0).getTime();
                return bTime - aTime;
            });
    }, [openTrades, tradeFilter]);

    const filteredPositions = useMemo(() => {
        return [...positions]
            .filter((position) => positionMatchesFilter(position, tradeFilter))
            .sort((a, b) =>
                String(a?.symbol || "").localeCompare(String(b?.symbol || ""))
            );
    }, [positions, tradeFilter]);

    const filteredPositionHistory = useMemo(() => {
        return [...historyEntries]
            .filter((entry) => historyMatchesFilter(entry, tradeFilter))
            .sort((a, b) => {
                const aTime = new Date(a?.timestamp || a?.tradeDate || 0).getTime();
                const bTime = new Date(b?.timestamp || b?.tradeDate || 0).getTime();
                return bTime - aTime;
            });
    }, [historyEntries, tradeFilter]);

    const totalOpenQty = useMemo(() => {
        return filteredPositions.reduce((sum, position) => {
            return sum + Math.abs(toNumber(position?.quantity, 0));
        }, 0);
    }, [filteredPositions]);

    const totalSignedQty = useMemo(() => {
        return filteredPositions.reduce((sum, position) => {
            return sum + toNumber(position?.signedQuantity, 0);
        }, 0);
    }, [filteredPositions]);

    const totalUnrealizedPnl = useMemo(() => {
        return filteredPositions.reduce((sum, position) => {
            return sum + toNumber(position?.unrealizedPnL, 0);
        }, 0);
    }, [filteredPositions]);

    const totalHistoryPnl = useMemo(() => {
        return filteredPositionHistory.reduce((sum, entry) => {
            return sum + toNumber(entry?.pnl, 0);
        }, 0);
    }, [filteredPositionHistory]);

    const hasSnapshotIdentity = hasLiveAtasIdentity(liveSnapshot);

    const lastActivityTime = useMemo(() => {
        return resolveLastActivityTime(
            filteredOpenTrades,
            filteredPositions,
            filteredPositionHistory,
            liveSnapshot
        );
    }, [filteredOpenTrades, filteredPositions, filteredPositionHistory, liveSnapshot]);

    const symbolSummary = useMemo(() => {
        return resolveSymbolSummary(
            filteredOpenTrades,
            filteredPositions,
            filteredPositionHistory,
            liveSnapshot,
            resolvedAccount,
            displayContract
        );
    }, [
        filteredOpenTrades,
        filteredPositions,
        filteredPositionHistory,
        liveSnapshot,
        resolvedAccount,
        displayContract,
    ]);

    const statusLabel = forceAtasZeroState
        ? "Keine Positionsdaten"
        : resolveFeedLabel(
            provider,
            fillCount,
            filteredPositions.length,
            filteredPositionHistory.length,
            hasSnapshotIdentity
        );

    const statusColor = forceAtasZeroState
        ? COLORS.muted
        : resolveFeedColor(
            provider,
            fillCount,
            filteredPositions.length,
            filteredPositionHistory.length,
            hasSnapshotIdentity
        );

    const recentHistoryEntries = useMemo(() => {
        return filteredPositionHistory.slice(0, 5);
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
                        Offene Positionen, ATAS Snapshot und Position History für den aktiven Account.
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
                            color: normalizeProvider(provider) === "atas"
                                ? COLORS.purple
                                : COLORS.cyan,
                        }}
                    >
                        {providerLabel}
                    </div>

                    <div style={badgeStyle}>
                        {formatInteger(filteredPositions.length)} Positionen
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                }}
            >
                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Offene Positionen</div>
                    <div style={summaryValueStyle}>
                        {formatInteger(filteredPositions.length)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Offene Trades</div>
                    <div style={summaryValueStyle}>
                        {formatInteger(filteredOpenTrades.length)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Offene Menge</div>
                    <div style={summaryValueStyle}>
                        {formatNumber(totalOpenQty, 4)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Signed Qty</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: totalSignedQty === 0 ? COLORS.text : COLORS.warning,
                        }}
                    >
                        {formatNumber(totalSignedQty, 4)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Unrealized PnL</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: resolvePnlColor(totalUnrealizedPnl),
                        }}
                    >
                        {formatSignedCurrency(totalUnrealizedPnl)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>History PnL</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: resolvePnlColor(totalHistoryPnl),
                        }}
                    >
                        {formatSignedCurrency(totalHistoryPnl)}
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
                        display: "grid",
                        gap: 16,
                        minWidth: 0,
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
                                    Offene Positionen
                                </div>
                                <div
                                    style={{
                                        color: COLORS.muted,
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    ATAS Snapshot zeigt Positionen, sobald positionQty nicht 0 ist.
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
                                    Signed Qty {formatNumber(totalSignedQty, 4)}
                                </span>
                                <span style={tableMetaPillStyle}>
                                    Symbol {symbolSummary}
                                </span>
                            </div>
                        </div>

                        {filteredPositions.length === 0 ? (
                            <div
                                style={{
                                    padding: 20,
                                    color: COLORS.muted,
                                    fontSize: 14,
                                }}
                            >
                                {normalizeProvider(provider) === "atas"
                                    ? "Keine offene ATAS Position. Snapshot ist aktiv, positionQty steht aktuell auf 0."
                                    : "Keine offenen Positionen für den aktuellen Filter gefunden."}
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
                                        minWidth: 980,
                                    }}
                                >
                                    <thead style={{ background: COLORS.tableHead }}>
                                        <tr>
                                            <th style={headerCellStyle}>Symbol</th>
                                            <th style={headerCellStyle}>Side</th>
                                            <th style={headerCellStyle}>Qty</th>
                                            <th style={headerCellStyle}>Signed Qty</th>
                                            <th style={headerCellStyle}>Ø Price</th>
                                            <th style={headerCellStyle}>Unrealized</th>
                                            <th style={headerCellStyle}>Opened</th>
                                            <th style={headerCellStyle}>Trade ID</th>
                                            <th style={headerCellStyle}>Quelle</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredPositions.map((position, index) => {
                                            const sideColor = getSideColor(position?.side);

                                            return (
                                                <tr
                                                    key={position?.tradeId || `${position?.symbol}_${index}`}
                                                    style={{
                                                        background:
                                                            index % 2 === 0
                                                                ? "transparent"
                                                                : COLORS.rowAlt,
                                                    }}
                                                >
                                                    <td style={bodyCellStyle}>
                                                        <span style={instrumentTextStyle}>
                                                            {position?.symbol || "–"}
                                                        </span>
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        <span
                                                            style={{
                                                                ...inlinePillStyle,
                                                                color: sideColor,
                                                            }}
                                                        >
                                                            {position?.side || "–"}
                                                        </span>
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        {formatNumber(position?.quantity, 4)}
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        {formatNumber(position?.signedQuantity, 4)}
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        {formatNumber(position?.avgPrice, 4)}
                                                    </td>

                                                    <td
                                                        style={{
                                                            ...bodyCellStyle,
                                                            color: resolvePnlColor(position?.unrealizedPnL),
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {formatSignedCurrency(position?.unrealizedPnL)}
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        {formatDateTime(position?.openedAt)}
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        <span style={monoTextStyle}>
                                                            {truncateMiddle(position?.tradeId, 26)}
                                                        </span>
                                                    </td>

                                                    <td style={bodyCellStyle}>
                                                        {position?.source || "snapshot"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

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
                                    Position History
                                </div>
                                <div
                                    style={{
                                        color: COLORS.muted,
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    Position History aus CSV, Live Snapshot oder ATAS Daten.
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
                                    Datei {positionHistoryData?.fileName || "keine"}
                                </span>
                                <span style={tableMetaPillStyle}>
                                    PnL {formatSignedCurrency(totalHistoryPnl)}
                                </span>
                            </div>
                        </div>

                        {filteredPositionHistory.length === 0 ? (
                            <div
                                style={{
                                    padding: 20,
                                    color: COLORS.muted,
                                    fontSize: 14,
                                }}
                            >
                                Keine Position History für den aktuellen Filter gefunden.
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        minWidth: 980,
                                    }}
                                >
                                    <thead style={{ background: COLORS.tableHead }}>
                                        <tr>
                                            <th style={headerCellStyle}>Timestamp</th>
                                            <th style={headerCellStyle}>Contract</th>
                                            <th style={headerCellStyle}>Product</th>
                                            <th style={headerCellStyle}>Net Pos</th>
                                            <th style={headerCellStyle}>Avg Buy</th>
                                            <th style={headerCellStyle}>Avg Sell</th>
                                            <th style={headerCellStyle}>Paired Qty</th>
                                            <th style={headerCellStyle}>P/L</th>
                                            <th style={headerCellStyle}>Position ID</th>
                                            <th style={headerCellStyle}>Pair ID</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredPositionHistory.map((entry, index) => (
                                            <tr
                                                key={entry?.id || `${entry?.positionId}_${index}`}
                                                style={{
                                                    background:
                                                        index % 2 === 0
                                                            ? "transparent"
                                                            : COLORS.rowAlt,
                                                }}
                                            >
                                                <td style={bodyCellStyle}>
                                                    {formatDateTime(entry?.timestamp || entry?.tradeDate)}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    <span style={instrumentTextStyle}>
                                                        {entry?.contract || "–"}
                                                    </span>
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    {entry?.product || "–"}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    {formatNumber(entry?.netPos, 4)}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    {formatNumber(entry?.avgBuy, 4)}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    {formatNumber(entry?.avgSell, 4)}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    {formatNumber(entry?.pairedQty, 4)}
                                                </td>

                                                <td
                                                    style={{
                                                        ...bodyCellStyle,
                                                        color: resolvePnlColor(entry?.pnl),
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {formatSignedCurrency(entry?.pnl)}
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    <span style={monoTextStyle}>
                                                        {truncateMiddle(entry?.positionId, 26)}
                                                    </span>
                                                </td>

                                                <td style={bodyCellStyle}>
                                                    <span style={monoTextStyle}>
                                                        {truncateMiddle(entry?.pairId, 26)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 14,
                        minWidth: 0,
                    }}
                >
                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Filter</div>

                        <label
                            style={{
                                display: "block",
                                color: COLORS.muted,
                                fontSize: 11,
                                marginBottom: 6,
                            }}
                        >
                            Gemeinsamer Trade Filter
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
                                borderRadius: 12,
                                padding: "10px 12px",
                                boxSizing: "border-box",
                                outline: "none",
                                fontSize: 12,
                            }}
                        />

                        <button
                            type="button"
                            onClick={() => updateTradeFilter("")}
                            style={{
                                marginTop: 10,
                                width: "100%",
                                background: COLORS.buttonBg,
                                color: COLORS.buttonText,
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontWeight: 700,
                                cursor: "pointer",
                                minHeight: 42,
                                fontSize: 12,
                            }}
                        >
                            Filter löschen
                        </button>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Positions Überblick</div>

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
                                <span style={metaKeyStyle}>History Datei</span>
                                <span style={metaValueStyle}>
                                    {positionHistoryData?.fileName || "keine Datei"}
                                </span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Letzte Aktivität</span>
                                <span style={metaValueStyle}>
                                    {lastActivityTime ? formatDateTime(lastActivityTime) : "–"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Live Fokus</div>

                        <div style={{ display: "grid", gap: 10 }}>
                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Offene Positionen</span>
                                    <span style={statusRowValueStyle}>
                                        {formatInteger(filteredPositions.length)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Aktueller Live Bestand
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Offene Trades</span>
                                    <span style={statusRowValueStyle}>
                                        {formatInteger(filteredOpenTrades.length)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Laufende Trade Struktur
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Offene Menge</span>
                                    <span style={statusRowValueStyle}>
                                        {formatNumber(totalOpenQty, 4)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Summe aller offenen Positionen
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Unrealized PnL</span>
                                    <span
                                        style={{
                                            ...statusRowValueStyle,
                                            color: resolvePnlColor(totalUnrealizedPnl),
                                        }}
                                    >
                                        {formatSignedCurrency(totalUnrealizedPnl)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Aus ATAS Snapshot oder Live Positionen
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Offene Trades</div>

                        {filteredOpenTrades.length === 0 ? (
                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 13,
                                }}
                            >
                                Keine offenen Trades vorhanden.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 10 }}>
                                {filteredOpenTrades.slice(0, 5).map((trade) => (
                                    <OpenTradeCard
                                        key={trade?.tradeId || `${trade?.symbol}_${trade?.entryTime}`}
                                        trade={trade}
                                        onSelectTradeId={updateTradeFilter}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Letzte History Zeilen</div>

                        {recentHistoryEntries.length === 0 ? (
                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 13,
                                }}
                            >
                                Keine History Aktivität vorhanden.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 10 }}>
                                {recentHistoryEntries.map((entry, index) => (
                                    <div
                                        key={entry?.id || `${entry?.positionId}_${index}`}
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
                                                {entry?.contract || entry?.product || "–"}
                                            </div>

                                            <span
                                                style={{
                                                    ...inlinePillStyle,
                                                    color: resolvePnlColor(entry?.pnl),
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {formatSignedCurrency(entry?.pnl)}
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
                                                <span style={miniTagStyle}>
                                                    Pos {formatNumber(entry?.netPos, 4)}
                                                </span>
                                                <span style={miniTagStyle}>
                                                    Pair {truncateMiddle(entry?.pairId, 14)}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                {formatDateTime(entry?.timestamp || entry?.tradeDate)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

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