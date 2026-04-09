import { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "./pages/Dashboard";
import { formatDateTime } from "./utils/dateFormat";
import {
    addAccount,
    deleteAccount,
    detectAccountSize,
    formatAccountSizeLabel,
    getAccounts,
    getAccountGroups,
    getActiveAccountId,
    getFills,
    getImportedOrders,
    getOrders,
    linkEvalToPaAccount,
    normalizeAccountSize,
    setActiveAccountId as persistActiveAccountId,
    setAccountStatus,
    subscribeStorage,
    unlinkEvalFromPaAccount,
} from "./utils/storage";

const EMPTY_LIST = [];

const COLORS = {
    pageBg: "#020617",
    panelBg: "rgba(8, 15, 37, 0.92)",
    panelBgStrong: "rgba(20, 30, 55, 0.96)",
    border: "rgba(56, 189, 248, 0.20)",
    borderStrong: "rgba(56, 189, 248, 0.32)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#e0f2fe",
    text: "#dbeafe",
    textSoft: "#94a3b8",
    cyan: "#22d3ee",
    green: "#4ade80",
    orange: "#fb923c",
    red: "#f87171",
    purple: "#a78bfa",
    yellow: "#facc15",
    gold: "#facc15",
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

    const safeValue = cleanString(value).replace(",", ".");
    const parsed = Number(safeValue);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatWholeNumber(value) {
    return toNumber(value, 0).toLocaleString("de-CH", {
        maximumFractionDigits: 0,
    });
}

function getAccountSizeDisplay(value) {
    return formatAccountSizeLabel(value) || formatWholeNumber(value || 0);
}

function getStatusLabel(status) {
    const map = {
        open: "Offen",
        active: "Aktiv",
        passed: "Bestanden",
        failed: "Failed",
        archived: "Archiv",
    };

    return map[cleanString(status).toLowerCase()] || "Offen";
}

function getPhaseLabel(phase) {
    const map = {
        eval: "EVAL",
        pa: "PA",
    };

    return map[cleanString(phase).toLowerCase()] || "EVAL";
}

function getProductTypeLabel(productType) {
    const map = {
        eod: "EOD",
        intraday: "Intraday",
    };

    return map[cleanString(productType).toLowerCase()] || "EOD";
}

function getStatusColor(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "active") {
        return COLORS.green;
    }

    if (normalized === "passed") {
        return COLORS.cyan;
    }

    if (normalized === "failed") {
        return COLORS.red;
    }

    if (normalized === "archived") {
        return COLORS.orange;
    }

    return COLORS.yellow;
}

function getGroupStatusMeta(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "pa_active") {
        return {
            label: "PA aktiv",
            color: COLORS.green,
        };
    }

    if (normalized === "pa_passed") {
        return {
            label: "PA bestanden",
            color: COLORS.cyan,
        };
    }

    if (normalized === "pa_archived") {
        return {
            label: "PA archiviert",
            color: COLORS.orange,
        };
    }

    if (normalized === "eval_passed") {
        return {
            label: "EVAL bestanden",
            color: COLORS.purple,
        };
    }

    if (normalized === "failed") {
        return {
            label: "Gruppe failed",
            color: COLORS.red,
        };
    }

    if (normalized === "archived") {
        return {
            label: "Gruppe archiviert",
            color: COLORS.orange,
        };
    }

    return {
        label: "Gruppe offen",
        color: COLORS.yellow,
    };
}

function getLifecycleSummary(account) {
    if (!account) {
        return [];
    }

    return [
        {
            label: "Created",
            value: formatDateTime(account.createdAt),
        },
        {
            label: "Status geändert",
            value: formatDateTime(account.statusChangedAt),
        },
        {
            label: "Phase geändert",
            value: formatDateTime(account.phaseChangedAt),
        },
        {
            label: "Linked",
            value: formatDateTime(account.linkedAt),
        },
        {
            label: "Unlinked",
            value: formatDateTime(account.unlinkedAt),
        },
        {
            label: "Passed",
            value: formatDateTime(account.passedAt),
        },
        {
            label: "Failed",
            value: formatDateTime(account.failedAt),
        },
        {
            label: "Archived",
            value: formatDateTime(account.archivedAt),
        },
        {
            label: "Lifecycle Version",
            value: account.lifecycleVersion ?? 0,
        },
    ];
}

function getLinkedPaAccounts(accounts, evalAccountId) {
    const evalId = cleanString(evalAccountId);

    if (!evalId) {
        return EMPTY_LIST;
    }

    return accounts.filter((account) => {
        return (
            cleanString(account.accountPhase).toLowerCase() === "pa" &&
            cleanString(account.linkedEvalAccountId) === evalId
        );
    });
}

function hasLinkedPaActiveOrPassed(accounts, evalAccountId) {
    return getLinkedPaAccounts(accounts, evalAccountId).some((account) => {
        const status = cleanString(account.accountStatus).toLowerCase();
        return status === "active" || status === "passed";
    });
}

function getEffectiveAccountStatus(account, accounts) {
    if (!account) {
        return "open";
    }

    const rawStatus = cleanString(account.accountStatus).toLowerCase() || "open";
    const phase = cleanString(account.accountPhase).toLowerCase();

    if (phase === "eval" && hasLinkedPaActiveOrPassed(accounts, account.id)) {
        return "archived";
    }

    return rawStatus;
}

function getLinkedRelationLabel(account, accounts) {
    if (!account) {
        return "–";
    }

    const phase = cleanString(account.accountPhase).toLowerCase();

    if (phase === "eval") {
        const linkedPas = getLinkedPaAccounts(accounts, account.id);

        if (!linkedPas.length) {
            return "Keine PA Verknüpfung";
        }

        return linkedPas
            .map((item) => item.displayName || item.id)
            .join(", ");
    }

    if (phase === "pa") {
        return cleanString(account.linkedEvalAccountId) || "Keine EVAL Verknüpfung";
    }

    return "–";
}

function loadViewState() {
    const accounts = getAccounts();
    const groups = getAccountGroups();
    const storedActiveAccountId = cleanString(getActiveAccountId());

    const activeExists = accounts.some(
        (account) => account.id === storedActiveAccountId
    );

    const fallbackActiveAccountId = activeExists
        ? storedActiveAccountId
        : cleanString(accounts[0]?.id);

    return {
        accounts,
        groups,
        activeAccountId: fallbackActiveAccountId,
    };
}

function HeaderBrand() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minWidth: 220,
            }}
        >
            <div
                style={{
                    width: 62,
                    height: 62,
                    borderRadius: 18,
                    border: "1px solid rgba(125, 211, 252, 0.28)",
                    background:
                        "linear-gradient(180deg, rgba(125,211,252,0.16) 0%, rgba(34,211,238,0.08) 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 20px rgba(34, 211, 238, 0.12)",
                }}
            >
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M5 17L10 12L13 15L19 9"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M16 9H19V12"
                        stroke="#facc15"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="3"
                        stroke="rgba(148,163,184,0.45)"
                        strokeWidth="1.2"
                    />
                </svg>
            </div>

            <div style={{ lineHeight: 1.15 }}>
                <div
                    style={{
                        color: COLORS.gold,
                        fontWeight: 900,
                        fontSize: 14,
                        letterSpacing: "0.08em",
                    }}
                >
                    TRADING
                </div>
                <div
                    style={{
                        color: COLORS.gold,
                        fontWeight: 900,
                        fontSize: 14,
                        letterSpacing: "0.08em",
                    }}
                >
                    DASHBOARD
                </div>
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 12,
                        marginTop: 6,
                    }}
                >
                    Focus. Risiko.
                </div>
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 12,
                    }}
                >
                    Ausführung.
                </div>
            </div>
        </div>
    );
}

function CommunityBadge() {
    return (
        <div
            style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "10px 22px",
                borderRadius: 18,
                border: `1px solid ${COLORS.borderStrong}`,
                background:
                    "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                boxShadow:
                    "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
                marginBottom: 12,
            }}
        >
            <div
                style={{
                    color: COLORS.gold,
                    fontSize: 20,
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: "0.02em",
                    textShadow:
                        "0 1px 0 rgba(255,255,255,0.10), 0 6px 16px rgba(0,0,0,0.32)",
                }}
            >
                Futures.Robby
            </div>

            <div
                style={{
                    color: COLORS.cyan,
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    textShadow: "0 0 12px rgba(34,211,238,0.18)",
                }}
            >
                Exclusive for Community
            </div>
        </div>
    );
}

function HeroTitle3D() {
    const baseTextStyle = {
        fontSize: 58,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: "-0.03em",
        whiteSpace: "nowrap",
        userSelect: "none",
    };

    return (
        <div
            style={{
                position: "relative",
                display: "inline-block",
                padding: "6px 18px 18px",
                perspective: 1200,
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    ...baseTextStyle,
                    position: "absolute",
                    inset: "0 auto auto 0",
                    transform: "translate(0px, 12px)",
                    color: "rgba(15, 23, 42, 0.95)",
                    textShadow:
                        "0 2px 0 rgba(2, 6, 23, 0.95), 0 4px 0 rgba(2, 6, 23, 0.92), 0 8px 18px rgba(0, 0, 0, 0.55)",
                    pointerEvents: "none",
                }}
            >
                <span>Future </span>
                <span>Dashboard Execution</span>
            </div>

            <div
                aria-hidden="true"
                style={{
                    ...baseTextStyle,
                    position: "absolute",
                    inset: "0 auto auto 0",
                    transform: "translate(0px, 6px)",
                    color: "rgba(250, 204, 21, 0.18)",
                    textShadow: "0 0 18px rgba(250, 204, 21, 0.16)",
                    pointerEvents: "none",
                }}
            >
                <span>Future </span>
                <span>Dashboard Execution</span>
            </div>

            <div
                style={{
                    ...baseTextStyle,
                    position: "relative",
                    transform: "translateZ(0)",
                    textShadow:
                        "0 1px 0 rgba(255,255,255,0.10), 0 2px 0 rgba(255,255,255,0.08), 0 3px 0 rgba(2,6,23,0.55), 0 10px 24px rgba(0,0,0,0.45), 0 0 18px rgba(255,255,255,0.08)",
                }}
            >
                <span style={{ color: "#f8fafc" }}>Future </span>
                <span
                    style={{
                        color: COLORS.gold,
                        textShadow:
                            "0 1px 0 rgba(255,255,255,0.10), 0 2px 0 rgba(250,204,21,0.10), 0 3px 0 rgba(120,53,15,0.55), 0 10px 24px rgba(0,0,0,0.45), 0 0 20px rgba(250,204,21,0.14)",
                    }}
                >
                    Dashboard Execution
                </span>
            </div>
        </div>
    );
}

function HeaderHero({
    activeAccount,
    activeAccountPhaseLabel,
    activeAccountStatusLabel,
    activeAccountStatusColor,
    activeLinkedRelation,
}) {
    const hasActiveAccount = Boolean(activeAccount);

    return (
        <header
            style={{
                background:
                    "linear-gradient(90deg, rgba(31, 41, 55, 0.92) 0%, rgba(15, 23, 42, 0.98) 30%, rgba(17, 24, 39, 0.98) 100%)",
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 28,
                padding: "26px 26px 28px",
                boxShadow: COLORS.shadow,
                overflow: "hidden",
                position: "relative",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(circle at left center, rgba(34,211,238,0.12), transparent 35%)",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "260px 1fr 300px",
                    alignItems: "center",
                    gap: 16,
                }}
            >
                <div style={{ justifySelf: "start" }}>
                    <HeaderBrand />
                </div>

                <div
                    style={{
                        textAlign: "center",
                        justifySelf: "center",
                        display: "grid",
                        justifyItems: "center",
                    }}
                >
                    <CommunityBadge />
                    <HeroTitle3D />

                    <div
                        style={{
                            color: "#cbd5e1",
                            fontSize: 18,
                            marginTop: 10,
                        }}
                    >
                        Disziplin vor Emotion. Klare Ausführung vor jeder Entscheidung.
                    </div>
                </div>

                <div
                    style={{
                        justifySelf: "end",
                        width: "100%",
                        maxWidth: 300,
                        display: "grid",
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            border: `1px solid ${COLORS.borderStrong}`,
                            borderRadius: 18,
                            padding: 14,
                            background: "rgba(255,255,255,0.03)",
                        }}
                    >
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 11,
                                marginBottom: 6,
                            }}
                        >
                            Aktiver Account
                        </div>
                        <div
                            style={{
                                color: hasActiveAccount ? COLORS.title : COLORS.textSoft,
                                fontWeight: 800,
                                fontSize: 14,
                                wordBreak: "break-word",
                            }}
                        >
                            {activeAccount?.displayName || activeAccount?.id || "–"}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 18,
                                padding: 14,
                                background: "rgba(255,255,255,0.03)",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 11,
                                    marginBottom: 6,
                                }}
                            >
                                Phase
                            </div>
                            <div
                                style={{
                                    color: hasActiveAccount ? COLORS.text : COLORS.textSoft,
                                    fontWeight: 800,
                                }}
                            >
                                {activeAccountPhaseLabel}
                            </div>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${activeAccountStatusColor}`,
                                borderRadius: 18,
                                padding: 14,
                                background: "rgba(255,255,255,0.03)",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 11,
                                    marginBottom: 6,
                                }}
                            >
                                Status
                            </div>
                            <div
                                style={{
                                    color: hasActiveAccount
                                        ? activeAccountStatusColor
                                        : COLORS.textSoft,
                                    fontWeight: 800,
                                }}
                            >
                                {activeAccountStatusLabel}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${COLORS.borderStrong}`,
                            borderRadius: 18,
                            padding: 14,
                            background: "rgba(255,255,255,0.03)",
                        }}
                    >
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 11,
                                marginBottom: 6,
                            }}
                        >
                            Verknüpfung
                        </div>
                        <div
                            style={{
                                color: hasActiveAccount ? COLORS.text : COLORS.textSoft,
                                fontWeight: 700,
                                fontSize: 13,
                                wordBreak: "break-word",
                            }}
                        >
                            {activeLinkedRelation}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

function StatusButtons({ account, accounts, onChange }) {
    const effectiveStatus = getEffectiveAccountStatus(account, accounts);
    const phase = cleanString(account.accountPhase).toLowerCase();
    const isEvalLockedByPa =
        phase === "eval" && hasLinkedPaActiveOrPassed(accounts, account.id);

    const statuses = isEvalLockedByPa
        ? ["archived", "failed"]
        : ["open", "active", "passed", "failed", "archived"];

    return (
        <div
            style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
            }}
        >
            {statuses.map((status) => {
                const active = effectiveStatus === status;

                return (
                    <button
                        key={status}
                        type="button"
                        onClick={() => onChange(account.id, status)}
                        style={{
                            flex: "1 1 110px",
                            minWidth: 0,
                            textAlign: "center",
                            border: `1px solid ${active ? getStatusColor(status) : COLORS.borderStrong
                                }`,
                            background: active
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(255,255,255,0.03)",
                            color: active ? getStatusColor(status) : COLORS.text,
                            borderRadius: 12,
                            padding: "9px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {getStatusLabel(status)}
                    </button>
                );
            })}
        </div>
    );
}

function AccountCard({
    account,
    accounts,
    isActive,
    onSelect,
    onDelete,
    onStatusChange,
    onUnlink,
    showUnlink,
}) {
    const lifecycle = getLifecycleSummary(account);
    const effectiveStatus = getEffectiveAccountStatus(account, accounts);
    const linkedRelation = getLinkedRelationLabel(account, accounts);

    return (
        <div
            style={{
                background: isActive ? COLORS.panelBgStrong : COLORS.panelBg,
                border: `1px solid ${isActive ? COLORS.cyan : COLORS.border}`,
                borderRadius: 18,
                padding: 16,
                boxShadow: COLORS.shadow,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            marginBottom: 8,
                        }}
                    >
                        <div
                            style={{
                                color: COLORS.title,
                                fontSize: 18,
                                fontWeight: 800,
                                wordBreak: "break-word",
                            }}
                        >
                            {account.displayName || account.id}
                        </div>

                        <span
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 999,
                                padding: "4px 10px",
                                fontSize: 11,
                                color: COLORS.textSoft,
                            }}
                        >
                            {getPhaseLabel(account.accountPhase)}
                        </span>

                        <span
                            style={{
                                border: `1px solid ${getStatusColor(effectiveStatus)}`,
                                borderRadius: 999,
                                padding: "4px 10px",
                                fontSize: 11,
                                color: getStatusColor(effectiveStatus),
                            }}
                        >
                            {getStatusLabel(effectiveStatus)}
                        </span>

                        <span
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 999,
                                padding: "4px 10px",
                                fontSize: 11,
                                color: COLORS.textSoft,
                            }}
                        >
                            {getProductTypeLabel(account.productType)}
                        </span>
                    </div>

                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 13,
                            marginBottom: 6,
                            wordBreak: "break-word",
                        }}
                    >
                        ID: {account.id}
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: 8,
                            marginTop: 12,
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 14,
                                padding: 10,
                            }}
                        >
                            <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
                                Account Size
                            </div>
                            <div style={{ color: COLORS.text, fontWeight: 700 }}>
                                {getAccountSizeDisplay(account.accountSize || 0)}
                            </div>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 14,
                                padding: 10,
                            }}
                        >
                            <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
                                Current Balance
                            </div>
                            <div style={{ color: COLORS.text, fontWeight: 700 }}>
                                {formatWholeNumber(account.currentBalance || 0)}
                            </div>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 14,
                                padding: 10,
                            }}
                        >
                            <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
                                Verknüpfung
                            </div>
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontWeight: 700,
                                    wordBreak: "break-word",
                                }}
                            >
                                {linkedRelation}
                            </div>
                        </div>
                    </div>

                    <StatusButtons
                        account={account}
                        accounts={accounts}
                        onChange={onStatusChange}
                    />
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => onSelect(account.id)}
                        style={{
                            border: `1px solid ${COLORS.cyan}`,
                            background: isActive
                                ? "rgba(34, 211, 238, 0.18)"
                                : "transparent",
                            color: COLORS.cyan,
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Öffnen
                    </button>

                    {showUnlink ? (
                        <button
                            type="button"
                            onClick={onUnlink}
                            style={{
                                border: `1px solid ${COLORS.orange}`,
                                background: "transparent",
                                color: COLORS.orange,
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            Entkoppeln
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => onDelete(account.id)}
                        style={{
                            border: `1px solid ${COLORS.red}`,
                            background: "transparent",
                            color: COLORS.red,
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Löschen
                    </button>
                </div>
            </div>

            <div
                style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 8,
                }}
            >
                {lifecycle.map((item) => (
                    <div
                        key={item.label}
                        style={{
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 12,
                            padding: 10,
                        }}
                    >
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 11,
                                marginBottom: 4,
                            }}
                        >
                            {item.label}
                        </div>
                        <div
                            style={{
                                color: COLORS.text,
                                fontSize: 13,
                                fontWeight: 600,
                                wordBreak: "break-word",
                            }}
                        >
                            {item.value}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GroupCard({
    group,
    accounts,
    activeAccountId,
    onSelectAccount,
    onDeleteAccount,
    onStatusChange,
    onUnlink,
}) {
    const statusMeta = getGroupStatusMeta(group.groupStatus);
    const evalAccount = group.evalAccount;
    const paAccounts = Array.isArray(group.paAccounts) ? group.paAccounts : [];

    return (
        <div
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 24,
                padding: 20,
                boxShadow: COLORS.shadow,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 16,
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 20,
                            fontWeight: 800,
                        }}
                    >
                        {evalAccount
                            ? `Gruppe ${evalAccount.displayName || evalAccount.id}`
                            : "PA Gruppe ohne EVAL"}
                    </div>

                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 13,
                            marginTop: 4,
                        }}
                    >
                        EVAL und zugehörige PA Accounts
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${statusMeta.color}`,
                        color: statusMeta.color,
                        borderRadius: 999,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                    }}
                >
                    {statusMeta.label}
                </div>
            </div>

            {evalAccount ? (
                <div style={{ marginBottom: 16 }}>
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 8,
                        }}
                    >
                        EVAL
                    </div>

                    <AccountCard
                        account={evalAccount}
                        accounts={accounts}
                        isActive={activeAccountId === evalAccount.id}
                        onSelect={onSelectAccount}
                        onDelete={onDeleteAccount}
                        onStatusChange={onStatusChange}
                        showUnlink={false}
                    />
                </div>
            ) : null}

            <div>
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 8,
                    }}
                >
                    PA Accounts
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 12,
                    }}
                >
                    {paAccounts.length ? (
                        paAccounts.map((paAccount) => (
                            <AccountCard
                                key={paAccount.id}
                                account={paAccount}
                                accounts={accounts}
                                isActive={activeAccountId === paAccount.id}
                                onSelect={onSelectAccount}
                                onDelete={onDeleteAccount}
                                onStatusChange={onStatusChange}
                                onUnlink={() =>
                                    onUnlink(evalAccount?.id || "", paAccount.id)
                                }
                                showUnlink={
                                    Boolean(evalAccount?.id) &&
                                    paAccount.linkedEvalAccountId === evalAccount?.id
                                }
                            />
                        ))
                    ) : (
                        <div
                            style={{
                                border: `1px dashed ${COLORS.borderStrong}`,
                                borderRadius: 18,
                                padding: 18,
                                color: COLORS.textSoft,
                                fontSize: 14,
                            }}
                        >
                            Noch kein PA Account verknüpft
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [viewState, setViewState] = useState(() => loadViewState());
    const [newAccountId, setNewAccountId] = useState("");
    const [newAccountPhase, setNewAccountPhase] = useState("eval");
    const [newProductType, setNewProductType] = useState("eod");
    const [newAccountSizeOverride, setNewAccountSizeOverride] = useState("");
    const [linkEvalId, setLinkEvalId] = useState("");
    const [linkPaId, setLinkPaId] = useState("");

    const detectedAccountSize = useMemo(() => {
        return detectAccountSize(newAccountId);
    }, [newAccountId]);

    const displayedAccountSize = useMemo(() => {
        const manualValue = cleanString(newAccountSizeOverride);

        if (manualValue) {
            return manualValue;
        }

        if (detectedAccountSize > 0) {
            return String(detectedAccountSize);
        }

        return "";
    }, [newAccountSizeOverride, detectedAccountSize]);

    const syncFromStorage = useCallback(() => {
        setViewState(loadViewState());
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeStorage(() => {
            syncFromStorage();
        });

        return unsubscribe;
    }, [syncFromStorage]);

    const accounts = viewState.accounts;
    const groups = viewState.groups;
    const activeAccountId = viewState.activeAccountId;

    const activeAccount = useMemo(() => {
        return accounts.find((account) => account.id === activeAccountId) || null;
    }, [accounts, activeAccountId]);

    const hasActiveAccount = Boolean(activeAccount);

    const activeAccountPhaseLabel = useMemo(() => {
        return hasActiveAccount ? getPhaseLabel(activeAccount.accountPhase) : "–";
    }, [activeAccount, hasActiveAccount]);

    const activeAccountStatus = useMemo(() => {
        return hasActiveAccount
            ? getEffectiveAccountStatus(activeAccount, accounts)
            : "";
    }, [activeAccount, accounts, hasActiveAccount]);

    const activeAccountStatusLabel = useMemo(() => {
        return hasActiveAccount ? getStatusLabel(activeAccountStatus) : "–";
    }, [activeAccountStatus, hasActiveAccount]);

    const activeAccountStatusColor = useMemo(() => {
        return hasActiveAccount ? getStatusColor(activeAccountStatus) : COLORS.borderStrong;
    }, [activeAccountStatus, hasActiveAccount]);

    const activeLinkedRelation = useMemo(() => {
        return hasActiveAccount ? getLinkedRelationLabel(activeAccount, accounts) : "–";
    }, [activeAccount, accounts, hasActiveAccount]);

    const evalAccounts = useMemo(() => {
        return accounts.filter((account) => {
            return cleanString(account.accountPhase).toLowerCase() === "eval";
        });
    }, [accounts]);

    const paAccounts = useMemo(() => {
        return accounts.filter((account) => {
            return cleanString(account.accountPhase).toLowerCase() === "pa";
        });
    }, [accounts]);

    const storedOrders = activeAccountId ? getOrders(activeAccountId) : EMPTY_LIST;
    const importedOrders = activeAccountId
        ? getImportedOrders(activeAccountId)
        : EMPTY_LIST;
    const storedFills = activeAccountId ? getFills(activeAccountId) : EMPTY_LIST;

    const resolvedOrders =
        Array.isArray(importedOrders) && importedOrders.length
            ? importedOrders
            : Array.isArray(storedOrders)
                ? storedOrders
                : EMPTY_LIST;

    const simulationTrades = EMPTY_LIST;

    const handleSelectAccount = useCallback((accountId) => {
        const nextId = cleanString(accountId);

        setViewState((previous) => ({
            ...previous,
            activeAccountId: nextId,
        }));

        persistActiveAccountId(nextId);
    }, []);

    const handleNewAccountIdChange = useCallback((event) => {
        setNewAccountId(event.target.value);
        setNewAccountSizeOverride("");
    }, []);

    const handleNewAccountSizeChange = useCallback((event) => {
        setNewAccountSizeOverride(event.target.value);
    }, []);

    const handleAddAccount = useCallback(() => {
        const id = cleanString(newAccountId);
        const parsedSize = normalizeAccountSize(
            toNumber(displayedAccountSize, 0) ||
            detectAccountSize(displayedAccountSize) ||
            detectAccountSize(newAccountId),
            0
        );

        if (!id) {
            return;
        }

        const created = addAccount({
            id,
            displayName: id,
            accountPhase: newAccountPhase,
            productType: newProductType,
            accountSize: parsedSize,
            currentBalance: parsedSize,
            startingBalance: parsedSize,
            accountStatus: "open",
        });

        if (created?.id) {
            persistActiveAccountId(created.id);
            setViewState(loadViewState());
        }

        setNewAccountId("");
        setNewAccountSizeOverride("");
    }, [newAccountId, newAccountPhase, newProductType, displayedAccountSize]);

    const handleDeleteAccount = useCallback((accountId) => {
        const removed = deleteAccount(accountId);

        if (!removed) {
            return;
        }

        const nextState = loadViewState();
        setViewState(nextState);
        persistActiveAccountId(nextState.activeAccountId || "");
    }, []);

    const handleStatusChange = useCallback(
        (accountId, nextStatus) => {
            const targetAccount = accounts.find((account) => account.id === accountId);

            if (!targetAccount) {
                return;
            }

            const normalizedNextStatus = cleanString(nextStatus).toLowerCase();
            const phase = cleanString(targetAccount.accountPhase).toLowerCase();
            const effectiveStatus = getEffectiveAccountStatus(targetAccount, accounts);

            if (
                phase === "eval" &&
                effectiveStatus === "archived" &&
                normalizedNextStatus !== "archived" &&
                normalizedNextStatus !== "failed"
            ) {
                return;
            }

            setAccountStatus(accountId, normalizedNextStatus);

            if (
                phase === "pa" &&
                (normalizedNextStatus === "active" ||
                    normalizedNextStatus === "passed")
            ) {
                const linkedEvalId = cleanString(targetAccount.linkedEvalAccountId);

                if (linkedEvalId) {
                    setAccountStatus(linkedEvalId, "archived");
                }
            }

            setViewState(loadViewState());
        },
        [accounts]
    );

    const handleLink = useCallback(() => {
        const evalId = cleanString(linkEvalId);
        const paId = cleanString(linkPaId);

        if (!evalId || !paId) {
            return;
        }

        const targetPa = accounts.find((account) => account.id === paId);

        linkEvalToPaAccount(evalId, paId);

        if (targetPa) {
            const paStatus = cleanString(targetPa.accountStatus).toLowerCase();

            if (paStatus === "active" || paStatus === "passed") {
                setAccountStatus(evalId, "archived");
            }
        }

        setViewState(loadViewState());
        setLinkEvalId("");
        setLinkPaId("");
    }, [accounts, linkEvalId, linkPaId]);

    const handleUnlink = useCallback(
        (evalId, paId) => {
            const cleanEvalId = cleanString(evalId);
            const cleanPaId = cleanString(paId);

            if (!cleanEvalId || !cleanPaId) {
                return;
            }

            unlinkEvalFromPaAccount(cleanEvalId, cleanPaId);
            setViewState(loadViewState());

            if (linkEvalId === cleanEvalId) {
                setLinkEvalId("");
            }

            if (linkPaId === cleanPaId) {
                setLinkPaId("");
            }
        },
        [linkEvalId, linkPaId]
    );

    return (
        <div
            style={{
                minHeight: "100vh",
                background: COLORS.pageBg,
                color: COLORS.text,
                padding: 20,
                fontFamily: "Inter, Arial, sans-serif",
            }}
        >
            <div
                style={{
                    maxWidth: 1680,
                    margin: "0 auto",
                    display: "grid",
                    gap: 18,
                }}
            >
                <HeaderHero
                    activeAccount={activeAccount}
                    activeAccountPhaseLabel={activeAccountPhaseLabel}
                    activeAccountStatusLabel={activeAccountStatusLabel}
                    activeAccountStatusColor={activeAccountStatusColor}
                    activeLinkedRelation={activeLinkedRelation}
                />

                <section
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 24,
                        padding: 20,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 18,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 22,
                                    fontWeight: 800,
                                }}
                            >
                                Account Switcher
                            </div>
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 13,
                                    marginTop: 4,
                                }}
                            >
                                EVAL und PA Gruppen mit direkter Entkoppeln Funktion
                            </div>
                        </div>

                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 13,
                            }}
                        >
                            Aktiver Account:{" "}
                            {activeAccount?.displayName || activeAccount?.id || "–"}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 18,
                                padding: 14,
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontWeight: 700,
                                }}
                            >
                                Neuer Account
                            </div>

                            <input
                                value={newAccountId}
                                onChange={handleNewAccountIdChange}
                                placeholder="Account einfügen"
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            />

                            <select
                                value={newAccountPhase}
                                onChange={(event) => setNewAccountPhase(event.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            >
                                <option value="eval">EVAL</option>
                                <option value="pa">PA</option>
                            </select>

                            <select
                                value={newProductType}
                                onChange={(event) => setNewProductType(event.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            >
                                <option value="eod">EOD</option>
                                <option value="intraday">Intraday</option>
                            </select>

                            <input
                                value={displayedAccountSize}
                                onChange={handleNewAccountSizeChange}
                                placeholder="z. B. 25000"
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            />

                            <button
                                type="button"
                                onClick={handleAddAccount}
                                style={{
                                    border: `1px solid ${COLORS.green}`,
                                    color: COLORS.green,
                                    background: "transparent",
                                    borderRadius: 12,
                                    padding: "12px 14px",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                }}
                            >
                                Account hinzufügen
                            </button>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 18,
                                padding: 14,
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontWeight: 700,
                                }}
                            >
                                EVAL mit PA verknüpfen
                            </div>

                            <select
                                value={linkEvalId}
                                onChange={(event) => setLinkEvalId(event.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            >
                                <option value="">EVAL wählen</option>
                                {evalAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.displayName || account.id}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={linkPaId}
                                onChange={(event) => setLinkPaId(event.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            >
                                <option value="">PA wählen</option>
                                {paAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.displayName || account.id}
                                    </option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={handleLink}
                                style={{
                                    border: `1px solid ${COLORS.cyan}`,
                                    color: COLORS.cyan,
                                    background: "transparent",
                                    borderRadius: 12,
                                    padding: "12px 14px",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                }}
                            >
                                Verknüpfen
                            </button>

                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                }}
                            >
                                Entkoppeln ist direkt in jeder PA Karte sichtbar, sobald eine echte
                                Verknüpfung besteht.
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gap: 16,
                        }}
                    >
                        {groups.length ? (
                            groups.map((group) => (
                                <GroupCard
                                    key={group.id}
                                    group={group}
                                    accounts={accounts}
                                    activeAccountId={activeAccountId}
                                    onSelectAccount={handleSelectAccount}
                                    onDeleteAccount={handleDeleteAccount}
                                    onStatusChange={handleStatusChange}
                                    onUnlink={handleUnlink}
                                />
                            ))
                        ) : (
                            <div
                                style={{
                                    border: `1px dashed ${COLORS.borderStrong}`,
                                    borderRadius: 24,
                                    padding: 24,
                                    color: COLORS.textSoft,
                                    textAlign: "center",
                                }}
                            >
                                Noch keine Accounts vorhanden
                            </div>
                        )}
                    </div>
                </section>

                <section
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 24,
                        padding: 8,
                        boxShadow: COLORS.shadow,
                    }}
                >
                    <Dashboard
                        accounts={accounts}
                        accountGroups={groups}
                        activeAccount={activeAccount}
                        activeAccountId={activeAccountId}
                        selectedAccount={activeAccount}
                        selectedAccountId={activeAccountId}
                        orders={resolvedOrders}
                        fills={Array.isArray(storedFills) ? storedFills : EMPTY_LIST}
                        simulationTrades={simulationTrades}
                    />
                </section>
            </div>
        </div>
    );
}