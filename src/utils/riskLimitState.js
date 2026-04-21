function toNumber(value, fallback = 0) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return numeric;
}

function toWholeNumber(value, fallback = 0) {
    return Math.max(0, Math.round(toNumber(value, fallback)));
}

function toSignedNumber(value, fallback = 0) {
    return toNumber(value, fallback);
}

function buildStatus(status, reason) {
    return {
        status,
        reason,
        isGreen: status === "green",
        isYellow: status === "yellow",
        isRed: status === "red",
    };
}

export function buildRiskLimitState(input = {}) {
    const maxContracts = Math.max(toNumber(input.maxContracts, 0), 0);
    const safeSize = toWholeNumber(input.safeSize, 0);

    const currentExposureUnits = Math.max(
        toNumber(input.currentExposureUnits, input.currentContracts ?? 0),
        0
    );

    const plannedContracts = toWholeNumber(input.plannedContracts, 0);

    const plannedExposureUnits = Math.max(
        toNumber(input.plannedExposureUnits, plannedContracts),
        0
    );

    const currentInstrumentExposureUnits = Math.max(
        toNumber(
            input.currentInstrumentExposureUnits,
            input.currentInstrumentContracts ?? 0
        ),
        0
    );

    const openAfterEntryExposureUnits =
        input.openAfterEntryExposureUnits !== undefined
            ? Math.max(toNumber(input.openAfterEntryExposureUnits, 0), 0)
            : currentExposureUnits + plannedExposureUnits;

    const instrumentAfterEntryExposureUnits =
        input.instrumentAfterEntryExposureUnits !== undefined
            ? Math.max(toNumber(input.instrumentAfterEntryExposureUnits, 0), 0)
            : currentInstrumentExposureUnits + plannedExposureUnits;

    const freeExposureNow =
        input.freeExposureNow !== undefined
            ? toSignedNumber(input.freeExposureNow, 0)
            : maxContracts - currentExposureUnits;

    const freeExposureAfterEntry =
        input.freeExposureAfterEntry !== undefined
            ? toSignedNumber(input.freeExposureAfterEntry, 0)
            : maxContracts - openAfterEntryExposureUnits;

    const epsilon = 0.000001;

    const liveOverLimit =
        Boolean(input.liveOverLimit) ||
        (maxContracts > 0 && currentExposureUnits - maxContracts > epsilon) ||
        freeExposureNow < -epsilon;

    const safeSizeOverLimit =
        plannedContracts > safeSize;

    const totalAfterEntryOverLimit =
        (maxContracts > 0 && openAfterEntryExposureUnits - maxContracts > epsilon) ||
        freeExposureAfterEntry < -epsilon;

    const instrumentAfterEntryOverLimit =
        maxContracts > 0 && instrumentAfterEntryExposureUnits - maxContracts > epsilon;

    const anyOverLimit =
        liveOverLimit ||
        safeSizeOverLimit ||
        totalAfterEntryOverLimit ||
        instrumentAfterEntryOverLimit;

    const exactLimit =
        !anyOverLimit &&
        (
            plannedContracts === safeSize ||
            Math.abs(openAfterEntryExposureUnits - maxContracts) <= epsilon ||
            Math.abs(instrumentAfterEntryExposureUnits - maxContracts) <= epsilon ||
            Math.abs(freeExposureAfterEntry) <= epsilon
        );

    const nearLimit =
        !anyOverLimit &&
        !exactLimit &&
        (
            safeSize - plannedContracts <= 1 ||
            freeExposureNow <= 1 ||
            freeExposureAfterEntry <= 1
        );

    let shared;

    if (liveOverLimit) {
        shared = buildStatus("red", "Live Exposure liegt bereits über dem Apex Limit.");
    } else if (safeSizeOverLimit) {
        shared = buildStatus("red", "Neue Kontrakte überschreiten die aktuelle Safe Size.");
    } else if (totalAfterEntryOverLimit) {
        shared = buildStatus("red", "Exposure nach Entry liegt über dem Apex Limit.");
    } else if (instrumentAfterEntryOverLimit) {
        shared = buildStatus("red", "Markt Exposure nach Entry liegt über dem Apex Limit.");
    } else if (exactLimit) {
        shared = buildStatus("yellow", "Grenze ist exakt erreicht.");
    } else if (nearLimit) {
        shared = buildStatus("yellow", "Wenig Reserve bis zur Grenze.");
    } else {
        shared = buildStatus("green", "Lage liegt innerhalb der Grenze.");
    }

    return {
        maxContracts,
        safeSize,
        plannedContracts,
        currentExposureUnits,
        plannedExposureUnits,
        currentInstrumentExposureUnits,
        openAfterEntryExposureUnits,
        instrumentAfterEntryExposureUnits,
        freeExposureNow,
        freeExposureAfterEntry,
        flags: {
            liveOverLimit,
            safeSizeOverLimit,
            totalAfterEntryOverLimit,
            instrumentAfterEntryOverLimit,
            exactLimit,
            nearLimit,
        },
        sharedStatus: shared.status,
        sharedReason: shared.reason,
        blocks: {
            safeSize: {
                ...shared,
                value: safeSize,
            },
            openAfterEntry: {
                ...shared,
                value: openAfterEntryExposureUnits,
            },
            freeSlotsAfterEntry: {
                ...shared,
                value: freeExposureAfterEntry,
            },
            liveOverLimit: {
                ...shared,
                value: liveOverLimit,
            },
            instrumentAfterEntry: {
                ...shared,
                value: instrumentAfterEntryExposureUnits,
            },
        },
    };
}

export function getRiskStatusColors(status, colors = {}) {
    if (status === "red") {
        return {
            border: colors.redBorder || "rgba(248, 113, 113, 0.45)",
            background: colors.redBackground || "rgba(248, 113, 113, 0.12)",
            text: colors.redText || "#fecaca",
            accent: colors.redAccent || "#f87171",
        };
    }

    if (status === "yellow") {
        return {
            border: colors.yellowBorder || "rgba(251, 191, 36, 0.45)",
            background: colors.yellowBackground || "rgba(251, 191, 36, 0.12)",
            text: colors.yellowText || "#fde68a",
            accent: colors.yellowAccent || "#fbbf24",
        };
    }

    return {
        border: colors.greenBorder || "rgba(74, 222, 128, 0.45)",
        background: colors.greenBackground || "rgba(74, 222, 128, 0.12)",
        text: colors.greenText || "#bbf7d0",
        accent: colors.greenAccent || "#4ade80",
    };
}