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

function toSignedWholeNumber(value, fallback = 0) {
    return Math.round(toNumber(value, fallback));
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
    const maxContracts = toWholeNumber(input.maxContracts, 0);
    const safeSize = toWholeNumber(input.safeSize, 0);
    const currentContracts = toWholeNumber(input.currentContracts, 0);
    const plannedContracts = toWholeNumber(input.plannedContracts, 0);
    const currentInstrumentContracts = toWholeNumber(input.currentInstrumentContracts, 0);

    const openAfterEntry =
        input.openAfterEntry !== undefined
            ? toWholeNumber(input.openAfterEntry, 0)
            : currentContracts + plannedContracts;

    const instrumentAfterEntry =
        input.instrumentAfterEntry !== undefined
            ? toWholeNumber(input.instrumentAfterEntry, 0)
            : currentInstrumentContracts + plannedContracts;

    const freeSlotsNow =
        input.freeSlotsNow !== undefined
            ? toSignedWholeNumber(input.freeSlotsNow, 0)
            : maxContracts - currentContracts;

    const freeSlotsAfterEntry =
        input.freeSlotsAfterEntry !== undefined
            ? toSignedWholeNumber(input.freeSlotsAfterEntry, 0)
            : maxContracts - openAfterEntry;

    const liveOverLimit =
        Boolean(input.liveOverLimit) ||
        (maxContracts > 0 && currentContracts > maxContracts) ||
        freeSlotsNow < 0;

    const safeSizeOverLimit =
        plannedContracts > safeSize;

    const totalAfterEntryOverLimit =
        (maxContracts > 0 && openAfterEntry > maxContracts) ||
        freeSlotsAfterEntry < 0;

    const instrumentAfterEntryOverLimit =
        maxContracts > 0 && instrumentAfterEntry > maxContracts;

    const anyOverLimit =
        liveOverLimit ||
        safeSizeOverLimit ||
        totalAfterEntryOverLimit ||
        instrumentAfterEntryOverLimit;

    const exactLimit =
        !anyOverLimit &&
        (
            plannedContracts === safeSize ||
            openAfterEntry === maxContracts ||
            instrumentAfterEntry === maxContracts ||
            freeSlotsAfterEntry === 0
        );

    const nearLimit =
        !anyOverLimit &&
        !exactLimit &&
        (
            safeSize - plannedContracts <= 1 ||
            freeSlotsNow <= 1 ||
            freeSlotsAfterEntry <= 1
        );

    let shared;

    if (liveOverLimit) {
        shared = buildStatus("red", "Live Position liegt bereits über dem Max Kontrakt Limit.");
    } else if (safeSizeOverLimit) {
        shared = buildStatus("red", "Neue Kontrakte überschreiten die aktuelle Safe Size.");
    } else if (totalAfterEntryOverLimit) {
        shared = buildStatus("red", "Offen nach Entry liegt über dem Max Kontrakt Limit.");
    } else if (instrumentAfterEntryOverLimit) {
        shared = buildStatus("red", "Instrument nach Entry liegt über dem Max Kontrakt Limit.");
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
        currentContracts,
        plannedContracts,
        currentInstrumentContracts,
        openAfterEntry,
        instrumentAfterEntry,
        freeSlotsNow,
        freeSlotsAfterEntry,
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
                value: openAfterEntry,
            },
            freeSlotsAfterEntry: {
                ...shared,
                value: freeSlotsAfterEntry,
            },
            liveOverLimit: {
                ...shared,
                value: liveOverLimit,
            },
            instrumentAfterEntry: {
                ...shared,
                value: instrumentAfterEntry,
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