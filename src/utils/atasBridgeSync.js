import { fetchNormalizedAtasAccounts } from "./atasBridgeApi";

export const ATAS_BRIDGE_ACCOUNTS_EVENT = "atas-bridge-accounts-updated";
export const ATAS_BRIDGE_STATUS_EVENT = "atas-bridge-status-updated";

let pollTimer = null;
let activeController = null;
let lastSerializedAccounts = "";
let lastStatusKey = "";

function dispatchWindowEvent(name, detail) {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(
        new CustomEvent(name, {
            detail,
        })
    );
}

function buildStatusPayload({ ok, count, error, updatedAt }) {
    return {
        ok: Boolean(ok),
        count: Number(count || 0),
        accountCount: Number(count || 0),
        connected: Boolean(ok) && Number(count || 0) > 0,
        error: error ? String(error) : "",
        updatedAt: updatedAt || new Date().toISOString(),
    };
}

function emitStatus(status) {
    const statusKey = JSON.stringify(status);

    if (statusKey === lastStatusKey) {
        return;
    }

    lastStatusKey = statusKey;

    dispatchWindowEvent(ATAS_BRIDGE_STATUS_EVENT, status);
}

function emitAccounts(accounts, meta = {}) {
    const normalizedAccounts = Array.isArray(accounts) ? accounts : [];
    const serialized = JSON.stringify(normalizedAccounts);
    const updatedAt = meta.updatedAt || new Date().toISOString();

    if (serialized !== lastSerializedAccounts) {
        lastSerializedAccounts = serialized;

        dispatchWindowEvent(ATAS_BRIDGE_ACCOUNTS_EVENT, {
            ok: true,
            connected: normalizedAccounts.length > 0,
            count: normalizedAccounts.length,
            accountCount: normalizedAccounts.length,
            accounts: normalizedAccounts,
            updatedAt,
        });
    }

    emitStatus(
        buildStatusPayload({
            ok: true,
            count: normalizedAccounts.length,
            updatedAt,
        })
    );
}

async function runPoll() {
    if (activeController) {
        activeController.abort();
    }

    activeController = new AbortController();

    try {
        const result = await fetchNormalizedAtasAccounts(activeController.signal);

        emitAccounts(result.accounts || [], {
            updatedAt: result.lastUpdatedAt || new Date().toISOString(),
        });
    } catch (error) {
        emitStatus(
            buildStatusPayload({
                ok: false,
                count: 0,
                error: error?.message || "ATAS Bridge nicht erreichbar",
                updatedAt: new Date().toISOString(),
            })
        );
    } finally {
        activeController = null;
    }
}

export function startAtasBridgePolling(intervalMs = 2000) {
    if (typeof window === "undefined") {
        return () => {};
    }

    if (pollTimer) {
        return () => stopAtasBridgePolling();
    }

    runPoll();

    pollTimer = window.setInterval(() => {
        runPoll();
    }, Math.max(1000, Number(intervalMs || 2000)));

    return () => stopAtasBridgePolling();
}

export function stopAtasBridgePolling() {
    if (typeof window !== "undefined" && pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }

    if (activeController) {
        activeController.abort();
        activeController = null;
    }
}

export function resetAtasBridgePollingState() {
    lastSerializedAccounts = "";
    lastStatusKey = "";
}