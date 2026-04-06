import {
    getRulesForAccount,
    resolveCurrentMaxContracts,
    resolveCurrentPaTier,
} from "./apexRules";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

function isCancelled(order) {
    return String(order?.status || "").toLowerCase() === "cancelled";
}

function isOpenOrder(order) {
    return String(order?.status || "").toLowerCase() === "open";
}

function getProductLabel(productType) {
    if (productType === "intraday") return "Intraday";
    return "EOD";
}

function getPhaseLabel(accountPhase) {
    if (accountPhase === "pa") return "PA";
    return "Eval";
}

function normalizeSide(value) {
    const side = String(value || "").toLowerCase();

    if (side === "sell" || side === "short") {
        return "short";
    }

    return "long";
}

function isPositiveNumber(value) {
    return toNumber(value) > 0;
}

function isValidStopForSide(order) {
    const entry = toNumber(order?.entry);
    const stopLoss = toNumber(order?.stopLoss);
    const side = normalizeSide(order?.side);

    if (!hasValue(order?.entry) || !hasValue(order?.stopLoss)) {
        return true;
    }

    if (side === "long") {
        return stopLoss < entry;
    }

    return stopLoss > entry;
}

function isValidTakeProfitForSide(order) {
    const entry = toNumber(order?.entry);
    const takeProfit = toNumber(order?.takeProfit);
    const side = normalizeSide(order?.side);

    if (!hasValue(order?.entry) || !hasValue(order?.takeProfit)) {
        return true;
    }

    if (side === "long") {
        return takeProfit > entry;
    }

    return takeProfit < entry;
}

function hasLogicalStopDistance(order) {
    const entry = toNumber(order?.entry);
    const stopLoss = toNumber(order?.stopLoss);

    if (!hasValue(order?.entry) || !hasValue(order?.stopLoss)) {
        return true;
    }

    return entry !== stopLoss;
}

function buildContextMessages(rules, paTier) {
    const messages = [];

    if (!rules) {
        return messages;
    }

    messages.push(
        `Aktives Regelset: ${getProductLabel(rules.productType)} ${getPhaseLabel(rules.accountPhase)}.`
    );

    if (rules.accountPhase === "pa" && paTier?.tierLabel) {
        messages.push(`Aktives PA Tier: ${paTier.tierLabel}.`);
    }

    if (rules.accountPhase === "eval") {
        messages.push("Eval Account. Contract Limit wird direkt aus dem Regelset gelesen.");
    }

    if (rules.accountPhase === "pa") {
        messages.push("PA Account. Contract Limit wird live aus Balance und Tier bestimmt.");
    }

    return messages;
}

export function getActiveContractsTotal(orders = []) {
    return orders.reduce((sum, order) => {
        if (isCancelled(order)) {
            return sum;
        }

        return sum + toNumber(order.contracts || 0);
    }, 0);
}

export function validateOrdersAgainstAccount(account, orders = []) {
    const rules = getRulesForAccount(account);

    if (!account || !rules) {
        return {
            status: "warning",
            maxContracts: null,
            totalContracts: getActiveContractsTotal(orders),
            paTier: null,
            messages: ["Keine gültigen Regeln für diesen Account gefunden."],
        };
    }

    const currentBalance = toNumber(account.currentBalance);
    const maxContracts = resolveCurrentMaxContracts(rules, currentBalance);
    const paTier = resolveCurrentPaTier(rules, currentBalance);
    const totalContracts = getActiveContractsTotal(orders);
    const activeOrders = orders.filter((order) => !isCancelled(order));

    const messages = buildContextMessages(rules, paTier);
    let status = "ok";

    if (activeOrders.length === 0) {
        messages.push("Keine aktiven Orders vorhanden.");
    }

    const invalidContractsCount = activeOrders.filter(
        (order) => !isPositiveNumber(order.contracts)
    ).length;

    if (invalidContractsCount > 0) {
        status = "breach";
        messages.push(
            `${invalidContractsCount} aktive Order${invalidContractsCount > 1 ? "s haben" : " hat"} ungültige Contracts.`
        );
    }

    const openOrders = activeOrders.filter((order) => isOpenOrder(order));

    const missingEntryCount = openOrders.filter((order) => !hasValue(order.entry)).length;
    const missingStopCount = openOrders.filter((order) => !hasValue(order.stopLoss)).length;
    const missingTakeProfitCount = openOrders.filter(
        (order) => !hasValue(order.takeProfit)
    ).length;

    if (missingEntryCount > 0) {
        status = "breach";
        messages.push(
            `${missingEntryCount} offene Order${missingEntryCount > 1 ? "s haben" : " hat"} keinen Entry.`
        );
    }

    if (missingStopCount > 0) {
        status = "breach";
        messages.push(
            `${missingStopCount} offene Order${missingStopCount > 1 ? "s haben" : " hat"} keinen Stop Loss.`
        );
    }

    if (missingTakeProfitCount > 0) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push(
            `${missingTakeProfitCount} offene Order${missingTakeProfitCount > 1 ? "s haben" : " hat"} keinen Take Profit.`
        );
    }

    const invalidStopLogicCount = openOrders.filter(
        (order) =>
            hasValue(order.entry) &&
            hasValue(order.stopLoss) &&
            !isValidStopForSide(order)
    ).length;

    if (invalidStopLogicCount > 0) {
        status = "breach";
        messages.push(
            `${invalidStopLogicCount} offene Order${invalidStopLogicCount > 1 ? "s haben" : " hat"} eine unlogische Entry Stop Kombination.`
        );
    }

    const equalStopEntryCount = openOrders.filter(
        (order) =>
            hasValue(order.entry) &&
            hasValue(order.stopLoss) &&
            !hasLogicalStopDistance(order)
    ).length;

    if (equalStopEntryCount > 0) {
        status = "breach";
        messages.push(
            `${equalStopEntryCount} offene Order${equalStopEntryCount > 1 ? "s haben" : " hat"} Stop Loss gleich Entry.`
        );
    }

    const invalidTakeProfitLogicCount = openOrders.filter(
        (order) =>
            hasValue(order.entry) &&
            hasValue(order.takeProfit) &&
            !isValidTakeProfitForSide(order)
    ).length;

    if (invalidTakeProfitLogicCount > 0) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push(
            `${invalidTakeProfitLogicCount} offene Order${invalidTakeProfitLogicCount > 1 ? "s haben" : " hat"} einen unlogischen Take Profit.`
        );
    }

    if (maxContracts === null) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push("Max Contracts konnten nicht aufgelöst werden.");
    } else if (totalContracts > maxContracts) {
        status = "breach";
        messages.push(
            `Max Contracts überschritten. Aktiv sind ${totalContracts}, erlaubt sind ${maxContracts}.`
        );
    } else if (totalContracts === maxContracts) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push(
            `Max Contracts erreicht. Aktiv sind ${totalContracts} von ${maxContracts}.`
        );
    } else if (totalContracts >= Math.max(maxContracts - 1, 1)) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push(
            `Nahe am Contract Limit. Aktiv sind ${totalContracts} von ${maxContracts}.`
        );
    }

    return {
        status,
        maxContracts,
        totalContracts,
        paTier,
        messages,
    };
}

export function validateSingleOrder(account, order, allOrders = []) {
    const rules = getRulesForAccount(account);

    if (!account || !rules || !order) {
        return {
            status: "warning",
            messages: ["Order oder Regelkontext fehlt."],
        };
    }

    if (isCancelled(order)) {
        return {
            status: "ok",
            messages: ["Order ist storniert und zählt nicht in die aktive Validierung."],
        };
    }

    const currentBalance = toNumber(account.currentBalance);
    const maxContracts = resolveCurrentMaxContracts(rules, currentBalance);
    const paTier = resolveCurrentPaTier(rules, currentBalance);

    const otherOrders = allOrders.filter((item) => item?.id !== order?.id);
    const ownContracts = toNumber(order.contracts || 0);
    const totalContractsWithOrder = getActiveContractsTotal(otherOrders) + ownContracts;

    const messages = buildContextMessages(rules, paTier);
    let status = "ok";

    if (ownContracts <= 0) {
        status = "breach";
        messages.push("Contracts müssen größer als 0 sein.");
    }

    if (isOpenOrder(order) && !hasValue(order.entry)) {
        status = "breach";
        messages.push("Entry fehlt für eine offene Order.");
    }

    if (isOpenOrder(order) && !hasValue(order.stopLoss)) {
        status = "breach";
        messages.push("Stop Loss fehlt für eine offene Order.");
    }

    if (isOpenOrder(order) && hasValue(order.entry) && hasValue(order.stopLoss)) {
        if (!hasLogicalStopDistance(order)) {
            status = "breach";
            messages.push("Stop Loss darf nicht gleich Entry sein.");
        } else if (!isValidStopForSide(order)) {
            status = "breach";
            messages.push("Stop Loss liegt auf der falschen Seite vom Entry.");
        }
    }

    if (isOpenOrder(order) && !hasValue(order.takeProfit)) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push("Take Profit ist nicht gesetzt.");
    }

    if (isOpenOrder(order) && hasValue(order.entry) && hasValue(order.takeProfit)) {
        if (!isValidTakeProfitForSide(order)) {
            if (status !== "breach") {
                status = "warning";
            }

            messages.push("Take Profit liegt auf der falschen Seite vom Entry.");
        }
    }

    if (maxContracts === null) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push("Max Contracts konnten für diese Order nicht aufgelöst werden.");
    } else if (totalContractsWithOrder > maxContracts) {
        status = "breach";
        messages.push(
            `Diese Order überschreitet das Contract Limit. Danach wären ${totalContractsWithOrder} aktiv, erlaubt sind ${maxContracts}.`
        );
    } else if (totalContractsWithOrder === maxContracts) {
        if (status !== "breach") {
            status = "warning";
        }

        messages.push(
            `Diese Order erreicht das Contract Limit. Danach wären ${totalContractsWithOrder} von ${maxContracts} aktiv.`
        );
    }

    return {
        status,
        maxContracts,
        paTier,
        totalContractsWithOrder,
        messages,
    };
}