import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as atasSyncUtils from "./utils/atasSync";
import Dashboard from "./pages/Dashboard";
import { getRiskStatusForAccount } from "./utils/accountRiskStatus";
import {
    buildProviderSourceFromAccount,
    getProviderLabel,
    getProviderStatusLabel,
    getProviderTypeLabel,
    normalizeDataProvider,
    normalizeDataProviderStatus,
    normalizeDataProviderType,
} from "./utils/providerModel";
import {
    getActiveProvider,
    getStrictProviderAccountId,
    getStrictProviderAccountName,
    getStrictProviderDisplayName,
    getStrictProviderTradingRef,
    shouldUseAtasZeroState,
} from "./utils/providerDisplay";
import {
    addAccount,
    deleteAccount,
    detectAccountSize,
    formatAccountSizeLabel,
    getAccounts,
    getActiveAccountId,
    getAccountBalanceHistory,
    getAccountGroups,
    getFills,
    getLiveAccountSnapshot,
    getOrders,
    linkEvalToPaAccount,
    saveProviderSyncSnapshot,
    setActiveAccountId as persistActiveAccountId,
    subscribeStorage,
    unlinkEvalFromPaAccount,
} from "./utils/storage";

const IS_DEV = import.meta.env.DEV;
const STORAGE_VIEW_KEY = "future-dashboard.active-view";
const STORAGE_PROVIDER_VIEW_KEY = "future-dashboard.active-provider";
const DEFAULT_DASHBOARD_VIEW = "accounts";

const HERO_FIXED_HEIGHT = 228;
const STICKY_TOP = HERO_FIXED_HEIGHT + 12;

const HERO_MAX_WIDTH = 2200;
const CONTENT_MAX_WIDTH = 1960;
const APP_SIDE_PADDING = 10;

const SIDEBAR_WIDTH = 212;
const CONTROL_WIDTH = 236;
const SHELL_GAP = 10;

const DASHBOARD_VIEWS = IS_DEV
    ? [
        { key: "overview", label: "Übersicht" },
        { key: "balance", label: "Balance" },
        { key: "accounts", label: "Accounts" },
        { key: "trades", label: "Trades" },
        { key: "analysis", label: "Analyse" },
        { key: "imports", label: "Import" },
    ]
    : [
        { key: "overview", label: "Übersicht" },
        { key: "balance", label: "Balance" },
        { key: "accounts", label: "Accounts" },
        { key: "trades", label: "Trades" },
        { key: "imports", label: "Import" },
    ];

const SIDEBAR_SECTIONS = [
    {
        title: "Main",
        items: [
            { key: "overview", label: "Dashboard", type: "view" },
            { key: "trades", label: "Trades", type: "view" },
        ],
    },
    {
        title: "Analyse",
        items: [
            { key: "analysis", label: "Berichte", devOnly: true, type: "view" },
            { key: "balance", label: "Balance", type: "view" },
            { key: "accounts", label: "Accounts", type: "view" },
            { key: "imports", label: "Import", type: "view" },
        ],
    },
    {
        title: "Kontrollcenter",
        items: [
            { key: "toggle_create_account", label: "Account anlegen", type: "action" },
            { key: "toggle_link_accounts", label: "EVAL mit PA verknüpfen", type: "action" },
            { key: "toggle_provider_switch", label: "Provider umschalten", type: "action" },
        ],
    },
];

const COLORS = {
    pageBg: "#050816",
    panelBg: "rgba(8, 15, 37, 0.92)",
    panelBgSoft: "rgba(255, 255, 255, 0.03)",
    panelBgStrong: "rgba(20, 30, 55, 0.96)",
    panelBgMuted: "rgba(15, 23, 42, 0.74)",
    border: "rgba(56, 189, 248, 0.16)",
    borderStrong: "rgba(125, 211, 252, 0.24)",
    title: "#f8fafc",
    text: "#e2e8f0",
    textSoft: "#94a3b8",
    cyan: "#22d3ee",
    blue: "#38bdf8",
    gold: "#facc15",
    green: "#22c55e",
    yellow: "#f59e0b",
    red: "#ef4444",
    shadow: "0 0 28px rgba(0, 0, 0, 0.24)",
};

const EMPTY_LIST = [];

const INITIAL_ACCOUNT_DRAFT = {
    name: "",
    provider: "APEX",
    phase: "EVAL",
    mode: "Intraday",
    size: "25K",
    dataProvider: "tradovate",
};

const INITIAL_ATAS_SYNC_STATE = {
    isRunning: false,
    message: "",
    error: false,
};

const inputStyle = {
    width: "100%",
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.035)",
    color: COLORS.text,
    padding: "10px 12px",
    outline: "none",
    fontSize: 12,
};

const primaryButtonStyle = {
    border: `1px solid ${COLORS.blue}`,
    background: "rgba(56, 189, 248, 0.12)",
    color: COLORS.text,
    borderRadius: 11,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
};

const secondaryButtonStyle = {
    border: `1px solid ${COLORS.borderStrong}`,
    background: "rgba(255,255,255,0.035)",
    color: COLORS.text,
    borderRadius: 11,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
};

const miniChipStyle = {
    borderRadius: 999,
    padding: "4px 8px",
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${COLORS.border}`,
    fontSize: 10,
    color: COLORS.textSoft,
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
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

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : fallback;
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

function formatDateTime(value) {
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
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function createLocalId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhaseValue(value) {
    return cleanString(value).toLowerCase() === "pa" ? "pa" : "eval";
}

function normalizePhaseLabel(value) {
    return normalizePhaseValue(value) === "pa" ? "PA" : "EVAL";
}

function normalizeProductTypeValue(value) {
    const raw = cleanString(value).toLowerCase();

    if (raw.includes("eod")) {
        return "eod";
    }

    return "intraday";
}

function normalizeProductTypeLabel(value) {
    return normalizeProductTypeValue(value) === "eod" ? "EOD" : "Intraday";
}

function isValidDashboardView(viewKey) {
    return DASHBOARD_VIEWS.some((view) => view.key === viewKey);
}

function sanitizeDashboardView(viewKey) {
    return isValidDashboardView(viewKey) ? viewKey : DEFAULT_DASHBOARD_VIEW;
}

function persistDashboardView(viewKey) {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(STORAGE_VIEW_KEY, sanitizeDashboardView(viewKey));
}

function getInitialDashboardView() {
    if (typeof window === "undefined") {
        return DEFAULT_DASHBOARD_VIEW;
    }

    const saved = window.localStorage.getItem(STORAGE_VIEW_KEY);
    return sanitizeDashboardView(saved);
}

function getInitialProviderView() {
    if (typeof window === "undefined") {
        return "";
    }

    const saved = cleanString(
        window.localStorage.getItem(STORAGE_PROVIDER_VIEW_KEY)
    );

    return saved ? normalizeDataProvider(saved) : "";
}

function persistProviderView(provider) {
    if (typeof window === "undefined") {
        return;
    }

    const next = cleanString(provider);

    if (!next) {
        window.localStorage.removeItem(STORAGE_PROVIDER_VIEW_KEY);
        return;
    }

    window.localStorage.setItem(
        STORAGE_PROVIDER_VIEW_KEY,
        normalizeDataProvider(next)
    );
}

function normalizeMatchText(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildAccountMatchKeys(account) {
    if (!account || typeof account !== "object") {
        return [];
    }

    const rawKeys = [
        account?.displayName,
        account?.name,
        account?.accountName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.tradovateAccountId,
        account?.tradovateAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.source?.accountId,
        account?.source?.accountName,
        account?.apexId,
        account?.resolvedAccountId,
    ];

    return [...new Set(rawKeys.map(normalizeMatchText).filter(Boolean))];
}
function hasSameAccountShape(leftAccount, rightAccount) {
    if (!leftAccount || !rightAccount) {
        return false;
    }

    const leftPhase = normalizePhaseValue(
        leftAccount?.accountPhase || leftAccount?.phase || leftAccount?.accountType
    );
    const rightPhase = normalizePhaseValue(
        rightAccount?.accountPhase || rightAccount?.phase || rightAccount?.accountType
    );

    const leftMode = normalizeProductTypeValue(
        leftAccount?.productType || leftAccount?.mode || leftAccount?.challengeMode
    );
    const rightMode = normalizeProductTypeValue(
        rightAccount?.productType || rightAccount?.mode || rightAccount?.challengeMode
    );

    const leftSize =
        Number(leftAccount?.accountSize) ||
        detectAccountSize(leftAccount?.displayName || leftAccount?.name || "");

    const rightSize =
        Number(rightAccount?.accountSize) ||
        detectAccountSize(rightAccount?.displayName || rightAccount?.name || "");

    return leftPhase === rightPhase && leftMode === rightMode && leftSize === rightSize;
}

function findBestProviderAccount(accounts, currentAccount) {
    const candidates = Array.isArray(accounts) ? accounts : EMPTY_LIST;

    if (!candidates.length) {
        return null;
    }

    if (!currentAccount) {
        return candidates[0] || null;
    }

    const currentKeys = buildAccountMatchKeys(currentAccount);

    const exactMatch = candidates.find((candidate) => {
        const candidateKeys = buildAccountMatchKeys(candidate);

        return (
            candidateKeys.some((key) => currentKeys.includes(key)) &&
            hasSameAccountShape(candidate, currentAccount)
        );
    });

    if (exactMatch) {
        return exactMatch;
    }

    const looseMatch = candidates.find((candidate) => {
        const candidateKeys = buildAccountMatchKeys(candidate);
        return candidateKeys.some((key) => currentKeys.includes(key));
    });

    if (looseMatch) {
        return looseMatch;
    }

    const shapeMatch = candidates.find((candidate) =>
        hasSameAccountShape(candidate, currentAccount)
    );

    return shapeMatch || candidates[0] || null;
}

function decorateAccountWithDataProvider(account) {
    if (!account || typeof account !== "object") {
        return null;
    }

    const provider = normalizeDataProvider(
        account?.dataProvider ||
        account?.source?.provider ||
        "tradovate"
    );

    const type = normalizeDataProviderType(
        account?.dataProviderType ||
        account?.source?.type,
        provider
    );

    const defaultStatus = provider === "atas" ? "disconnected" : "ready";
    const status = normalizeDataProviderStatus(
        account?.dataProviderStatus ||
        account?.source?.status,
        defaultStatus
    );

    const sourceProvider = normalizeDataProvider(account?.source?.provider || provider);

    const tradovateAccountId = cleanString(
        account?.tradovateAccountId ||
        account?.tradingAccountId ||
        account?.apexId ||
        account?.accountId
    );

    const tradovateAccountName = cleanString(
        account?.tradovateAccountName ||
        account?.tradingAccountName ||
        tradovateAccountId
    );

    const atasAccountId = cleanString(
        account?.atasAccountId ||
        (sourceProvider === "atas" ? account?.source?.accountId : "")
    );

    const atasAccountName = cleanString(
        account?.atasAccountName ||
        (sourceProvider === "atas" ? account?.source?.accountName : "")
    );

    const strictSourceAccountId =
        provider === "atas"
            ? atasAccountId
            : tradovateAccountId;

    const strictSourceAccountName =
        provider === "atas"
            ? (atasAccountName || atasAccountId)
            : (tradovateAccountName || tradovateAccountId);

    const source = buildProviderSourceFromAccount(
        {
            ...account,
            dataProvider: provider,
            dataProviderType: type,
            dataProviderStatus: status,
            tradovateAccountId,
            tradovateAccountName,
            atasAccountId,
            atasAccountName,
            dataProviderAccountId: strictSourceAccountId,
            dataProviderAccountName: strictSourceAccountName,
        },
        provider
    );

    return {
        ...account,
        dataProvider: provider,
        dataProviderType: type,
        dataProviderStatus: status,
        dataProviderAccountId: strictSourceAccountId,
        dataProviderAccountName: strictSourceAccountName,
        tradovateAccountId,
        tradovateAccountName,
        atasAccountId,
        atasAccountName,
        source: {
            ...(account?.source || {}),
            ...source,
            provider,
            type,
            status,
            accountId: strictSourceAccountId,
            accountName: strictSourceAccountName,
            lastSyncAt: cleanString(
                account?.lastSyncAt ||
                source?.lastSyncAt
            ),
        },
    };
}

function getAccountProvider(account) {
    if (!account || typeof account !== "object") {
        return "";
    }

    return normalizeDataProvider(
        account?.dataProvider ||
        account?.source?.provider ||
        "tradovate"
    );
}

function filterAccountsByProvider(accounts, provider) {
    const safeAccounts = Array.isArray(accounts) ? accounts : EMPTY_LIST;
    const normalizedProvider = normalizeDataProvider(provider || "tradovate");

    return safeAccounts.filter(
        (account) => getAccountProvider(account) === normalizedProvider
    );
}

function readAppStateSnapshot(preferredActiveAccountId = null) {
    const rawAccounts = getAccounts?.() || EMPTY_LIST;
    const accounts = Array.isArray(rawAccounts)
        ? rawAccounts.map((account) => decorateAccountWithDataProvider(account)).filter(Boolean)
        : EMPTY_LIST;
    const storedActiveAccountId = getActiveAccountId?.() || null;

    const preferredIsValid =
        preferredActiveAccountId &&
        accounts.some((account) => account.id === preferredActiveAccountId);

    const storedIsValid =
        storedActiveAccountId &&
        accounts.some((account) => account.id === storedActiveAccountId);

    const activeAccountId = preferredIsValid
        ? preferredActiveAccountId
        : storedIsValid
            ? storedActiveAccountId
            : accounts[0]?.id || null;

    return {
        accounts,
        activeAccountId,
    };
}

function getProviderDisplayAccountId(account, snapshot = null) {
    if (!account && !snapshot) {
        return "";
    }

    const provider = getActiveProvider(account, snapshot, account?.dataProvider);

    if (shouldUseAtasZeroState(account, snapshot, provider)) {
        return "";
    }

    return cleanString(
        getStrictProviderAccountId(account, snapshot, provider)
    );
}

function getProviderDisplayAccountName(account, snapshot = null) {
    if (!account && !snapshot) {
        return "";
    }

    const provider = getActiveProvider(account, snapshot, account?.dataProvider);

    return cleanString(
        getStrictProviderDisplayName(account, snapshot, provider)
    );
}

function getProviderDisplaySourceLabel(account, snapshot = null) {
    if (!account && !snapshot) {
        return "offen";
    }

    const provider = getActiveProvider(account, snapshot, account?.dataProvider);
    const sourceName = cleanString(
        getStrictProviderAccountName(account, snapshot, provider)
    );
    const tradingRef = cleanString(
        getStrictProviderTradingRef(account, snapshot, provider)
    );

    if (sourceName) {
        return sourceName;
    }

    if (tradingRef) {
        return tradingRef;
    }

    if (normalizeDataProvider(provider) === "atas") {
        return "Kein ATAS Account";
    }

    return "offen";
}

function getHeaderAccountLabelFromProvider(provider) {
    return normalizeDataProvider(provider) === "atas"
        ? "APEX-ATAS"
        : "APEX-Tradovate";
}

function getAccountDisplayName(account, snapshot = null) {
    if (!account && !snapshot) {
        return "Kein Account";
    }

    return getProviderDisplayAccountName(account, snapshot) || "Kein Account";
}

function getAccountPhase(account) {
    return normalizePhaseLabel(
        account?.accountPhase || account?.phase || account?.accountType
    );
}

function getAccountMode(account) {
    return normalizeProductTypeLabel(
        account?.productType || account?.mode || account?.challengeMode
    );
}

function getAccountSizeLabel(account) {
    const rawSize =
        account?.accountSize ||
        account?.size ||
        detectAccountSize(
            account?.displayName || account?.name || account?.accountName || ""
        );

    if (!rawSize) {
        return "Größe offen";
    }

    return formatAccountSizeLabel(rawSize) || String(rawSize);
}

function getResolvedAccountKey(account, snapshot = null) {
    if (!account && !snapshot) {
        return "";
    }

    return getProviderDisplayAccountId(account, snapshot) || "";
}

function normalizeRiskState(raw) {
    const value = String(
        raw?.state || raw?.status || raw?.level || raw?.color || "neutral"
    ).toLowerCase();

    if (value.includes("green") || value === "grün" || value.includes("ok")) {
        return "green";
    }

    if (
        value.includes("yellow") ||
        value.includes("warn") ||
        value === "gelb" ||
        value === "amber"
    ) {
        return "yellow";
    }

    if (
        value.includes("red") ||
        value.includes("danger") ||
        value === "rot" ||
        value === "critical"
    ) {
        return "red";
    }

    return "neutral";
}

function getRiskColors(state) {
    if (state === "green") {
        return {
            dot: COLORS.green,
            bg: "rgba(34, 197, 94, 0.12)",
            border: "rgba(34, 197, 94, 0.24)",
            text: "#bbf7d0",
            label: "Grün",
        };
    }

    if (state === "yellow") {
        return {
            dot: COLORS.yellow,
            bg: "rgba(245, 158, 11, 0.12)",
            border: "rgba(245, 158, 11, 0.24)",
            text: "#fde68a",
            label: "Gelb",
        };
    }

    if (state === "red") {
        return {
            dot: COLORS.red,
            bg: "rgba(239, 68, 68, 0.12)",
            border: "rgba(239, 68, 68, 0.24)",
            text: "#fecaca",
            label: "Rot",
        };
    }

    return {
        dot: COLORS.textSoft,
        bg: "rgba(148, 163, 184, 0.10)",
        border: "rgba(148, 163, 184, 0.20)",
        text: "#cbd5e1",
        label: "Neutral",
    };
}

function getAccountRiskStatus(accountId) {
    const raw = getRiskStatusForAccount?.(accountId);

    return {
        state: normalizeRiskState(raw),
        reason: raw?.reason || raw?.message || "",
        updatedAt: raw?.updatedAt || raw?.timestamp || null,
    };
}

function buildSlotsFromAccounts(accounts) {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];

    return {
        evalEod:
            safeAccounts.find(
                (account) =>
                    normalizePhaseValue(account?.accountPhase || account?.phase) === "eval" &&
                    normalizeProductTypeValue(
                        account?.productType || account?.mode || account?.challengeMode
                    ) === "eod"
            ) || null,
        paEod:
            safeAccounts.find(
                (account) =>
                    normalizePhaseValue(account?.accountPhase || account?.phase) === "pa" &&
                    normalizeProductTypeValue(
                        account?.productType || account?.mode || account?.challengeMode
                    ) === "eod"
            ) || null,
        evalIntraday:
            safeAccounts.find(
                (account) =>
                    normalizePhaseValue(account?.accountPhase || account?.phase) === "eval" &&
                    normalizeProductTypeValue(
                        account?.productType || account?.mode || account?.challengeMode
                    ) === "intraday"
            ) || null,
        paIntraday:
            safeAccounts.find(
                (account) =>
                    normalizePhaseValue(account?.accountPhase || account?.phase) === "pa" &&
                    normalizeProductTypeValue(
                        account?.productType || account?.mode || account?.challengeMode
                    ) === "intraday"
            ) || null,
    };
}

function getPrimaryGroupTitle(rawGroup, slots, accounts) {
    return (
        cleanString(rawGroup?.title) ||
        cleanString(rawGroup?.name) ||
        cleanString(rawGroup?.label) ||
        getAccountDisplayName(slots?.evalEod) ||
        getAccountDisplayName(slots?.paEod) ||
        getAccountDisplayName(slots?.evalIntraday) ||
        getAccountDisplayName(slots?.paIntraday) ||
        getAccountDisplayName(accounts?.[0]) ||
        "Gruppe"
    );
}

function getSingleUnlinkPair(slots) {
    const eodComplete = Boolean(slots.evalEod && slots.paEod);
    const intradayComplete = Boolean(slots.evalIntraday && slots.paIntraday);

    if (eodComplete && !intradayComplete) {
        return {
            evalAccount: slots.evalEod,
            paAccount: slots.paEod,
        };
    }

    if (intradayComplete && !eodComplete) {
        return {
            evalAccount: slots.evalIntraday,
            paAccount: slots.paIntraday,
        };
    }

    return {
        evalAccount: null,
        paAccount: null,
    };
}

function normalizeGroup(rawGroup, accounts, index) {
    if (!rawGroup) {
        return null;
    }

    let groupAccounts = Array.isArray(rawGroup.accounts) ? rawGroup.accounts : [];

    if (!groupAccounts.length && Array.isArray(rawGroup.accountIds)) {
        groupAccounts = rawGroup.accountIds
            .map((id) => accounts.find((item) => item.id === id))
            .filter(Boolean);
    }

    if (!groupAccounts.length) {
        return null;
    }

    groupAccounts = groupAccounts
        .map((groupAccount) => {
            const accountId = cleanString(groupAccount?.id);
            return (
                accounts.find((item) => item.id === accountId) ||
                decorateAccountWithDataProvider(groupAccount)
            );
        })
        .filter(Boolean);

    if (!groupAccounts.length) {
        return null;
    }

    const rawSlots = rawGroup?.slots || {};
    const builtSlots = buildSlotsFromAccounts(groupAccounts);

    const repairedSlots = {
        evalEod: rawSlots.evalEod || rawGroup.evalEod || builtSlots.evalEod || null,
        paEod: rawSlots.paEod || rawGroup.paEod || builtSlots.paEod || null,
        evalIntraday:
            rawSlots.evalIntraday ||
            rawGroup.evalIntraday ||
            builtSlots.evalIntraday ||
            null,
        paIntraday:
            rawSlots.paIntraday ||
            rawGroup.paIntraday ||
            builtSlots.paIntraday ||
            null,
    };

    const unlinkPair = getSingleUnlinkPair(repairedSlots);

    return {
        id: rawGroup.id || rawGroup.groupId || `group-${index}`,
        title: getPrimaryGroupTitle(rawGroup, repairedSlots, groupAccounts),
        accounts: groupAccounts,
        slots: repairedSlots,
        evalAccount: unlinkPair.evalAccount,
        paAccount: unlinkPair.paAccount,
        groupStatus: cleanString(rawGroup.groupStatus || "open"),
    };
}

function buildProviderScopedGroup(rawGroup, accounts, index, provider) {
    const normalizedGroup = normalizeGroup(rawGroup, accounts, index);

    if (!normalizedGroup) {
        return null;
    }

    const scopedAccounts = filterAccountsByProvider(
        normalizedGroup.accounts,
        provider
    );

    if (!scopedAccounts.length) {
        return null;
    }

    const scopedSlots = buildSlotsFromAccounts(scopedAccounts);
    const unlinkPair = getSingleUnlinkPair(scopedSlots);

    return {
        ...normalizedGroup,
        title:
            getAccountDisplayName(scopedSlots?.evalEod) ||
            getAccountDisplayName(scopedSlots?.paEod) ||
            getAccountDisplayName(scopedSlots?.evalIntraday) ||
            getAccountDisplayName(scopedSlots?.paIntraday) ||
            getAccountDisplayName(scopedAccounts?.[0]) ||
            cleanString(normalizedGroup.title) ||
            "Gruppe",
        accounts: scopedAccounts,
        slots: scopedSlots,
        evalAccount: unlinkPair.evalAccount,
        paAccount: unlinkPair.paAccount,
    };
}

function inferPhaseFromName(name, fallback = "EVAL") {
    const text = cleanString(name).toLowerCase();

    if (!text) {
        return fallback;
    }

    if (text.includes("paapex") || text.startsWith("pa") || text.includes(" pa ")) {
        return "PA";
    }

    if (text.includes("eval")) {
        return "EVAL";
    }

    return fallback;
}

function inferModeFromName(name, fallback = "Intraday") {
    const text = cleanString(name).toLowerCase();

    if (!text) {
        return fallback;
    }

    if (text.includes("eod")) {
        return "EOD";
    }

    if (text.includes("intraday") || text.includes("intra")) {
        return "Intraday";
    }

    return fallback;
}

function inferSizeFromName(name, fallback = "25K") {
    const detected = detectAccountSize(name);

    if (!detected) {
        return fallback;
    }

    return formatAccountSizeLabel(detected) || fallback;
}

function buildSmartDraftFromName(name, currentDraft) {
    return {
        ...currentDraft,
        name,
        phase: inferPhaseFromName(name, currentDraft.phase),
        mode: inferModeFromName(name, currentDraft.mode),
        size: inferSizeFromName(name, currentDraft.size),
    };
}

function getPairingHint(selectedEvalAccount, paAccounts) {
    if (!selectedEvalAccount) {
        return "Wähle zuerst ein EVAL Konto.";
    }

    if (paAccounts.length === 0) {
        return "Keine passende PA für diesen Modus gefunden.";
    }

    if (paAccounts.length === 1) {
        return "Passende PA wurde automatisch vorausgewählt.";
    }

    return `${paAccounts.length} passende PA Konten verfügbar.`;
}

function useViewportWidth() {
    const [viewportWidth, setViewportWidth] = useState(() => {
        if (typeof window === "undefined") {
            return 1920;
        }

        return window.innerWidth;
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const handleResize = () => {
            setViewportWidth(window.innerWidth);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    return viewportWidth;
}
function toDateOrNull(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = cleanString(value);

    if (!text) {
        return null;
    }

    const direct = new Date(text);

    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }

    const european = text.match(
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

function getHistoryRowTimestamp(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

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

function formatMonthLabel(date) {
    return new Intl.DateTimeFormat("de-CH", {
        month: "long",
        year: "numeric",
    }).format(date);
}

function getDateKey(date) {
    const safeDate = toDateOrNull(date);

    if (!safeDate) {
        return "";
    }

    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, "0");
    const day = String(safeDate.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function buildMonthGrid(anchorDate) {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < startWeekday; index += 1) {
        cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(new Date(year, month, day));
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
}

function buildSidebarCalendarState(accountBalanceHistory) {
    const safeRows = Array.isArray(accountBalanceHistory)
        ? accountBalanceHistory
        : EMPTY_LIST;

    const dates = safeRows
        .map((row) => getHistoryRowTimestamp(row))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());

    const latestDate = dates.length ? dates[dates.length - 1] : new Date();

    return {
        anchorDate: latestDate,
        activeDayKey: getDateKey(latestDate),
        hasData: dates.length > 0,
        pointCount: dates.length,
    };
}

function getAtasSyncRunner() {
    const candidates = [
        atasSyncUtils.runAtasSync,
        atasSyncUtils.syncAtasAccount,
        atasSyncUtils.executeAtasSync,
        atasSyncUtils.testAtasSync,
        atasSyncUtils.startAtasSync,
        atasSyncUtils.default,
    ];

    return candidates.find((entry) => typeof entry === "function") || null;
}

function normalizeAtasSyncSnapshot(account, result) {
    const safeResult = result && typeof result === "object" ? result : {};
    const orders = Array.isArray(safeResult.orders) ? safeResult.orders : [];
    const fills = Array.isArray(safeResult.fills) ? safeResult.fills : [];
    const balanceHistory = Array.isArray(safeResult.balanceHistory)
        ? safeResult.balanceHistory
        : Array.isArray(safeResult.cashHistory)
            ? safeResult.cashHistory
            : Array.isArray(safeResult.accountBalanceHistory)
                ? safeResult.accountBalanceHistory
                : [];
    const performance = Array.isArray(safeResult.performance)
        ? safeResult.performance
        : [];
    const positionHistory = Array.isArray(safeResult.positionHistory)
        ? safeResult.positionHistory
        : [];
    const currentBalance = toNumber(
        safeResult.currentBalance ?? safeResult.balance ?? safeResult.netLiquidity,
        toNumber(account?.currentBalance, 0)
    );
    const startingBalance = toNumber(
        safeResult.startingBalance,
        toNumber(account?.startingBalance, 0)
    );

    return {
        dataProvider: "atas",
        dataProviderType: cleanString(
            safeResult.dataProviderType ||
            safeResult.providerType ||
            account?.dataProviderType ||
            "desktop"
        ),
        dataProviderStatus: cleanString(
            safeResult.dataProviderStatus ||
            safeResult.status ||
            "connected"
        ),
        dataProviderAccountId: cleanString(
            safeResult.dataProviderAccountId ||
            safeResult.providerAccountId ||
            safeResult.accountId ||
            account?.atasAccountId ||
            ""
        ),
        dataProviderAccountName: cleanString(
            safeResult.dataProviderAccountName ||
            safeResult.providerAccountName ||
            safeResult.accountName ||
            account?.atasAccountName ||
            ""
        ),
        atasAccountId: cleanString(
            safeResult.atasAccountId ||
            safeResult.dataProviderAccountId ||
            safeResult.providerAccountId ||
            account?.atasAccountId ||
            ""
        ),
        atasAccountName: cleanString(
            safeResult.atasAccountName ||
            safeResult.dataProviderAccountName ||
            safeResult.providerAccountName ||
            account?.atasAccountName ||
            ""
        ),
        tradingAccountId: "",
        tradingAccountName: "",
        lastSyncAt: cleanString(
            safeResult.lastSyncAt ||
            safeResult.syncedAt ||
            new Date().toISOString()
        ),
        accountSize: toNumber(
            safeResult.accountSize,
            toNumber(account?.accountSize, 0)
        ),
        startingBalance,
        currentBalance,
        balance: currentBalance,
        dailyPnL: toNumber(safeResult.dailyPnL, 0),
        realizedPnL: toNumber(safeResult.realizedPnL, 0),
        unrealizedPnL: toNumber(safeResult.unrealizedPnL, 0),
        drawdownLimit: toNumber(
            safeResult.drawdownLimit,
            toNumber(account?.drawdownLimit, 0)
        ),
        maxDailyLoss: toNumber(
            safeResult.maxDailyLoss,
            toNumber(account?.maxDailyLoss, 0)
        ),
        liquidationPrice: toNumber(safeResult.liquidationPrice, 0),
        openOrderCount: toNumber(
            safeResult.openOrderCount,
            orders.length
        ),
        openPositionCount: toNumber(
            safeResult.openPositionCount ?? safeResult.positionCount,
            0
        ),
        sessionKey: cleanString(safeResult.sessionKey),
        tradingDate: cleanString(safeResult.tradingDate),
        orders,
        fills,
        balanceHistory,
        performance,
        positionHistory,
    };
}

function unwrapAtasSyncResult(result) {
    if (result && typeof result === "object" && result.snapshot && typeof result.snapshot === "object") {
        return {
            ok: result.ok !== false,
            message: cleanString(result.message),
            snapshot: result.snapshot,
        };
    }

    return {
        ok: true,
        message: "",
        snapshot: result,
    };
}

async function runAtasSyncForAccount(account) {
    const runner = getAtasSyncRunner();

    if (!runner) {
        throw new Error("ATAS Sync Export fehlt in atasSync.js");
    }

    const rawResult = await runner(account);
    const parsedResult = unwrapAtasSyncResult(rawResult);

    return {
        ok: parsedResult.ok,
        message: parsedResult.message,
        snapshot: normalizeAtasSyncSnapshot(account, parsedResult.snapshot),
    };
}

class DashboardErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
        };
    }

    static getDerivedStateFromError() {
        return {
            hasError: true,
        };
    }

    componentDidCatch(error, errorInfo) {
        if (typeof this.props.onError === "function") {
            this.props.onError(error, errorInfo);
        }
    }

    componentDidUpdate(prevProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({
                hasError: false,
            });
        }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
        });

        if (typeof this.props.onReset === "function") {
            this.props.onReset();
        }
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const colors = this.props.colors || COLORS;
        const activeView = cleanString(this.props.activeView) || DEFAULT_DASHBOARD_VIEW;
        const activeViewLabel =
            DASHBOARD_VIEWS.find((view) => view.key === activeView)?.label || "Accounts";

        return (
            <div
                style={{
                    background: colors.panelBg,
                    border: `1px solid ${colors.red}`,
                    borderRadius: 18,
                    boxShadow: colors.shadow,
                    padding: 18,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div
                    style={{
                        color: "#fecaca",
                        fontSize: 18,
                        fontWeight: 900,
                    }}
                >
                    Ansicht wurde abgefangen
                </div>

                <div
                    style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.45,
                    }}
                >
                    Die Ansicht {activeViewLabel} hat einen Fehler ausgelöst.
                </div>

                <button
                    type="button"
                    onClick={this.handleReset}
                    style={{
                        border: `1px solid ${colors.cyan}`,
                        background: "rgba(34, 211, 238, 0.12)",
                        color: colors.text,
                        borderRadius: 12,
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontWeight: 800,
                        width: "fit-content",
                    }}
                >
                    Auf Accounts zurück
                </button>
            </div>
        );
    }
}

function HeroTitle() {
    return (
        <div
            style={{
                position: "relative",
                display: "inline-block",
                lineHeight: 0.92,
                textAlign: "center",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    transform: "translate(-8px, 10px)",
                    color: "rgba(0, 0, 0, 0.72)",
                    fontSize: "clamp(40px, 4.8vw, 62px)",
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    userSelect: "none",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                }}
            >
                Future Dashboard Execution
            </div>

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    transform: "translate(-3px, 4px)",
                    color: "rgba(250, 204, 21, 0.35)",
                    fontSize: "clamp(40px, 4.8vw, 62px)",
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    userSelect: "none",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                }}
            >
                Future Dashboard Execution
            </div>

            <div
                style={{
                    position: "relative",
                    fontSize: "clamp(40px, 4.8vw, 62px)",
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    whiteSpace: "nowrap",
                }}
            >
                <span
                    style={{
                        color: "#f8fafc",
                        textShadow:
                            "0 2px 0 rgba(0,0,0,0.5), 0 8px 18px rgba(0,0,0,0.35)",
                    }}
                >
                    Future
                </span>
                <span>{" "}</span>
                <span
                    style={{
                        color: COLORS.gold,
                        textShadow:
                            "0 2px 0 rgba(89, 65, 0, 0.75), 0 0 24px rgba(250, 204, 21, 0.18), 0 8px 18px rgba(0,0,0,0.35)",
                    }}
                >
                    Dashboard Execution
                </span>
            </div>
        </div>
    );
}

function TradingMark() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
            }}
        >
            <div
                style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(34, 211, 238, 0.10)",
                    border: `1px solid ${COLORS.borderStrong}`,
                    boxShadow: `0 0 24px rgba(34,211,238,0.18)`,
                    color: COLORS.gold,
                    fontSize: 22,
                    fontWeight: 900,
                }}
            >
                ↗
            </div>

            <div style={{ display: "grid", gap: 2 }}>
                <div
                    style={{
                        fontSize: 14,
                        lineHeight: 1,
                        fontWeight: 900,
                        color: COLORS.gold,
                        textTransform: "uppercase",
                    }}
                >
                    Trading
                </div>
                <div
                    style={{
                        fontSize: 14,
                        lineHeight: 1,
                        fontWeight: 900,
                        color: COLORS.gold,
                        textTransform: "uppercase",
                    }}
                >
                    Dashboard
                </div>
                <div
                    style={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        color: "#a5b4fc",
                        marginTop: 4,
                    }}
                >
                    Focus. Risiko.
                </div>
                <div
                    style={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        color: "#a5b4fc",
                    }}
                >
                    Ausführung.
                </div>
            </div>
        </div>
    );
}

function SidebarCalendarPanel({ calendarState }) {
    const anchorDate = calendarState?.anchorDate || new Date();
    const activeDayKey = calendarState?.activeDayKey || getDateKey(new Date());
    const weekdayLabels = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
    const monthCells = buildMonthGrid(anchorDate);

    return (
        <div
            style={{
                borderRadius: 14,
                border: `1px solid ${COLORS.border}`,
                background: "rgba(15, 23, 42, 0.52)",
                padding: 10,
                display: "grid",
                gap: 10,
            }}
        >
            <div style={{ display: "grid", gap: 3 }}>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                    }}
                >
                    Kalender
                </div>
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 11,
                        lineHeight: 1.35,
                    }}
                >
                    {formatMonthLabel(anchorDate)}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: 4,
                }}
            >
                {weekdayLabels.map((label) => (
                    <div
                        key={label}
                        style={{
                            minHeight: 16,
                            display: "grid",
                            placeItems: "center",
                            color: COLORS.textSoft,
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                        }}
                    >
                        {label}
                    </div>
                ))}
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: 4,
                }}
            >
                {monthCells.map((date, index) => {
                    const key = date ? getDateKey(date) : `empty-${index}`;
                    const isActive = key === activeDayKey;

                    return (
                        <div
                            key={key}
                            style={{
                                minHeight: 26,
                                borderRadius: 6,
                                border: isActive
                                    ? `1px solid ${COLORS.cyan}`
                                    : "1px solid rgba(255,255,255,0.05)",
                                background: isActive
                                    ? "rgba(34,211,238,0.14)"
                                    : "rgba(255,255,255,0.02)",
                                display: "grid",
                                placeItems: "center",
                                color: date
                                    ? isActive
                                        ? COLORS.title
                                        : COLORS.text
                                    : "transparent",
                                fontSize: 10,
                                fontWeight: isActive ? 900 : 700,
                            }}
                        >
                            {date ? date.getDate() : "•"}
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 10,
                    lineHeight: 1.35,
                }}
            >
                {calendarState?.hasData
                    ? `${calendarState.pointCount} Balance Einträge`
                    : "Noch keine Balance Daten"}
            </div>
        </div>
    );
}
function ShellSidebar({
    activeView,
    onChangeView,
    showCreateAccount,
    showLinkAccounts,
    showProviderSwitch,
    onToggleCreateAccount,
    onToggleLinkAccounts,
    onToggleProviderSwitch,
    calendarState,
}) {
    return (
        <aside
            style={{
                width: SIDEBAR_WIDTH,
                minWidth: SIDEBAR_WIDTH,
                background: "rgba(0,0,0,0.38)",
                borderRight: `1px solid rgba(82, 82, 91, 0.38)`,
                padding: "14px 10px 20px",
                position: "sticky",
                top: STICKY_TOP,
                alignSelf: "start",
                maxHeight: `calc(100vh - ${STICKY_TOP + 16}px)`,
                overflowY: "auto",
                borderRadius: 16,
                boxShadow: COLORS.shadow,
            }}
        >
            <div style={{ display: "grid", gap: 16 }}>
                <div
                    style={{
                        display: "grid",
                        gap: 12,
                    }}
                >
                    {SIDEBAR_SECTIONS.map((section) => {
                        const visibleItems = section.items.filter((item) => {
                            if (item.type === "action") {
                                return true;
                            }

                            if (item.devOnly && !IS_DEV) {
                                return false;
                            }

                            return DASHBOARD_VIEWS.some((view) => view.key === item.key);
                        });

                        return (
                            <div key={section.title} style={{ display: "grid", gap: 8 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <div
                                        style={{
                                            color: "rgba(244,244,245,0.9)",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            letterSpacing: "0.16em",
                                            textTransform: "uppercase",
                                            minWidth: 0,
                                        }}
                                    >
                                        {section.title}
                                    </div>
                                    <div
                                        style={{
                                            height: 1,
                                            flex: 1,
                                            background: "rgba(82,82,91,0.45)",
                                        }}
                                    />
                                </div>

                                <div style={{ display: "grid", gap: 4 }}>
                                    {visibleItems.map((item) => {
                                        const isAction = item.type === "action";
                                        const isActive = isAction
                                            ? item.key === "toggle_create_account"
                                                ? showCreateAccount
                                                : item.key === "toggle_link_accounts"
                                                    ? showLinkAccounts
                                                    : showProviderSwitch
                                            : activeView === item.key;

                                        const handleClick = () => {
                                            if (isAction) {
                                                if (item.key === "toggle_create_account") {
                                                    onToggleCreateAccount?.();
                                                    return;
                                                }

                                                if (item.key === "toggle_link_accounts") {
                                                    onToggleLinkAccounts?.();
                                                    return;
                                                }

                                                if (item.key === "toggle_provider_switch") {
                                                    onToggleProviderSwitch?.();
                                                }

                                                return;
                                            }

                                            onChangeView(item.key);
                                        };

                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={handleClick}
                                                style={{
                                                    width: "100%",
                                                    minHeight: 30,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    padding: "7px 10px",
                                                    borderRadius: 7,
                                                    border: `1px solid ${isActive
                                                            ? "rgba(34,211,238,0.24)"
                                                            : "transparent"
                                                        }`,
                                                    background: isActive
                                                        ? "linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(34,211,238,0.14) 100%)"
                                                        : "transparent",
                                                    color: isActive
                                                        ? COLORS.cyan
                                                        : "rgba(161,161,170,0.92)",
                                                    fontSize: 10,
                                                    fontWeight: isActive ? 800 : 700,
                                                    letterSpacing: "0.12em",
                                                    textTransform: "uppercase",
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: 10,
                                                        color: isActive
                                                            ? COLORS.cyan
                                                            : "rgba(113,113,122,0.8)",
                                                        fontSize: 10,
                                                        flex: "0 0 auto",
                                                    }}
                                                >
                                                    {isActive ? "◈" : "◦"}
                                                </span>
                                                <span>{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <SidebarCalendarPanel calendarState={calendarState} />
            </div>
        </aside>
    );
}

function MiddleSection({ title, subtitle = "", children }) {
    return (
        <div
            style={{
                borderRadius: 12,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgSoft,
                padding: 10,
                display: "grid",
                gap: 10,
            }}
        >
            <div style={{ display: "grid", gap: 4 }}>
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 13,
                        fontWeight: 800,
                    }}
                >
                    {title}
                </div>
                {subtitle ? (
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 11,
                            lineHeight: 1.4,
                        }}
                    >
                        {subtitle}
                    </div>
                ) : null}
            </div>
            {children}
        </div>
    );
}

function HeaderProviderSwitch({ provider, onChange }) {
    const trackRef = useRef(null);
    const isAtas = normalizeDataProvider(provider) === "atas";
    const [dragging, setDragging] = useState(false);

    const applyByClientX = useCallback((clientX) => {
        const track = trackRef.current;

        if (!track) {
            return;
        }

        const rect = track.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const nextProvider = relativeX >= rect.width / 2 ? "atas" : "tradovate";

        onChange?.(nextProvider);
    }, [onChange]);

    const handlePointerDown = useCallback((event) => {
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        applyByClientX(event.clientX);
    }, [applyByClientX]);

    const handlePointerMove = useCallback((event) => {
        if (!dragging) {
            return;
        }

        applyByClientX(event.clientX);
    }, [dragging, applyByClientX]);

    const handlePointerUp = useCallback((event) => {
        applyByClientX(event.clientX);
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    }, [applyByClientX]);

    const handleTradovateClick = useCallback(() => {
        onChange?.("tradovate");
    }, [onChange]);

    const handleAtasClick = useCallback(() => {
        onChange?.("atas");
    }, [onChange]);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
            }}
        >
            <button
                type="button"
                onClick={handleTradovateClick}
                style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: normalizeDataProvider(provider) === "tradovate"
                        ? COLORS.cyan
                        : "rgba(161,161,170,0.9)",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                }}
            >
                Tradovate
            </button>

            <div
                ref={trackRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                    position: "relative",
                    width: 62,
                    height: 24,
                    borderRadius: 999,
                    border: `1px solid ${COLORS.borderStrong}`,
                    background: "rgba(255,255,255,0.05)",
                    boxShadow: "inset 0 0 10px rgba(0,0,0,0.35)",
                    cursor: "pointer",
                    padding: 2,
                    userSelect: "none",
                    touchAction: "none",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: 2,
                        left: isAtas ? 32 : 2,
                        width: 28,
                        height: 18,
                        borderRadius: 999,
                        background: COLORS.cyan,
                        boxShadow:
                            "0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(34,211,238,0.45), 0 4px 10px rgba(0,0,0,0.28)",
                        transition: dragging ? "none" : "left 140ms ease",
                    }}
                />
            </div>

            <button
                type="button"
                onClick={handleAtasClick}
                style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: normalizeDataProvider(provider) === "atas"
                        ? COLORS.cyan
                        : "rgba(161,161,170,0.9)",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                }}
            >
                ATAS
            </button>
        </div>
    );
}

function MiddleControlColumn({
    showCreateAccount,
    showLinkAccounts,
    showProviderSwitch,
    accountDraft,
    selectedEvalId,
    selectedPaId,
    evalAccounts,
    paAccounts,
    pairingHint,
    activeAccount,
    activeLiveSnapshot,
    atasSyncState,
    currentProvider,
    onChangeDraft,
    onAddAccount,
    onSetSelectedEvalId,
    onSetSelectedPaId,
    onLinkAccounts,
    onSetAccountDataProvider,
    onRunAtasSync,
}) {
    const provider = normalizeDataProvider(currentProvider || activeAccount?.dataProvider);
    const isAtasActive = provider === "atas";
    const zeroState = shouldUseAtasZeroState(activeAccount, activeLiveSnapshot, provider);

    const providerLabel = getProviderLabel(provider);
    const providerTypeLabel = activeAccount
        ? getProviderTypeLabel(activeAccount?.dataProviderType, provider)
        : getProviderTypeLabel("", provider);

    const providerStatusLabel = activeAccount
        ? getProviderStatusLabel(activeAccount?.dataProviderStatus)
        : getProviderStatusLabel(provider === "atas" ? "disconnected" : "ready");

    const sourceLabel = activeAccount
        ? getProviderDisplaySourceLabel(activeAccount, activeLiveSnapshot)
        : provider === "atas"
            ? "Kein ATAS Account"
            : "Kein Tradovate Account";

    const ordersCount = !activeAccount || zeroState
        ? 0
        : Array.isArray(activeLiveSnapshot?.orders)
            ? activeLiveSnapshot.orders.length
            : 0;

    const fillsCount = !activeAccount || zeroState
        ? 0
        : Array.isArray(activeLiveSnapshot?.fills)
            ? activeLiveSnapshot.fills.length
            : 0;

    const balanceValue = !activeAccount || zeroState
        ? 0
        : toNumber(
            activeLiveSnapshot?.currentBalance,
            toNumber(activeAccount?.currentBalance, 0)
        );

    return (
        <div
            style={{
                width: CONTROL_WIDTH,
                minWidth: CONTROL_WIDTH,
                display: "grid",
                gap: 10,
                alignSelf: "start",
                position: "sticky",
                top: STICKY_TOP,
                maxHeight: `calc(100vh - ${STICKY_TOP + 16}px)`,
                overflowY: "auto",
            }}
        >
            <div
                style={{
                    width: "100%",
                    background: COLORS.panelBgMuted,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 14,
                    boxShadow: COLORS.shadow,
                    padding: 10,
                    display: "grid",
                    gap: 10,
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gap: 4,
                        padding: "2px 2px 4px",
                        borderBottom: `1px solid ${COLORS.border}`,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 14,
                            fontWeight: 800,
                        }}
                    >
                        Kontrollcenter
                    </div>
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 11,
                            lineHeight: 1.4,
                        }}
                    >
                        Eingeblendete Bereiche für Accounts, Verknüpfungen und Datenquellen.
                    </div>
                </div>

                {showCreateAccount ? (
                    <MiddleSection
                        title="Account anlegen"
                        subtitle="Name eingeben. Phase, Modus, Größe und Datenquelle werden passend vorbelegt."
                    >
                        <input
                            value={accountDraft.name}
                            onChange={(event) => onChangeDraft("name", event.target.value)}
                            placeholder="Account Name"
                            style={inputStyle}
                        />

                        <div
                            style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                            }}
                        >
                            <span style={miniChipStyle}>{accountDraft.phase}</span>
                            <span style={miniChipStyle}>{accountDraft.mode}</span>
                            <span style={miniChipStyle}>{accountDraft.size}</span>
                            <span style={miniChipStyle}>
                                {getProviderLabel(accountDraft.dataProvider)}
                            </span>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 8,
                            }}
                        >
                            <select
                                value={accountDraft.provider}
                                onChange={(event) => onChangeDraft("provider", event.target.value)}
                                style={inputStyle}
                            >
                                <option value="APEX">APEX</option>
                            </select>

                            <select
                                value={accountDraft.phase}
                                onChange={(event) => onChangeDraft("phase", event.target.value)}
                                style={inputStyle}
                            >
                                <option value="EVAL">EVAL</option>
                                <option value="PA">PA</option>
                            </select>

                            <select
                                value={accountDraft.mode}
                                onChange={(event) => onChangeDraft("mode", event.target.value)}
                                style={inputStyle}
                            >
                                <option value="Intraday">Intraday</option>
                                <option value="EOD">EOD</option>
                            </select>

                            <select
                                value={accountDraft.size}
                                onChange={(event) => onChangeDraft("size", event.target.value)}
                                style={inputStyle}
                            >
                                <option value="25K">25K</option>
                                <option value="50K">50K</option>
                                <option value="100K">100K</option>
                                <option value="150K">150K</option>
                                <option value="250K">250K</option>
                                <option value="300K">300K</option>
                            </select>
                        </div>

                        <select
                            value={accountDraft.dataProvider}
                            onChange={(event) => onChangeDraft("dataProvider", event.target.value)}
                            style={inputStyle}
                        >
                            <option value="tradovate">Tradovate</option>
                            <option value="atas">ATAS</option>
                        </select>

                        <button
                            type="button"
                            onClick={onAddAccount}
                            style={primaryButtonStyle}
                        >
                            Account speichern
                        </button>
                    </MiddleSection>
                ) : null}

                {showLinkAccounts ? (
                    <MiddleSection
                        title="EVAL mit PA verknüpfen"
                        subtitle="Es werden nur passende Konten für den Modus gezeigt."
                    >
                        <select
                            value={selectedEvalId}
                            onChange={(event) => onSetSelectedEvalId(event.target.value)}
                            style={inputStyle}
                        >
                            <option value="">EVAL wählen</option>
                            {evalAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {`${getAccountDisplayName(account)} • ${getAccountMode(account)} • ${getAccountSizeLabel(account)}`}
                                </option>
                            ))}
                        </select>

                        <select
                            value={selectedPaId}
                            onChange={(event) => onSetSelectedPaId(event.target.value)}
                            style={inputStyle}
                        >
                            <option value="">PA wählen</option>
                            {paAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {`${getAccountDisplayName(account)} • ${getAccountMode(account)} • ${getAccountSizeLabel(account)}`}
                                </option>
                            ))}
                        </select>

                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 11,
                                lineHeight: 1.4,
                            }}
                        >
                            {pairingHint}
                        </div>

                        <button
                            type="button"
                            onClick={onLinkAccounts}
                            style={secondaryButtonStyle}
                        >
                            Verknüpfung speichern
                        </button>
                    </MiddleSection>
                ) : null}

                {showProviderSwitch ? (
                    <MiddleSection
                        title="Provider umschalten"
                        subtitle="Der Umschalter wechselt die sichtbare Provider Ansicht und sucht den echten Gegenaccount."
                    >
                        <div
                            style={{
                                display: "grid",
                                gap: 6,
                                borderRadius: 10,
                                border: `1px solid ${COLORS.border}`,
                                background: "rgba(255,255,255,0.03)",
                                padding: 10,
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    lineHeight: 1.4,
                                }}
                            >
                                {activeAccount
                                    ? getAccountDisplayName(activeAccount, activeLiveSnapshot)
                                    : "Kein Account"}
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                }}
                            >
                                <span style={miniChipStyle}>{providerLabel}</span>
                                <span style={miniChipStyle}>{providerTypeLabel}</span>
                                <span style={miniChipStyle}>{providerStatusLabel}</span>
                            </div>

                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 11,
                                    lineHeight: 1.45,
                                }}
                            >
                                Quelle: {sourceLabel}
                            </div>
                        </div>

                        <div
                            style={{
                                borderRadius: 10,
                                border: `1px solid ${COLORS.border}`,
                                background: "rgba(255,255,255,0.03)",
                                padding: 12,
                                display: "grid",
                                gap: 8,
                                justifyItems: "center",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "0.10em",
                                    textTransform: "uppercase",
                                }}
                            >
                                Provider Switch
                            </div>

                            <HeaderProviderSwitch
                                provider={provider}
                                onChange={onSetAccountDataProvider}
                            />

                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 10,
                                    lineHeight: 1.45,
                                    textAlign: "center",
                                }}
                            >
                                Ziehen oder klicken wechselt direkt zwischen Tradovate und ATAS.
                            </div>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 8,
                            }}
                        >
                            <div
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${COLORS.border}`,
                                    background: "rgba(255,255,255,0.03)",
                                    padding: 10,
                                    display: "grid",
                                    gap: 4,
                                }}
                            >
                                <div
                                    style={{
                                        color: COLORS.textSoft,
                                        fontSize: 10,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                    }}
                                >
                                    Status
                                </div>
                                <div
                                    style={{
                                        color: provider === "atas" ? COLORS.green : COLORS.text,
                                        fontSize: 13,
                                        fontWeight: 800,
                                    }}
                                >
                                    {providerStatusLabel}
                                </div>
                                <div
                                    style={{
                                        color: COLORS.textSoft,
                                        fontSize: 10,
                                    }}
                                >
                                    {activeAccount ? formatDateTime(activeAccount?.lastSyncAt) : "Kein Sync"}
                                </div>
                            </div>

                            <div
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${COLORS.border}`,
                                    background: "rgba(255,255,255,0.03)",
                                    padding: 10,
                                    display: "grid",
                                    gap: 4,
                                }}
                            >
                                <div
                                    style={{
                                        color: COLORS.textSoft,
                                        fontSize: 10,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                    }}
                                >
                                    Orders / Fills
                                </div>
                                <div
                                    style={{
                                        color: COLORS.gold,
                                        fontSize: 13,
                                        fontWeight: 800,
                                    }}
                                >
                                    {ordersCount} / {fillsCount}
                                </div>
                                <div
                                    style={{
                                        color: COLORS.textSoft,
                                        fontSize: 10,
                                    }}
                                >
                                    Balance {formatCurrency(balanceValue)}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onRunAtasSync}
                            disabled={!isAtasActive || !activeAccount || atasSyncState.isRunning}
                            style={{
                                ...primaryButtonStyle,
                                opacity: !isAtasActive || !activeAccount || atasSyncState.isRunning ? 0.6 : 1,
                                cursor: !isAtasActive || !activeAccount || atasSyncState.isRunning
                                    ? "default"
                                    : "pointer",
                            }}
                        >
                            {atasSyncState.isRunning ? "ATAS Sync läuft..." : "ATAS Sync testen"}
                        </button>

                        {atasSyncState.message ? (
                            <div
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${atasSyncState.error ? "rgba(239, 68, 68, 0.35)" : COLORS.border}`,
                                    background: atasSyncState.error
                                        ? "rgba(239, 68, 68, 0.10)"
                                        : "rgba(255,255,255,0.03)",
                                    padding: 10,
                                    color: atasSyncState.error ? "#fecaca" : COLORS.text,
                                    fontSize: 11,
                                    lineHeight: 1.5,
                                }}
                            >
                                {atasSyncState.message}
                            </div>
                        ) : null}
                    </MiddleSection>
                ) : null}
            </div>
        </div>
    );
}

function ShellTopbar({
    activeAccount,
    topLiveMetrics,
    activeRiskColors,
    currentProvider,
    onSetAccountDataProvider,
}) {
    const provider = normalizeDataProvider(
        currentProvider || activeAccount?.dataProvider || "tradovate"
    );

    const currentTime = new Intl.DateTimeFormat("de-CH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date());

    const providerLabel = getProviderLabel(provider);
    const providerTypeLabel = activeAccount
        ? getProviderTypeLabel(activeAccount?.dataProviderType, provider)
        : getProviderTypeLabel("", provider);

    const providerStatusLabel = activeAccount
        ? getProviderStatusLabel(activeAccount?.dataProviderStatus)
        : getProviderStatusLabel(provider === "atas" ? "disconnected" : "ready");

    const headerAccountLabel = getHeaderAccountLabelFromProvider(provider);

    return (
        <header
            style={{
                position: "sticky",
                top: STICKY_TOP,
                zIndex: 10,
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid rgba(39,39,42,0.7)",
                background: "rgba(0,0,0,0.58)",
                backdropFilter: "blur(8px)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: COLORS.shadow,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        color: "rgba(161,161,170,0.95)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                    }}
                >
                    Account:
                </div>

                <div
                    style={{
                        color: COLORS.cyan,
                        fontSize: 24,
                        fontWeight: 900,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textShadow:
                            "0 1px 0 rgba(8,47,73,0.95), 0 2px 0 rgba(8,47,73,0.9), 0 3px 0 rgba(8,47,73,0.85), 0 8px 18px rgba(34,211,238,0.20), 0 0 16px rgba(34,211,238,0.18)",
                    }}
                >
                    {headerAccountLabel}
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "rgba(161,161,170,0.9)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                }}
            >
                <HeaderProviderSwitch
                    provider={provider}
                    onChange={onSetAccountDataProvider}
                />

                <span>{currentTime}</span>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: COLORS.cyan,
                    }}
                >
                    <span
                        style={{
                            width: 7,
                            height: 7,
                            borderRadius: "999px",
                            background: COLORS.cyan,
                            boxShadow: "0 0 10px rgba(34,211,238,0.55)",
                        }}
                    />
                    <span>Live</span>
                </div>

                <span style={{ color: "rgba(113,113,122,0.8)" }}>|</span>

                <span
                    style={{
                        color: COLORS.cyan,
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {providerLabel}
                </span>

                <span
                    style={{
                        color: "rgba(161,161,170,0.9)",
                        maxWidth: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {providerTypeLabel}
                </span>

                <span
                    style={{
                        color: "rgba(161,161,170,0.9)",
                        maxWidth: 130,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {providerStatusLabel}
                </span>

                <span style={{ color: "rgba(113,113,122,0.8)" }}>|</span>

                <span>Balance {formatCurrency(topLiveMetrics.currentBalance)}</span>

                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: `1px solid ${activeRiskColors.border}`,
                        background: activeRiskColors.bg,
                        color: activeRiskColors.text,
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "999px",
                            background: activeRiskColors.dot,
                        }}
                    />
                    {activeRiskColors.label}
                </span>
            </div>
        </header>
    );
}
function AppLayout({
    showCreateAccount,
    showLinkAccounts,
    showProviderSwitch,
    accountDraft,
    selectedEvalId,
    selectedPaId,
    evalAccounts,
    paAccounts,
    pairingHint,
    onToggleCreateAccount,
    onToggleLinkAccounts,
    onToggleProviderSwitch,
    onChangeDraft,
    onAddAccount,
    onSetSelectedEvalId,
    onSetSelectedPaId,
    onLinkAccounts,
    onSetAccountDataProvider,
    onRunAtasSync,
    activeAccount,
    activeLiveSnapshot,
    atasSyncState,
    activeRiskColors,
    topLiveMetrics,
    dashboardViewKey,
    currentProvider,
    onChangeView,
    onSelectAccount,
    onDeleteAccount,
    onUnlinkAccounts,
    accounts,
    accountGroups,
    activeAccountId,
    dashboardResetKey,
    onDashboardRenderError,
    onDashboardBoundaryReset,
    sidebarCalendarState,
}) {
    const showControlColumn =
        showCreateAccount || showLinkAccounts || showProviderSwitch;

    return (
        <div
            style={{
                minHeight: "100vh",
                background:
                    "radial-gradient(circle at top, rgba(34,211,238,0.08) 0%, rgba(5,8,22,0) 28%), linear-gradient(180deg, #07101f 0%, #050816 46%, #050816 100%)",
                color: COLORS.text,
                padding: "0 0 18px",
            }}
        >
            <section
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 40,
                    overflow: "hidden",
                    borderBottom: `1px solid ${COLORS.borderStrong}`,
                    background:
                        "linear-gradient(180deg, rgba(8,15,37,0.94) 0%, rgba(8,15,37,0.88) 58%, rgba(8,15,37,0.72) 100%)",
                    boxShadow: "inset 0 -20px 40px rgba(0,0,0,0.18)",
                    backdropFilter: "blur(10px)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background:
                            "radial-gradient(circle at 18% 30%, rgba(34,211,238,0.10) 0%, rgba(34,211,238,0.00) 30%), radial-gradient(circle at 74% 22%, rgba(250,204,21,0.08) 0%, rgba(250,204,21,0.00) 25%)",
                        pointerEvents: "none",
                    }}
                />

                <div
                    style={{
                        maxWidth: `${HERO_MAX_WIDTH}px`,
                        margin: "0 auto",
                        padding: "24px 22px 34px",
                        display: "grid",
                        gridTemplateColumns: `220px minmax(0, 1fr) 220px`,
                        alignItems: "center",
                        gap: 18,
                        position: "relative",
                        zIndex: 1,
                    }}
                >
                    <div>
                        <TradingMark />
                    </div>

                    <div
                        style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: 10,
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                padding: "9px 20px",
                                borderRadius: 18,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(12, 28, 56, 0.72)",
                                boxShadow: `0 0 24px rgba(34,211,238,0.18)`,
                                textAlign: "center",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.gold,
                                    fontWeight: 900,
                                    fontSize: 15,
                                    lineHeight: 1,
                                    letterSpacing: "0.02em",
                                }}
                            >
                                Futures.Robby
                            </div>
                            <div
                                style={{
                                    marginTop: 4,
                                    color: COLORS.cyan,
                                    fontWeight: 800,
                                    fontSize: 11,
                                    lineHeight: 1,
                                    letterSpacing: "0.18em",
                                    textTransform: "uppercase",
                                }}
                            >
                                Exclusive for Community
                            </div>
                        </div>

                        <HeroTitle />

                        <div
                            style={{
                                fontSize: 13,
                                textAlign: "center",
                                color: "#e5e7eb",
                                textShadow: "0 2px 8px rgba(0,0,0,0.35)",
                            }}
                        >
                            Disziplin vor Emotion. Klare Ausführung vor jeder Entscheidung.
                        </div>
                    </div>

                    <div />
                </div>
            </section>

            <div style={{ height: HERO_FIXED_HEIGHT }} />

            <div
                style={{
                    maxWidth: `${CONTENT_MAX_WIDTH}px`,
                    margin: "0 auto",
                    padding: `${APP_SIDE_PADDING}px ${APP_SIDE_PADDING}px 0`,
                    display: "grid",
                    gap: SHELL_GAP,
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: showControlColumn
                            ? `${SIDEBAR_WIDTH}px ${CONTROL_WIDTH}px minmax(0, 1fr)`
                            : `${SIDEBAR_WIDTH}px minmax(0, 1fr)`,
                        gap: SHELL_GAP,
                        alignItems: "start",
                    }}
                >
                    <ShellSidebar
                        activeView={dashboardViewKey}
                        onChangeView={onChangeView}
                        showCreateAccount={showCreateAccount}
                        showLinkAccounts={showLinkAccounts}
                        showProviderSwitch={showProviderSwitch}
                        onToggleCreateAccount={onToggleCreateAccount}
                        onToggleLinkAccounts={onToggleLinkAccounts}
                        onToggleProviderSwitch={onToggleProviderSwitch}
                        calendarState={sidebarCalendarState}
                    />

                    {showControlColumn ? (
                        <MiddleControlColumn
                            showCreateAccount={showCreateAccount}
                            showLinkAccounts={showLinkAccounts}
                            showProviderSwitch={showProviderSwitch}
                            accountDraft={accountDraft}
                            selectedEvalId={selectedEvalId}
                            selectedPaId={selectedPaId}
                            evalAccounts={evalAccounts}
                            paAccounts={paAccounts}
                            pairingHint={pairingHint}
                            activeAccount={activeAccount}
                            activeLiveSnapshot={activeLiveSnapshot}
                            atasSyncState={atasSyncState}
                            currentProvider={currentProvider}
                            onChangeDraft={onChangeDraft}
                            onAddAccount={onAddAccount}
                            onSetSelectedEvalId={onSetSelectedEvalId}
                            onSetSelectedPaId={onSetSelectedPaId}
                            onLinkAccounts={onLinkAccounts}
                            onSetAccountDataProvider={onSetAccountDataProvider}
                            onRunAtasSync={onRunAtasSync}
                        />
                    ) : null}

                    <div
                        style={{
                            minWidth: 0,
                            display: "grid",
                            gap: 10,
                        }}
                    >
                        <ShellTopbar
                            activeAccount={activeAccount}
                            topLiveMetrics={topLiveMetrics}
                            activeRiskColors={activeRiskColors}
                            currentProvider={currentProvider}
                            onSetAccountDataProvider={onSetAccountDataProvider}
                        />

                        <div
                            style={{
                                minWidth: 0,
                                minHeight: 0,
                                overflow: "hidden",
                                background: "rgba(0,0,0,0.22)",
                                border: "1px solid rgba(39,39,42,0.55)",
                                borderRadius: 14,
                                padding: "18px 18px 22px",
                                boxShadow: COLORS.shadow,
                            }}
                        >
                            <DashboardErrorBoundary
                                resetKey={`${dashboardViewKey}-${dashboardResetKey}`}
                                activeView={dashboardViewKey}
                                onError={onDashboardRenderError}
                                onReset={onDashboardBoundaryReset}
                                colors={COLORS}
                            >
                                <Dashboard
                                    activeAccount={activeAccount}
                                    activeAccountId={activeAccountId}
                                    accounts={accounts}
                                    accountGroups={accountGroups}
                                    activeView={dashboardViewKey}
                                    onSelectAccount={onSelectAccount}
                                    onDeleteAccount={onDeleteAccount}
                                    onUnlinkAccounts={onUnlinkAccounts}
                                    getAccountDisplayName={getAccountDisplayName}
                                    getAccountPhase={getAccountPhase}
                                    getAccountMode={getAccountMode}
                                    getAccountSizeLabel={getAccountSizeLabel}
                                    getResolvedAccountKey={getResolvedAccountKey}
                                    getAccountRiskStatus={getAccountRiskStatus}
                                    getRiskColors={getRiskColors}
                                />
                            </DashboardErrorBoundary>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [appState, setAppState] = useState(() => readAppStateSnapshot());
    const [accountDraft, setAccountDraft] = useState(INITIAL_ACCOUNT_DRAFT);
    const [selectedEvalId, setSelectedEvalId] = useState("");
    const [selectedPaId, setSelectedPaId] = useState("");
    const [activeDashboardView, setActiveDashboardView] = useState(() =>
        getInitialDashboardView()
    );
    const [providerView, setProviderView] = useState(() =>
        getInitialProviderView()
    );
    const [dashboardResetKey, setDashboardResetKey] = useState(0);
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [showLinkAccounts, setShowLinkAccounts] = useState(false);
    const [showProviderSwitch, setShowProviderSwitch] = useState(false);
    const [atasSyncState, setAtasSyncState] = useState(INITIAL_ATAS_SYNC_STATE);

    useViewportWidth();

    const accounts = appState.accounts;
    const storedActiveAccountId = appState.activeAccountId;

    const reloadAppState = useCallback((preferredActiveAccountId = null) => {
        setAppState(readAppStateSnapshot(preferredActiveAccountId));
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeStorage?.(() => {
            setAppState(readAppStateSnapshot());
        });

        return () => {
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, []);

    useEffect(() => {
        persistDashboardView(activeDashboardView);
    }, [activeDashboardView]);

    useEffect(() => {
        persistProviderView(providerView);
    }, [providerView]);

    useEffect(() => {
        if (!storedActiveAccountId) {
            return;
        }

        persistActiveAccountId?.(storedActiveAccountId);
    }, [storedActiveAccountId]);

    const storedActiveAccount =
        accounts.find((account) => account.id === storedActiveAccountId) || null;

    const currentProvider = useMemo(() => {
        if (providerView) {
            return normalizeDataProvider(providerView);
        }

        if (storedActiveAccount) {
            return getAccountProvider(storedActiveAccount);
        }

        if (accounts.length) {
            return getAccountProvider(accounts[0]);
        }

        return "tradovate";
    }, [providerView, storedActiveAccount, accounts]);

    const visibleAccounts = useMemo(() => {
        return filterAccountsByProvider(accounts, currentProvider);
    }, [accounts, currentProvider]);

    const activeAccount = useMemo(() => {
        if (
            storedActiveAccount &&
            getAccountProvider(storedActiveAccount) === currentProvider
        ) {
            return storedActiveAccount;
        }

        return findBestProviderAccount(visibleAccounts, storedActiveAccount);
    }, [storedActiveAccount, visibleAccounts, currentProvider]);

    const activeAccountId = activeAccount?.id || null;

    const activeLiveSnapshot = activeAccount?.id
        ? getLiveAccountSnapshot(activeAccount.id)
        : null;

    const activeAccountZeroState = useMemo(() => {
        if (!activeAccount) {
            return false;
        }

        return shouldUseAtasZeroState(
            activeAccount,
            activeLiveSnapshot,
            currentProvider
        );
    }, [activeAccount, activeLiveSnapshot, currentProvider]);

    const activeRiskStatus = useMemo(() => {
        if (!activeAccount?.id) {
            return {
                state: "neutral",
                reason: "",
                updatedAt: null,
            };
        }

        if (activeAccountZeroState) {
            return {
                state: "neutral",
                reason: "ATAS Zero State",
                updatedAt: null,
            };
        }

        return getAccountRiskStatus(activeAccount.id);
    }, [activeAccount, activeAccountZeroState]);

    const activeRiskColors = getRiskColors(activeRiskStatus.state);

    const activeAccountBalanceHistory = !activeAccount?.id
        ? EMPTY_LIST
        : activeAccountZeroState
            ? EMPTY_LIST
            : (() => {
                const rows = getAccountBalanceHistory(activeAccount.id) || EMPTY_LIST;
                return Array.isArray(rows) ? rows : EMPTY_LIST;
            })();

    const sidebarCalendarState = useMemo(() => {
        return buildSidebarCalendarState(activeAccountBalanceHistory);
    }, [activeAccountBalanceHistory]);

    const topLiveMetrics = useMemo(() => {
        if (!activeAccount?.id) {
            return {
                orderCount: 0,
                fillCount: 0,
                startBalance: 0,
                currentBalance: 0,
                delta: 0,
            };
        }

        const fallbackStartBalance = Math.max(
            toNumber(activeAccount?.startingBalance, 0),
            toNumber(activeAccount?.accountSize, 0)
        );

        if (activeAccountZeroState) {
            return {
                orderCount: 0,
                fillCount: 0,
                startBalance: fallbackStartBalance,
                currentBalance: fallbackStartBalance,
                delta: 0,
            };
        }

        const orders = Array.isArray(activeLiveSnapshot?.orders)
            ? activeLiveSnapshot.orders
            : getOrders(activeAccount.id) || EMPTY_LIST;

        const fills = Array.isArray(activeLiveSnapshot?.fills)
            ? activeLiveSnapshot.fills
            : getFills(activeAccount.id) || EMPTY_LIST;

        const activeProvider = normalizeDataProvider(activeAccount?.dataProvider || currentProvider);

        const startBalanceRaw = activeProvider === "atas"
            ? toNumber(activeLiveSnapshot?.startingBalance, 0)
            : (
                toNumber(activeLiveSnapshot?.startingBalance, 0) ||
                toNumber(activeAccount?.startingBalance, 0) ||
                toNumber(activeAccount?.accountSize, 0)
            );

        const currentBalanceRaw = activeProvider === "atas"
            ? toNumber(activeLiveSnapshot?.currentBalance, 0)
            : (
                toNumber(activeLiveSnapshot?.currentBalance, 0) ||
                toNumber(activeAccount?.currentBalance, 0) ||
                startBalanceRaw
            );

        return {
            orderCount: orders.length,
            fillCount: fills.length,
            startBalance: startBalanceRaw,
            currentBalance: currentBalanceRaw,
            delta: currentBalanceRaw - startBalanceRaw,
        };
    }, [activeAccount, activeLiveSnapshot, activeAccountZeroState]);

    const accountGroups = useMemo(() => {
        const rawGroups = getAccountGroups?.() || EMPTY_LIST;

        if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
            return [];
        }

        return rawGroups
            .map((group, index) =>
                buildProviderScopedGroup(group, accounts, index, currentProvider)
            )
            .filter(Boolean);
    }, [accounts, currentProvider]);

    const evalAccounts = useMemo(() => {
        return visibleAccounts.filter(
            (account) =>
                normalizePhaseValue(account?.accountPhase || account?.phase) === "eval"
        );
    }, [visibleAccounts]);

    const selectedEvalAccount = useMemo(() => {
        return evalAccounts.find((account) => account.id === selectedEvalId) || null;
    }, [evalAccounts, selectedEvalId]);

    const paAccounts = useMemo(() => {
        const allPaAccounts = visibleAccounts.filter(
            (account) =>
                normalizePhaseValue(account?.accountPhase || account?.phase) === "pa"
        );

        if (!selectedEvalAccount) {
            return allPaAccounts;
        }

        const selectedMode = normalizeProductTypeValue(
            selectedEvalAccount?.productType ||
            selectedEvalAccount?.mode ||
            selectedEvalAccount?.challengeMode
        );

        return allPaAccounts.filter((account) => {
            const accountMode = normalizeProductTypeValue(
                account?.productType || account?.mode || account?.challengeMode
            );

            return accountMode === selectedMode;
        });
    }, [visibleAccounts, selectedEvalAccount]);

    const safeSelectedPaId = useMemo(() => {
        return paAccounts.some((account) => account.id === selectedPaId)
            ? selectedPaId
            : "";
    }, [paAccounts, selectedPaId]);

    const effectiveSelectedPaId = useMemo(() => {
        if (safeSelectedPaId) {
            return safeSelectedPaId;
        }

        if (selectedEvalId && paAccounts.length === 1) {
            return paAccounts[0].id;
        }

        return "";
    }, [safeSelectedPaId, selectedEvalId, paAccounts]);

    const pairingHint = useMemo(() => {
        return getPairingHint(selectedEvalAccount, paAccounts);
    }, [selectedEvalAccount, paAccounts]);

    const closeControlPanels = useCallback(() => {
        setShowCreateAccount(false);
        setShowLinkAccounts(false);
        setShowProviderSwitch(false);
    }, []);

    const handleSelectAccount = useCallback((accountId) => {
        const nextAccount =
            accounts.find((account) => account.id === accountId) || null;

        setAppState((current) => ({
            ...current,
            activeAccountId: accountId,
        }));

        if (nextAccount) {
            setProviderView(getAccountProvider(nextAccount));
        }
    }, [accounts]);

    const handleChangeDashboardView = useCallback((nextView) => {
        setActiveDashboardView(sanitizeDashboardView(nextView));
        closeControlPanels();
    }, [closeControlPanels]);

    const handleToggleCreateAccount = useCallback(() => {
        setActiveDashboardView("accounts");
        setShowCreateAccount((current) => {
            const next = !current;

            if (next) {
                setShowLinkAccounts(false);
                setShowProviderSwitch(false);
            }

            return next;
        });
    }, []);

    const handleToggleLinkAccounts = useCallback(() => {
        setActiveDashboardView("accounts");
        setShowLinkAccounts((current) => {
            const next = !current;

            if (next) {
                setShowCreateAccount(false);
                setShowProviderSwitch(false);
            }

            return next;
        });
    }, []);

    const handleToggleProviderSwitch = useCallback(() => {
        setActiveDashboardView("accounts");
        setShowProviderSwitch((current) => {
            const next = !current;

            if (next) {
                setShowCreateAccount(false);
                setShowLinkAccounts(false);
            }

            return next;
        });
    }, []);

    const handleChangeDraft = useCallback((field, value) => {
        setAccountDraft((current) => {
            if (field === "name") {
                return buildSmartDraftFromName(value, current);
            }

            return {
                ...current,
                [field]: value,
            };
        });
    }, []);

    const handleSetSelectedEvalId = useCallback((nextEvalId) => {
        setSelectedEvalId(nextEvalId);
        setSelectedPaId("");
    }, []);

    const handleAddAccount = useCallback(() => {
        const trimmedName = accountDraft.name.trim();

        if (!trimmedName) {
            return;
        }

        const smartDraft = buildSmartDraftFromName(trimmedName, accountDraft);
        const normalizedDataProvider = normalizeDataProvider(smartDraft.dataProvider);
        const detectedSize =
            detectAccountSize(smartDraft.size) ||
            detectAccountSize(trimmedName) ||
            0;
        const providerType = normalizeDataProviderType("", normalizedDataProvider);
        const providerStatus = normalizeDataProviderStatus(
            "",
            normalizedDataProvider === "atas" ? "disconnected" : "ready"
        );

        const isAtasAccount = normalizedDataProvider === "atas";

        const localId = createLocalId();

        const initialTradovateAccountId = isAtasAccount ? "" : trimmedName;
        const initialTradovateAccountName = isAtasAccount ? "" : trimmedName;
        const initialTradingAccountId = isAtasAccount ? "" : trimmedName;
        const initialTradingAccountName = isAtasAccount ? "" : trimmedName;
        const initialResolvedAccountId = isAtasAccount ? "" : trimmedName;
        const initialApexId = isAtasAccount ? "" : trimmedName;

        const initialAtasAccountId = "";
        const initialAtasAccountName = "";

        const initialProviderAccountId =
            isAtasAccount ? "" : trimmedName;
        const initialProviderAccountName =
            isAtasAccount ? "" : trimmedName;

        const seedSource = buildProviderSourceFromAccount(
            {
                id: localId,
                displayName: trimmedName,
                tradingAccountId: initialTradingAccountId,
                tradingAccountName: initialTradingAccountName,
                tradovateAccountId: initialTradovateAccountId,
                tradovateAccountName: initialTradovateAccountName,
                atasAccountId: initialAtasAccountId,
                atasAccountName: initialAtasAccountName,
                dataProvider: normalizedDataProvider,
                dataProviderType: providerType,
                dataProviderStatus: providerStatus,
                dataProviderAccountId: initialProviderAccountId,
                dataProviderAccountName: initialProviderAccountName,
            },
            normalizedDataProvider
        );

        const newAccount = {
            id: localId,
            displayName: trimmedName,
            tradingAccountId: initialTradingAccountId,
            tradingAccountName: initialTradingAccountName,
            resolvedAccountId: initialResolvedAccountId,
            apexId: initialApexId,
            provider: smartDraft.provider,
            accountPhase: normalizePhaseValue(smartDraft.phase),
            productType: normalizeProductTypeValue(smartDraft.mode),
            accountSize: detectedSize,
            dataProvider: normalizedDataProvider,
            dataProviderType: providerType,
            dataProviderStatus: providerStatus,
            dataProviderAccountId: initialProviderAccountId,
            dataProviderAccountName: initialProviderAccountName,
            tradovateAccountId: initialTradovateAccountId,
            tradovateAccountName: initialTradovateAccountName,
            atasAccountId: initialAtasAccountId,
            atasAccountName: initialAtasAccountName,
            source: {
                ...seedSource,
                provider: normalizedDataProvider,
                type: providerType,
                status: providerStatus,
                accountId: initialProviderAccountId,
                accountName: initialProviderAccountName,
            },
            createdAt: new Date().toISOString(),
        };

        addAccount?.(newAccount);
        setProviderView(normalizedDataProvider);
        setAccountDraft(INITIAL_ACCOUNT_DRAFT);
        setShowCreateAccount(false);
        setActiveDashboardView("accounts");
        setDashboardResetKey((current) => current + 1);
        reloadAppState(newAccount.id);
    }, [accountDraft, reloadAppState]);

    const handleDeleteAccount = useCallback((accountId) => {
        if (!accountId) {
            return;
        }

        deleteAccount?.(accountId);
        reloadAppState();
    }, [reloadAppState]);

    const handleLinkAccounts = useCallback(() => {
        if (!selectedEvalId || !effectiveSelectedPaId) {
            return;
        }

        const evalAccount = visibleAccounts.find((account) => account.id === selectedEvalId);
        const paAccount = visibleAccounts.find((account) => account.id === effectiveSelectedPaId);

        if (!evalAccount || !paAccount) {
            return;
        }

        const evalMode = normalizeProductTypeValue(
            evalAccount?.productType || evalAccount?.mode
        );
        const paMode = normalizeProductTypeValue(
            paAccount?.productType || paAccount?.mode
        );

        if (evalMode !== paMode) {
            return;
        }

        linkEvalToPaAccount?.(selectedEvalId, effectiveSelectedPaId);
        setSelectedEvalId("");
        setSelectedPaId("");
        setShowLinkAccounts(false);
        setActiveDashboardView("accounts");
        setDashboardResetKey((current) => current + 1);
        reloadAppState(effectiveSelectedPaId);
    }, [effectiveSelectedPaId, reloadAppState, selectedEvalId, visibleAccounts]);

    const handleUnlinkAccounts = useCallback((evalId, paId) => {
        unlinkEvalFromPaAccount?.(evalId, paId);
        reloadAppState();
    }, [reloadAppState]);

    const handleSetAccountDataProvider = useCallback((nextProvider) => {
        const targetProvider = normalizeDataProvider(nextProvider);
        const targetAccounts = filterAccountsByProvider(accounts, targetProvider);
        const matchedAccount = findBestProviderAccount(
            targetAccounts,
            activeAccount || storedActiveAccount
        );

        setProviderView(targetProvider);
        setAtasSyncState(INITIAL_ATAS_SYNC_STATE);
        setShowProviderSwitch(false);
        setDashboardResetKey((current) => current + 1);

        if (matchedAccount?.id) {
            setAppState((current) => ({
                ...current,
                activeAccountId: matchedAccount.id,
            }));
            reloadAppState(matchedAccount.id);
            return;
        }

        reloadAppState(storedActiveAccount?.id || null);
    }, [accounts, activeAccount, storedActiveAccount, reloadAppState]);

    const handleRunAtasSync = useCallback(async () => {
        if (!activeAccount?.id) {
            setAtasSyncState({
                isRunning: false,
                message: "Für diesen Provider ist aktuell kein echter Account vorhanden.",
                error: true,
            });
            return;
        }

        if (normalizeDataProvider(currentProvider) !== "atas") {
            setAtasSyncState({
                isRunning: false,
                message: "Bitte zuerst auf ATAS umschalten.",
                error: true,
            });
            return;
        }

        setAtasSyncState({
            isRunning: true,
            message: "ATAS Sync läuft...",
            error: false,
        });

        try {
            saveProviderSyncSnapshot(
                activeAccount.id,
                {
                    dataProvider: "atas",
                    dataProviderType: activeAccount.dataProviderType || "desktop",
                    dataProviderStatus: "syncing",
                    lastSyncAt: activeAccount.lastSyncAt || "",
                },
                "atas"
            );

            const syncResult = await runAtasSyncForAccount(activeAccount);
            const savedSnapshot = saveProviderSyncSnapshot(
                activeAccount.id,
                syncResult.snapshot,
                "atas"
            );

            const ordersCount = Array.isArray(savedSnapshot?.orders)
                ? savedSnapshot.orders.length
                : Array.isArray(syncResult.snapshot?.orders)
                    ? syncResult.snapshot.orders.length
                    : 0;

            const fillsCount = Array.isArray(savedSnapshot?.fills)
                ? savedSnapshot.fills.length
                : Array.isArray(syncResult.snapshot?.fills)
                    ? syncResult.snapshot.fills.length
                    : 0;

            const balanceValue = toNumber(
                savedSnapshot?.currentBalance,
                toNumber(syncResult.snapshot?.currentBalance, 0)
            );

            setAtasSyncState({
                isRunning: false,
                message:
                    syncResult.message ||
                    `ATAS Sync fertig. Orders ${ordersCount}. Fills ${fillsCount}. Balance ${formatCurrency(balanceValue)}.`,
                error: false,
            });

            setDashboardResetKey((current) => current + 1);
            reloadAppState(activeAccount.id);
        } catch (error) {
            const errorMessage = cleanString(error?.message) || "ATAS Sync fehlgeschlagen.";

            saveProviderSyncSnapshot(
                activeAccount.id,
                {
                    dataProvider: "atas",
                    dataProviderType: activeAccount.dataProviderType || "desktop",
                    dataProviderStatus: "error",
                    lastSyncAt: activeAccount.lastSyncAt || "",
                },
                "atas"
            );

            setAtasSyncState({
                isRunning: false,
                message: errorMessage,
                error: true,
            });

            setDashboardResetKey((current) => current + 1);
            reloadAppState(activeAccount.id);
        }
    }, [activeAccount, currentProvider, reloadAppState]);

    const handleDashboardRenderError = useCallback((error, errorInfo) => {
        console.error("Dashboard render error", error, errorInfo);
    }, []);

    const handleDashboardBoundaryReset = useCallback(() => {
        persistDashboardView(DEFAULT_DASHBOARD_VIEW);
        setActiveDashboardView(DEFAULT_DASHBOARD_VIEW);
        closeControlPanels();
        setDashboardResetKey((current) => current + 1);
        reloadAppState();
    }, [closeControlPanels, reloadAppState]);

    const dashboardViewKey = sanitizeDashboardView(activeDashboardView);

    return (
        <AppLayout
            showCreateAccount={showCreateAccount}
            showLinkAccounts={showLinkAccounts}
            showProviderSwitch={showProviderSwitch}
            accountDraft={accountDraft}
            selectedEvalId={selectedEvalId}
            selectedPaId={effectiveSelectedPaId}
            evalAccounts={evalAccounts}
            paAccounts={paAccounts}
            pairingHint={pairingHint}
            onToggleCreateAccount={handleToggleCreateAccount}
            onToggleLinkAccounts={handleToggleLinkAccounts}
            onToggleProviderSwitch={handleToggleProviderSwitch}
            onChangeDraft={handleChangeDraft}
            onAddAccount={handleAddAccount}
            onSetSelectedEvalId={handleSetSelectedEvalId}
            onSetSelectedPaId={setSelectedPaId}
            onLinkAccounts={handleLinkAccounts}
            onSetAccountDataProvider={handleSetAccountDataProvider}
            onRunAtasSync={handleRunAtasSync}
            activeAccount={activeAccount}
            activeLiveSnapshot={activeLiveSnapshot}
            atasSyncState={atasSyncState}
            activeRiskColors={activeRiskColors}
            topLiveMetrics={topLiveMetrics}
            dashboardViewKey={dashboardViewKey}
            currentProvider={currentProvider}
            onChangeView={handleChangeDashboardView}
            onSelectAccount={handleSelectAccount}
            onDeleteAccount={handleDeleteAccount}
            onUnlinkAccounts={handleUnlinkAccounts}
            accounts={visibleAccounts}
            accountGroups={accountGroups}
            activeAccountId={activeAccountId}
            dashboardResetKey={dashboardResetKey}
            onDashboardRenderError={handleDashboardRenderError}
            onDashboardBoundaryReset={handleDashboardBoundaryReset}
            sidebarCalendarState={sidebarCalendarState}
        />
    );
}
