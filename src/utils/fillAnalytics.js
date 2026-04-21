const EPSILON = 0.0000001;

const CONTRACT_POINT_VALUES = Object.freeze({
    MNQ: 2,
    NQ: 20,
    MES: 5,
    ES: 50,
});

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function normalizeLookupKey(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSymbolLookup(value) {
    return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getContractRoot(symbol) {
    const normalizedSymbol = normalizeSymbolLookup(symbol);

    if (!normalizedSymbol) {
        return "";
    }

    const roots = Object.keys(CONTRACT_POINT_VALUES).sort(
        (left, right) => right.length - left.length
    );

    for (const root of roots) {
        if (normalizedSymbol.startsWith(root)) {
            return root;
        }
    }

    return "";
}

function getContractPointValue(symbol) {
    const root = getContractRoot(symbol);
    return CONTRACT_POINT_VALUES[root] || 1;
}

function buildFlexibleSource(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = normalizeLookupKey(key);

        if (!normalizedKey) {
            return;
        }

        if (map[normalizedKey] === undefined) {
            map[normalizedKey] = source[key];
        }
    });

    return map;
}

function pickFirst(source, keys) {
    for (const key of keys) {
        const normalizedKey = normalizeLookupKey(key);

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

function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    let raw = String(value).trim();

    if (!raw) {
        return fallback;
    }

    raw = raw
        .replace(/\s+/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    const negativeByParens = raw.startsWith("(") && raw.endsWith(")");
    raw = raw.replace(/[()]/g, "");

    if (!raw) {
        return fallback;
    }

    const hasComma = raw.includes(",");
    const hasDot = raw.includes(".");

    let normalized = raw;

    if (hasComma && hasDot) {
        if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
            normalized = raw.replace(/\./g, "").replace(/,/g, ".");
        } else {
            normalized = raw.replace(/,/g, "");
        }
    } else if (hasComma && !hasDot) {
        const lastPart = raw.split(",").pop() || "";

        if (lastPart.length === 1 || lastPart.length === 2) {
            normalized = raw.replace(/,/g, ".");
        } else {
            normalized = raw.replace(/,/g, "");
        }
    }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return negativeByParens ? -Math.abs(parsed) : parsed;
}

function roundTo(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toTimestamp(value) {
    if (!value) {
        return {
            iso: "",
            ms: 0,
        };
    }

    if (value instanceof Date) {
        const ms = value.getTime();
        return {
            iso: Number.isFinite(ms) ? value.toISOString() : "",
            ms: Number.isFinite(ms) ? ms : 0,
        };
    }

    if (typeof value === "number") {
        const date = new Date(value);
        const ms = date.getTime();
        return {
            iso: Number.isFinite(ms) ? date.toISOString() : "",
            ms: Number.isFinite(ms) ? ms : 0,
        };
    }

    const raw = cleanString(value);

    if (!raw) {
        return {
            iso: "",
            ms: 0,
        };
    }

    const direct = new Date(raw);

    if (Number.isFinite(direct.getTime())) {
        return {
            iso: direct.toISOString(),
            ms: direct.getTime(),
        };
    }

    const replaced = raw.replace(" ", "T");
    const fallbackDate = new Date(replaced);

    if (Number.isFinite(fallbackDate.getTime())) {
        return {
            iso: fallbackDate.toISOString(),
            ms: fallbackDate.getTime(),
        };
    }

    return {
        iso: raw,
        ms: 0,
    };
}

function normalizeSide(rawSide, rawQuantity = 0) {
    const sideText = cleanString(rawSide).toLowerCase();
    const compactSide = sideText.replace(/[^a-z0-9+-]/g, "");
    const numericSide = parseNumber(rawSide, NaN);

    if (
        compactSide === "buy" ||
        compactSide === "b" ||
        compactSide === "long" ||
        compactSide === "bot" ||
        compactSide === "bought" ||
        compactSide === "openbuy" ||
        compactSide === "+1"
    ) {
        return "buy";
    }

    if (
        compactSide === "sell" ||
        compactSide === "s" ||
        compactSide === "short" ||
        compactSide === "sl" ||
        compactSide === "sold" ||
        compactSide === "sld" ||
        compactSide === "sellshort" ||
        compactSide === "shortsell" ||
        compactSide === "opensell" ||
        compactSide === "-1"
    ) {
        return "sell";
    }

    if (Number.isFinite(numericSide)) {
        if (numericSide === 0) {
            return "buy";
        }

        if (numericSide === 1) {
            return "sell";
        }

        return numericSide < 0 ? "sell" : "buy";
    }

    return rawQuantity < 0 ? "sell" : "buy";
}

function sanitizeIdPart(value, fallback = "x") {
    const cleaned = cleanString(value)
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    return cleaned || fallback;
}

function addUnique(array, value) {
    const normalized = cleanString(value);

    if (!normalized) {
        return;
    }

    if (!array.includes(normalized)) {
        array.push(normalized);
    }
}

function allocateCommission(totalCommission, partialQty, fullQty) {
    if (fullQty <= 0) {
        return 0;
    }

    return totalCommission * (partialQty / fullQty);
}

function getSignedQuantity(side, quantity) {
    return side === "buy" ? quantity : -quantity;
}

function getDirectionFromSignedQty(signedQty) {
    if (signedQty > 0) {
        return "long";
    }

    if (signedQty < 0) {
        return "short";
    }

    return "flat";
}

function getPriceAverageFromLots(lots) {
    const openLots = lots.filter((lot) => lot.remainingQty > EPSILON);

    const totalQty = openLots.reduce((sum, lot) => sum + lot.remainingQty, 0);

    if (totalQty <= EPSILON) {
        return 0;
    }

    const totalNotional = openLots.reduce(
        (sum, lot) => sum + lot.remainingQty * lot.price,
        0
    );

    return totalNotional / totalQty;
}

function createTradeId(accountId, symbol, ordinal, timestampIso, side) {
    const accountPart = sanitizeIdPart(accountId || "account", "account");
    const symbolPart = sanitizeIdPart(symbol || "symbol", "symbol");
    const timePart = sanitizeIdPart(
        (timestampIso || "").slice(0, 19).replace(/[^\d]/g, ""),
        "time"
    );
    const sidePart = side === "long" ? "L" : "S";
    const ordinalPart = String(ordinal).padStart(4, "0");

    return `${accountPart}_${symbolPart}_${timePart}_${sidePart}_${ordinalPart}`;
}

function createEmptyAnalytics() {
    return {
        normalizedFills: [],
        fillsByOrderId: {},
        closedTrades: [],
        openTrades: [],
        positions: [],
        summary: {
            fillCount: 0,
            filledContracts: 0,
            closedTradeCount: 0,
            openTradeCount: 0,
            openPositionCount: 0,
            grossPnl: 0,
            netPnl: 0,
            commissions: 0,
        },
    };
}

function normalizeFill(fill, index, fallbackAccountId = "") {
    const source = buildFlexibleSource(fill);

    const rawQuantity = parseNumber(
        pickFirst(source, [
            "signedQuantity",
            "signedQty",
            "quantity",
            "qty",
            "fillQty",
            "filledQty",
            "filledQuantity",
            "contracts",
            "size",
            "shares",
        ]),
        0
    );

    const rawSideValue = pickFirst(source, [
        "side",
        "buySell",
        "buy/sell",
        "buy_sell",
        "b/s",
        "bs",
        "tradeSide",
        "sideLabel",
        "sideCode",
        "positionSide",
        "direction",
        "action",
    ]);

    const side = normalizeSide(rawSideValue, rawQuantity);
    const quantity = Math.abs(rawQuantity);

    const symbol = cleanString(
        pickFirst(source, [
            "symbol",
            "contract",
            "instrument",
            "market",
            "product",
            "contractName",
            "instrumentName",
        ])
    ).toUpperCase();

    const price = parseNumber(
        pickFirst(source, [
            "price",
            "fillPrice",
            "avgPrice",
            "averagePrice",
            "fill price",
            "average fill price",
        ]),
        0
    );

    const commission = Math.abs(
        parseNumber(
            pickFirst(source, [
                "commission",
                "commissions",
                "fee",
                "fees",
                "commissionAmount",
                "totalCommission",
            ]),
            0
        )
    );

    const timestampRaw = pickFirst(source, [
        "timestamp",
        "dateTime",
        "datetime",
        "time",
        "fillTime",
        "filledTime",
        "executionTime",
        "createdAt",
        "updatedAt",
        "date",
        "tradeDate",
        "filledAt",
    ]);

    const timestamp = toTimestamp(timestampRaw);

    const accountId =
        cleanString(
            pickFirst(source, [
                "accountId",
                "account",
                "accountName",
                "accountNumber",
                "accountNo",
            ])
        ) || cleanString(fallbackAccountId);

    const orderId = cleanString(
        pickFirst(source, [
            "orderId",
            "order_id",
            "clOrderId",
            "clientOrderId",
            "orderNumber",
            "orderNo",
        ])
    );

    const fillId =
        cleanString(
            pickFirst(source, [
                "fillId",
                "id",
                "executionId",
                "execId",
                "tradeId",
                "fillNumber",
            ])
        ) ||
        `fill_${sanitizeIdPart(accountId || "account")}_${sanitizeIdPart(symbol || "symbol")}_${index}`;

    const contractRoot = getContractRoot(symbol);
    const pointValue = getContractPointValue(symbol);

    return {
        raw: fill,
        sourceIndex: index,
        accountId,
        symbol,
        contractRoot,
        pointValue,
        side,
        quantity,
        signedQuantity: getSignedQuantity(side, quantity),
        price,
        commission,
        orderId,
        fillId,
        timestampIso: timestamp.iso,
        timestampMs: timestamp.ms,
    };
}

function buildFillsByOrderId(fills) {
    const map = {};

    fills.forEach((fill) => {
        const orderId = cleanString(fill.orderId);

        if (!orderId) {
            return;
        }

        if (!map[orderId]) {
            map[orderId] = [];
        }

        map[orderId].push(fill);
    });

    Object.keys(map).forEach((orderId) => {
        map[orderId].sort((a, b) => {
            if (a.timestampMs !== b.timestampMs) {
                return a.timestampMs - b.timestampMs;
            }

            return a.sourceIndex - b.sourceIndex;
        });
    });

    return map;
}

function createSymbolState(symbol, pointValue = 1, contractRoot = "") {
    return {
        symbol,
        pointValue,
        contractRoot,
        netQty: 0,
        lots: [],
        activeTrade: null,
    };
}

function createActiveTrade({
    accountId,
    symbol,
    side,
    ordinal,
    entryTime,
    pointValue,
    contractRoot,
}) {
    return {
        tradeId: createTradeId(accountId, symbol, ordinal, entryTime, side),
        tradeOrdinal: ordinal,
        accountId,
        symbol,
        contractRoot,
        pointValue,
        side,
        status: "open",
        entryTime,
        exitTime: "",
        entryQty: 0,
        closedQty: 0,
        remainingQty: 0,
        entryNotional: 0,
        exitNotional: 0,
        realizedPnlGross: 0,
        entryCommission: 0,
        exitCommission: 0,
        totalCommission: 0,
        realizedPnlNet: 0,
        avgEntryPrice: 0,
        avgExitPrice: 0,
        maxOpenQty: 0,
        scaleInCount: 0,
        scaleOutCount: 0,
        fillIds: [],
        orderIds: [],
        entryFillIds: [],
        exitFillIds: [],
    };
}

function appendEntryToTradeState(state, fill, entryQty) {
    if (!state.activeTrade || entryQty <= EPSILON) {
        return;
    }

    const trade = state.activeTrade;
    const entryCommission = allocateCommission(fill.commission, entryQty, fill.quantity);
    const commissionPerUnit = entryQty > EPSILON ? entryCommission / entryQty : 0;
    const hadEntryFillBefore = trade.entryFillIds.length > 0;

    state.lots.push({
        remainingQty: entryQty,
        price: fill.price,
        fillId: fill.fillId,
        orderId: fill.orderId,
        openedAt: fill.timestampIso,
        openedAtMs: fill.timestampMs,
        commissionPerUnit,
        pointValue: fill.pointValue,
    });

    state.netQty += getSignedQuantity(fill.side, entryQty);

    trade.entryQty += entryQty;
    trade.remainingQty += entryQty;
    trade.entryNotional += entryQty * fill.price;
    trade.avgEntryPrice = trade.entryQty > EPSILON ? trade.entryNotional / trade.entryQty : 0;
    trade.maxOpenQty = Math.max(trade.maxOpenQty, Math.abs(state.netQty));

    addUnique(trade.fillIds, fill.fillId);
    addUnique(trade.orderIds, fill.orderId);
    addUnique(trade.entryFillIds, fill.fillId);

    if (hadEntryFillBefore) {
        trade.scaleInCount += 1;
    }
}

function openNewTrade(state, fill, entryQty, context) {
    if (entryQty <= EPSILON) {
        return;
    }

    context.tradeOrdinal += 1;

    state.activeTrade = createActiveTrade({
        accountId: fill.accountId || context.accountId,
        symbol: fill.symbol,
        contractRoot: fill.contractRoot,
        pointValue: fill.pointValue,
        side: fill.side === "buy" ? "long" : "short",
        ordinal: context.tradeOrdinal,
        entryTime: fill.timestampIso,
    });

    appendEntryToTradeState(state, fill, entryQty);
}

function closeAgainstLots(state, fill, closeQty, closedTrades) {
    if (!state.activeTrade || closeQty <= EPSILON) {
        return;
    }

    const trade = state.activeTrade;
    const exitCommission = allocateCommission(fill.commission, closeQty, fill.quantity);
    const exitCommissionPerUnit = closeQty > EPSILON ? exitCommission / closeQty : 0;
    const hadExitFillBefore = trade.exitFillIds.length > 0;

    let remainingToClose = closeQty;
    const wasLong = state.netQty > 0;
    const pointValue = trade.pointValue || fill.pointValue || getContractPointValue(fill.symbol);

    while (remainingToClose > EPSILON && state.lots.length > 0) {
        const lot = state.lots[0];
        const matchedQty = Math.min(lot.remainingQty, remainingToClose);
        const priceDelta = wasLong
            ? fill.price - lot.price
            : lot.price - fill.price;

        const grossPnl = priceDelta * matchedQty * pointValue;

        trade.realizedPnlGross += grossPnl;
        trade.entryCommission += lot.commissionPerUnit * matchedQty;
        trade.exitCommission += exitCommissionPerUnit * matchedQty;
        trade.closedQty += matchedQty;
        trade.remainingQty -= matchedQty;
        trade.exitNotional += matchedQty * fill.price;
        trade.exitTime = fill.timestampIso;

        addUnique(trade.fillIds, fill.fillId);
        addUnique(trade.orderIds, fill.orderId);
        addUnique(trade.exitFillIds, fill.fillId);

        lot.remainingQty -= matchedQty;
        remainingToClose -= matchedQty;

        if (lot.remainingQty <= EPSILON) {
            state.lots.shift();
        }
    }

    state.netQty += getSignedQuantity(fill.side, closeQty);

    if (hadExitFillBefore) {
        trade.scaleOutCount += 1;
    }

    if (Math.abs(state.netQty) <= EPSILON) {
        state.netQty = 0;
        finalizeTrade(state, closedTrades);
    }
}

function finalizeTrade(state, closedTrades) {
    const trade = state.activeTrade;

    if (!trade) {
        return;
    }

    trade.status = "closed";
    trade.totalCommission = trade.entryCommission + trade.exitCommission;
    trade.realizedPnlNet = trade.realizedPnlGross - trade.totalCommission;
    trade.avgEntryPrice = trade.entryQty > EPSILON ? trade.entryNotional / trade.entryQty : 0;
    trade.avgExitPrice = trade.closedQty > EPSILON ? trade.exitNotional / trade.closedQty : 0;

    closedTrades.push({
        ...trade,
        entryQty: roundTo(trade.entryQty, 4),
        closedQty: roundTo(trade.closedQty, 4),
        remainingQty: roundTo(trade.remainingQty, 4),
        entryNotional: roundTo(trade.entryNotional, 4),
        exitNotional: roundTo(trade.exitNotional, 4),
        realizedPnlGross: roundTo(trade.realizedPnlGross, 2),
        entryCommission: roundTo(trade.entryCommission, 2),
        exitCommission: roundTo(trade.exitCommission, 2),
        totalCommission: roundTo(trade.totalCommission, 2),
        realizedPnlNet: roundTo(trade.realizedPnlNet, 2),
        avgEntryPrice: roundTo(trade.avgEntryPrice, 4),
        avgExitPrice: roundTo(trade.avgExitPrice, 4),
        maxOpenQty: roundTo(trade.maxOpenQty, 4),
    });

    state.activeTrade = null;
}

function createOpenTradeSnapshot(state) {
    const trade = state.activeTrade;

    if (!trade) {
        return null;
    }

    const totalEntryCommissionOnOpenLots = state.lots.reduce(
        (sum, lot) => sum + lot.remainingQty * lot.commissionPerUnit,
        0
    );

    return {
        ...trade,
        status: "open",
        remainingQty: roundTo(Math.abs(state.netQty), 4),
        avgEntryPrice: roundTo(getPriceAverageFromLots(state.lots), 4),
        entryQty: roundTo(trade.entryQty, 4),
        closedQty: roundTo(trade.closedQty, 4),
        entryNotional: roundTo(trade.entryNotional, 4),
        exitNotional: roundTo(trade.exitNotional, 4),
        realizedPnlGross: roundTo(trade.realizedPnlGross, 2),
        entryCommission: roundTo(trade.entryCommission, 2),
        exitCommission: roundTo(trade.exitCommission, 2),
        openLotCommission: roundTo(totalEntryCommissionOnOpenLots, 2),
        totalCommission: roundTo(trade.entryCommission + trade.exitCommission, 2),
        realizedPnlNet: roundTo(
            trade.realizedPnlGross - trade.entryCommission - trade.exitCommission,
            2
        ),
        maxOpenQty: roundTo(trade.maxOpenQty, 4),
    };
}

function createPositionSnapshot(state) {
    if (Math.abs(state.netQty) <= EPSILON) {
        return null;
    }

    const activeTrade = state.activeTrade;
    const openQty = Math.abs(state.netQty);
    const avgPrice = getPriceAverageFromLots(state.lots);
    const firstOpenLot = state.lots[0] || null;

    return {
        symbol: state.symbol,
        contractRoot: state.contractRoot,
        pointValue: state.pointValue,
        side: getDirectionFromSignedQty(state.netQty),
        quantity: roundTo(openQty, 4),
        signedQuantity: roundTo(state.netQty, 4),
        avgPrice: roundTo(avgPrice, 4),
        openedAt: firstOpenLot?.openedAt || activeTrade?.entryTime || "",
        tradeId: activeTrade?.tradeId || "",
        fillIds: activeTrade?.fillIds || [],
        orderIds: activeTrade?.orderIds || [],
    };
}

export function buildFillAnalytics({ fills = [], accountId = "" } = {}) {
    if (!Array.isArray(fills) || fills.length === 0) {
        return createEmptyAnalytics();
    }

    const normalizedFills = fills
        .map((fill, index) => normalizeFill(fill, index, accountId))
        .filter((fill) => fill.symbol && fill.quantity > EPSILON)
        .sort((a, b) => {
            if (a.timestampMs !== b.timestampMs) {
                return a.timestampMs - b.timestampMs;
            }

            if (a.sourceIndex !== b.sourceIndex) {
                return a.sourceIndex - b.sourceIndex;
            }

            return a.fillId.localeCompare(b.fillId);
        });

    const fillsByOrderId = buildFillsByOrderId(normalizedFills);
    const stateBySymbol = new Map();
    const closedTrades = [];
    const context = {
        accountId,
        tradeOrdinal: 0,
    };

    normalizedFills.forEach((fill) => {
        const symbol = fill.symbol;
        const state =
            stateBySymbol.get(symbol) ||
            createSymbolState(symbol, fill.pointValue, fill.contractRoot);

        if (!stateBySymbol.has(symbol)) {
            stateBySymbol.set(symbol, state);
        }

        if (Math.abs(state.netQty) <= EPSILON) {
            state.netQty = 0;
            openNewTrade(state, fill, fill.quantity, context);
            return;
        }

        const fillSignedQty = getSignedQuantity(fill.side, fill.quantity);
        const sameDirection = Math.sign(state.netQty) === Math.sign(fillSignedQty);

        if (sameDirection) {
            appendEntryToTradeState(state, fill, fill.quantity);
            return;
        }

        const closeQty = Math.min(Math.abs(state.netQty), fill.quantity);
        closeAgainstLots(state, fill, closeQty, closedTrades);

        const residualQty = fill.quantity - closeQty;

        if (residualQty > EPSILON) {
            openNewTrade(state, fill, residualQty, context);
        }
    });

    const openTrades = [];
    const positions = [];

    stateBySymbol.forEach((state) => {
        const openTrade = createOpenTradeSnapshot(state);

        if (openTrade) {
            openTrades.push(openTrade);
        }

        const position = createPositionSnapshot(state);

        if (position) {
            positions.push(position);
        }
    });

    const grossPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPnlGross, 0);
    const netPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPnlNet, 0);
    const commissions = closedTrades.reduce((sum, trade) => sum + trade.totalCommission, 0);
    const filledContracts = normalizedFills.reduce((sum, fill) => sum + fill.quantity, 0);

    return {
        normalizedFills,
        fillsByOrderId,
        closedTrades,
        openTrades,
        positions,
        summary: {
            fillCount: normalizedFills.length,
            filledContracts: roundTo(filledContracts, 4),
            closedTradeCount: closedTrades.length,
            openTradeCount: openTrades.length,
            openPositionCount: positions.length,
            grossPnl: roundTo(grossPnl, 2),
            netPnl: roundTo(netPnl, 2),
            commissions: roundTo(commissions, 2),
        },
    };
}

export function buildFillsByOrderMap(fills = []) {
    const normalizedFills = Array.isArray(fills)
        ? fills.map((fill, index) => normalizeFill(fill, index))
        : [];

    return buildFillsByOrderId(normalizedFills);
}

export function buildClosedTradesFromFills({ fills = [], accountId = "" } = {}) {
    return buildFillAnalytics({ fills, accountId }).closedTrades;
}

export function buildOpenPositionsFromFills({ fills = [], accountId = "" } = {}) {
    return buildFillAnalytics({ fills, accountId }).positions;
}

export function buildOpenTradesFromFills({ fills = [], accountId = "" } = {}) {
    return buildFillAnalytics({ fills, accountId }).openTrades;
}