const SIMULATION_UPDATED_EVENT = "future-dashboard-simulation-updated";

const EMPTY_SIMULATION = {
    trades: [],
    updatedAt: null,
};

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

    const text = cleanString(value).replace(",", ".");
    const parsed = Number(text);

    return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeInteger(value, fallback = 1) {
    const parsed = Math.round(toNumber(value, fallback));

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

function emitSimulationUpdated() {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new CustomEvent(SIMULATION_UPDATED_EVENT));
}

function getSimulationStorageKey(accountId) {
    const normalized = cleanString(accountId).toLowerCase() || "__unknown_account__";
    return `trade-simulation:${normalized}`;
}

function getBasePriceForInstrument(instrument) {
    const value = cleanString(instrument).toUpperCase();

    if (value.startsWith("MES")) {
        return 5000;
    }

    if (value.startsWith("ES")) {
        return 5000;
    }

    if (value.startsWith("MNQ")) {
        return 20000;
    }

    if (value.startsWith("NQ")) {
        return 20000;
    }

    return 10000;
}

function normalizeSimulationTrade(trade) {
    return {
        id: cleanString(trade?.id) || createSimulationTradeId(),
        accountId: cleanString(trade?.accountId),
        instrument: cleanString(trade?.instrument) || "MNQ",
        side: cleanString(trade?.side) === "short" ? "short" : "long",
        qty: toSafeInteger(trade?.qty, 1),
        pnl: toNumber(trade?.pnl, 0),
        createdAt: cleanString(trade?.createdAt) || new Date().toISOString(),
    };
}

export function getSimulationUpdatedEventName() {
    return SIMULATION_UPDATED_EVENT;
}

export function getEmptyTradeSimulation() {
    return {
        trades: [],
        updatedAt: null,
    };
}

export function createSimulationTradeId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getTradeSimulationForAccount(accountId) {
    if (typeof window === "undefined") {
        return { ...EMPTY_SIMULATION };
    }

    try {
        const raw = window.localStorage.getItem(getSimulationStorageKey(accountId));

        if (!raw) {
            return { ...EMPTY_SIMULATION };
        }

        const parsed = JSON.parse(raw);

        return {
            trades: Array.isArray(parsed?.trades)
                ? parsed.trades.map(normalizeSimulationTrade)
                : [],
            updatedAt: cleanString(parsed?.updatedAt) || null,
        };
    } catch {
        return { ...EMPTY_SIMULATION };
    }
}

export function persistTradeSimulationForAccount(accountId, simulation) {
    if (typeof window === "undefined") {
        return { ...EMPTY_SIMULATION };
    }

    const normalized = {
        trades: Array.isArray(simulation?.trades)
            ? simulation.trades.map(normalizeSimulationTrade)
            : [],
        updatedAt: cleanString(simulation?.updatedAt) || new Date().toISOString(),
    };

    window.localStorage.setItem(
        getSimulationStorageKey(accountId),
        JSON.stringify(normalized)
    );

    emitSimulationUpdated();
    return normalized;
}

export function resetTradeSimulationForAccount(accountId) {
    if (typeof window === "undefined") {
        return { ...EMPTY_SIMULATION };
    }

    window.localStorage.removeItem(getSimulationStorageKey(accountId));
    emitSimulationUpdated();
    return { ...EMPTY_SIMULATION };
}

export function buildSimulationOrders(trades = []) {
    return trades.map((rawTrade, index) => {
        const trade = normalizeSimulationTrade(rawTrade);
        const entryPrice = getBasePriceForInstrument(trade.instrument);
        const qty = Math.max(toSafeInteger(trade.qty, 1), 1);

        const exitPrice =
            trade.side === "long"
                ? entryPrice + trade.pnl / qty
                : entryPrice - trade.pnl / qty;

        return {
            id: `sim-order-${trade.id}`,
            orderId: `SIM-${index + 1}-${trade.id.slice(0, 8)}`,
            source: "simulation",
            symbol: trade.instrument,
            side: trade.side === "long" ? "Buy" : "Sell",
            status: "Filled",
            executionStatus: "Filled",
            type: "Simulation",
            contracts: String(qty),
            contractsValue: qty,
            entry: String(entryPrice),
            stopLoss: "",
            takeProfit: "",
            realizedPnl: String(trade.pnl),
            createdAt: trade.createdAt,
            filledContracts: qty,
            remainingContracts: 0,
            fillCount: 2,
            fillAveragePrice: exitPrice,
            fillLastTime: trade.createdAt,
            totalCommission: 0,
            hasFillDetails: true,
            primaryTradeId: trade.id,
            tradeIds: [trade.id],
            entryTradeIds: [trade.id],
            exitTradeIds: [trade.id],
            tradeRole: "Simulation",
            tradeCount: 1,
        };
    });
}

export function buildSimulationJournalTrades(trades = []) {
    return trades.map((rawTrade, index) => {
        const trade = normalizeSimulationTrade(rawTrade);
        const qty = Math.max(toSafeInteger(trade.qty, 1), 1);
        const entryPrice = getBasePriceForInstrument(trade.instrument);

        const exitPrice =
            trade.side === "long"
                ? entryPrice + trade.pnl / qty
                : entryPrice - trade.pnl / qty;

        return {
            tradeId: trade.id,
            tradeOrdinal: index + 1,
            symbol: trade.instrument,
            side: trade.side,
            entryTime: trade.createdAt,
            exitTime: trade.createdAt,
            entryQty: qty,
            closedQty: qty,
            remainingQty: 0,
            avgEntryPrice: entryPrice,
            avgExitPrice: exitPrice,
            realizedPnlGross: trade.pnl,
            totalCommission: 0,
            realizedPnlNet: trade.pnl,
            scaleInCount: 1,
            scaleOutCount: 1,
            status: "closed",
            source: "simulation",
        };
    });
}

export function buildSimulationPositions(trades = []) {
    return trades.map((rawTrade) => {
        const trade = normalizeSimulationTrade(rawTrade);
        const qty = Math.max(toSafeInteger(trade.qty, 1), 1);
        const signedQuantity = trade.side === "short" ? -qty : qty;

        return {
            tradeId: trade.id,
            symbol: trade.instrument,
            side: trade.side,
            quantity: qty,
            signedQuantity,
            avgPrice: getBasePriceForInstrument(trade.instrument),
            openedAt: trade.createdAt,
            source: "simulation",
        };
    });
}