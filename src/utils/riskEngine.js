import {
    resolveCurrentDailyLossLimit,
    resolveDrawdownFloor,
} from "./apexRules";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOverallStatus(statuses) {
    if (statuses.includes("breach")) return "breach";
    if (statuses.includes("warning")) return "warning";
    return "ok";
}

function resolveDrawdownFloorStatus({
    currentBalance,
    drawdownFloor,
    remainingDrawdownBuffer,
    warningBuffer,
    items,
}) {
    if (drawdownFloor === null) {
        return "ok";
    }

    if (currentBalance <= drawdownFloor) {
        items.push({
            code: "DRAWDOWN_FLOOR_BREACH",
            level: "breach",
            text: "Balance liegt auf oder unter dem Drawdown Floor",
        });
        return "breach";
    }

    if (remainingDrawdownBuffer <= warningBuffer) {
        items.push({
            code: "DRAWDOWN_FLOOR_WARNING",
            level: "warning",
            text: "Drawdown Puffer ist niedrig",
        });
        return "warning";
    }

    return "ok";
}

function resolveDailyLossStatus({
    dailyPnL,
    dailyLossLimit,
    items,
}) {
    if (dailyLossLimit === null || dailyLossLimit <= 0) {
        return "ok";
    }

    const dailyLoss = Math.abs(Math.min(dailyPnL, 0));

    if (dailyLoss >= dailyLossLimit) {
        items.push({
            code: "DAILY_LOSS_LIMIT_BREACH",
            level: "breach",
            text: "Daily Loss Limit überschritten",
        });
        return "breach";
    }

    if (dailyLoss >= dailyLossLimit * 0.8) {
        items.push({
            code: "DAILY_LOSS_LIMIT_WARNING",
            level: "warning",
            text: "Daily Loss Limit fast erreicht",
        });
        return "warning";
    }

    return "ok";
}

function resolveStopBufferStatus({
    remainingDrawdownBufferAfterStop,
    stopWarningBuffer,
    items,
}) {
    if (remainingDrawdownBufferAfterStop === null) {
        return "ok";
    }

    if (remainingDrawdownBufferAfterStop <= 0) {
        items.push({
            code: "STOP_BUFFER_BREACH",
            level: "breach",
            text: "Geplanter Stop überschreitet den verbleibenden Drawdown Puffer",
        });
        return "breach";
    }

    if (remainingDrawdownBufferAfterStop <= stopWarningBuffer) {
        items.push({
            code: "STOP_BUFFER_WARNING",
            level: "warning",
            text: "Wenig Puffer nach geplantem Stop",
        });
        return "warning";
    }

    return "ok";
}

function resolveStopRiskViolationStatus({
    stopRiskViolationCount,
    items,
}) {
    const count = toNumber(stopRiskViolationCount, 0);

    if (count <= 0) {
        return "ok";
    }

    if (count >= 2) {
        items.push({
            code: "STOP_RISK_VIOLATION_BREACH",
            level: "breach",
            text: `${count} offene Order Regeln verletzen das Stop Risiko`,
        });
        return "breach";
    }

    items.push({
        code: "STOP_RISK_VIOLATION_WARNING",
        level: "warning",
        text: `${count} offene Order verletzt das Stop Risiko`,
    });
    return "warning";
}

function resolveCombinedStopRiskStatus(stopStatuses) {
    if (stopStatuses.includes("breach")) {
        return "breach";
    }

    if (stopStatuses.includes("warning")) {
        return "warning";
    }

    return "ok";
}

export function evaluateRiskWarnings({
    account,
    rules,
    plannedStop = 0,
    realizedPnl = 0,
    unrealizedPnl = 0,
    stopRiskViolationCount = 0,
    warningBuffer = 200,
    stopWarningBuffer = 100,
}) {
    const currentBalance = toNumber(account?.currentBalance);
    const liveBalance = currentBalance + toNumber(unrealizedPnl);
    const dailyPnL = toNumber(realizedPnl) + toNumber(unrealizedPnl);

    const drawdownFloor = rules && account
        ? resolveDrawdownFloor(rules, account)
        : null;

    const dailyLossLimit = rules
        ? resolveCurrentDailyLossLimit(rules, currentBalance)
        : null;

    const remainingDrawdownBuffer =
        drawdownFloor !== null ? currentBalance - drawdownFloor : null;

    const remainingDrawdownBufferAfterStop =
        drawdownFloor !== null
            ? currentBalance - toNumber(plannedStop) - drawdownFloor
            : null;

    const items = [];

    const drawdownFloorStatus = resolveDrawdownFloorStatus({
        currentBalance,
        drawdownFloor,
        remainingDrawdownBuffer,
        warningBuffer,
        items,
    });

    const dailyLossStatus = resolveDailyLossStatus({
        dailyPnL,
        dailyLossLimit,
        items,
    });

    const stopBufferStatus = resolveStopBufferStatus({
        remainingDrawdownBufferAfterStop,
        stopWarningBuffer,
        items,
    });

    const stopRiskViolationStatus = resolveStopRiskViolationStatus({
        stopRiskViolationCount,
        items,
    });

    const stopRiskStatus = resolveCombinedStopRiskStatus([
        stopBufferStatus,
        stopRiskViolationStatus,
    ]);

    const overallStatus = resolveOverallStatus([
        drawdownFloorStatus,
        dailyLossStatus,
        stopRiskStatus,
    ]);

    return {
        overallStatus,
        liveBalance,
        dailyPnL,
        drawdownFloor,
        dailyLossLimit,
        remainingDrawdownBuffer,
        remainingDrawdownBufferAfterStop,
        stopRiskViolationCount: toNumber(stopRiskViolationCount, 0),
        statuses: {
            drawdownFloor: drawdownFloorStatus,
            dailyLoss: dailyLossStatus,
            stopRisk: stopRiskStatus,
            stopBuffer: stopBufferStatus,
            stopRiskViolations: stopRiskViolationStatus,
        },
        items,
    };
}