const IMPORT_KEYS = [
    "orders",
    "trades",
    "cashHistory",
    "performance",
    "positionHistory",
];

const DEFAULT_PROVIDER = "tradovate";

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeProvider(value) {
    return toText(value).toLowerCase() === "atas" ? "atas" : DEFAULT_PROVIDER;
}

function resolveSourceProvider(source) {
    return normalizeProvider(
        source?.provider ||
        source?.dataProvider ||
        source?.source?.provider ||
        ""
    );
}

function hasExplicitProvider(source) {
    return Boolean(
        toText(source?.provider) ||
        toText(source?.dataProvider) ||
        toText(source?.source?.provider)
    );
}

export function createEmptyImport(type, provider = DEFAULT_PROVIDER) {
    return {
        type,
        provider: normalizeProvider(provider),
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

export function getEmptyAccountImports(provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

    const empty = {
        orders: createEmptyImport("orders", normalizedProvider),
        trades: createEmptyImport("trades", normalizedProvider),
        cashHistory: createEmptyImport("cashHistory", normalizedProvider),
        performance: createEmptyImport("performance", normalizedProvider),
        positionHistory: createEmptyImport("positionHistory", normalizedProvider),
    };

    return {
        ...empty,
        provider: normalizedProvider,
        dataProvider: normalizedProvider,
        fills: empty.trades,
        dailySummary: empty.cashHistory,
    };
}

export function hasImportContent(importItem) {
    if (!importItem || typeof importItem !== "object") {
        return false;
    }

    if (toText(importItem.fileName)) {
        return true;
    }

    if (toText(importItem.rawText)) {
        return true;
    }

    if (toArray(importItem.rows).length > 0) {
        return true;
    }

    if (toArray(importItem.previewRows).length > 0) {
        return true;
    }

    return false;
}

function normalizeImportItem(type, importItem, provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(
        importItem?.provider || provider
    );

    const item =
        importItem && typeof importItem === "object"
            ? importItem
            : createEmptyImport(type, normalizedProvider);

    return {
        type,
        provider: normalizedProvider,
        fileName: toText(item.fileName),
        importedAt: toText(item.importedAt),
        headers: toArray(item.headers),
        rows: toArray(item.rows),
        previewRows: toArray(item.previewRows),
        rawText: typeof item.rawText === "string" ? item.rawText : "",
        appAccountId: toText(item.appAccountId),
        appAccountName: toText(item.appAccountName),
        tradingAccountId: toText(item.tradingAccountId),
        tradingAccountName: toText(item.tradingAccountName),
        tradingAccountKey: toText(item.tradingAccountKey),
        csvAccountRaw: toText(item.csvAccountRaw),
    };
}

function getImportBlockCandidates(source, provider) {
    if (!source || typeof source !== "object") {
        return [];
    }

    const normalizedProvider = normalizeProvider(provider);
    const exactBlocks = [];
    const explicitProvider = resolveSourceProvider(source);

    const directProviderBlock =
        source?.providers?.[normalizedProvider] ||
        source?.providerDataByProvider?.[normalizedProvider] ||
        source?.byProvider?.[normalizedProvider] ||
        source?.[normalizedProvider];

    if (directProviderBlock && typeof directProviderBlock === "object") {
        exactBlocks.push(directProviderBlock);
    }

    if (explicitProvider === normalizedProvider) {
        exactBlocks.push(source);
    }

    if (normalizedProvider === DEFAULT_PROVIDER && !hasExplicitProvider(source)) {
        exactBlocks.push(source);
    }

    return exactBlocks;
}

function getCandidatesForKey(block, key) {
    if (!block || typeof block !== "object") {
        return [];
    }

    if (key === "trades") {
        return [block.trades, block.fills];
    }

    if (key === "cashHistory") {
        return [block.cashHistory, block.dailySummary];
    }

    return [block[key]];
}

function resolvePreferredProvider(sources = []) {
    for (const source of sources) {
        const provider = resolveSourceProvider(source);

        if (provider) {
            return provider;
        }

        const nestedProvider = normalizeProvider(
            source?.provider ||
            source?.dataProvider ||
            source?.activeProvider ||
            source?.source?.provider
        );

        if (nestedProvider) {
            return nestedProvider;
        }
    }

    return DEFAULT_PROVIDER;
}

export function resolveAccountImportsFromSources(...sources) {
    const safeSources = sources.filter(
        (source) => source && typeof source === "object"
    );

    const preferredProvider = resolvePreferredProvider(safeSources);
    const resolved = {};

    for (const key of IMPORT_KEYS) {
        let pickedImport = null;

        for (const source of safeSources) {
            const blocks = getImportBlockCandidates(source, preferredProvider);

            for (const block of blocks) {
                const candidates = getCandidatesForKey(block, key);
                const match = candidates.find(hasImportContent);

                if (match) {
                    pickedImport = match;
                    break;
                }
            }

            if (pickedImport) {
                break;
            }
        }

        resolved[key] = normalizeImportItem(
            key,
            pickedImport,
            preferredProvider
        );
    }

    return {
        ...resolved,
        provider: preferredProvider,
        dataProvider: preferredProvider,
        fills: resolved.trades,
        dailySummary: resolved.cashHistory,
    };
}