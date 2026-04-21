// src/utils/providerDisplay.js

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

function isUuidLike(value) {
    const text = cleanString(value);

    if (!text) {
        return false;
    }

    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
        /^acc-\d+-[a-z0-9]+$/i.test(text)
    );
}

export function getActiveProvider(account = null, snapshot = null, fallback = "") {
    return normalizeProvider(
        snapshot?.dataProvider ||
        account?.dataProvider ||
        account?.provider ||
        fallback
    ) || "tradovate";
}

export function getStrictProviderAccountId(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);

    if (activeProvider === "atas") {
        return cleanString(
            snapshot?.atasAccountId ||
            snapshot?.dataProviderAccountId ||
            account?.atasAccountId ||
            account?.dataProviderAccountId
        );
    }

    const candidates = [
        snapshot?.tradovateAccountId,
        snapshot?.tradingAccountId,
        account?.tradovateAccountId,
        account?.tradingAccountId,
        account?.tradovateAccountName,
        account?.tradingAccountName,
    ]
        .map(cleanString)
        .filter(Boolean)
        .filter((value) => !isUuidLike(value));

    return candidates[0] || "";
}

export function getStrictProviderAccountName(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);

    if (activeProvider === "atas") {
        return cleanString(
            snapshot?.atasAccountName ||
            snapshot?.dataProviderAccountName ||
            account?.atasAccountName ||
            account?.dataProviderAccountName
        );
    }

    const candidates = [
        snapshot?.tradovateAccountName,
        snapshot?.tradingAccountName,
        account?.tradovateAccountName,
        account?.tradingAccountName,
        snapshot?.tradovateAccountId,
        snapshot?.tradingAccountId,
        account?.tradovateAccountId,
        account?.tradingAccountId,
    ]
        .map(cleanString)
        .filter(Boolean)
        .filter((value) => !isUuidLike(value));

    return candidates[0] || "";
}

export function hasStrictProviderIdentity(account = null, snapshot = null, provider = "") {
    return Boolean(
        getStrictProviderAccountId(account, snapshot, provider) ||
        getStrictProviderAccountName(account, snapshot, provider)
    );
}

export function getStrictProviderDisplayName(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);
    const name = getStrictProviderAccountName(account, snapshot, activeProvider);
    const id = getStrictProviderAccountId(account, snapshot, activeProvider);

    if (activeProvider === "atas") {
        return name || id || "Kein ATAS Account";
    }

    return name || id || "Kein Tradovate Account";
}

export function getStrictProviderTradingRef(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);
    const id = getStrictProviderAccountId(account, snapshot, activeProvider);

    if (activeProvider === "atas") {
        return id || "";
    }

    return id || "Keine Trading Ref";
}

export function getStrictProviderScopeAccountId(account = null, snapshot = null, provider = "") {
    return cleanString(
        getStrictProviderTradingRef(account, snapshot, provider)
    );
}

export function getStrictProviderAccountLabel(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);
    const strictName = cleanString(
        getStrictProviderAccountName(account, snapshot, activeProvider)
    );
    const strictId = cleanString(
        getStrictProviderTradingRef(account, snapshot, activeProvider)
    );

    if (strictName) {
        return strictName;
    }

    if (strictId) {
        return strictId;
    }

    return activeProvider === "atas" ? "Kein ATAS Account" : "Kein Account";
}

export function shouldUseAtasZeroState(account = null, snapshot = null, provider = "") {
    const activeProvider = getActiveProvider(account, snapshot, provider);
    return activeProvider === "atas" && !hasStrictProviderIdentity(account, snapshot, activeProvider);
}