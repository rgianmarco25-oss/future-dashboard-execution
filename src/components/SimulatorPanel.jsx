import { useEffect, useMemo, useState } from "react";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    getRiskStatusForAccount,
    saveRiskStatusForAccount,
} from "../utils/accountRiskStatus";
import {
    addAccount,
    deleteAccount,
    getAccountGroups,
    getAccounts,
    getLiveAccountSnapshot,
    saveLiveAccountSnapshot,
    saveOrders,
    setActiveAccountId,
    syncImportedCashHistory,
    syncImportedFills,
    syncImportedOrders,
    updateAccount,
} from "../utils/storage";

const COLORS = {
    panelBg: "#050816",
    cardBg: "rgba(255, 255, 255, 0.04)",
    cardBgStrong: "rgba(255, 255, 255, 0.06)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    ok: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
    cyan: "#22d3ee",
    violet: "#a78bfa",
};

const TEST_GROUP_ID = "sim-apex-4slot-25k";
const TEST_ACCOUNT_IDS = [
    "sim-eval-eod-25k",
    "sim-pa-eod-25k",
    "sim-eval-intraday-25k",
    "sim-pa-intraday-25k",
];

const TEST_SCENARIOS = [
    {
        id: "sim-eval-eod-25k",
        label: "EVAL EOD",
        accountPhase: "eval",
        productType: "eod",
        tradingAccountId: "APEXSIMEOD25000EVAL01",
        tradingAccountName: "APEXSIMEOD25000EVAL01",
        accountSize: 25000,
        startingBalance: 25000,
        drawdownLimit: 24000,
        maxDailyLoss: 500,
        orderStatusLabel: "Aktiv",
        trades: [
            {
                tradeId: "EEOD-T1",
                symbol: "MNQM6",
                side: "long",
                qty: 2,
                entryPrice: 18000,
                exitPrice: 17980,
                entryAt: "2026-04-10T15:30:00",
                exitAt: "2026-04-10T15:42:00",
            },
            {
                tradeId: "EEOD-T2",
                symbol: "MNQM6",
                side: "short",
                qty: 1,
                entryPrice: 18010,
                exitPrice: 18040,
                entryAt: "2026-04-11T15:35:00",
                exitAt: "2026-04-11T15:48:00",
            },
        ],
    },
    {
        id: "sim-pa-eod-25k",
        label: "PA EOD",
        accountPhase: "pa",
        productType: "eod",
        tradingAccountId: "PAAPEXSIMEOD25000PA01",
        tradingAccountName: "PAAPEXSIMEOD25000PA01",
        accountSize: 25000,
        startingBalance: 25000,
        drawdownLimit: 24000,
        maxDailyLoss: 500,
        orderStatusLabel: "Aktiv",
        trades: [
            {
                tradeId: "PEOD-T1",
                symbol: "MNQM6",
                side: "long",
                qty: 2,
                entryPrice: 18000,
                exitPrice: 18025,
                entryAt: "2026-04-10T15:30:00",
                exitAt: "2026-04-10T15:40:00",
            },
            {
                tradeId: "PEOD-T2",
                symbol: "MNQM6",
                side: "short",
                qty: 2,
                entryPrice: 18050,
                exitPrice: 18025,
                entryAt: "2026-04-11T15:33:00",
                exitAt: "2026-04-11T15:47:00",
            },
        ],
    },
    {
        id: "sim-eval-intraday-25k",
        label: "EVAL Intraday",
        accountPhase: "eval",
        productType: "intraday",
        tradingAccountId: "APEXSIMINTRA25000EVAL01",
        tradingAccountName: "APEXSIMINTRA25000EVAL01",
        accountSize: 25000,
        startingBalance: 25000,
        drawdownLimit: 24000,
        maxDailyLoss: 500,
        orderStatusLabel: "Aktiv",
        trades: [
            {
                tradeId: "EINTRA-T1",
                symbol: "MNQM6",
                side: "long",
                qty: 1,
                entryPrice: 18100,
                exitPrice: 18120,
                entryAt: "2026-04-10T09:35:00",
                exitAt: "2026-04-10T09:47:00",
            },
            {
                tradeId: "EINTRA-T2",
                symbol: "MNQM6",
                side: "long",
                qty: 2,
                entryPrice: 18110,
                exitPrice: 18130,
                entryAt: "2026-04-11T10:10:00",
                exitAt: "2026-04-11T10:26:00",
            },
        ],
    },
    {
        id: "sim-pa-intraday-25k",
        label: "PA Intraday",
        accountPhase: "pa",
        productType: "intraday",
        tradingAccountId: "PAAPEXSIMINTRA25000PA01",
        tradingAccountName: "PAAPEXSIMINTRA25000PA01",
        accountSize: 25000,
        startingBalance: 25000,
        drawdownLimit: 24000,
        maxDailyLoss: 500,
        orderStatusLabel: "Aktiv",
        trades: [
            {
                tradeId: "PINTRA-T1",
                symbol: "MNQM6",
                side: "short",
                qty: 1,
                entryPrice: 18140,
                exitPrice: 18150,
                entryAt: "2026-04-10T09:42:00",
                exitAt: "2026-04-10T09:55:00",
            },
            {
                tradeId: "PINTRA-T2",
                symbol: "MNQM6",
                side: "long",
                qty: 2,
                entryPrice: 18120,
                exitPrice: 18115,
                entryAt: "2026-04-11T10:05:00",
                exitAt: "2026-04-11T10:18:00",
            },
        ],
    },
];

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateTime(value) {
    if (!value) {
        return "Kein Zeitstempel";
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

function formatMoney(value) {
    const safeValue = toNumber(value, 0);

    return `${safeValue.toLocaleString("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function formatCompactNumber(value, digits = 0) {
    return toNumber(value, 0).toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function getStatusColors(status) {
    if (status === "ok") {
        return {
            bg: "rgba(34, 197, 94, 0.12)",
            border: "rgba(34, 197, 94, 0.35)",
            text: COLORS.ok,
        };
    }

    if (status === "warn") {
        return {
            bg: "rgba(245, 158, 11, 0.12)",
            border: "rgba(245, 158, 11, 0.35)",
            text: COLORS.warn,
        };
    }

    return {
        bg: "rgba(239, 68, 68, 0.12)",
        border: "rgba(239, 68, 68, 0.35)",
        text: COLORS.danger,
    };
}

function normalizeRiskState(raw) {
    const value = String(
        raw?.state || raw?.status || raw?.level || raw?.color || "neutral"
    ).toLowerCase();

    if (value.includes("green") || value === "grün" || value === "ok") {
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

function getRiskTone(state) {
    if (state === "green") {
        return {
            label: "Grün",
            status: "ok",
        };
    }

    if (state === "yellow") {
        return {
            label: "Gelb",
            status: "warn",
        };
    }

    if (state === "red") {
        return {
            label: "Rot",
            status: "danger",
        };
    }

    return {
        label: "Neutral",
        status: "warn",
    };
}

function escapeCsvValue(value) {
    const text = String(value ?? "");

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n") ||
        text.includes("\r")
    ) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

function buildCsvText(headers, rows) {
    const headerLine = headers.map(escapeCsvValue).join(",");
    const lines = rows.map((row) =>
        headers.map((header) => escapeCsvValue(row[header] ?? "")).join(",")
    );

    return [headerLine, ...lines].join("\n");
}

function getPointValue(symbol) {
    const safeSymbol = cleanString(symbol).toUpperCase();

    if (safeSymbol.startsWith("MNQ")) {
        return 2;
    }

    if (safeSymbol.startsWith("MES")) {
        return 5;
    }

    if (safeSymbol.startsWith("NQ")) {
        return 20;
    }

    if (safeSymbol.startsWith("ES")) {
        return 50;
    }

    return 2;
}

function calculateGrossPnl(trade) {
    const qty = toNumber(trade.qty, 0);
    const pointValue = getPointValue(trade.symbol);
    const entryPrice = toNumber(trade.entryPrice, 0);
    const exitPrice = toNumber(trade.exitPrice, 0);

    if (cleanString(trade.side).toLowerCase() === "short") {
        return (entryPrice - exitPrice) * pointValue * qty;
    }

    return (exitPrice - entryPrice) * pointValue * qty;
}

function buildTradeSummaries(scenario) {
    return scenario.trades.map((trade, index) => {
        const grossPnl = calculateGrossPnl(trade);
        const commissionPerFill = 1;
        const totalCommission = commissionPerFill * 2;
        const netPnl = grossPnl - totalCommission;

        return {
            ...trade,
            index,
            grossPnl,
            netPnl,
            totalCommission,
            entryOrderId: `${scenario.id}-ENTRY-${index + 1}`,
            exitOrderId: `${scenario.id}-EXIT-${index + 1}`,
            entryFillId: `${scenario.id}-ENTRYFILL-${index + 1}`,
            exitFillId: `${scenario.id}-EXITFILL-${index + 1}`,
        };
    });
}

function buildOrdersCsvText(scenario) {
    const tradeSummaries = buildTradeSummaries(scenario);

    const rows = tradeSummaries.flatMap((trade) => {
        const common = {
            Contract: trade.symbol,
            Quantity: trade.qty,
            "Filled Qty": trade.qty,
            "Avg Fill Price": trade.entryPrice,
            "Account ID": scenario.tradingAccountId,
            "Account Name": scenario.tradingAccountName,
            Type: "Market",
        };

        return [
            {
                "Order ID": trade.entryOrderId,
                Status: "Filled",
                Timestamp: trade.entryAt,
                "B/S": cleanString(trade.side).toLowerCase() === "short" ? "Sell" : "Buy",
                ...common,
            },
            {
                "Order ID": trade.exitOrderId,
                Status: "Filled",
                Timestamp: trade.exitAt,
                "B/S": cleanString(trade.side).toLowerCase() === "short" ? "Buy" : "Sell",
                ...common,
                "Avg Fill Price": trade.exitPrice,
            },
        ];
    });

    rows.push({
        "Order ID": `${scenario.id}-WORKING-1`,
        Contract: "MNQM6",
        Quantity: 1,
        "Filled Qty": 0,
        "Avg Fill Price": "",
        "Account ID": scenario.tradingAccountId,
        "Account Name": scenario.tradingAccountName,
        Type: "Limit",
        Status: "Working",
        Timestamp: "2026-04-11T14:20:00",
        "B/S": "Buy",
    });

    rows.push({
        "Order ID": `${scenario.id}-CANCELED-1`,
        Contract: "MNQM6",
        Quantity: 1,
        "Filled Qty": 0,
        "Avg Fill Price": "",
        "Account ID": scenario.tradingAccountId,
        "Account Name": scenario.tradingAccountName,
        Type: "Limit",
        Status: "Canceled",
        Timestamp: "2026-04-11T14:25:00",
        "B/S": "Sell",
    });

    return buildCsvText(
        [
            "Order ID",
            "Contract",
            "Quantity",
            "Filled Qty",
            "Avg Fill Price",
            "Account ID",
            "Account Name",
            "Type",
            "Status",
            "Timestamp",
            "B/S",
        ],
        rows
    );
}

function buildFillsCsvText(scenario) {
    const tradeSummaries = buildTradeSummaries(scenario);

    const rows = tradeSummaries.flatMap((trade) => {
        const entrySide =
            cleanString(trade.side).toLowerCase() === "short" ? "Sell" : "Buy";
        const exitSide =
            cleanString(trade.side).toLowerCase() === "short" ? "Buy" : "Sell";

        return [
            {
                "Fill ID": trade.entryFillId,
                "Order ID": trade.entryOrderId,
                Contract: trade.symbol,
                "B/S": entrySide,
                Quantity: trade.qty,
                Price: trade.entryPrice,
                commission: 1,
                Timestamp: trade.entryAt,
                "Account ID": scenario.tradingAccountId,
                "Account Name": scenario.tradingAccountName,
            },
            {
                "Fill ID": trade.exitFillId,
                "Order ID": trade.exitOrderId,
                Contract: trade.symbol,
                "B/S": exitSide,
                Quantity: trade.qty,
                Price: trade.exitPrice,
                commission: 1,
                Timestamp: trade.exitAt,
                "Account ID": scenario.tradingAccountId,
                "Account Name": scenario.tradingAccountName,
            },
        ];
    });

    return buildCsvText(
        [
            "Fill ID",
            "Order ID",
            "Contract",
            "B/S",
            "Quantity",
            "Price",
            "commission",
            "Timestamp",
            "Account ID",
            "Account Name",
        ],
        rows
    );
}

function buildCashHistoryCsvText(scenario) {
    const tradeSummaries = buildTradeSummaries(scenario);
    let runningBalance = scenario.startingBalance;

    const rows = tradeSummaries.map((trade, index) => {
        runningBalance += trade.grossPnl;

        return {
            "Trade Date": trade.exitAt,
            "Transaction Type": "Trade",
            Description: `Sim Trade ${index + 1}`,
            Amount: trade.grossPnl.toFixed(2),
            "Total Amount": runningBalance.toFixed(2),
            "Starting Balance":
                index === 0
                    ? scenario.startingBalance.toFixed(2)
                    : "",
            "Account Size":
                index === 0
                    ? scenario.accountSize.toFixed(2)
                    : "",
            "Account ID": scenario.tradingAccountId,
            "Account Name": scenario.tradingAccountName,
        };
    });

    return buildCsvText(
        [
            "Trade Date",
            "Transaction Type",
            "Description",
            "Amount",
            "Total Amount",
            "Starting Balance",
            "Account Size",
            "Account ID",
            "Account Name",
        ],
        rows
    );
}

function buildPerformanceCsvText(scenario) {
    const tradeSummaries = buildTradeSummaries(scenario);

    const rows = tradeSummaries.map((trade) => ({
        symbol: trade.symbol,
        qty: trade.qty,
        pnl: trade.grossPnl.toFixed(2),
        buyPrice:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitPrice
                : trade.entryPrice,
        sellPrice:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryPrice
                : trade.exitPrice,
        boughtTimestamp:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitAt
                : trade.entryAt,
        soldTimestamp:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryAt
                : trade.exitAt,
        duration: "00:12:00",
        buyFillId:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitFillId
                : trade.entryFillId,
        sellFillId:
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryFillId
                : trade.exitFillId,
        "Account ID": scenario.tradingAccountId,
        "Account Name": scenario.tradingAccountName,
    }));

    return buildCsvText(
        [
            "symbol",
            "qty",
            "pnl",
            "buyPrice",
            "sellPrice",
            "boughtTimestamp",
            "soldTimestamp",
            "duration",
            "buyFillId",
            "sellFillId",
            "Account ID",
            "Account Name",
        ],
        rows
    );
}

function buildPositionHistoryCsvText(scenario) {
    const tradeSummaries = buildTradeSummaries(scenario);

    const rows = tradeSummaries.map((trade, index) => ({
        "Position ID": `${scenario.id}-POSITION-${index + 1}`,
        "Pair ID": `${scenario.id}-PAIR-${index + 1}`,
        Timestamp: trade.exitAt,
        "Trade Date": trade.exitAt.split("T")[0],
        "Account ID": scenario.tradingAccountId,
        Account: scenario.tradingAccountName,
        Contract: trade.symbol,
        Product: trade.symbol.startsWith("MNQ") ? "MNQ" : trade.symbol,
        "Net Pos": 0,
        "Net Price": trade.exitPrice,
        Bought: trade.qty,
        "Avg. Buy":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitPrice
                : trade.entryPrice,
        Sold: trade.qty,
        "Avg. Sell":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryPrice
                : trade.exitPrice,
        "Paired Qty": trade.qty,
        "Buy Price":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitPrice
                : trade.entryPrice,
        "Sell Price":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryPrice
                : trade.exitPrice,
        "P/L": trade.grossPnl.toFixed(2),
        "Buy Fill ID":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitFillId
                : trade.entryFillId,
        "Sell Fill ID":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryFillId
                : trade.exitFillId,
        "Bought Timestamp":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.exitAt
                : trade.entryAt,
        "Sold Timestamp":
            cleanString(trade.side).toLowerCase() === "short"
                ? trade.entryAt
                : trade.exitAt,
    }));

    return buildCsvText(
        [
            "Position ID",
            "Pair ID",
            "Timestamp",
            "Trade Date",
            "Account ID",
            "Account",
            "Contract",
            "Product",
            "Net Pos",
            "Net Price",
            "Bought",
            "Avg. Buy",
            "Sold",
            "Avg. Sell",
            "Paired Qty",
            "Buy Price",
            "Sell Price",
            "P/L",
            "Buy Fill ID",
            "Sell Fill ID",
            "Bought Timestamp",
            "Sold Timestamp",
        ],
        rows
    );
}

function buildScenarioFiles(scenario) {
    return {
        orders: {
            fileName: `${scenario.tradingAccountId}_Orders.csv`,
            text: buildOrdersCsvText(scenario),
        },
        trades: {
            fileName: `${scenario.tradingAccountId}_Fills.csv`,
            text: buildFillsCsvText(scenario),
        },
        cashHistory: {
            fileName: `${scenario.tradingAccountId}_AccountBalanceHistory.csv`,
            text: buildCashHistoryCsvText(scenario),
        },
        performance: {
            fileName: `${scenario.tradingAccountId}_Performance.csv`,
            text: buildPerformanceCsvText(scenario),
        },
        positionHistory: {
            fileName: `${scenario.tradingAccountId}_PositionHistory.csv`,
            text: buildPositionHistoryCsvText(scenario),
        },
    };
}

function getImportEntry(imports, key) {
    return imports?.[key] || null;
}

function getImportRowCount(imports, key) {
    const entry = getImportEntry(imports, key);
    return Array.isArray(entry?.rows) ? entry.rows.length : 0;
}

function hasImportedRows(imports, key) {
    return getImportRowCount(imports, key) > 0;
}

function getScenarioImportSummary(accountId) {
    const imports =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports(accountId)
            : {};

    return {
        orders: getImportRowCount(imports, "orders"),
        trades: getImportRowCount(imports, "trades"),
        cashHistory: getImportRowCount(imports, "cashHistory"),
        performance: getImportRowCount(imports, "performance"),
        positionHistory: getImportRowCount(imports, "positionHistory"),
        requiredReady:
            hasImportedRows(imports, "orders") &&
            hasImportedRows(imports, "trades") &&
            hasImportedRows(imports, "cashHistory"),
        optionalReady:
            hasImportedRows(imports, "performance") &&
            hasImportedRows(imports, "positionHistory"),
    };
}

function buildScenarioStatus(allAccounts) {
    const accountMap = new Map(
        (Array.isArray(allAccounts) ? allAccounts : []).map((account) => [account.id, account])
    );

    return TEST_SCENARIOS.map((scenario) => {
        const account = accountMap.get(scenario.id) || null;
        const imports = getScenarioImportSummary(scenario.id);
        const liveSnapshot =
            typeof getLiveAccountSnapshot === "function"
                ? getLiveAccountSnapshot(scenario.id)
                : null;
        const storedRisk = getRiskStatusForAccount?.(scenario.id);

        return {
            scenario,
            account,
            imports,
            liveSnapshot,
            storedRisk,
            riskState: normalizeRiskState(storedRisk),
            present: Boolean(account),
            currentBalance: toNumber(
                liveSnapshot?.currentBalance,
                toNumber(account?.currentBalance, 0)
            ),
            startingBalance: toNumber(
                liveSnapshot?.startingBalance,
                toNumber(account?.startingBalance, scenario.startingBalance)
            ),
            accountSize: toNumber(account?.accountSize, scenario.accountSize),
            drawdownLimit: toNumber(
                liveSnapshot?.drawdownLimit,
                scenario.drawdownLimit
            ),
            maxDailyLoss: toNumber(
                liveSnapshot?.maxDailyLoss,
                scenario.maxDailyLoss
            ),
            dailyPnL: toNumber(liveSnapshot?.dailyPnL, 0),
            openPositionCount: toNumber(liveSnapshot?.openPositionCount, 0),
            openOrderCount: toNumber(liveSnapshot?.openOrderCount, 0),
            sessionKey: cleanString(liveSnapshot?.sessionKey),
            tradingDate: cleanString(liveSnapshot?.tradingDate),
        };
    });
}

function buildRiskMetrics(item) {
    const currentBalance = toNumber(item.currentBalance, 0);
    const startBalance = toNumber(item.startingBalance, 0);
    const accountSize = toNumber(item.accountSize, 0);
    const drawdownLimit = toNumber(item.drawdownLimit, 0);
    const maxDailyLoss = toNumber(item.maxDailyLoss, 0);
    const dailyPnL = toNumber(item.dailyPnL, 0);
    const openPositionCount = toNumber(item.openPositionCount, 0);

    const thresholdRest = currentBalance - drawdownLimit;
    const dllUsed = dailyPnL < 0 ? Math.abs(dailyPnL) : 0;
    const dllRest = maxDailyLoss - dllUsed;
    const liveApexUnits = openPositionCount;

    return [
        {
            label: "Balance",
            value: formatMoney(currentBalance),
            note: "Aktueller Account Wert",
            tone: "cyan",
        },
        {
            label: "Startbalance",
            value: formatMoney(startBalance),
            note: `Delta ${formatMoney(currentBalance - startBalance)}`,
            tone: "gold",
        },
        {
            label: "Kontogrösse",
            value: formatCompactNumber(accountSize, 0),
            note: "Aus Account und History erkannt",
            tone: "violet",
        },
        {
            label: "Threshold Rest",
            value: formatMoney(thresholdRest),
            note: `Threshold ${formatMoney(drawdownLimit)}`,
            tone: thresholdRest > 0 ? "orange" : "danger",
        },
        {
            label: "DLL Rest",
            value: formatMoney(dllRest),
            note: `Aktiv ${formatMoney(maxDailyLoss)}`,
            tone: dllRest > 0 ? "gold" : "danger",
        },
        {
            label: "Live Apex Einheiten",
            value: `${formatCompactNumber(liveApexUnits, 2)} AE`,
            note: `Max ${formatCompactNumber(Math.max(0, accountSize / 6250), 2)} AE`,
            tone: "ok",
        },
        {
            label: "Liquidation",
            value: formatMoney(drawdownLimit),
            note: "Aktive Grenzlinie",
            tone: "danger",
        },
    ];
}

function buildRuleTiles(item) {
    const currentBalance = toNumber(item.currentBalance, 0);
    const drawdownLimit = toNumber(item.drawdownLimit, 0);
    const maxDailyLoss = toNumber(item.maxDailyLoss, 0);
    const dailyPnL = toNumber(item.dailyPnL, 0);
    const openPositionCount = toNumber(item.openPositionCount, 0);
    const openOrderCount = toNumber(item.openOrderCount, 0);

    const thresholdRest = currentBalance - drawdownLimit;
    const dllUsed = dailyPnL < 0 ? Math.abs(dailyPnL) : 0;
    const dllRest = maxDailyLoss - dllUsed;
    const isPa = cleanString(item.scenario.accountPhase).toLowerCase() === "pa";

    return [
        {
            title: "Threshold",
            value: thresholdRest > 0 ? "Sauber" : "Verletzt",
            note: `Rest ${formatMoney(thresholdRest)}`,
            status: thresholdRest > 0 ? "ok" : "danger",
        },
        {
            title: "DLL",
            value: dllRest > 0 ? "Sauber" : "Verletzt",
            note: `Rest ${formatMoney(dllRest)}`,
            status: dllRest > 0 ? "ok" : "danger",
        },
        {
            title: "Exposure",
            value: openPositionCount === 0 ? "Sauber" : "Offen",
            note:
                openPositionCount === 0
                    ? `Frei ${formatCompactNumber(Math.max(0, item.accountSize / 6250), 2)} AE`
                    : `${formatCompactNumber(openPositionCount, 0)} Positionen offen`,
            status: openPositionCount === 0 ? "ok" : "warn",
        },
        {
            title: "Payout",
            value: isPa ? "Prüfen" : "Später aktiv",
            note: isPa ? "Payout Regeln in PA prüfen." : "Payout gilt erst in PA.",
            status: isPa ? "warn" : "ok",
        },
        {
            title: "Inactivity",
            value: openOrderCount > 0 ? "Sauber" : isPa ? "Prüfen" : "Später aktiv",
            note:
                openOrderCount > 0
                    ? `${formatCompactNumber(openOrderCount, 0)} Orders aktiv`
                    : isPa
                        ? "Aktivität in PA überwachen."
                        : "Inactivity gilt erst in PA.",
            status: openOrderCount > 0 ? "ok" : isPa ? "warn" : "ok",
        },
    ];
}

function StatusPill({ label, status }) {
    const colors = getStatusColors(status);

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.text,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: "uppercase",
            }}
        >
            {label}
        </span>
    );
}

function InfoBadge({ label, value }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.cardBg,
                minWidth: 0,
            }}
        >
            <span
                style={{
                    fontSize: 12,
                    color: COLORS.muted,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </span>
            <span
                style={{
                    fontSize: 15,
                    color: COLORS.text,
                    fontWeight: 700,
                    overflowWrap: "anywhere",
                }}
            >
                {value}
            </span>
        </div>
    );
}

function CheckRow({ title, description, status, meta }) {
    const colors = getStatusColors(status);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 16px",
                borderRadius: 14,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
            }}
        >
            <div style={{ minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: COLORS.text,
                        marginBottom: 4,
                    }}
                >
                    {title}
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: COLORS.muted,
                        lineHeight: 1.5,
                        overflowWrap: "anywhere",
                    }}
                >
                    {description}
                </div>
                {meta ? (
                    <div
                        style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: COLORS.text,
                            overflowWrap: "anywhere",
                        }}
                    >
                        {meta}
                    </div>
                ) : null}
            </div>

            <StatusPill
                label={status === "ok" ? "OK" : status === "warn" ? "Prüfen" : "Fehlt"}
                status={status}
            />
        </div>
    );
}

function RiskMetricCard({ item }) {
    const toneMap = {
        cyan: {
            color: COLORS.cyan,
            border: "rgba(34, 211, 238, 0.35)",
        },
        gold: {
            color: "#facc15",
            border: "rgba(250, 204, 21, 0.35)",
        },
        violet: {
            color: COLORS.violet,
            border: "rgba(167, 139, 250, 0.35)",
        },
        orange: {
            color: COLORS.warn,
            border: "rgba(245, 158, 11, 0.35)",
        },
        ok: {
            color: COLORS.ok,
            border: "rgba(34, 197, 94, 0.35)",
        },
        danger: {
            color: COLORS.danger,
            border: "rgba(239, 68, 68, 0.35)",
        },
    };

    const ui = toneMap[item.tone] || toneMap.cyan;

    return (
        <div
            style={{
                border: `1px solid ${ui.border}`,
                borderRadius: 12,
                padding: 12,
                background: "rgba(255,255,255,0.02)",
                minHeight: 76,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {item.label}
            </div>
            <div
                style={{
                    color: ui.color,
                    fontSize: 18,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    marginBottom: 6,
                }}
            >
                {item.value}
            </div>
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 10.5,
                    lineHeight: 1.35,
                }}
            >
                {item.note}
            </div>
        </div>
    );
}

function RuleTile({ item }) {
    const colors = getStatusColors(item.status);

    return (
        <div
            style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                padding: 12,
                background: colors.bg,
                minHeight: 82,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {item.title}
            </div>
            <div
                style={{
                    color: colors.text,
                    fontSize: 20,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    marginBottom: 6,
                }}
            >
                {item.value}
            </div>
            <div
                style={{
                    color: COLORS.text,
                    fontSize: 11,
                    lineHeight: 1.35,
                }}
            >
                {item.note}
            </div>
        </div>
    );
}

function ScenarioCard({ item, isActive, onActivate }) {
    const requiredStatus = item.imports.requiredReady ? "ok" : "danger";
    const optionalStatus = item.imports.optionalReady ? "ok" : "warn";
    const riskTone = getRiskTone(item.riskState);
    const riskMetrics = buildRiskMetrics(item);
    const ruleTiles = buildRuleTiles(item);

    return (
        <div
            style={{
                border: `1px solid ${isActive ? COLORS.cyan : COLORS.border}`,
                background: isActive
                    ? "rgba(34, 211, 238, 0.08)"
                    : COLORS.cardBg,
                borderRadius: 16,
                padding: 14,
                display: "grid",
                gap: 12,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 16,
                            fontWeight: 800,
                            marginBottom: 6,
                        }}
                    >
                        {item.scenario.label}
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                            lineHeight: 1.45,
                            overflowWrap: "anywhere",
                        }}
                    >
                        {item.scenario.tradingAccountId}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <StatusPill label={riskTone.label} status={riskTone.status} />
                    {isActive ? <StatusPill label="Aktiv" status="ok" /> : null}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 8,
                }}
            >
                <InfoBadge label="Start" value={formatMoney(item.startingBalance)} />
                <InfoBadge label="Aktuell" value={formatMoney(item.currentBalance)} />
                <InfoBadge label="Phase" value={item.scenario.accountPhase.toUpperCase()} />
                <InfoBadge label="Modus" value={item.scenario.productType.toUpperCase()} />
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                }}
            >
                <InfoBadge label="Orders" value={item.imports.orders} />
                <InfoBadge label="Fills" value={item.imports.trades} />
                <InfoBadge label="Cash History" value={item.imports.cashHistory} />
                <InfoBadge label="Performance" value={item.imports.performance} />
                <InfoBadge label="Position History" value={item.imports.positionHistory} />
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                }}
            >
                <StatusPill
                    label={item.imports.requiredReady ? "Pflicht OK" : "Pflicht fehlt"}
                    status={requiredStatus}
                />
                <StatusPill
                    label={item.imports.optionalReady ? "Optional OK" : "Optional offen"}
                    status={optionalStatus}
                />
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.cardBgStrong,
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
                            color: COLORS.text,
                            fontSize: 15,
                            fontWeight: 800,
                        }}
                    >
                        Risk Fokus
                    </div>

                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                        }}
                    >
                        {item.sessionKey || item.tradingDate || "Session offen"}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 8,
                    }}
                >
                    {riskMetrics.map((metric) => (
                        <RiskMetricCard
                            key={`${item.scenario.id}-${metric.label}`}
                            item={metric}
                        />
                    ))}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.cardBgStrong,
                }}
            >
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 15,
                        fontWeight: 800,
                    }}
                >
                    Regelstatus
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 8,
                    }}
                >
                    {ruleTiles.map((rule) => (
                        <RuleTile
                            key={`${item.scenario.id}-${rule.title}`}
                            item={rule}
                        />
                    ))}
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                }}
            >
                <button
                    type="button"
                    onClick={() => onActivate(item.scenario.id)}
                    style={{
                        border: `1px solid ${isActive ? COLORS.cyan : COLORS.borderStrong}`,
                        background: isActive
                            ? "rgba(34, 211, 238, 0.16)"
                            : "rgba(255,255,255,0.04)",
                        color: COLORS.text,
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontWeight: 800,
                        cursor: "pointer",
                    }}
                >
                    {isActive ? "Aktiver Test Account" : "Als aktiv setzen"}
                </button>
            </div>
        </div>
    );
}

export default function SimulatorPanel({
    activeAccount = null,
    title = "Simulator Panel",
}) {
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const eventName =
            typeof csvImportUtils.getCsvImportEventName === "function"
                ? csvImportUtils.getCsvImportEventName()
                : "tradovate-csv-imports-updated";

        const refresh = () => {
            setVersion((prev) => prev + 1);
        };

        window.addEventListener(eventName, refresh);
        window.addEventListener("storage", refresh);
        window.addEventListener("focus", refresh);

        return () => {
            window.removeEventListener(eventName, refresh);
            window.removeEventListener("storage", refresh);
            window.removeEventListener("focus", refresh);
        };
    }, []);

    const allAccounts = useMemo(() => {
        void version;
        return Array.isArray(getAccounts?.()) ? getAccounts() : [];
    }, [version]);

    const allGroups = useMemo(() => {
        void version;
        return Array.isArray(getAccountGroups?.()) ? getAccountGroups() : [];
    }, [version]);

    const scenarioState = useMemo(() => {
        return buildScenarioStatus(allAccounts);
    }, [allAccounts]);

    const simulatorAccounts = useMemo(() => {
        return scenarioState.filter((item) => item.present);
    }, [scenarioState]);

    const simulatorGroup = useMemo(() => {
        return (
            allGroups.find((group) => cleanString(group?.id) === TEST_GROUP_ID) ||
            allGroups.find((group) =>
                Array.isArray(group?.accounts) &&
                group.accounts.some((account) => TEST_ACCOUNT_IDS.includes(account.id))
            ) ||
            null
        );
    }, [allGroups]);

    const activeScenarioId = cleanString(activeAccount?.id);
    const activeIsSimulator = TEST_ACCOUNT_IDS.includes(activeScenarioId);

    const checks = useMemo(() => {
        const accountCount = simulatorAccounts.length;
        const groupAccounts = Array.isArray(simulatorGroup?.accounts)
            ? simulatorGroup.accounts.length
            : 0;

        const hasFourSlotGroup = Boolean(
            simulatorGroup?.slots?.evalEod &&
            simulatorGroup?.slots?.paEod &&
            simulatorGroup?.slots?.evalIntraday &&
            simulatorGroup?.slots?.paIntraday
        );

        const missingRequired = scenarioState.filter(
            (item) => !item.imports.requiredReady
        ).length;

        const missingOptional = scenarioState.filter(
            (item) => !item.imports.optionalReady
        ).length;

        return [
            {
                title: "4 Test Accounts",
                description:
                    accountCount === 4
                        ? "Alle 4 Test Accounts sind vorhanden."
                        : "Die Testgruppe ist unvollständig.",
                status: accountCount === 4 ? "ok" : "danger",
                meta: `Gefunden: ${accountCount}/4`,
            },
            {
                title: "4 Slot Gruppe",
                description: hasFourSlotGroup
                    ? "EVAL EOD, PA EOD, EVAL Intraday und PA Intraday sind in einer Gruppe vorhanden."
                    : "Die 4 Slot Gruppe ist noch nicht vollständig.",
                status: hasFourSlotGroup ? "ok" : "danger",
                meta: `Gruppen Accounts: ${groupAccounts}`,
            },
            {
                title: "Pflichtdateien",
                description:
                    missingRequired === 0
                        ? "Orders, Fills und Account Balance History sind für alle 4 Test Accounts geladen."
                        : "Mindestens eine Pflichtdatei fehlt.",
                status: missingRequired === 0 ? "ok" : "danger",
                meta: `Accounts mit Lücken: ${missingRequired}`,
            },
            {
                title: "Optionale Dateien",
                description:
                    missingOptional === 0
                        ? "Performance und Position History sind für alle 4 Test Accounts geladen."
                        : "Optionale Dateien sind noch nicht überall vorhanden.",
                status: missingOptional === 0 ? "ok" : "warn",
                meta: `Accounts mit Lücken: ${missingOptional}`,
            },
            {
                title: "Aktiver Test Account",
                description: activeIsSimulator
                    ? "Der aktive Account liegt in der Testgruppe."
                    : "Der aktive Account liegt noch nicht in der Testgruppe.",
                status: activeIsSimulator ? "ok" : "warn",
                meta: activeIsSimulator
                    ? `Aktiv: ${cleanString(activeAccount?.displayName) || cleanString(activeAccount?.id)}`
                    : "",
            },
        ];
    }, [activeAccount, activeIsSimulator, scenarioState, simulatorAccounts, simulatorGroup]);

    const summary = useMemo(() => {
        const dangerCount = checks.filter((item) => item.status === "danger").length;
        const warnCount = checks.filter((item) => item.status === "warn").length;

        if (dangerCount > 0) {
            return {
                status: "danger",
                label: "Testgruppe unvollständig",
            };
        }

        if (warnCount > 0) {
            return {
                status: "warn",
                label: "Testgruppe fast bereit",
            };
        }

        return {
            status: "ok",
            label: "Testgruppe bereit",
        };
    }, [checks]);

    function refreshState(messageText = "") {
        if (messageText) {
            setMessage(messageText);
        }
        setVersion((prev) => prev + 1);
    }

    function seedScenarioToStorage(scenario) {
        const files = buildScenarioFiles(scenario);

        addAccount({
            id: scenario.id,
            displayName: scenario.tradingAccountName,
            tradingAccountId: scenario.tradingAccountId,
            tradingAccountName: scenario.tradingAccountName,
            provider: "APEX",
            accountPhase: scenario.accountPhase,
            productType: scenario.productType,
            accountStatus: "active",
            accountSize: scenario.accountSize,
            startingBalance: scenario.startingBalance,
            currentBalance: scenario.startingBalance,
            accountGroupId: TEST_GROUP_ID,
            createdAt: new Date().toISOString(),
        });

        csvImportUtils.saveParsedImport(
            "orders",
            files.orders.fileName,
            files.orders.text,
            scenario.id
        );
        csvImportUtils.saveParsedImport(
            "trades",
            files.trades.fileName,
            files.trades.text,
            scenario.id
        );
        csvImportUtils.saveParsedImport(
            "cashHistory",
            files.cashHistory.fileName,
            files.cashHistory.text,
            scenario.id
        );
        csvImportUtils.saveParsedImport(
            "performance",
            files.performance.fileName,
            files.performance.text,
            scenario.id
        );
        csvImportUtils.saveParsedImport(
            "positionHistory",
            files.positionHistory.fileName,
            files.positionHistory.text,
            scenario.id
        );

        const imports = csvImportUtils.getAllParsedImports(scenario.id);
        const ordersData = csvImportUtils.buildOrdersData(
            imports,
            scenario.tradingAccountId
        );
        const fillsData = csvImportUtils.buildFillsData(
            imports,
            scenario.tradingAccountId
        );
        const cashHistoryData = csvImportUtils.buildCashHistoryData(
            imports,
            scenario.tradingAccountId
        );
        const cashHistorySnapshot = csvImportUtils.deriveCashHistorySnapshot(
            imports,
            scenario.tradingAccountId
        );

        syncImportedOrders(scenario.id, ordersData.entries);
        saveOrders(scenario.id, ordersData.entries);
        syncImportedFills(scenario.id, fillsData.entries);
        syncImportedCashHistory(scenario.id, cashHistoryData.entries);

        updateAccount(scenario.id, {
            displayName: scenario.tradingAccountName,
            tradingAccountId: scenario.tradingAccountId,
            tradingAccountName: scenario.tradingAccountName,
            provider: "APEX",
            accountPhase: scenario.accountPhase,
            productType: scenario.productType,
            accountStatus: "active",
            accountGroupId: TEST_GROUP_ID,
            accountSize: cashHistorySnapshot.accountSize || scenario.accountSize,
            startingBalance:
                cashHistorySnapshot.startingBalance || scenario.startingBalance,
            currentBalance:
                cashHistorySnapshot.currentBalance || scenario.startingBalance,
        });

        const lastTrade = scenario.trades[scenario.trades.length - 1];
        const lastTradeGross = calculateGrossPnl(lastTrade);

        saveLiveAccountSnapshot(scenario.id, {
            sessionKey: "2026-04-11",
            tradingDate: "2026-04-11",
            dailyPnL: lastTradeGross,
            realizedPnL: lastTradeGross,
            unrealizedPnL: 0,
            startingBalance:
                cashHistorySnapshot.startingBalance || scenario.startingBalance,
            currentBalance:
                cashHistorySnapshot.currentBalance || scenario.startingBalance,
            liquidationPrice: scenario.drawdownLimit,
            liquidationPriceBreached: false,
            stopRiskViolation: false,
            trailingDrawdownViolation: false,
            isLocked: false,
            drawdownLimit: scenario.drawdownLimit,
            maxDailyLoss: scenario.maxDailyLoss,
            openPositionCount: 0,
            openOrderCount: 1,
            accountSize: cashHistorySnapshot.accountSize || scenario.accountSize,
            balance: cashHistorySnapshot.currentBalance || scenario.startingBalance,
            tradingAccountId: scenario.tradingAccountId,
            tradingAccountName: scenario.tradingAccountName,
        });

        saveRiskStatusForAccount(scenario.id, {
            level: "green",
            label: "Grün",
            source: "simulator-panel",
            flags: {
                threshold: false,
                dll: false,
                exposure: false,
                payout: false,
                inactivity: false,
            },
            meta: {
                scenario: scenario.label,
                currentBalance:
                    cashHistorySnapshot.currentBalance || scenario.startingBalance,
                startBalance:
                    cashHistorySnapshot.startingBalance || scenario.startingBalance,
                openPositionCount: 0,
                openOrderCount: 1,
            },
        });
    }

    function clearScenarioFromStorage() {
        TEST_ACCOUNT_IDS.forEach((accountId) => {
            try {
                deleteAccount(accountId);
            } catch {
                return;
            }
        });
    }

    async function handleCreateScenario() {
        setBusy(true);

        try {
            clearScenarioFromStorage();

            TEST_SCENARIOS.forEach((scenario) => {
                seedScenarioToStorage(scenario);
            });

            setActiveAccountId(TEST_SCENARIOS[0].id);
            refreshState("4er Testgruppe wurde geladen.");
        } catch {
            refreshState("Testgruppe wurde nicht vollständig geladen.");
        } finally {
            setBusy(false);
        }
    }

    async function handleClearScenario() {
        setBusy(true);

        try {
            clearScenarioFromStorage();
            refreshState("4er Testgruppe wurde entfernt.");
        } catch {
            refreshState("Testgruppe wurde nicht vollständig entfernt.");
        } finally {
            setBusy(false);
        }
    }

    async function handleActivateScenario(accountId) {
        setBusy(true);

        try {
            setActiveAccountId(accountId);
            refreshState(`${accountId} wurde als aktiver Test Account gesetzt.`);
        } catch {
            refreshState("Aktiver Test Account wurde nicht gesetzt.");
        } finally {
            setBusy(false);
        }
    }

    async function handleActivateFirstScenario() {
        await handleActivateScenario(TEST_SCENARIOS[0].id);
    }

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 22,
                boxShadow: COLORS.shadow,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 18,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: COLORS.title,
                            marginBottom: 6,
                        }}
                    >
                        {title}
                    </div>
                    <div
                        style={{
                            fontSize: 14,
                            color: COLORS.muted,
                            lineHeight: 1.5,
                            maxWidth: 820,
                        }}
                    >
                        Interne 4er Testgruppe für EVAL EOD, PA EOD, EVAL Intraday und
                        PA Intraday. Pro Account werden Orders, Fills, Cash History,
                        Performance und Position History erzeugt.
                    </div>
                </div>

                <StatusPill label={summary.label} status={summary.status} />
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <button
                    type="button"
                    onClick={handleCreateScenario}
                    disabled={busy}
                    style={{
                        border: `1px solid ${COLORS.cyan}`,
                        background: "rgba(34, 211, 238, 0.14)",
                        color: COLORS.text,
                        borderRadius: 12,
                        padding: "12px 14px",
                        fontWeight: 800,
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.65 : 1,
                    }}
                >
                    4er Testgruppe laden
                </button>

                <button
                    type="button"
                    onClick={handleActivateFirstScenario}
                    disabled={busy}
                    style={{
                        border: `1px solid ${COLORS.borderStrong}`,
                        background: COLORS.cardBg,
                        color: COLORS.text,
                        borderRadius: 12,
                        padding: "12px 14px",
                        fontWeight: 800,
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.65 : 1,
                    }}
                >
                    EVAL EOD aktiv setzen
                </button>

                <button
                    type="button"
                    onClick={handleClearScenario}
                    disabled={busy}
                    style={{
                        border: `1px solid rgba(239, 68, 68, 0.35)`,
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#fecaca",
                        borderRadius: 12,
                        padding: "12px 14px",
                        fontWeight: 800,
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.65 : 1,
                    }}
                >
                    Testgruppe löschen
                </button>
            </div>

            {message ? (
                <div
                    style={{
                        padding: 14,
                        borderRadius: 14,
                        border: `1px solid ${COLORS.border}`,
                        background: "rgba(34, 211, 238, 0.08)",
                        color: COLORS.text,
                        fontSize: 13,
                        lineHeight: 1.6,
                    }}
                >
                    {message}
                </div>
            ) : null}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                }}
            >
                <InfoBadge label="Test Accounts" value={`${simulatorAccounts.length}/4`} />
                <InfoBadge
                    label="4 Slot Gruppe"
                    value={
                        simulatorGroup
                            ? cleanString(simulatorGroup.title) || TEST_GROUP_ID
                            : "Nicht vorhanden"
                    }
                />
                <InfoBadge
                    label="Aktiver Test Account"
                    value={
                        activeIsSimulator
                            ? cleanString(activeAccount?.displayName) || cleanString(activeAccount?.id)
                            : "Keiner"
                    }
                />
                <InfoBadge
                    label="Letzter Stand"
                    value={formatDateTime(new Date().toISOString())}
                />
            </div>

            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: 16,
                    borderRadius: 18,
                    border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.cardBgStrong,
                }}
            >
                <div
                    style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: COLORS.text,
                    }}
                >
                    Simulations Prüfung
                </div>

                {checks.map((item) => (
                    <CheckRow
                        key={item.title}
                        title={item.title}
                        description={item.description}
                        status={item.status}
                        meta={item.meta}
                    />
                ))}
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                    gap: 12,
                }}
            >
                {scenarioState.map((item) => (
                    <ScenarioCard
                        key={item.scenario.id}
                        item={item}
                        isActive={activeScenarioId === item.scenario.id}
                        onActivate={handleActivateScenario}
                    />
                ))}
            </div>

            <div
                style={{
                    padding: 14,
                    borderRadius: 14,
                    border: `1px solid ${COLORS.border}`,
                    background: "rgba(34, 211, 238, 0.08)",
                    color: COLORS.text,
                    fontSize: 13,
                    lineHeight: 1.6,
                }}
            >
                Nächster Schritt ist der große Testlauf. Danach ziehen wir die gleiche
                kompakte Risk Struktur in die Slot Karten im Dashboard.
            </div>
        </section>
    );
}