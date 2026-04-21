export const STATUS = {
    OK: "ok",
    WARNING: "warning",
    ERROR: "error",
};

export const OVERALL_STATUS = {
    OK: "ok",
    WARNING: "warning",
    ERROR: "error",
};

export const DEFAULT_EPSILON = 0.01;

function round2(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.round(number * 100) / 100;
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function buildResult({
    key,
    title,
    status,
    message,
    expected = null,
    actual = null,
    delta = null,
    critical = false,
    warning = false,
    ok = false,
    missingBase = false,
    meta = {},
}) {
    return {
        key: normalizeText(key),
        title: normalizeText(title),
        status,
        message: normalizeText(message),
        expected: round2(expected),
        actual: round2(actual),
        delta: round2(delta),
        critical: Boolean(critical),
        warning: Boolean(warning),
        ok: Boolean(ok),
        missingBase: Boolean(missingBase),
        meta,
    };
}

export function createMissingBaseResult({
    key,
    title,
    message,
    expected = null,
    actual = null,
    delta = null,
    meta = {},
}) {
    return buildResult({
        key,
        title,
        status: STATUS.WARNING,
        message,
        expected,
        actual,
        delta,
        critical: false,
        warning: true,
        ok: false,
        missingBase: true,
        meta,
    });
}

export function createMatchResult({
    key,
    title,
    message,
    expected = null,
    actual = null,
    delta = 0,
    meta = {},
}) {
    return buildResult({
        key,
        title,
        status: STATUS.OK,
        message,
        expected,
        actual,
        delta,
        critical: false,
        warning: false,
        ok: true,
        missingBase: false,
        meta,
    });
}

export function createMismatchResult({
    key,
    title,
    message,
    expected = null,
    actual = null,
    delta = null,
    meta = {},
}) {
    return buildResult({
        key,
        title,
        status: STATUS.ERROR,
        message,
        expected,
        actual,
        delta,
        critical: true,
        warning: false,
        ok: false,
        missingBase: false,
        meta,
    });
}

export function compareNumbers({
    key,
    title,
    expected,
    actual,
    epsilon = DEFAULT_EPSILON,
    okMessage = "Werte stimmen überein",
    errorMessage = "Abweichung erkannt",
    missingMessage = "Datenbasis fehlt",
    meta = {},
}) {
    const expectedNumber = toNumber(expected);
    const actualNumber = toNumber(actual);

    if (expectedNumber === null || actualNumber === null) {
        return createMissingBaseResult({
            key,
            title,
            message: missingMessage,
            expected,
            actual,
            delta: null,
            meta,
        });
    }

    const delta = round2(actualNumber - expectedNumber);

    if (Math.abs(delta) <= epsilon) {
        return createMatchResult({
            key,
            title,
            message: okMessage,
            expected: expectedNumber,
            actual: actualNumber,
            delta,
            meta,
        });
    }

    return createMismatchResult({
        key,
        title,
        message: errorMessage,
        expected: expectedNumber,
        actual: actualNumber,
        delta,
        meta,
    });
}

export function compareCounts({
    key,
    title,
    expected,
    actual,
    okMessage = "Zähler stimmen überein",
    errorMessage = "Zähler stimmen nicht überein",
    missingMessage = "Datenbasis fehlt",
    meta = {},
}) {
    return compareNumbers({
        key,
        title,
        expected,
        actual,
        epsilon: 0,
        okMessage,
        errorMessage,
        missingMessage,
        meta,
    });
}

export function buildOrderFillValidation({
    filledOrdersCount,
    fillsCount,
    filledWithoutFillCount,
    fillsWithoutOrderCount,
}) {
    const missingBase =
        !Number.isFinite(Number(filledOrdersCount)) ||
        !Number.isFinite(Number(fillsCount)) ||
        !Number.isFinite(Number(filledWithoutFillCount)) ||
        !Number.isFinite(Number(fillsWithoutOrderCount));

    if (missingBase) {
        return createMissingBaseResult({
            key: "orders-vs-fills",
            title: "Orders gegen Fills",
            message: "Order oder Fill Basis fehlt",
            expected: filledOrdersCount,
            actual: fillsCount,
            delta: null,
            meta: {
                filledWithoutFillCount,
                fillsWithoutOrderCount,
            },
        });
    }

    const hasMissingFill = Number(filledWithoutFillCount) > 0;
    const hasMissingOrder = Number(fillsWithoutOrderCount) > 0;
    const filledDelta = Number(fillsCount) - Number(filledOrdersCount);

    if (hasMissingFill || hasMissingOrder) {
        return createMismatchResult({
            key: "orders-vs-fills",
            title: "Orders gegen Fills",
            message: "Filled Order ohne Fill oder Fill ohne Order erkannt",
            expected: filledOrdersCount,
            actual: fillsCount,
            delta: filledDelta,
            meta: {
                filledWithoutFillCount,
                fillsWithoutOrderCount,
            },
        });
    }

    return createMatchResult({
        key: "orders-vs-fills",
        title: "Orders gegen Fills",
        message: "Filled Orders und Fills passen sauber zusammen",
        expected: filledOrdersCount,
        actual: fillsCount,
        delta: filledDelta,
        meta: {
            filledWithoutFillCount,
            fillsWithoutOrderCount,
        },
    });
}

export function buildCashDayValidation({
    key,
    title,
    expectedDayMove,
    actualDayMove,
    cashHistoryRowCount,
    okMessage,
    errorMessage,
    missingMessage = "Für diese Prüfung fehlt ein zweiter Cash History Tagesstand",
    epsilon = DEFAULT_EPSILON,
}) {
    const rowCount = Number(cashHistoryRowCount);

    if (!Number.isFinite(rowCount) || rowCount < 2) {
        return createMissingBaseResult({
            key,
            title,
            message: missingMessage,
            expected: expectedDayMove,
            actual: actualDayMove,
            delta: null,
            meta: {
                cashHistoryRowCount,
            },
        });
    }

    return compareNumbers({
        key,
        title,
        expected: expectedDayMove,
        actual: actualDayMove,
        epsilon,
        okMessage,
        errorMessage,
        missingMessage,
        meta: {
            cashHistoryRowCount,
        },
    });
}

export function summarizeValidationResults(results = []) {
    const safeResults = Array.isArray(results) ? results.filter(Boolean) : [];

    const counts = safeResults.reduce(
        (acc, item) => {
            if (item.status === STATUS.ERROR) {
                acc.criticalCount += 1;
            } else if (item.status === STATUS.WARNING) {
                acc.warningCount += 1;
            } else if (item.status === STATUS.OK) {
                acc.okCount += 1;
            }

            return acc;
        },
        {
            totalCount: safeResults.length,
            criticalCount: 0,
            warningCount: 0,
            okCount: 0,
        }
    );

    let overallStatus = OVERALL_STATUS.OK;
    let overallLabel = "Validation Status OK";

    if (counts.criticalCount > 0) {
        overallStatus = OVERALL_STATUS.ERROR;
        overallLabel = "Validation Status Abweichung";
    } else if (counts.warningCount > 0) {
        overallStatus = OVERALL_STATUS.WARNING;
        overallLabel = "Validation Status Prüfen";
    }

    return {
        overallStatus,
        overallLabel,
        totalCount: counts.totalCount,
        criticalCount: counts.criticalCount,
        warningCount: counts.warningCount,
        okCount: counts.okCount,
        results: safeResults,
    };
}

export function getValidationStatusColors(status, colors = {}) {
    if (status === STATUS.ERROR) {
        return {
            tone: colors.danger || "#ef4444",
            border: colors.dangerSoft || "rgba(239, 68, 68, 0.32)",
            background: colors.dangerBg || "rgba(239, 68, 68, 0.12)",
        };
    }

    if (status === STATUS.WARNING) {
        return {
            tone: colors.warning || "#f59e0b",
            border: colors.warningSoft || "rgba(245, 158, 11, 0.30)",
            background: colors.warningBg || "rgba(245, 158, 11, 0.12)",
        };
    }

    return {
        tone: colors.positive || "#22c55e",
        border: colors.positiveSoft || "rgba(34, 197, 94, 0.30)",
        background: colors.positiveBg || "rgba(34, 197, 94, 0.12)",
    };
}