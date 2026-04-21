function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeDataProvider(value) {
    const provider = cleanString(value).toLowerCase();

    if (provider === "atas") {
        return "atas";
    }

    return "tradovate";
}

function normalizeDataProviderType(value, provider = "tradovate") {
    const normalizedProvider = normalizeDataProvider(provider);
    const type = cleanString(value).toLowerCase();

    if (normalizedProvider === "atas") {
        if (type === "api") {
            return "api";
        }

        if (type === "bridge") {
            return "bridge";
        }

        if (type === "desktop") {
            return "desktop";
        }

        return "desktop";
    }

    if (type === "api") {
        return "api";
    }

    if (type === "csv") {
        return "csv";
    }

    return "csv";
}

function normalizeDataProviderStatus(value, fallback = "") {
    const status = cleanString(value).toLowerCase();
    const safeFallback = cleanString(fallback).toLowerCase();

    if (status === "connected") {
        return "connected";
    }

    if (status === "ready") {
        return "ready";
    }

    if (status === "syncing") {
        return "syncing";
    }

    if (status === "error") {
        return "error";
    }

    if (status === "disconnected") {
        return "disconnected";
    }

    if (status === "offline") {
        return "disconnected";
    }

    if (status === "online") {
        return "connected";
    }

    if (safeFallback === "connected") {
        return "connected";
    }

    if (safeFallback === "ready") {
        return "ready";
    }

    if (safeFallback === "syncing") {
        return "syncing";
    }

    if (safeFallback === "error") {
        return "error";
    }

    if (safeFallback === "disconnected") {
        return "disconnected";
    }

    return "ready";
}

function getProviderLabel(provider) {
    return normalizeDataProvider(provider) === "atas" ? "ATAS" : "Tradovate";
}

function getProviderTypeLabel(type, provider = "tradovate") {
    const normalizedProvider = normalizeDataProvider(provider);
    const normalizedType = normalizeDataProviderType(type, normalizedProvider);

    if (normalizedProvider === "atas") {
        if (normalizedType === "desktop") {
            return "Desktop";
        }

        if (normalizedType === "bridge") {
            return "Bridge";
        }

        if (normalizedType === "api") {
            return "API";
        }

        return "Desktop";
    }

    if (normalizedType === "api") {
        return "API";
    }

    if (normalizedType === "csv") {
        return "CSV";
    }

    return "CSV";
}

function getProviderStatusLabel(status) {
    const normalizedStatus = normalizeDataProviderStatus(status, "ready");

    if (normalizedStatus === "connected") {
        return "Verbunden";
    }

    if (normalizedStatus === "ready") {
        return "Bereit";
    }

    if (normalizedStatus === "syncing") {
        return "Sync läuft";
    }

    if (normalizedStatus === "error") {
        return "Fehler";
    }

    if (normalizedStatus === "disconnected") {
        return "Nicht verbunden";
    }

    return "Bereit";
}

function createEmptyCsvImport(type) {
    return {
        type: cleanString(type),
        fileName: "",
        importedAt: "",
        headers: [],
        rows: [],
        previewRows: [],
        rawText: "",
        appAccountId: "",
        appAccountName: "",
        tradingAccountId: "",
        tradingAccountName: "",
        tradingAccountKey: "",
        csvAccountRaw: "",
    };
}

function getEmptyCsvImports() {
    const cashHistory = createEmptyCsvImport("cashHistory");

    return {
        orders: createEmptyCsvImport("orders"),
        trades: createEmptyCsvImport("trades"),
        cashHistory,
        dailySummary: {
            ...cashHistory,
            type: "dailySummary",
        },
        performance: createEmptyCsvImport("performance"),
        positionHistory: createEmptyCsvImport("positionHistory"),
    };
}

function cloneCsvImportEntry(type, source = {}) {
    return {
        ...createEmptyCsvImport(type),
        ...(source || {}),
        type,
        fileName: cleanString(source?.fileName),
        importedAt: cleanString(source?.importedAt),
        headers: toArray(source?.headers),
        rows: toArray(source?.rows),
        previewRows: toArray(source?.previewRows),
        rawText: String(source?.rawText || ""),
        appAccountId: cleanString(source?.appAccountId),
        appAccountName: cleanString(source?.appAccountName),
        tradingAccountId: cleanString(source?.tradingAccountId),
        tradingAccountName: cleanString(source?.tradingAccountName),
        tradingAccountKey: cleanString(source?.tradingAccountKey),
        csvAccountRaw: cleanString(source?.csvAccountRaw),
    };
}

function normalizeProviderImportsShape(value) {
    const base = getEmptyCsvImports();
    const input = value && typeof value === "object" ? value : {};

    const cashHistory = cloneCsvImportEntry(
        "cashHistory",
        input.cashHistory || input.dailySummary || {}
    );

    const normalized = {
        orders: cloneCsvImportEntry("orders", input.orders || {}),
        trades: cloneCsvImportEntry("trades", input.trades || {}),
        cashHistory,
        dailySummary: {
            ...cashHistory,
            type: "dailySummary",
        },
        performance: cloneCsvImportEntry("performance", input.performance || {}),
        positionHistory: cloneCsvImportEntry("positionHistory", input.positionHistory || {}),
    };

    return {
        ...base,
        ...normalized,
    };
}

function buildProviderSourceFromAccount(account = {}, providerOverride = "") {
    const provider = normalizeDataProvider(
        providerOverride ||
        account?.dataProvider ||
        account?.source?.provider ||
        "tradovate"
    );

    const type = normalizeDataProviderType(
        account?.dataProviderType ||
        account?.source?.type,
        provider
    );

    const fallbackStatus = provider === "atas" ? "disconnected" : "ready";
    const status = normalizeDataProviderStatus(
        account?.dataProviderStatus ||
        account?.source?.status,
        fallbackStatus
    );

    const tradovateAccountId = cleanString(
        account?.tradovateAccountId ||
        account?.tradingAccountId ||
        account?.apexId ||
        account?.accountId ||
        account?.displayName ||
        account?.id
    );

    const tradovateAccountName = cleanString(
        account?.tradovateAccountName ||
        account?.tradingAccountName ||
        account?.displayName ||
        tradovateAccountId
    );

    const atasAccountId = cleanString(
        account?.atasAccountId ||
        account?.dataProviderAccountId ||
        account?.displayName ||
        account?.id
    );

    const atasAccountName = cleanString(
        account?.atasAccountName ||
        account?.dataProviderAccountName ||
        account?.displayName ||
        atasAccountId
    );

    const accountId = provider === "atas" ? atasAccountId : tradovateAccountId;
    const accountName = provider === "atas" ? atasAccountName : tradovateAccountName;

    return {
        provider,
        type,
        status,
        accountId: cleanString(
            account?.source?.accountId ||
            accountId
        ),
        accountName: cleanString(
            account?.source?.accountName ||
            accountName
        ),
        lastSyncAt: cleanString(
            account?.lastSyncAt ||
            account?.source?.lastSyncAt
        ),
    };
}

function buildEmptyProviderBucket(provider = "tradovate", seed = {}) {
    const normalizedProvider = normalizeDataProvider(provider);
    const normalizedSeed = seed && typeof seed === "object" ? seed : {};
    const source = {
        provider: normalizedProvider,
        type: normalizeDataProviderType(
            normalizedSeed?.source?.type || normalizedSeed?.type,
            normalizedProvider
        ),
        status: normalizeDataProviderStatus(
            normalizedSeed?.source?.status || normalizedSeed?.status,
            normalizedProvider === "atas" ? "disconnected" : "ready"
        ),
        accountId: cleanString(
            normalizedSeed?.source?.accountId || normalizedSeed?.accountId
        ),
        accountName: cleanString(
            normalizedSeed?.source?.accountName || normalizedSeed?.accountName
        ),
        lastSyncAt: cleanString(
            normalizedSeed?.source?.lastSyncAt || normalizedSeed?.lastSyncAt
        ),
    };

    return {
        provider: normalizedProvider,
        source,
        status: source.status,
        lastSyncAt: source.lastSyncAt,
        orders: toArray(normalizedSeed?.orders),
        fills: toArray(normalizedSeed?.fills),
        balanceHistory: toArray(normalizedSeed?.balanceHistory),
        performance: toArray(normalizedSeed?.performance),
        positionHistory: toArray(normalizedSeed?.positionHistory),
        csvImports: normalizeProviderImportsShape(normalizedSeed?.csvImports || {}),
    };
}

function buildEmptyProviderData() {
    return {
        tradovate: buildEmptyProviderBucket("tradovate"),
        atas: buildEmptyProviderBucket("atas"),
    };
}

export {
    buildEmptyProviderBucket,
    buildEmptyProviderData,
    buildProviderSourceFromAccount,
    getProviderLabel,
    getProviderStatusLabel,
    getProviderTypeLabel,
    normalizeDataProvider,
    normalizeDataProviderStatus,
    normalizeDataProviderType,
    normalizeProviderImportsShape,
};