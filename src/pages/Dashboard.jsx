import { useEffect, useMemo, useState } from "react";
import LiveCard from "../components/LiveCard";
import RiskPanel from "../components/RiskPanel";
import RulesPanel from "../components/RulesPanel";
import OrdersPanel from "../components/OrdersPanel";
import PositionsPanel from "../components/PositionsPanel";
import JournalPanel from "../components/JournalPanel";
import ImportCenterPanel from "../components/ImportCenterPanel";
import SimulatorPanel from "../components/SimulatorPanel";
import ValidationPanel from "../components/ValidationPanel";
import AccountBalancePanel from "../components/AccountBalancePanel";
import {
    getAccountBalanceHistory,
    getFills,
    getLiveAccountSnapshot,
    getOrders,
} from "../utils/storage";
import {
    getProviderLabel,
    getProviderStatusLabel,
    getProviderTypeLabel,
} from "../utils/providerModel";
import {
    getActiveProvider,
    getStrictProviderAccountName,
    getStrictProviderTradingRef,
    hasStrictProviderIdentity,
    shouldUseAtasZeroState,
} from "../utils/providerDisplay";
import {
    fetchAtasHistoryOrders,
    getAtasHistoryStartDate,
} from "../utils/atasBridgeApi";

const EMPTY_LIST = Object.freeze([]);

const ATAS_HISTORY_SUMMARY_URL = "http://localhost:3030/api/atas/history/summary";
const ATAS_HISTORY_START_DATE = getAtasHistoryStartDate();

const COLORS = {
    panelBg: "#050816",
    panelBgSoft: "rgba(255, 255, 255, 0.03)",
    panelBgStrong: "rgba(15, 23, 42, 0.82)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#f8fafc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    cyan: "#22d3ee",
    blue: "#38bdf8",
    gold: "#facc15",
    green: "#22c55e",
    yellow: "#f59e0b",
    red: "#ef4444",
    violet: "#a78bfa",
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

function toNumber(value, fallback = 0) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    const rawText = cleanString(value);

    if (!rawText) {
        return fallback;
    }

    let text = rawText
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    const negativeByParens = text.startsWith("(") && text.endsWith(")");
    text = text.replace(/[()]/g, "");

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
        return fallback;
    }

    return negativeByParens ? -Math.abs(parsed) : parsed;
}

function formatCurrency(value) {
    if (!Number.isFinite(toNumber(value, NaN))) {
        return "–";
    }

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

function formatDateTime(value) {
    if (!value) {
        return "Kein Sync";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function getDefaultEndDate() {
    return new Date().toISOString().slice(0, 10);
}

function getProviderStatusTone(status) {
    const normalized = cleanString(status).toLowerCase();

    if (
        normalized === "connected" ||
        normalized === "ready" ||
        normalized === "online"
    ) {
        return "green";
    }

    if (normalized === "syncing") {
        return "yellow";
    }

    if (
        normalized === "error" ||
        normalized === "disconnected" ||
        normalized === "offline"
    ) {
        return "red";
    }

    return "neutral";
}

function getMetricToneFromProviderStatus(status) {
    const tone = getProviderStatusTone(status);

    if (tone === "green") {
        return "green";
    }

    if (tone === "yellow") {
        return "yellow";
    }

    if (tone === "red") {
        return "red";
    }

    return "white";
}

function getRuleStatusTone(status) {
    const normalized = cleanString(status).toLowerCase();

    if (
        normalized === "passed" ||
        normalized === "target_reached" ||
        normalized.includes("bestanden")
    ) {
        return "green";
    }

    if (
        normalized === "expired" ||
        normalized === "failed" ||
        normalized.includes("abgelaufen") ||
        normalized.includes("nicht bestanden")
    ) {
        return "red";
    }

    if (normalized === "archived" || normalized.includes("archiv")) {
        return "yellow";
    }

    if (normalized === "active" || normalized.includes("aktiv")) {
        return "cyan";
    }

    return "white";
}

function getPnlTone(value) {
    const number = toNumber(value, 0);

    if (number > 0) {
        return "green";
    }

    if (number < 0) {
        return "red";
    }

    return "white";
}

function getSafeRows(value) {
    return Array.isArray(value) ? value : [];
}

function getDisplayOrderCount(providerMeta) {
    if (!providerMeta) {
        return 0;
    }

    if (providerMeta.provider === "atas") {
        return providerMeta.historyOrderCount;
    }

    return providerMeta.orderCount;
}

function getAccountLabelFallback(account) {
    if (!account) {
        return "";
    }

    return (
        cleanString(account?.displayName) ||
        cleanString(account?.tradingAccountName) ||
        cleanString(account?.tradingAccountId) ||
        cleanString(account?.id)
    );
}

function getGroupAccounts(group) {
    const slots = group?.slots || {};

    return [
        slots.evalEod || null,
        slots.paEod || null,
        slots.evalIntraday || null,
        slots.paIntraday || null,
        ...(Array.isArray(group?.accounts) ? group.accounts : []),
    ].filter((account, index, array) => {
        if (!account?.id) {
            return false;
        }

        return array.findIndex((item) => item?.id === account.id) === index;
    });
}

function getFirstGroupAccount(group) {
    const accounts = getGroupAccounts(group);
    return accounts.length ? accounts[0] : null;
}

function resolveGroupTitle(group, getAccountDisplayName) {
    const rawTitle = cleanString(group?.title);

    if (rawTitle && rawTitle.toLowerCase() !== "kein account") {
        return rawTitle;
    }

    const fallbackAccount = getFirstGroupAccount(group);

    if (!fallbackAccount) {
        return "Gruppe";
    }

    const displayName =
        typeof getAccountDisplayName === "function"
            ? cleanString(getAccountDisplayName(fallbackAccount))
            : "";

    return displayName || getAccountLabelFallback(fallbackAccount) || "Gruppe";
}

function getAtasStartBalance(snapshot) {
    const directStart = toNumber(snapshot?.atasStartingBalance, NaN);

    if (Number.isFinite(directStart)) {
        return directStart;
    }

    const providerStart = toNumber(snapshot?.providerStartingBalance, NaN);

    if (Number.isFinite(providerStart)) {
        return providerStart;
    }

    const snapshotStart = toNumber(snapshot?.snapshotStartingBalance, NaN);

    if (Number.isFinite(snapshotStart)) {
        return snapshotStart;
    }

    const startBalance = toNumber(snapshot?.startingBalance, NaN);

    if (Number.isFinite(startBalance)) {
        return startBalance;
    }

    return 0;
}

function getAtasCurrentBalance(snapshot) {
    const currentBalance = toNumber(snapshot?.currentBalance, NaN);

    if (Number.isFinite(currentBalance)) {
        return currentBalance;
    }

    const balance = toNumber(snapshot?.balance, NaN);

    if (Number.isFinite(balance)) {
        return balance;
    }

    const cash = toNumber(snapshot?.cash, NaN);

    if (Number.isFinite(cash)) {
        return cash;
    }

    return 0;
}

function isReplaySnapshot(snapshot) {
    const accountId = cleanString(snapshot?.accountId).toLowerCase();
    const accountName = cleanString(snapshot?.accountName).toLowerCase();
    const tradingRef = cleanString(snapshot?.tradingAccountId).toLowerCase();
    const sourceName = cleanString(snapshot?.sourceName).toLowerCase();

    return (
        accountId === "replay" ||
        accountName === "replay" ||
        tradingRef === "replay" ||
        sourceName === "replay"
    );
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

function resolveSymbolSummary(values) {
    const symbols = reduceContractsWithMicroPriority(values);

    if (!symbols.length) {
        return "–";
    }

    if (symbols.length <= 3) {
        return symbols.join(", ");
    }

    return `${symbols.slice(0, 3).join(", ")} +${symbols.length - 3}`;
}

function getRuntimeAccountText(account, snapshot) {
    return [
        snapshot?.accountPhase,
        account?.accountPhase,
        snapshot?.productType,
        account?.productType,
        snapshot?.mode,
        account?.mode,
        snapshot?.accountMode,
        account?.accountMode,
        snapshot?.dataProviderAccountId,
        snapshot?.dataProviderAccountName,
        snapshot?.atasAccountId,
        snapshot?.atasAccountName,
        snapshot?.tradingAccountId,
        snapshot?.tradingAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.displayName,
    ].join(" ");
}

function getRuntimePhase(account, snapshot, replaySource) {
    if (replaySource) {
        return "replay";
    }

    const normalized = getRuntimeAccountText(account, snapshot)
        .toUpperCase()
        .replace(/\s+/g, "");

    if (
        normalized.startsWith("PA-APEX") ||
        normalized.startsWith("PA_APEX") ||
        normalized.startsWith("PAAPEX")
    ) {
        return "pa";
    }

    if (
        normalized.startsWith("APEX-") ||
        normalized.startsWith("APEX_") ||
        normalized.startsWith("APEX")
    ) {
        return "eval";
    }

    const rawPhase = cleanString(snapshot?.accountPhase || account?.accountPhase).toLowerCase();

    if (rawPhase.includes("pa")) {
        return "pa";
    }

    return "eval";
}

function getRuntimeProductType(account, snapshot, replaySource) {
    if (replaySource) {
        return "replay";
    }

    const text = getRuntimeAccountText(account, snapshot).toLowerCase();

    if (text.includes("intraday")) {
        return "intraday";
    }

    if (text.includes("eod")) {
        return "eod";
    }

    const rawProductType = cleanString(snapshot?.productType || account?.productType).toLowerCase();

    if (rawProductType.includes("intraday")) {
        return "intraday";
    }

    return "eod";
}

function resolveKnownAccountSize(value) {
    const numeric = toNumber(value, NaN);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return "";
    }

    const accountSize = numeric < 1000 ? numeric * 1000 : numeric;

    if (accountSize >= 145000 && accountSize <= 175000) {
        return "150K";
    }

    if (accountSize >= 95000 && accountSize <= 125000) {
        return "100K";
    }

    if (accountSize >= 45000 && accountSize <= 65000) {
        return "50K";
    }

    if (accountSize >= 20000 && accountSize <= 35000) {
        return "25K";
    }

    return "";
}

function resolveAccountSizeFromTargetBalance(value) {
    const targetBalance = toNumber(value, NaN);

    if (!Number.isFinite(targetBalance) || targetBalance <= 0) {
        return "";
    }

    if (targetBalance >= 158000 && targetBalance <= 170000) {
        return "150K";
    }

    if (targetBalance >= 105000 && targetBalance <= 115000) {
        return "100K";
    }

    if (targetBalance >= 52500 && targetBalance <= 57000) {
        return "50K";
    }

    if (targetBalance >= 26000 && targetBalance <= 28000) {
        return "25K";
    }

    return "";
}

function resolveAccountSizeFromBalance(value) {
    const balance = toNumber(value, NaN);

    if (!Number.isFinite(balance) || balance <= 0) {
        return "";
    }

    if (balance >= 145000 && balance <= 175000) {
        return "150K";
    }

    if (balance >= 95000 && balance <= 125000) {
        return "100K";
    }

    if (balance >= 45000 && balance <= 65000) {
        return "50K";
    }

    if (balance >= 20000 && balance <= 35000) {
        return "25K";
    }

    return "";
}

function getRuntimeAccountSizeLabel(account, snapshot) {
    const directSize = [
        snapshot?.accountSizeLabel,
        account?.accountSizeLabel,
        snapshot?.accountSize,
        account?.accountSize,
        snapshot?.size,
        account?.size,
        snapshot?.accountSizeName,
        account?.accountSizeName,
    ];

    for (const value of directSize) {
        const text = cleanString(value).toUpperCase();

        if (text.includes("150K") || text.includes("150000")) {
            return "150K";
        }

        if (text.includes("100K") || text.includes("100000")) {
            return "100K";
        }

        if (text.includes("50K") || text.includes("50000")) {
            return "50K";
        }

        if (text.includes("25K") || text.includes("25000")) {
            return "25K";
        }

        const resolved = resolveKnownAccountSize(value);

        if (resolved) {
            return resolved;
        }
    }

    const targetBalanceSize = [
        snapshot?.targetBalance,
        account?.targetBalance,
        snapshot?.ruleTargetBalance,
        account?.ruleTargetBalance,
    ];

    for (const value of targetBalanceSize) {
        const resolved = resolveAccountSizeFromTargetBalance(value);

        if (resolved) {
            return resolved;
        }
    }

    const balanceSize = [
        snapshot?.startingBalance,
        account?.startingBalance,
        snapshot?.atasStartingBalance,
        snapshot?.providerStartingBalance,
        snapshot?.snapshotStartingBalance,
        snapshot?.currentBalance,
        account?.currentBalance,
        snapshot?.balance,
        snapshot?.cash,
    ];

    for (const value of balanceSize) {
        const resolved = resolveAccountSizeFromBalance(value);

        if (resolved) {
            return resolved;
        }
    }

    return "";
}

function normalizeAccountMatchText(value) {
    return cleanString(value)
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z0-9-]/g, "");
}

function getAtasHistoryAccounts(summary) {
    if (!summary || typeof summary !== "object") {
        return EMPTY_LIST;
    }

    if (Array.isArray(summary.accounts)) {
        return summary.accounts;
    }

    if (Array.isArray(summary.accountSummaries)) {
        return summary.accountSummaries;
    }

    if (Array.isArray(summary.items)) {
        return summary.items;
    }

    return EMPTY_LIST;
}

function getAtasHistoryAccountKeys(account, snapshot, tradingRef) {
    return [
        tradingRef,
        account?.id,
        account?.displayName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
        snapshot?.accountId,
        snapshot?.accountName,
        snapshot?.tradingAccountId,
        snapshot?.tradingAccountName,
        snapshot?.dataProviderAccountId,
        snapshot?.dataProviderAccountName,
        snapshot?.atasAccountId,
        snapshot?.atasAccountName,
    ]
        .map(normalizeAccountMatchText)
        .filter(Boolean);
}

function pickAtasHistoryAccount(summary, account, snapshot, tradingRef) {
    const accounts = getAtasHistoryAccounts(summary);

    if (!accounts.length) {
        return null;
    }

    const targetKeys = getAtasHistoryAccountKeys(account, snapshot, tradingRef);

    const exactMatch = accounts.find((entry) => {
        const entryKeys = [
            entry?.accountId,
            entry?.accountName,
            entry?.tradingAccountId,
            entry?.tradingAccountName,
            entry?.name,
            entry?.id,
        ]
            .map(normalizeAccountMatchText)
            .filter(Boolean);

        return entryKeys.some((key) => targetKeys.includes(key));
    });

    if (exactMatch) {
        return exactMatch;
    }

    if (accounts.length === 1) {
        return accounts[0];
    }

    return null;
}

function getAtasSummaryNumber(entry, summary, keys, fallback = 0) {
    for (const key of keys) {
        const entryValue = entry?.[key];

        if (entryValue !== undefined && entryValue !== null && entryValue !== "") {
            return toNumber(entryValue, fallback);
        }
    }

    const accounts = getAtasHistoryAccounts(summary);

    if (accounts.length <= 1) {
        for (const key of keys) {
            const summaryValue = summary?.[key];

            if (summaryValue !== undefined && summaryValue !== null && summaryValue !== "") {
                return toNumber(summaryValue, fallback);
            }
        }
    }

    return fallback;
}

function getAtasSummaryText(entry, summary, keys, fallback = "") {
    for (const key of keys) {
        const entryValue = entry?.[key];

        if (entryValue !== undefined && entryValue !== null && entryValue !== "") {
            return cleanString(entryValue);
        }
    }

    const accounts = getAtasHistoryAccounts(summary);

    if (accounts.length <= 1) {
        for (const key of keys) {
            const summaryValue = summary?.[key];

            if (summaryValue !== undefined && summaryValue !== null && summaryValue !== "") {
                return cleanString(summaryValue);
            }
        }
    }

    return fallback;
}

function getAtasSummarySymbols(entry, summary, snapshot) {
    const values = [
        ...(Array.isArray(entry?.symbols) ? entry.symbols : EMPTY_LIST),
        ...(Array.isArray(entry?.contracts) ? entry.contracts : EMPTY_LIST),
        ...(Array.isArray(summary?.symbols) ? summary.symbols : EMPTY_LIST),
        ...(Array.isArray(summary?.contracts) ? summary.contracts : EMPTY_LIST),
        snapshot?.symbol,
        snapshot?.instrument,
        snapshot?.contract,
        snapshot?.product,
    ];

    return resolveSymbolSummary(values);
}

function normalizeDashboardHistoryOrder(order, index) {
    const id =
        cleanString(order?.orderId) ||
        cleanString(order?.id) ||
        cleanString(order?.tradeId) ||
        cleanString(order?.ExtId) ||
        `atas-history-order-${index}`;

    return {
        id,
        instrument:
            cleanString(order?.instrument) ||
            cleanString(order?.symbol) ||
            cleanString(order?.contract) ||
            cleanString(order?.SecurityId) ||
            "–",
        side:
            cleanString(order?.side) ||
            cleanString(order?.direction) ||
            cleanString(order?.Direction) ||
            cleanString(order?.orderDirection) ||
            "–",
        qty:
            order?.qty ??
            order?.quantity ??
            order?.QuantityToFill ??
            order?.volume ??
            order?.Volume ??
            0,
        status:
            cleanString(order?.status) ||
            cleanString(order?.state) ||
            cleanString(order?.State) ||
            "–",
        price:
            order?.price ??
            order?.Price ??
            order?.limitPrice ??
            order?.avgPrice ??
            0,
        time:
            cleanString(order?.timestamp) ||
            cleanString(order?.time) ||
            cleanString(order?.Time) ||
            cleanString(order?.createdAt) ||
            "",
    };
}

function dedupeDashboardHistoryOrders(rows) {
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

function isFilledOrder(row) {
    const status = cleanString(row?.status).toLowerCase();

    return (
        status.includes("filled") ||
        status.includes("executed") ||
        status.includes("done") ||
        status.includes("complete")
    );
}

function buildDashboardHistoryOrderStats(result) {
    const rawOrders = Array.isArray(result?.orders) ? result.orders : EMPTY_LIST;
    const rows = dedupeDashboardHistoryOrders(
        rawOrders.map((order, index) => normalizeDashboardHistoryOrder(order, index))
    );

    return {
        historyOrderCount: rows.length,
        filledOrderCount: rows.filter(isFilledOrder).length,
        readAt: cleanString(result?.readAt),
    };
}

function buildAtasHistoryMeta(summary, account, snapshot, tradingRef, orderStats = null) {
    if (!summary || typeof summary !== "object" || summary.ok === false) {
        return {
            hasHistorySummary: false,
            orderCount: 0,
            historyOrderCount: toNumber(orderStats?.historyOrderCount, 0),
            filledOrderCount: toNumber(orderStats?.filledOrderCount, 0),
            fillCount: 0,
            closedTradeCount: 0,
            grossPnl: 0,
            netPnl: 0,
            commission: 0,
            firstTradeAt: "",
            lastTradeAt: "",
            symbolSummary: "–",
        };
    }

    const entry = pickAtasHistoryAccount(summary, account, snapshot, tradingRef);
    const accounts = getAtasHistoryAccounts(summary);

    if (accounts.length > 1 && !entry) {
        return {
            hasHistorySummary: false,
            orderCount: 0,
            historyOrderCount: toNumber(orderStats?.historyOrderCount, 0),
            filledOrderCount: toNumber(orderStats?.filledOrderCount, 0),
            fillCount: 0,
            closedTradeCount: 0,
            grossPnl: 0,
            netPnl: 0,
            commission: 0,
            firstTradeAt: "",
            lastTradeAt: "",
            symbolSummary: "–",
        };
    }

    const orderCount = getAtasSummaryNumber(entry, summary, [
        "orders",
        "orderCount",
        "totalOrders",
        "totalOrderCount",
    ]);

    const orderStatsHistoryCount = toNumber(orderStats?.historyOrderCount, 0);
    const orderStatsFilledCount = toNumber(orderStats?.filledOrderCount, 0);

    const historyOrderCount = orderStatsHistoryCount > 0
        ? orderStatsHistoryCount
        : getAtasSummaryNumber(entry, summary, [
            "historyOrders",
            "historyOrderCount",
            "filledOrders",
            "filledOrderCount",
            "doneOrders",
            "doneOrderCount",
            "journalOrders",
            "journalOrderCount",
        ], orderCount);

    const filledOrderCount = orderStatsFilledCount > 0
        ? orderStatsFilledCount
        : historyOrderCount;

    return {
        hasHistorySummary: true,
        orderCount,
        historyOrderCount,
        filledOrderCount,
        fillCount: getAtasSummaryNumber(entry, summary, [
            "fills",
            "fillCount",
            "filledCount",
        ]),
        closedTradeCount: getAtasSummaryNumber(entry, summary, [
            "trades",
            "tradeCount",
            "closedTrades",
            "closedTradeCount",
        ]),
        grossPnl: getAtasSummaryNumber(entry, summary, [
            "grossPnL",
            "grossPnl",
            "grossPNL",
            "gross",
        ]),
        netPnl: getAtasSummaryNumber(entry, summary, [
            "netPnL",
            "netPnl",
            "netPNL",
            "pnl",
        ]),
        commission: getAtasSummaryNumber(entry, summary, [
            "commission",
            "commissions",
            "fees",
        ]),
        firstTradeAt: getAtasSummaryText(entry, summary, [
            "firstTradeAt",
            "firstTrade",
            "firstAt",
            "startTradeAt",
        ]),
        lastTradeAt: getAtasSummaryText(entry, summary, [
            "lastTradeAt",
            "lastTrade",
            "lastAt",
            "endTradeAt",
        ]),
        symbolSummary: getAtasSummarySymbols(entry, summary, snapshot),
    };
}

function buildRuntimeAccountMeta(account, atasHistorySummary = null, atasHistoryOrderStats = null) {
    if (!account?.id) {
        return {
            snapshot: null,
            provider: "tradovate",
            providerLabel: getProviderLabel("tradovate"),
            providerTypeLabel: getProviderTypeLabel("", "tradovate"),
            providerStatusLabel: getProviderStatusLabel(""),
            providerStatusTone: "neutral",
            ruleStatusLabel: "Neutral",
            ruleStatusTone: "neutral",
            lastSyncAtValue: "",
            lastSyncLabel: "Kein Sync",
            sourceName: "Offen",
            tradingRef: "Offen",
            orderCount: 0,
            historyOrderCount: 0,
            filledOrderCount: 0,
            fillCount: 0,
            balancePoints: 0,
            startBalance: 0,
            currentBalance: 0,
            delta: 0,
            orders: [],
            fills: [],
            cashHistory: [],
            hasIdentity: false,
            phaseLabel: "",
            modeLabel: "",
            accountSizeLabel: "",
            lifecycleStatusLabel: "Offen",
            lifecycleStatusNote: "Lifecycle",
            lifecycleStatusTone: "white",
            hasHistorySummary: false,
            closedTradeCount: 0,
            historyGrossPnl: 0,
            historyNetPnl: 0,
            historyCommission: 0,
            firstTradeAt: "",
            lastTradeAt: "",
            symbolSummary: "–",
            showMacherBadge: false,
            macherBadgeTitle: "",
            macherBadgeText: "",
            macherBadgeIcon: "",
        };
    }

    const snapshot = getLiveAccountSnapshot(account.id);
    const provider = getActiveProvider(account, snapshot);
    const isAtas = provider === "atas";
    const hasIdentity = hasStrictProviderIdentity(account, snapshot, provider);
    const zeroState = shouldUseAtasZeroState(account, snapshot, provider);

    const rawOrders = isAtas
        ? Array.isArray(snapshot?.orders)
            ? snapshot.orders
            : EMPTY_LIST
        : Array.isArray(snapshot?.orders) && snapshot.orders.length > 0
            ? snapshot.orders
            : getSafeRows(getOrders(account.id));

    const rawFills = isAtas
        ? Array.isArray(snapshot?.fills)
            ? snapshot.fills
            : EMPTY_LIST
        : Array.isArray(snapshot?.fills) && snapshot.fills.length > 0
            ? snapshot.fills
            : getSafeRows(getFills(account.id));

    const rawCashHistory = isAtas
        ? Array.isArray(snapshot?.balanceHistory)
            ? snapshot.balanceHistory
            : Array.isArray(snapshot?.cashHistory)
                ? snapshot.cashHistory
                : EMPTY_LIST
        : Array.isArray(snapshot?.balanceHistory) && snapshot.balanceHistory.length > 0
            ? snapshot.balanceHistory
            : Array.isArray(snapshot?.cashHistory) && snapshot.cashHistory.length > 0
                ? snapshot.cashHistory
                : getSafeRows(getAccountBalanceHistory(account.id));

    const orders = zeroState ? [] : rawOrders;
    const fills = zeroState ? [] : rawFills;
    const cashHistory = zeroState ? [] : rawCashHistory;

    const providerType = cleanString(
        snapshot?.dataProviderType || account?.dataProviderType
    );

    const providerStatus = cleanString(
        snapshot?.dataProviderStatus ||
            snapshot?.connectionStatus ||
            account?.dataProviderStatus
    );

    const startBalance = zeroState
        ? 0
        : isAtas
            ? getAtasStartBalance(snapshot)
            : toNumber(
                snapshot?.startingBalance,
                toNumber(account?.startingBalance, toNumber(account?.accountSize, 0))
            );

    const currentBalance = zeroState
        ? 0
        : isAtas
            ? getAtasCurrentBalance(snapshot)
            : toNumber(
                snapshot?.currentBalance,
                toNumber(account?.currentBalance, startBalance)
            );

    const tradingRef = getStrictProviderTradingRef(account, snapshot, provider);
    const sourceName = getStrictProviderAccountName(account, snapshot, provider) || tradingRef;

    const atasHistoryMeta = isAtas && !zeroState
        ? buildAtasHistoryMeta(atasHistorySummary, account, snapshot, tradingRef, atasHistoryOrderStats)
        : buildAtasHistoryMeta(null, account, snapshot, tradingRef, atasHistoryOrderStats);

    const lastSyncAtValue = cleanString(
        snapshot?.lastSyncAt ||
            snapshot?.receivedAt ||
            snapshot?.timestamp ||
            account?.lastSyncAt
    );

    const replaySource = isReplaySnapshot(snapshot);
    const runtimePhase = getRuntimePhase(account, snapshot, replaySource);
    const runtimeProductType = getRuntimeProductType(account, snapshot, replaySource);

    const phaseLabel = isAtas
        ? replaySource
            ? "Replay"
            : `${runtimePhase === "pa" ? "PA" : "EVAL"} ${runtimeProductType === "intraday" ? "Intraday" : "EOD"}`
        : "";

    const modeLabel = isAtas
        ? replaySource
            ? "Replay"
            : runtimeProductType === "intraday"
                ? "Intraday"
                : "EOD"
        : "";

    const accountSizeLabel = isAtas
        ? getRuntimeAccountSizeLabel(
            {
                ...account,
                startingBalance: account?.startingBalance,
                currentBalance: account?.currentBalance,
            },
            {
                ...snapshot,
                startingBalance: startBalance || snapshot?.startingBalance,
                currentBalance: currentBalance || snapshot?.currentBalance,
            }
        )
        : "";

    const lifecycleStatusLabel = isAtas
        ? getProviderStatusLabel(providerStatus)
        : cleanString(account?.accountStatus) || "Offen";

    const lifecycleStatusNote = isAtas ? "ATAS Status" : "Lifecycle";

    const lifecycleStatusTone = isAtas
        ? getMetricToneFromProviderStatus(providerStatus)
        : cleanString(account?.accountStatus).toLowerCase() === "failed"
            ? "red"
            : cleanString(account?.accountStatus).toLowerCase() === "passed"
                ? "green"
                : cleanString(account?.accountStatus).toLowerCase() === "active"
                    ? "green"
                    : "white";

    const ruleStatusLabel = cleanString(
        snapshot?.computedRuleStatusLabel ||
        account?.computedRuleStatusLabel ||
        account?.slotState?.status ||
        ""
    ) || "Neutral";

    const ruleStatusTone = getRuleStatusTone(
        snapshot?.computedRuleStatus ||
        account?.computedRuleStatus ||
        ruleStatusLabel
    );

    const resolvedOrderCount = isAtas && atasHistoryMeta.hasHistorySummary
        ? atasHistoryMeta.orderCount
        : orders.length;

    const resolvedHistoryOrderCount = isAtas
        ? atasHistoryMeta.historyOrderCount
        : orders.length;

    const resolvedFilledOrderCount = isAtas
        ? atasHistoryMeta.filledOrderCount
        : orders.length;

    const resolvedFillCount = isAtas && atasHistoryMeta.hasHistorySummary
        ? atasHistoryMeta.fillCount
        : fills.length;

    return {
        snapshot,
        provider,
        providerLabel: getProviderLabel(provider),
        providerTypeLabel: getProviderTypeLabel(providerType, provider),
        providerStatusLabel: getProviderStatusLabel(providerStatus),
        providerStatusTone: getProviderStatusTone(providerStatus),
        ruleStatusLabel,
        ruleStatusTone,
        lastSyncAtValue,
        lastSyncLabel: formatDateTime(lastSyncAtValue),
        sourceName,
        tradingRef,
        orderCount: resolvedOrderCount,
        historyOrderCount: resolvedHistoryOrderCount,
        filledOrderCount: resolvedFilledOrderCount,
        fillCount: resolvedFillCount,
        balancePoints: isAtas ? 0 : cashHistory.length,
        startBalance,
        currentBalance,
        delta: currentBalance - startBalance,
        orders,
        fills,
        cashHistory: isAtas ? [] : cashHistory,
        hasIdentity,
        phaseLabel,
        modeLabel,
        accountSizeLabel,
        lifecycleStatusLabel,
        lifecycleStatusNote,
        lifecycleStatusTone,
        hasHistorySummary: atasHistoryMeta.hasHistorySummary,
        closedTradeCount: atasHistoryMeta.closedTradeCount,
        historyGrossPnl: atasHistoryMeta.grossPnl,
        historyNetPnl: atasHistoryMeta.netPnl,
        historyCommission: atasHistoryMeta.commission,
        firstTradeAt: atasHistoryMeta.firstTradeAt,
        lastTradeAt: atasHistoryMeta.lastTradeAt,
        symbolSummary: atasHistoryMeta.symbolSummary,
        showMacherBadge: Boolean(account?.showMacherBadge || snapshot?.showMacherBadge),
        macherBadgeTitle: cleanString(account?.macherBadgeTitle || snapshot?.macherBadgeTitle || "Macher Modus"),
        macherBadgeText: cleanString(account?.macherBadgeText || snapshot?.macherBadgeText || "Bleib diszipliniert"),
        macherBadgeIcon: cleanString(account?.macherBadgeIcon || snapshot?.macherBadgeIcon || "🏆"),
    };
}

function getSlotBadgeColors(tone, label = "") {
    const normalizedTone = cleanString(tone).toLowerCase();
    const normalizedLabel = cleanString(label).toLowerCase();

    if (
        normalizedTone === "green" ||
        normalizedLabel.includes("bestanden")
    ) {
        return {
            label: label || "Bestanden",
            border: "rgba(34, 197, 94, 0.38)",
            bg: "rgba(34, 197, 94, 0.12)",
            text: COLORS.green,
            dot: COLORS.green,
        };
    }

    if (
        normalizedTone === "cyan" ||
        normalizedTone === "blue" ||
        normalizedLabel.includes("aktiv")
    ) {
        return {
            label: label || "Aktiv",
            border: "rgba(34, 211, 238, 0.38)",
            bg: "rgba(34, 211, 238, 0.12)",
            text: COLORS.cyan,
            dot: COLORS.cyan,
        };
    }

    if (
        normalizedTone === "yellow" ||
        normalizedLabel.includes("archiv") ||
        normalizedLabel.includes("offen")
    ) {
        return {
            label: label || "Offen",
            border: "rgba(245, 158, 11, 0.38)",
            bg: "rgba(245, 158, 11, 0.12)",
            text: COLORS.yellow,
            dot: COLORS.yellow,
        };
    }

    if (
        normalizedTone === "red" ||
        normalizedLabel.includes("fehl") ||
        normalizedLabel.includes("abgelaufen")
    ) {
        return {
            label: label || "Fehler",
            border: "rgba(239, 68, 68, 0.38)",
            bg: "rgba(239, 68, 68, 0.12)",
            text: COLORS.red,
            dot: COLORS.red,
        };
    }

    return {
        label: label || "Neutral",
        border: COLORS.border,
        bg: "rgba(255,255,255,0.04)",
        text: COLORS.text,
        dot: COLORS.muted,
    };
}

function DashboardCard({ title, subtitle = "", children }) {
    return (
        <section
            style={{
                display: "grid",
                gap: 12,
                padding: 18,
                borderRadius: 18,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgSoft,
                boxShadow: COLORS.shadow,
            }}
        >
            <div style={{ display: "grid", gap: 4 }}>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 15,
                        fontWeight: 800,
                    }}
                >
                    {title}
                </div>
                {subtitle ? (
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                            lineHeight: 1.45,
                        }}
                    >
                        {subtitle}
                    </div>
                ) : null}
            </div>

            {children}
        </section>
    );
}

function MetricCard({ label, value, note = "", tone = "cyan" }) {
    const toneMap = {
        cyan: COLORS.cyan,
        blue: COLORS.blue,
        gold: COLORS.gold,
        green: COLORS.green,
        yellow: COLORS.yellow,
        red: COLORS.red,
        violet: COLORS.violet,
        white: COLORS.title,
        neutral: COLORS.text,
    };

    return (
        <div
            style={{
                borderRadius: 16,
                border: `1px solid ${COLORS.border}`,
                background: "rgba(255,255,255,0.02)",
                padding: 14,
                display: "grid",
                gap: 6,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: toneMap[tone] || COLORS.cyan,
                    fontSize: 16,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    overflowWrap: "anywhere",
                }}
            >
                {value}
            </div>
            {note ? (
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 11,
                        lineHeight: 1.4,
                    }}
                >
                    {note}
                </div>
            ) : null}
        </div>
    );
}

function InfoChip({ label, tone = "neutral" }) {
    const toneMap = {
        neutral: {
            color: COLORS.text,
            border: COLORS.border,
            bg: "rgba(255,255,255,0.04)",
        },
        white: {
            color: COLORS.title,
            border: COLORS.border,
            bg: "rgba(255,255,255,0.04)",
        },
        cyan: {
            color: COLORS.cyan,
            border: "rgba(34, 211, 238, 0.24)",
            bg: "rgba(34, 211, 238, 0.10)",
        },
        green: {
            color: COLORS.green,
            border: "rgba(34, 197, 94, 0.24)",
            bg: "rgba(34, 197, 94, 0.10)",
        },
        yellow: {
            color: COLORS.yellow,
            border: "rgba(245, 158, 11, 0.24)",
            bg: "rgba(245, 158, 11, 0.10)",
        },
        red: {
            color: COLORS.red,
            border: "rgba(239, 68, 68, 0.24)",
            bg: "rgba(239, 68, 68, 0.10)",
        },
        violet: {
            color: COLORS.violet,
            border: "rgba(167, 139, 250, 0.24)",
            bg: "rgba(167, 139, 250, 0.10)",
        },
    };

    const ui = toneMap[tone] || toneMap.neutral;

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 28,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${ui.border}`,
                background: ui.bg,
                color: ui.color,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.04em",
            }}
        >
            {label}
        </span>
    );
}

function MacherBadge({ icon = "🏆", title = "Macher Modus", text = "Bleib diszipliniert" }) {
    return (
        <div
            style={{
                borderRadius: 16,
                border: "1px solid rgba(250, 204, 21, 0.55)",
                background:
                    "linear-gradient(135deg, rgba(250,204,21,0.14), rgba(34,211,238,0.08))",
                padding: "12px 14px",
                display: "grid",
                gap: 4,
                boxShadow: "0 0 24px rgba(250, 204, 21, 0.14)",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <style>
                {`
                    @keyframes macherPulse {
                        0% { transform: scale(1); opacity: 0.88; }
                        50% { transform: scale(1.04); opacity: 1; }
                        100% { transform: scale(1); opacity: 0.88; }
                    }

                    @keyframes macherSweep {
                        0% { transform: translateX(-120%); opacity: 0; }
                        35% { opacity: 0.7; }
                        100% { transform: translateX(140%); opacity: 0; }
                    }
                `}
            </style>

            <div
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: "45%",
                    background:
                        "linear-gradient(90deg, transparent, rgba(250,204,21,0.20), transparent)",
                    animation: "macherSweep 2.8s ease-in-out infinite",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: COLORS.gold,
                    fontSize: 13,
                    fontWeight: 950,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    animation: "macherPulse 1.6s ease-in-out infinite",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <span>{icon}</span>
                <span>{title}</span>
            </div>

            <div
                style={{
                    color: COLORS.text,
                    fontSize: 12,
                    fontWeight: 800,
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {text}
            </div>
        </div>
    );
}

function EmptyState({ text = "Kein Account ausgewählt." }) {
    return (
        <div
            style={{
                borderRadius: 18,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgSoft,
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                padding: 24,
                color: COLORS.muted,
                fontSize: 14,
                textAlign: "center",
            }}
        >
            {text}
        </div>
    );
}

function AccountGroupCard({
    group,
    onSelectAccount,
    onDeleteAccount,
    onUnlinkAccounts,
    getAccountDisplayName,
    getAccountPhase,
    getAccountMode,
    getAccountSizeLabel,
}) {
    const slots = group?.slots || {};
    const slotList = [
        { key: "evalEod", label: "EVAL EOD", account: slots.evalEod || null },
        { key: "paEod", label: "PA EOD", account: slots.paEod || null },
        { key: "evalIntraday", label: "EVAL Intraday", account: slots.evalIntraday || null },
        { key: "paIntraday", label: "PA Intraday", account: slots.paIntraday || null },
    ];

    const groupTitle = resolveGroupTitle(group, getAccountDisplayName);

    return (
        <DashboardCard
            title={groupTitle}
            subtitle={`${group?.accounts?.length || 0} Konten in dieser Gruppe`}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 12,
                }}
            >
                {slotList.map((slot) => {
                    const account = slot.account;
                    const runtimeMeta = buildRuntimeAccountMeta(account);
                    const slotBadgeColors = account?.id
                        ? getSlotBadgeColors(runtimeMeta.ruleStatusTone, runtimeMeta.ruleStatusLabel)
                        : getSlotBadgeColors("neutral", "Neutral");

                    return (
                        <div
                            key={slot.key}
                            style={{
                                borderRadius: 16,
                                border: `1px solid ${COLORS.border}`,
                                background: "rgba(255,255,255,0.02)",
                                padding: 14,
                                display: "grid",
                                gap: 10,
                                minHeight: 180,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                    flexWrap: "wrap",
                                }}
                            >
                                <div
                                    style={{
                                        color: COLORS.title,
                                        fontSize: 13,
                                        fontWeight: 900,
                                    }}
                                >
                                    {slot.label}
                                </div>

                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        border: `1px solid ${slotBadgeColors.border}`,
                                        background: slotBadgeColors.bg,
                                        color: slotBadgeColors.text,
                                        fontSize: 10,
                                        fontWeight: 800,
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: 999,
                                            background: slotBadgeColors.dot,
                                        }}
                                    />
                                    {slotBadgeColors.label}
                                </span>
                            </div>

                            {account ? (
                                <>
                                    <div
                                        style={{
                                            color: COLORS.text,
                                            fontSize: 14,
                                            fontWeight: 800,
                                            lineHeight: 1.4,
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {getAccountDisplayName(account)}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <InfoChip
                                            label={runtimeMeta.phaseLabel || getAccountPhase(account)}
                                            tone="cyan"
                                        />
                                        <InfoChip
                                            label={runtimeMeta.modeLabel || getAccountMode(account)}
                                            tone="violet"
                                        />
                                        <InfoChip
                                            label={runtimeMeta.accountSizeLabel || getAccountSizeLabel(account)}
                                            tone="yellow"
                                        />
                                        <InfoChip
                                            label={runtimeMeta.ruleStatusLabel}
                                            tone={runtimeMeta.ruleStatusTone}
                                        />
                                    </div>

                                    {runtimeMeta.showMacherBadge ? (
                                        <MacherBadge
                                            icon={runtimeMeta.macherBadgeIcon}
                                            title={runtimeMeta.macherBadgeTitle}
                                            text={runtimeMeta.macherBadgeText}
                                        />
                                    ) : null}

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                            gap: 8,
                                        }}
                                    >
                                        <MetricCard
                                            label="Provider"
                                            value={runtimeMeta.providerLabel}
                                            note={runtimeMeta.providerTypeLabel}
                                            tone="cyan"
                                        />
                                        <MetricCard
                                            label="Status"
                                            value={runtimeMeta.lifecycleStatusLabel}
                                            note={runtimeMeta.lifecycleStatusNote}
                                            tone={runtimeMeta.lifecycleStatusTone}
                                        />
                                        <MetricCard
                                            label="Regel Status"
                                            value={runtimeMeta.ruleStatusLabel}
                                            note="Zentral aus storage.js"
                                            tone={runtimeMeta.ruleStatusTone}
                                        />
                                        <MetricCard
                                            label="Orders / Fills"
                                            value={`${getDisplayOrderCount(runtimeMeta)} / ${runtimeMeta.fillCount}`}
                                            note={runtimeMeta.hasHistorySummary ? "ATAS History" : "Aktueller Speicherstand"}
                                            tone="gold"
                                        />
                                        <MetricCard
                                            label="Trading Ref"
                                            value={runtimeMeta.tradingRef}
                                            note={runtimeMeta.sourceName || "Kein Provider Konto"}
                                            tone="white"
                                        />
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSelectAccount(account.id)}
                                            style={{
                                                border: `1px solid ${COLORS.cyan}`,
                                                background: "rgba(34, 211, 238, 0.12)",
                                                color: COLORS.text,
                                                borderRadius: 12,
                                                padding: "9px 12px",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Aktiv setzen
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onDeleteAccount(account.id)}
                                            style={{
                                                border: `1px solid rgba(239, 68, 68, 0.28)`,
                                                background: "rgba(239, 68, 68, 0.10)",
                                                color: "#fecaca",
                                                borderRadius: 12,
                                                padding: "9px 12px",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Löschen
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div
                                    style={{
                                        color: COLORS.muted,
                                        fontSize: 13,
                                        lineHeight: 1.45,
                                    }}
                                >
                                    Für diesen Slot ist aktuell kein Account vorhanden.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {group?.evalAccount && group?.paAccount ? (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => onUnlinkAccounts(group.evalAccount.id, group.paAccount.id)}
                        style={{
                            border: `1px solid ${COLORS.borderStrong}`,
                            background: "rgba(255,255,255,0.04)",
                            color: COLORS.text,
                            borderRadius: 12,
                            padding: "10px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                        }}
                    >
                        EVAL und PA trennen
                    </button>
                </div>
            ) : null}
        </DashboardCard>
    );
}

export default function Dashboard({
    activeAccount,
    activeAccountId,
    accounts = [],
    accountGroups = [],
    activeView = "overview",
    onSelectAccount,
    onDeleteAccount,
    onUnlinkAccounts,
    getAccountDisplayName,
    getAccountPhase,
    getAccountMode,
    getAccountSizeLabel,
    getAccountRiskStatus,
    getRiskColors,
}) {
    const baseProviderMeta = useMemo(() => {
        return buildRuntimeAccountMeta(activeAccount);
    }, [activeAccount]);

    const [atasHistorySummary, setAtasHistorySummary] = useState(null);
    const [atasHistoryError, setAtasHistoryError] = useState("");
    const [atasHistoryOrderStats, setAtasHistoryOrderStats] = useState({
        loading: false,
        error: "",
        historyOrderCount: 0,
        filledOrderCount: 0,
        readAt: "",
    });

    useEffect(() => {
        if (
            typeof window === "undefined" ||
            typeof fetch !== "function" ||
            !activeAccount?.id ||
            baseProviderMeta.provider !== "atas"
        ) {
            setAtasHistorySummary(null);
            setAtasHistoryError("");
            return undefined;
        }

        let cancelled = false;

        const loadAtasHistorySummary = async () => {
            try {
                const response = await fetch(ATAS_HISTORY_SUMMARY_URL, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (!cancelled) {
                    setAtasHistorySummary(data);
                    setAtasHistoryError("");
                }
            } catch (error) {
                if (!cancelled) {
                    setAtasHistorySummary(null);
                    setAtasHistoryError(error?.message || "ATAS History nicht erreichbar");
                }
            }
        };

        loadAtasHistorySummary();

        const intervalId = window.setInterval(loadAtasHistorySummary, 15000);

        window.addEventListener("focus", loadAtasHistorySummary);
        window.addEventListener("atas-bridge-accounts-updated", loadAtasHistorySummary);
        window.addEventListener("atas-bridge-status-updated", loadAtasHistorySummary);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", loadAtasHistorySummary);
            window.removeEventListener("atas-bridge-accounts-updated", loadAtasHistorySummary);
            window.removeEventListener("atas-bridge-status-updated", loadAtasHistorySummary);
        };
    }, [
        activeAccount?.id,
        baseProviderMeta.provider,
        baseProviderMeta.tradingRef,
    ]);

    useEffect(() => {
        if (
            !activeAccount?.id ||
            baseProviderMeta.provider !== "atas" ||
            !cleanString(baseProviderMeta.tradingRef) ||
            baseProviderMeta.tradingRef === "Offen"
        ) {
            setAtasHistoryOrderStats({
                loading: false,
                error: "",
                historyOrderCount: 0,
                filledOrderCount: 0,
                readAt: "",
            });
            return undefined;
        }

        const controller = new AbortController();

        const loadAtasHistoryOrders = async () => {
            setAtasHistoryOrderStats((current) => ({
                ...current,
                loading: true,
                error: "",
            }));

            try {
                const result = await fetchAtasHistoryOrders(
                    {
                        accountId: baseProviderMeta.tradingRef,
                        start: ATAS_HISTORY_START_DATE,
                        end: getDefaultEndDate(),
                    },
                    controller.signal
                );

                const stats = buildDashboardHistoryOrderStats(result);

                setAtasHistoryOrderStats({
                    loading: false,
                    error: "",
                    historyOrderCount: stats.historyOrderCount,
                    filledOrderCount: stats.filledOrderCount,
                    readAt: stats.readAt,
                });
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                setAtasHistoryOrderStats({
                    loading: false,
                    error: cleanString(error?.message) || "ATAS Orders History nicht erreichbar",
                    historyOrderCount: 0,
                    filledOrderCount: 0,
                    readAt: "",
                });
            }
        };

        loadAtasHistoryOrders();

        const intervalId = window.setInterval(loadAtasHistoryOrders, 15000);

        window.addEventListener("focus", loadAtasHistoryOrders);
        window.addEventListener("atas-bridge-accounts-updated", loadAtasHistoryOrders);
        window.addEventListener("atas-bridge-status-updated", loadAtasHistoryOrders);

        return () => {
            controller.abort();
            window.clearInterval(intervalId);
            window.removeEventListener("focus", loadAtasHistoryOrders);
            window.removeEventListener("atas-bridge-accounts-updated", loadAtasHistoryOrders);
            window.removeEventListener("atas-bridge-status-updated", loadAtasHistoryOrders);
        };
    }, [
        activeAccount?.id,
        baseProviderMeta.provider,
        baseProviderMeta.tradingRef,
    ]);

    const providerMeta = useMemo(() => {
        return buildRuntimeAccountMeta(
            activeAccount,
            atasHistorySummary,
            atasHistoryOrderStats
        );
    }, [activeAccount, atasHistorySummary, atasHistoryOrderStats]);

    const displayOrderCount = getDisplayOrderCount(providerMeta);

    if (!activeAccount && activeView !== "accounts") {
        return <EmptyState text="Wähle zuerst einen aktiven Account." />;
    }

    if (activeView === "overview") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Übersicht"
                    subtitle="Kompakte Übersicht für den aktiven Account."
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                            <InfoChip
                                label={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                                tone="violet"
                            />
                            <InfoChip
                                label={providerMeta.providerStatusLabel}
                                tone={providerMeta.providerStatusTone}
                            />
                            <InfoChip
                                label={providerMeta.ruleStatusLabel}
                                tone={providerMeta.ruleStatusTone}
                            />
                            <InfoChip label={`Sync ${providerMeta.lastSyncLabel}`} tone="neutral" />
                            <InfoChip label={`Orders gesamt ${displayOrderCount}`} tone="yellow" />
                            <InfoChip label={`History Orders ${providerMeta.historyOrderCount}`} tone="yellow" />
                            <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                            {providerMeta.hasHistorySummary ? (
                                <InfoChip label={`Trades ${providerMeta.closedTradeCount}`} tone="green" />
                            ) : null}
                        </div>

                        <div
                            style={{
                                color: COLORS.muted,
                                fontSize: 12,
                                lineHeight: 1.45,
                                overflowWrap: "anywhere",
                            }}
                        >
                            Quelle: {providerMeta.sourceName || "Kein Provider Konto"}
                        </div>
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Account Details"
                    subtitle="Provider Kennzahlen und Verlauf für den aktiven Account."
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <MetricCard
                            label="Trading Ref"
                            value={providerMeta.tradingRef}
                            note={providerMeta.providerLabel}
                            tone="white"
                        />
                        <MetricCard
                            label="Phase"
                            value={providerMeta.phaseLabel || getAccountPhase(activeAccount)}
                            note={providerMeta.modeLabel || getAccountMode(activeAccount)}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Kontogrösse"
                            value={providerMeta.accountSizeLabel || getAccountSizeLabel(activeAccount)}
                            note="Account Size"
                            tone="violet"
                        />
                        <MetricCard
                            label="Status"
                            value={providerMeta.lifecycleStatusLabel}
                            note={providerMeta.lifecycleStatusNote}
                            tone={providerMeta.lifecycleStatusTone}
                        />
                        <MetricCard
                            label="Regel Status"
                            value={providerMeta.ruleStatusLabel}
                            note="Zentral aus storage.js"
                            tone={providerMeta.ruleStatusTone}
                        />
                        <MetricCard
                            label="Provider"
                            value={providerMeta.providerLabel}
                            note={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Provider Status"
                            value={providerMeta.providerStatusLabel}
                            note={providerMeta.lastSyncLabel}
                            tone={
                                providerMeta.providerStatusTone === "green"
                                    ? "green"
                                    : providerMeta.providerStatusTone === "yellow"
                                        ? "yellow"
                                        : providerMeta.providerStatusTone === "red"
                                            ? "red"
                                            : "white"
                            }
                        />
                        <MetricCard
                            label="Orders gesamt"
                            value={displayOrderCount}
                            note={providerMeta.hasHistorySummary ? "ATAS Orders.cdb" : "Aktueller Speicherstand"}
                            tone="gold"
                        />
                        <MetricCard
                            label="History Orders"
                            value={atasHistoryOrderStats.loading ? "Lädt..." : providerMeta.historyOrderCount}
                            note={
                                atasHistoryOrderStats.error ||
                                "Aus Orders.cdb wie im OrdersPanel"
                            }
                            tone="gold"
                        />
                        <MetricCard
                            label="Filled für Journal"
                            value={atasHistoryOrderStats.loading ? "Lädt..." : providerMeta.filledOrderCount}
                            note="Basis für Journal"
                            tone="green"
                        />
                        <MetricCard
                            label="Fills"
                            value={providerMeta.fillCount}
                            note={providerMeta.hasHistorySummary ? "ATAS History Summary" : "Aktueller Speicherstand"}
                            tone="yellow"
                        />
                        <MetricCard
                            label="Balance Punkte"
                            value={providerMeta.balancePoints}
                            note="Cash History Zeilen"
                            tone="yellow"
                        />
                        <MetricCard
                            label="Start Balance"
                            value={formatCurrency(providerMeta.startBalance)}
                            note="Erster Stand"
                            tone="gold"
                        />
                        <MetricCard
                            label="Aktuelle Balance"
                            value={formatCurrency(providerMeta.currentBalance)}
                            note="Letzter Stand"
                            tone="cyan"
                        />
                        <MetricCard
                            label="Delta"
                            value={formatCurrency(providerMeta.delta)}
                            note="Aktuell minus Start"
                            tone={providerMeta.delta >= 0 ? "green" : "red"}
                        />
                        <MetricCard
                            label="Quelle"
                            value={providerMeta.sourceName || "Kein Provider Konto"}
                            note="Provider Konto"
                            tone="white"
                        />

                        {providerMeta.provider === "atas" ? (
                            <>
                                <MetricCard
                                    label="Closed Trades"
                                    value={providerMeta.hasHistorySummary ? providerMeta.closedTradeCount : "–"}
                                    note={providerMeta.hasHistorySummary ? "ATAS History" : atasHistoryError || "History nicht geladen"}
                                    tone="green"
                                />
                                <MetricCard
                                    label="History Net PnL"
                                    value={providerMeta.hasHistorySummary ? formatSignedCurrency(providerMeta.historyNetPnl) : "–"}
                                    note="Netto aus History Summary"
                                    tone={getPnlTone(providerMeta.historyNetPnl)}
                                />
                                <MetricCard
                                    label="History Gross PnL"
                                    value={providerMeta.hasHistorySummary ? formatSignedCurrency(providerMeta.historyGrossPnl) : "–"}
                                    note="Brutto aus History Summary"
                                    tone={getPnlTone(providerMeta.historyGrossPnl)}
                                />
                                <MetricCard
                                    label="Commission"
                                    value={providerMeta.hasHistorySummary ? formatCurrency(providerMeta.historyCommission) : "–"}
                                    note="Gebühren aus History Summary"
                                    tone="yellow"
                                />
                                <MetricCard
                                    label="Symbol"
                                    value={providerMeta.symbolSummary}
                                    note="Micro Vorrang aktiv"
                                    tone="cyan"
                                />
                                <MetricCard
                                    label="First Trade"
                                    value={providerMeta.firstTradeAt ? formatDateTime(providerMeta.firstTradeAt) : "–"}
                                    note="History Start"
                                    tone="white"
                                />
                                <MetricCard
                                    label="Last Trade"
                                    value={providerMeta.lastTradeAt ? formatDateTime(providerMeta.lastTradeAt) : "–"}
                                    note="History Ende"
                                    tone="white"
                                />
                            </>
                        ) : null}
                    </div>
                </DashboardCard>

                <LiveCard
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <RiskPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <RulesPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "balance") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Balance"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.ruleStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip
                            label={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                            tone="violet"
                        />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip
                            label={providerMeta.ruleStatusLabel}
                            tone={providerMeta.ruleStatusTone}
                        />
                        <InfoChip label={`Orders gesamt ${displayOrderCount}`} tone="yellow" />
                        <InfoChip label={`History Orders ${providerMeta.historyOrderCount}`} tone="yellow" />
                        <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                    </div>
                </DashboardCard>

                <AccountBalancePanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "accounts") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Accounts"
                    subtitle="Gruppen, Slots und Provider Status auf einen Blick."
                >
                    <div
                        style={{
                            display: "grid",
                            gap: 12,
                        }}
                    >
                        {accountGroups.length ? (
                            accountGroups.map((group) => (
                                <AccountGroupCard
                                    key={group.id}
                                    group={group}
                                    onSelectAccount={onSelectAccount}
                                    onDeleteAccount={onDeleteAccount}
                                    onUnlinkAccounts={onUnlinkAccounts}
                                    getAccountDisplayName={getAccountDisplayName}
                                    getAccountPhase={getAccountPhase}
                                    getAccountMode={getAccountMode}
                                    getAccountSizeLabel={getAccountSizeLabel}
                                    getAccountRiskStatus={getAccountRiskStatus}
                                    getRiskColors={getRiskColors}
                                />
                            ))
                        ) : (
                            <EmptyState text="Noch keine Account Gruppen vorhanden." />
                        )}
                    </div>
                </DashboardCard>

                {!accountGroups.length && accounts.length ? (
                    <DashboardCard
                        title="Einzelkonten"
                        subtitle="Falls noch keine Gruppen gebildet wurden."
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 12,
                            }}
                        >
                            {accounts.map((account) => {
                                const runtimeMeta = buildRuntimeAccountMeta(account);

                                return (
                                    <div
                                        key={account.id}
                                        style={{
                                            borderRadius: 16,
                                            border: `1px solid ${COLORS.border}`,
                                            background: "rgba(255,255,255,0.02)",
                                            padding: 14,
                                            display: "grid",
                                            gap: 10,
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: COLORS.text,
                                                fontSize: 14,
                                                fontWeight: 800,
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            {getAccountDisplayName(account)}
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <InfoChip
                                                label={runtimeMeta.phaseLabel || getAccountPhase(account)}
                                                tone="cyan"
                                            />
                                            <InfoChip
                                                label={runtimeMeta.modeLabel || getAccountMode(account)}
                                                tone="violet"
                                            />
                                            <InfoChip
                                                label={runtimeMeta.accountSizeLabel || getAccountSizeLabel(account)}
                                                tone="yellow"
                                            />
                                            <InfoChip
                                                label={runtimeMeta.ruleStatusLabel}
                                                tone={runtimeMeta.ruleStatusTone}
                                            />
                                        </div>

                                        {runtimeMeta.showMacherBadge ? (
                                            <MacherBadge
                                                icon={runtimeMeta.macherBadgeIcon}
                                                title={runtimeMeta.macherBadgeTitle}
                                                text={runtimeMeta.macherBadgeText}
                                            />
                                        ) : null}

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {runtimeMeta.providerLabel} • {runtimeMeta.modeLabel || runtimeMeta.providerTypeLabel} • {runtimeMeta.lifecycleStatusLabel} • {runtimeMeta.ruleStatusLabel}
                                        </div>

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            Sync: {runtimeMeta.lastSyncLabel}
                                        </div>

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            Trading Ref: {runtimeMeta.tradingRef}
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelectAccount(account.id)}
                                                style={{
                                                    border: `1px solid ${COLORS.cyan}`,
                                                    background: "rgba(34, 211, 238, 0.12)",
                                                    color: COLORS.text,
                                                    borderRadius: 12,
                                                    padding: "9px 12px",
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Aktiv setzen
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onDeleteAccount(account.id)}
                                                style={{
                                                    border: `1px solid rgba(239, 68, 68, 0.28)`,
                                                    background: "rgba(239, 68, 68, 0.10)",
                                                    color: "#fecaca",
                                                    borderRadius: 12,
                                                    padding: "9px 12px",
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Löschen
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </DashboardCard>
                ) : null}
            </div>
        );
    }

    if (activeView === "trades") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Trades"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.ruleStatusLabel} • Orders gesamt ${displayOrderCount} • History Orders ${providerMeta.historyOrderCount} • Fills ${providerMeta.fillCount}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip
                            label={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                            tone="violet"
                        />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip
                            label={providerMeta.ruleStatusLabel}
                            tone={providerMeta.ruleStatusTone}
                        />
                        <InfoChip label={`Sync ${providerMeta.lastSyncLabel}`} tone="neutral" />
                        <InfoChip label={`Orders gesamt ${displayOrderCount}`} tone="yellow" />
                        <InfoChip label={`History Orders ${providerMeta.historyOrderCount}`} tone="yellow" />
                        <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                        {providerMeta.hasHistorySummary ? (
                            <InfoChip label={`Trades ${providerMeta.closedTradeCount}`} tone="green" />
                        ) : null}
                    </div>
                </DashboardCard>

                <OrdersPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <PositionsPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <JournalPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "analysis") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Analyse"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.ruleStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <MetricCard
                            label="Provider"
                            value={providerMeta.providerLabel}
                            note={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Status"
                            value={providerMeta.lifecycleStatusLabel}
                            note={providerMeta.lifecycleStatusNote}
                            tone={providerMeta.lifecycleStatusTone}
                        />
                        <MetricCard
                            label="Regel Status"
                            value={providerMeta.ruleStatusLabel}
                            note="Zentral aus storage.js"
                            tone={providerMeta.ruleStatusTone}
                        />
                        <MetricCard
                            label="Orders gesamt"
                            value={displayOrderCount}
                            note={providerMeta.hasHistorySummary ? "ATAS Orders.cdb" : "Aktiver Speicherstand"}
                            tone="yellow"
                        />
                        <MetricCard
                            label="History Orders"
                            value={providerMeta.historyOrderCount}
                            note="Aus Orders.cdb"
                            tone="yellow"
                        />
                        <MetricCard
                            label="Fills"
                            value={providerMeta.fillCount}
                            note={providerMeta.hasHistorySummary ? "ATAS History" : "Aktiver Speicherstand"}
                            tone="yellow"
                        />
                    </div>
                </DashboardCard>

                <ValidationPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <SimulatorPanel
                    activeAccount={activeAccount}
                    title="Simulator Panel"
                />
            </div>
        );
    }

    if (activeView === "imports") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Import"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.ruleStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip
                            label={providerMeta.modeLabel || providerMeta.providerTypeLabel}
                            tone="violet"
                        />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip
                            label={providerMeta.ruleStatusLabel}
                            tone={providerMeta.ruleStatusTone}
                        />
                        <InfoChip label={`Orders gesamt ${displayOrderCount}`} tone="yellow" />
                        <InfoChip label={`History Orders ${providerMeta.historyOrderCount}`} tone="yellow" />
                        <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                    </div>
                </DashboardCard>

                <ImportCenterPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <ValidationPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    return <EmptyState text="Diese Ansicht ist aktuell nicht verfügbar." />;
}