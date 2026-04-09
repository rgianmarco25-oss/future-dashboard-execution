const EVENT_NAME = "future-dashboard-trade-selection";

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

export function normalizeTradeSelection(value) {
    return cleanString(value);
}

export function emitTradeSelection(value) {
    if (typeof window === "undefined") {
        return;
    }

    const tradeId = normalizeTradeSelection(value);

    window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
            detail: { tradeId },
        })
    );
}

export function subscribeTradeSelection(callback) {
    if (typeof window === "undefined") {
        return () => {};
    }

    const handler = (event) => {
        const tradeId = normalizeTradeSelection(event?.detail?.tradeId);
        callback(tradeId);
    };

    window.addEventListener(EVENT_NAME, handler);

    return () => {
        window.removeEventListener(EVENT_NAME, handler);
    };
}