import { useEffect, useMemo, useState } from "react";
import { getLiveAccountSnapshot } from "../utils/storage";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    getStrictProviderAccountLabel,
    getStrictProviderScopeAccountId,
    getStrictProviderTradingRef,
} from "../utils/providerDisplay";
import {
    fetchAtasHistoryOrders,
    getAtasHistoryStartDate,
} from "../utils/atasBridgeApi";

const EMPTY_LIST = [];
const ATAS_HISTORY_START_DATE = getAtasHistoryStartDate();

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 24px rgba(0, 0, 0, 0.22)",
    text: "#dbeafe",
    muted: "#94a3b8",
    title: "#7dd3fc",
    cyan: "#22d3ee",
    green: "#34d399",
    orange: "#fb923c",
    red: "#f87171",
    yellow: "#fbbf24",
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
    const candidates = [
        props?.provider,
        props?.activeProvider,
        props?.dataProvider,
        props?.sourceProvider,
        liveSnapshot?.dataProvider,
        resolvedAccount?.provider,
        resolvedAccount?.activeProvider,
        resolvedAccount?.dataProvider,
        resolvedAccount?.sourceProvider,
        resolvedAccount?.platform,
        resolvedAccount?.broker,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeProvider(candidate);

        if (normalized) {
            return normalized;
        }
    }

    return "tradovate";
}

function toArray(value) {
    return Array.isArray(value) ? value : EMPTY_LIST;
}

function toNumber(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    const text = cleanString(value)
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    if (!text) {
        return fallback;
    }

    const normalized = text.includes(",") && text.includes(".")
        ? text.lastIndexOf(",") > text.lastIndexOf(".")
            ? text.replace(/\./g, "").replace(/,/g, ".")
            : text.replace(/,/g, "")
        : text.includes(",")
            ? text.replace(/,/g, ".")
            : text;

    const number = Number(normalized);

    return Number.isFinite(number) ? number : fallback;
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

function callBuildOrdersData(imports, accountId, provider) {
    if (typeof csvImportUtils.buildOrdersData !== "function") {
        return { entries: EMPTY_LIST };
    }

    const attempts = [
        () => csvImportUtils.buildOrdersData(imports, accountId, { provider }),
        () => csvImportUtils.buildOrdersData(imports, accountId, provider),
        () => csvImportUtils.buildOrdersData(imports, accountId),
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

function formatDateTime(value) {
    if (!value) {
        return "–";
    }

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return String(value);
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

function getDefaultEndDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatNumber(value, digits = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "–";
    }

    return number.toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatInteger(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString("de-CH", {
        maximumFractionDigits: 0,
    });
}

function getOrderId(order, index) {
    return (
        cleanString(order?.orderId) ||
        cleanString(order?.id) ||
        cleanString(order?.order_id) ||
        cleanString(order?.orderNumber) ||
        cleanString(order?.ExtId) ||
        cleanString(order?.extId) ||
        cleanString(order?.externalId) ||
        `order-${index}`
    );
}

function getOrderSide(order) {
    return (
        cleanString(order?.side) ||
        cleanString(order?.action) ||
        cleanString(order?.buySell) ||
        cleanString(order?.direction) ||
        cleanString(order?.Direction) ||
        cleanString(order?.OrderDirection) ||
        cleanString(order?.orderDirection) ||
        cleanString(order?.bs) ||
        "–"
    );
}

function getOrderInstrument(order) {
    return (
        pickBestContract([
            order?.instrument,
            order?.symbol,
            order?.contract,
            order?.market,
            order?.product,
            order?.SecurityId,
            order?.securityId,
        ]) || "–"
    );
}

function getOrderQty(order) {
    return (
        order?.quantity ??
        order?.qty ??
        order?.filledQty ??
        order?.QuantityToFill ??
        order?.quantityToFill ??
        order?.Volume ??
        order?.volume ??
        order?.size ??
        order?.contracts ??
        0
    );
}

function getOrderStatus(order) {
    return (
        cleanString(order?.status) ||
        cleanString(order?.orderStatus) ||
        cleanString(order?.state) ||
        cleanString(order?.State) ||
        "–"
    );
}

function getOrderPrice(order) {
    return (
        order?.price ??
        order?.Price ??
        order?.limitPrice ??
        order?.avgFillPrice ??
        order?.avgPrice ??
        0
    );
}

function getOrderTime(order) {
    return (
        cleanString(order?.timestamp) ||
        cleanString(order?.createdAt) ||
        cleanString(order?.submittedAt) ||
        cleanString(order?.updatedAt) ||
        cleanString(order?.time) ||
        cleanString(order?.Time) ||
        cleanString(order?.date) ||
        ""
    );
}

function normalizeText(value) {
    return cleanString(value).toLowerCase();
}

function parseTimestamp(value) {
    if (!value) {
        return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function mapOrderRows(entries = EMPTY_LIST, sourceLabel = "CSV") {
    return entries.map((order, index) => ({
        id: getOrderId(order, index),
        source: sourceLabel,
        instrument: getOrderInstrument(order),
        side: getOrderSide(order),
        qty: getOrderQty(order),
        status: getOrderStatus(order),
        price: getOrderPrice(order),
        time: getOrderTime(order),
        raw: order,
    }));
}

function buildSimulationRows(simulationTrades = EMPTY_LIST) {
    return simulationTrades.map((trade, index) => ({
        id:
            cleanString(trade?.id) ||
            cleanString(trade?.tradeId) ||
            cleanString(trade?.orderId) ||
            `sim-${index}`,
        source: "SIM",
        instrument:
            pickBestContract([
                trade?.instrument,
                trade?.symbol,
                trade?.contract,
                trade?.product,
            ]) || "–",
        side:
            cleanString(trade?.side) ||
            cleanString(trade?.direction) ||
            cleanString(trade?.action) ||
            "–",
        qty:
            trade?.quantity ??
            trade?.qty ??
            trade?.contracts ??
            0,
        status: cleanString(trade?.status) || "Simuliert",
        price: trade?.price ?? trade?.entryPrice ?? 0,
        time:
            cleanString(trade?.timestamp) ||
            cleanString(trade?.createdAt) ||
            cleanString(trade?.time) ||
            cleanString(trade?.date) ||
            "",
        raw: trade,
    }));
}

function normalizeAtasHistoryOrder(order, index) {
    const id =
        cleanString(order?.orderId) ||
        cleanString(order?.id) ||
        cleanString(order?.tradeId) ||
        cleanString(order?.ExtId) ||
        `atas-history-order-${index}`;

    const instrument =
        pickBestContract([
            order?.instrument,
            order?.symbol,
            order?.contract,
            order?.SecurityId,
            order?.securityId,
        ]) || "–";

    const side =
        cleanString(order?.side) ||
        cleanString(order?.direction) ||
        cleanString(order?.Direction) ||
        cleanString(order?.orderDirection) ||
        "–";

    const qty =
        order?.qty ??
        order?.quantity ??
        order?.QuantityToFill ??
        order?.volume ??
        order?.Volume ??
        0;

    const status =
        cleanString(order?.status) ||
        cleanString(order?.state) ||
        cleanString(order?.State) ||
        "–";

    const price =
        order?.price ??
        order?.Price ??
        order?.limitPrice ??
        order?.avgPrice ??
        0;

    const time =
        cleanString(order?.timestamp) ||
        cleanString(order?.time) ||
        cleanString(order?.Time) ||
        cleanString(order?.createdAt) ||
        "";

    return {
        id,
        source: "atas-history-orders",
        instrument,
        side,
        qty,
        status,
        price,
        time,
        raw: order,
    };
}

function dedupeOrderRows(rows) {
    const map = new Map();

    rows.forEach((row, index) => {
        if (!row) {
            return;
        }

        const key =
            cleanString(row.id) ||
            [
                cleanString(row.instrument),
                cleanString(row.side),
                cleanString(row.qty),
                cleanString(row.status),
                cleanString(row.price),
                cleanString(row.time),
                index,
            ].join("|");

        if (!key) {
            return;
        }

        map.set(key, row);
    });

    return Array.from(map.values());
}

function resolveFeedLabel(provider, liveCount, historyCount, importedCount, appCount, simCount, historyLoading) {
    const providerLabel = formatProviderLabel(provider);

    if (historyLoading) {
        return `${providerLabel} Orders laden`;
    }

    if (normalizeProvider(provider) === "atas") {
        if (historyCount > 0) {
            return `${providerLabel} History aktiv`;
        }

        if (liveCount > 0) {
            return `${providerLabel} Feed aktiv`;
        }

        if (importedCount > 0) {
            return `${providerLabel} Import aktiv`;
        }
    }

    if (normalizeProvider(provider) === "tradovate") {
        if (importedCount > 0) {
            return `${providerLabel} CSV aktiv`;
        }

        if (liveCount > 0) {
            return `${providerLabel} Feed aktiv`;
        }
    }

    if (appCount > 0) {
        return "App Orders aktiv";
    }

    if (simCount > 0) {
        return "Simulation aktiv";
    }

    return "Keine Orders geladen";
}

function resolveFeedColor(provider, liveCount, historyCount, importedCount, appCount, simCount, historyLoading) {
    if (historyLoading) {
        return COLORS.yellow;
    }

    if (normalizeProvider(provider) === "atas") {
        if (historyCount > 0) {
            return COLORS.purple;
        }

        if (liveCount > 0) {
            return COLORS.purple;
        }

        if (importedCount > 0) {
            return COLORS.purple;
        }
    }

    if (normalizeProvider(provider) === "tradovate") {
        if (importedCount > 0) {
            return COLORS.title;
        }

        if (liveCount > 0) {
            return COLORS.cyan;
        }
    }

    if (appCount > 0) {
        return COLORS.cyan;
    }

    if (simCount > 0) {
        return COLORS.yellow;
    }

    return COLORS.muted;
}

function resolveSideTone(side) {
    const text = normalizeText(side);

    if (text.includes("buy") || text.includes("long")) {
        return COLORS.green;
    }

    if (text.includes("sell") || text.includes("short")) {
        return COLORS.orange;
    }

    return COLORS.text;
}

function resolveStatusTone(status) {
    const text = normalizeText(status);

    if (
        text.includes("filled") ||
        text.includes("executed") ||
        text.includes("done") ||
        text.includes("complete")
    ) {
        return COLORS.green;
    }

    if (
        text.includes("cancel") ||
        text.includes("reject") ||
        text.includes("error") ||
        text.includes("fail")
    ) {
        return COLORS.red;
    }

    if (
        text.includes("working") ||
        text.includes("open") ||
        text.includes("pending") ||
        text.includes("submitted") ||
        text.includes("partial") ||
        text.includes("active")
    ) {
        return COLORS.yellow;
    }

    return COLORS.text;
}

function resolveSourceTone(source) {
    const text = normalizeText(source);

    if (text.includes("tradovate")) {
        return COLORS.title;
    }

    if (text.includes("atas")) {
        return COLORS.purple;
    }

    if (text === "app") {
        return COLORS.cyan;
    }

    if (text === "sim") {
        return COLORS.yellow;
    }

    return COLORS.text;
}

function resolveInstrumentSummary(rows) {
    const instruments = reduceContractsWithMicroPriority(
        rows.map((row) => row?.instrument)
    );

    if (instruments.length === 0) {
        return "Keine Symbole";
    }

    if (instruments.length <= 3) {
        return instruments.join(", ");
    }

    return `${instruments.slice(0, 3).join(", ")} +${instruments.length - 3}`;
}

function resolveLastOrderTime(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return "";
    }

    let latestRow = null;
    let latestTime = 0;

    for (const row of rows) {
        const time = parseTimestamp(row?.time);

        if (time > latestTime) {
            latestTime = time;
            latestRow = row;
        }
    }

    return latestRow?.time || "";
}

function resolvePrimarySource(rows) {
    const counts = rows.reduce((acc, row) => {
        const key = cleanString(row?.source).toUpperCase();

        if (!key) {
            return acc;
        }

        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (ordered.length === 0) {
        return "Keine Quelle";
    }

    return ordered[0][0];
}

function truncateMiddle(value, maxLength = 24) {
    const text = cleanString(value);

    if (text.length <= maxLength) {
        return text || "–";
    }

    const left = Math.ceil((maxLength - 3) / 2);
    const right = Math.floor((maxLength - 3) / 2);

    return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}

function getLiveOrderRows(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return EMPTY_LIST;
    }

    const sources = [
        snapshot.orders,
        snapshot.orderHistory,
        snapshot.openOrders,
    ];

    for (const source of sources) {
        if (Array.isArray(source) && source.length) {
            return source;
        }
    }

    return EMPTY_LIST;
}

function hasAtasLiveIdentity(snapshot) {
    return Boolean(
        cleanString(snapshot?.atasAccountId) ||
        cleanString(snapshot?.atasAccountName) ||
        cleanString(snapshot?.dataProviderAccountId) ||
        cleanString(snapshot?.dataProviderAccountName)
    );
}

export default function OrdersPanel({
    orders = EMPTY_LIST,
    simulationTrades = EMPTY_LIST,
    selectedAccount = null,
    activeAccount = null,
    account = null,
    resolvedAccountId = "",
    accountId = "",
    activeAccountId = "",
    selectedAccountId = "",
    imports = {},
    effectiveImports: effectiveImportsProp = null,
    provider: providerProp = "",
    activeProvider = "",
}) {
    const resolvedAccount =
        account ||
        activeAccount ||
        selectedAccount ||
        null;

    const effectiveAccountId =
        cleanString(resolvedAccountId) ||
        cleanString(accountId) ||
        cleanString(activeAccountId) ||
        cleanString(selectedAccountId) ||
        cleanString(resolvedAccount?.id) ||
        cleanString(resolvedAccount?.accountId) ||
        "";

    const liveSnapshot = useMemo(() => {
        if (!effectiveAccountId) {
            return null;
        }

        return getLiveAccountSnapshot(effectiveAccountId) || null;
    }, [effectiveAccountId]);

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

    const providerStatus = cleanString(
        liveSnapshot?.dataProviderStatus || resolvedAccount?.dataProviderStatus
    ).toLowerCase();

    const forceAtasZeroState = useMemo(() => {
        if (!isAtasProvider) {
            return false;
        }

        if (hasAtasLiveIdentity(liveSnapshot)) {
            return false;
        }

        return (
            !providerStatus ||
            providerStatus === "disconnected" ||
            providerStatus === "error" ||
            providerStatus === "not_connected"
        );
    }, [isAtasProvider, liveSnapshot, providerStatus]);

    const csvMatchAccountId = useMemo(() => {
        if (forceAtasZeroState) {
            return "";
        }

        return (
            getStrictProviderScopeAccountId(
                resolvedAccount,
                liveSnapshot,
                provider
            ) || cleanString(effectiveAccountId)
        );
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider, effectiveAccountId]);

    const accountLabel = useMemo(() => {
        if (forceAtasZeroState) {
            return "Kein ATAS Account";
        }

        return getStrictProviderAccountLabel(
            resolvedAccount,
            liveSnapshot,
            provider
        ) || "Kein Account gewählt";
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider]);

    const tradingRef = useMemo(() => {
        if (forceAtasZeroState) {
            return "Kein ATAS Account";
        }

        return getStrictProviderTradingRef(
            resolvedAccount,
            liveSnapshot,
            provider
        ) || (isAtasProvider ? "Kein ATAS Account" : "Keine Trading Ref");
    }, [forceAtasZeroState, resolvedAccount, liveSnapshot, provider, isAtasProvider]);

    const [historyStartDate, setHistoryStartDate] = useState(ATAS_HISTORY_START_DATE);
    const [historyEndDate, setHistoryEndDate] = useState(getDefaultEndDate);
    const [atasHistoryState, setAtasHistoryState] = useState({
        loading: false,
        error: "",
        orders: EMPTY_LIST,
        readAt: "",
    });

    const [localImports, setLocalImports] = useState(() => {
        return loadParsedImportsForProvider(effectiveAccountId, provider);
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const loadImports = () => {
            const nextImports = loadParsedImportsForProvider(effectiveAccountId, provider);
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
    }, [effectiveAccountId, provider]);

    useEffect(() => {
        if (!isAtasProvider || forceAtasZeroState || !csvMatchAccountId) {
            setAtasHistoryState({
                loading: false,
                error: "",
                orders: EMPTY_LIST,
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

        fetchAtasHistoryOrders(
            {
                accountId: csvMatchAccountId,
                start: historyStartDate || ATAS_HISTORY_START_DATE,
                end: historyEndDate || getDefaultEndDate(),
            },
            controller.signal
        )
            .then((result) => {
                const historyOrders = Array.isArray(result?.orders)
                    ? result.orders.map((order, index) =>
                        normalizeAtasHistoryOrder(order, index)
                    )
                    : EMPTY_LIST;

                setAtasHistoryState({
                    loading: false,
                    error: "",
                    orders: historyOrders,
                    readAt: result?.readAt || "",
                });
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                setAtasHistoryState({
                    loading: false,
                    error: cleanString(error?.message) || "ATAS Orders History konnte nicht geladen werden.",
                    orders: EMPTY_LIST,
                    readAt: "",
                });
            });

        return () => {
            controller.abort();
        };
    }, [
        isAtasProvider,
        forceAtasZeroState,
        csvMatchAccountId,
        historyStartDate,
        historyEndDate,
    ]);

    const resolvedAccountImports = useMemo(() => {
        return resolveImportsForProvider(provider, resolvedAccount?.imports);
    }, [provider, resolvedAccount?.imports]);

    const directImports = useMemo(() => {
        return resolveImportsForProvider(provider, imports);
    }, [provider, imports]);

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
            hasImportCollectionContent(directImports) ? directImports : imports
        );
    }, [
        localImports,
        resolvedAccountImports,
        directImports,
        directEffectiveImports,
        imports,
    ]);

    const mappedImportOrders = useMemo(() => {
        if (forceAtasZeroState) {
            return { entries: EMPTY_LIST };
        }

        return callBuildOrdersData(
            effectiveImports,
            csvMatchAccountId || effectiveAccountId,
            provider
        );
    }, [forceAtasZeroState, effectiveImports, csvMatchAccountId, effectiveAccountId, provider]);

    const liveOrders = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return toArray(getLiveOrderRows(liveSnapshot));
    }, [liveSnapshot, forceAtasZeroState]);

    const directOrders = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return toArray(orders);
    }, [orders, forceAtasZeroState]);

    const importedOrders = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return toArray(mappedImportOrders?.entries);
    }, [mappedImportOrders, forceAtasZeroState]);

    const historyOrders = useMemo(() => {
        if (!isAtasProvider || forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return Array.isArray(atasHistoryState.orders)
            ? atasHistoryState.orders
            : EMPTY_LIST;
    }, [isAtasProvider, forceAtasZeroState, atasHistoryState.orders]);

    const safeSimulationTrades = useMemo(() => {
        if (forceAtasZeroState) {
            return EMPTY_LIST;
        }

        return toArray(simulationTrades);
    }, [simulationTrades, forceAtasZeroState]);

    const orderRows = useMemo(() => {
        let rows = EMPTY_LIST;

        if (isAtasProvider) {
            rows = dedupeOrderRows([
                ...historyOrders,
                ...mapOrderRows(liveOrders, providerLabel),
                ...mapOrderRows(importedOrders, `${providerLabel} Import`),
                ...mapOrderRows(directOrders, "APP"),
                ...buildSimulationRows(safeSimulationTrades),
            ]);
        } else {
            if (importedOrders.length > 0) {
                rows = mapOrderRows(importedOrders, providerLabel);
            } else if (directOrders.length > 0) {
                rows = mapOrderRows(directOrders, "APP");
            } else if (liveOrders.length > 0) {
                rows = mapOrderRows(liveOrders, `${providerLabel} Feed`);
            } else if (safeSimulationTrades.length > 0) {
                rows = buildSimulationRows(safeSimulationTrades);
            }
        }

        if (rows.length === 0) {
            return EMPTY_LIST;
        }

        return [...rows].sort((a, b) => parseTimestamp(b.time) - parseTimestamp(a.time));
    }, [
        isAtasProvider,
        historyOrders,
        providerLabel,
        liveOrders,
        importedOrders,
        directOrders,
        safeSimulationTrades,
    ]);

    const stats = useMemo(() => {
        return orderRows.reduce(
            (acc, row) => {
                const side = normalizeText(row.side);
                const status = normalizeText(row.status);
                const qty = toNumber(row.qty, 0);

                acc.total += 1;
                acc.totalQty += qty;

                if (side.includes("buy") || side.includes("long")) {
                    acc.buyCount += 1;
                }

                if (side.includes("sell") || side.includes("short")) {
                    acc.sellCount += 1;
                }

                if (
                    status.includes("filled") ||
                    status.includes("executed") ||
                    status.includes("done") ||
                    status.includes("complete")
                ) {
                    acc.filledCount += 1;
                } else if (
                    status.includes("working") ||
                    status.includes("open") ||
                    status.includes("pending") ||
                    status.includes("submitted") ||
                    status.includes("partial") ||
                    status.includes("active")
                ) {
                    acc.openCount += 1;
                } else if (
                    status.includes("cancel") ||
                    status.includes("reject") ||
                    status.includes("error") ||
                    status.includes("fail")
                ) {
                    acc.cancelledCount += 1;
                } else {
                    acc.otherCount += 1;
                }

                return acc;
            },
            {
                total: 0,
                buyCount: 0,
                sellCount: 0,
                totalQty: 0,
                filledCount: 0,
                openCount: 0,
                cancelledCount: 0,
                otherCount: 0,
            }
        );
    }, [orderRows]);

    const statusLabel = forceAtasZeroState
        ? "Keine Orders geladen"
        : resolveFeedLabel(
            provider,
            liveOrders.length,
            historyOrders.length,
            importedOrders.length,
            directOrders.length,
            safeSimulationTrades.length,
            atasHistoryState.loading
        );

    const statusColor = forceAtasZeroState
        ? COLORS.muted
        : resolveFeedColor(
            provider,
            liveOrders.length,
            historyOrders.length,
            importedOrders.length,
            directOrders.length,
            safeSimulationTrades.length,
            atasHistoryState.loading
        );

    const lastOrderTime = useMemo(() => {
        return resolveLastOrderTime(orderRows);
    }, [orderRows]);

    const instrumentSummary = useMemo(() => {
        return resolveInstrumentSummary(orderRows);
    }, [orderRows]);

    const primarySource = useMemo(() => {
        return resolvePrimarySource(orderRows);
    }, [orderRows]);

    const averageQty = stats.total > 0 ? stats.totalQty / stats.total : 0;

    const recentRows = useMemo(() => {
        return orderRows.slice(0, 5);
    }, [orderRows]);

    const uniqueInstruments = useMemo(() => {
        return reduceContractsWithMicroPriority(
            orderRows.map((row) => row?.instrument)
        );
    }, [orderRows]);

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
                        Orders
                    </h2>

                    <div
                        style={{
                            color: COLORS.muted,
                            marginTop: 8,
                            fontSize: 13,
                            lineHeight: 1.45,
                        }}
                    >
                        Aktiver Order Feed aus ATAS History, Live Snapshot und Import Daten für den gewählten Account.
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
                            color: isAtasProvider ? COLORS.purple : COLORS.cyan,
                        }}
                    >
                        {providerLabel}
                    </div>

                    <div style={badgeStyle}>
                        {formatInteger(stats.total)} Orders
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
                        <div style={filterInfoLabelStyle}>History Orders</div>
                        <div style={filterInfoValueStyle}>
                            {atasHistoryState.loading
                                ? "Lädt..."
                                : formatInteger(historyOrders.length)}
                        </div>
                    </div>

                    <div style={filterInfoStyle}>
                        <div style={filterInfoLabelStyle}>Quelle</div>
                        <div style={filterInfoValueStyle}>
                            Orders.cdb
                        </div>
                    </div>

                    {atasHistoryState.error ? (
                        <div
                            style={{
                                ...filterInfoStyle,
                                borderColor: "rgba(248, 113, 113, 0.34)",
                                color: COLORS.red,
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
                    <div style={summaryLabelStyle}>Orders gesamt</div>
                    <div style={summaryValueStyle}>{formatInteger(stats.total)}</div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Filled für Journal</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: COLORS.green,
                        }}
                    >
                        {formatInteger(stats.filledCount)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Offen für Positions</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            color: COLORS.yellow,
                        }}
                    >
                        {formatInteger(stats.openCount)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Letzte Aktivität</div>
                    <div
                        style={{
                            ...summaryValueStyle,
                            fontSize: 16,
                            lineHeight: 1.35,
                        }}
                    >
                        {lastOrderTime ? formatDateTime(lastOrderTime) : "–"}
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
                                Order Liste
                            </div>
                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 12,
                                    marginTop: 4,
                                }}
                            >
                                Zeit, Quelle, Instrument, Side, Qty, Preis und Status
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
                                Quelle {primarySource}
                            </span>
                            <span style={tableMetaPillStyle}>
                                Provider {providerLabel}
                            </span>
                            <span style={tableMetaPillStyle}>
                                History {formatInteger(historyOrders.length)}
                            </span>
                            <span style={tableMetaPillStyle}>
                                Symbole {formatInteger(uniqueInstruments.length)}
                            </span>
                            <span style={tableMetaPillStyle}>
                                Qty {formatInteger(stats.totalQty)}
                            </span>
                        </div>
                    </div>

                    {orderRows.length === 0 ? (
                        <div
                            style={{
                                padding: 20,
                                color: COLORS.muted,
                                fontSize: 14,
                            }}
                        >
                            Keine Orders geladen.
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
                                    minWidth: 1020,
                                }}
                            >
                                <thead
                                    style={{
                                        background: COLORS.tableHead,
                                    }}
                                >
                                    <tr>
                                        <th style={thStyle}>Zeit</th>
                                        <th style={thStyle}>Quelle</th>
                                        <th style={thStyle}>Instrument</th>
                                        <th style={thStyle}>Side</th>
                                        <th style={thStyle}>Qty</th>
                                        <th style={thStyle}>Preis</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Order ID</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {orderRows.map((row, index) => (
                                        <tr
                                            key={`${row.id}-${index}`}
                                            style={{
                                                background:
                                                    index % 2 === 0 ? "transparent" : COLORS.rowAlt,
                                            }}
                                        >
                                            <td style={tdStyle}>{formatDateTime(row.time)}</td>

                                            <td style={tdStyle}>
                                                <span
                                                    style={{
                                                        ...inlinePillStyle,
                                                        color: resolveSourceTone(row.source),
                                                    }}
                                                >
                                                    {row.source}
                                                </span>
                                            </td>

                                            <td style={tdStyle}>
                                                <span style={instrumentTextStyle}>
                                                    {row.instrument}
                                                </span>
                                            </td>

                                            <td style={tdStyle}>
                                                <span
                                                    style={{
                                                        ...inlinePillStyle,
                                                        color: resolveSideTone(row.side),
                                                    }}
                                                >
                                                    {row.side}
                                                </span>
                                            </td>

                                            <td style={tdStyle}>{formatNumber(row.qty, 0)}</td>

                                            <td style={tdStyle}>{formatNumber(row.price, 2)}</td>

                                            <td style={tdStyle}>
                                                <span
                                                    style={{
                                                        ...inlinePillStyle,
                                                        color: resolveStatusTone(row.status),
                                                    }}
                                                >
                                                    {row.status}
                                                </span>
                                            </td>

                                            <td style={tdStyle}>
                                                <span style={monoTextStyle}>
                                                    {truncateMiddle(row.id, 26)}
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
                        <div style={sideCardTitleStyle}>Feed Überblick</div>

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
                                <span style={metaKeyStyle}>Primärquelle</span>
                                <span style={metaValueStyle}>{primarySource}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Symbole</span>
                                <span style={metaValueStyle}>{instrumentSummary}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>History Orders</span>
                                <span style={metaValueStyle}>{formatInteger(historyOrders.length)}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Live Orders</span>
                                <span style={metaValueStyle}>{formatInteger(liveOrders.length)}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Zeitraum</span>
                                <span style={metaValueStyle}>
                                    {formatDateLabel(historyStartDate)} bis {formatDateLabel(historyEndDate)}
                                </span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Ø Qty</span>
                                <span style={metaValueStyle}>{formatNumber(averageQty, 2)}</span>
                            </div>

                            <div style={metaRowStyle}>
                                <span style={metaKeyStyle}>Letzte Order</span>
                                <span style={metaValueStyle}>
                                    {lastOrderTime ? formatDateTime(lastOrderTime) : "–"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Status Fokus</div>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Filled</span>
                                    <span
                                        style={{
                                            ...statusRowValueStyle,
                                            color: COLORS.green,
                                        }}
                                    >
                                        {formatInteger(stats.filledCount)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Basis für Journal
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Offen</span>
                                    <span
                                        style={{
                                            ...statusRowValueStyle,
                                            color: COLORS.yellow,
                                        }}
                                    >
                                        {formatInteger(stats.openCount)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Fokus für Positions
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Storniert</span>
                                    <span
                                        style={{
                                            ...statusRowValueStyle,
                                            color: COLORS.red,
                                        }}
                                    >
                                        {formatInteger(stats.cancelledCount)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Historie und Feed Qualität
                                </div>
                            </div>

                            <div style={statusRowCardStyle}>
                                <div style={statusRowHeadStyle}>
                                    <span style={statusRowLabelStyle}>Buy / Sell</span>
                                    <span style={statusRowValueStyle}>
                                        {formatInteger(stats.buyCount)} / {formatInteger(stats.sellCount)}
                                    </span>
                                </div>
                                <div style={statusRowSubTextStyle}>
                                    Richtungsverteilung
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={sideCardStyle}>
                        <div style={sideCardTitleStyle}>Letzte Aktivität</div>

                        {recentRows.length === 0 ? (
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
                                {recentRows.map((row, index) => (
                                    <div
                                        key={`recent-${row.id}-${index}`}
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
                                                {row.instrument}
                                            </div>

                                            <span
                                                style={{
                                                    ...inlinePillStyle,
                                                    color: resolveStatusTone(row.status),
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {row.status}
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
                                                        color: resolveSideTone(row.side),
                                                    }}
                                                >
                                                    {row.side}
                                                </span>

                                                <span style={miniTagStyle}>
                                                    Qty {formatNumber(row.qty, 0)}
                                                </span>

                                                <span
                                                    style={{
                                                        ...miniTagStyle,
                                                        color: resolveSourceTone(row.source),
                                                    }}
                                                >
                                                    {row.source}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                {formatDateTime(row.time)}
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

const thStyle = {
    textAlign: "left",
    padding: "13px 14px",
    fontSize: 12,
    color: COLORS.muted,
    borderBottom: `1px solid ${COLORS.borderStrong}`,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: COLORS.tableHead,
};

const tdStyle = {
    padding: "13px 14px",
    fontSize: 13,
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
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