import { useCallback, useMemo, useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import {
    addAccount,
    deleteAccount,
    getAccounts,
    upsertDetectedAccount,
} from "./utils/storage";

const COLORS = {
    pageBg: "#050816",
    panelBg: "rgba(255, 255, 255, 0.04)",
    panelBgStrong: "rgba(255, 255, 255, 0.06)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.30)",
    title: "#7dd3fc",
    text: "#dbeafe",
    muted: "#94a3b8",
    accentStrong: "#7dd3fc",
    accentSoft: "#22d3ee",
    gold: "#facc15",
    buttonText: "#04111d",
    danger: "#f87171",
    dangerBg: "rgba(248, 113, 113, 0.14)",
    shadow: "0 0 40px rgba(0, 0, 0, 0.30)",
};

const pageStyle = {
    minHeight: "100vh",
    background: COLORS.pageBg,
    color: COLORS.text,
};

const contentStyle = {
    maxWidth: "1600px",
    margin: "0 auto",
    padding: "18px 16px 24px",
};

const headerWrapStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "28px",
    background: COLORS.panelBg,
    boxShadow: COLORS.shadow,
    overflow: "hidden",
    marginBottom: "16px",
};

const heroStyle = {
    padding: "22px 22px 18px",
    borderBottom: `1px solid ${COLORS.border}`,
    background:
        "radial-gradient(circle at top left, rgba(34, 211, 238, 0.14), transparent 28%), radial-gradient(circle at top right, rgba(250, 204, 21, 0.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
};

const heroGridStyle = {
    display: "grid",
    gridTemplateColumns: "220px 1fr 260px",
    alignItems: "center",
    gap: "16px",
};

const logoWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    minWidth: 0,
};

const logoBadgeStyle = {
    width: "72px",
    height: "72px",
    borderRadius: "22px",
    border: `1px solid ${COLORS.borderStrong}`,
    background:
        "linear-gradient(180deg, rgba(125, 211, 252, 0.16), rgba(34, 211, 238, 0.08))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 24px rgba(34, 211, 238, 0.16)",
    flexShrink: 0,
};

const logoTextWrapStyle = {
    display: "grid",
    gap: "4px",
    minWidth: 0,
};

const logoKickerStyle = {
    color: COLORS.gold,
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    lineHeight: 1.2,
};

const logoSubStyle = {
    color: COLORS.muted,
    fontSize: "12px",
    lineHeight: 1.3,
    fontWeight: "600",
};

const titleWrapStyle = {
    textAlign: "center",
    display: "grid",
    gap: "8px",
};

const titleStyle = {
    margin: 0,
    color: "#e0f2fe",
    fontSize: "34px",
    fontWeight: "900",
    lineHeight: 1.05,
    letterSpacing: "0.02em",
    textShadow: "0 0 18px rgba(125, 211, 252, 0.18)",
};

const titleAccentStyle = {
    color: COLORS.gold,
};

const quoteStyle = {
    margin: 0,
    color: COLORS.muted,
    fontSize: "14px",
    lineHeight: 1.45,
    fontWeight: "600",
};

const heroRightStyle = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    minWidth: 0,
};

const pulseCardStyle = {
    width: "100%",
    maxWidth: "240px",
    padding: "12px 18px",
    borderRadius: "16px",
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    textAlign: "center",
    boxSizing: "border-box",
    overflow: "hidden",
};

const pulseLabelStyle = {
    display: "block",
    width: "100%",
    textAlign: "center",
    color: COLORS.muted,
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: "6px",
    lineHeight: 1.25,
};

const pulseValueStyle = {
    display: "block",
    width: "100%",
    textAlign: "center",
    color: COLORS.accentStrong,
    fontSize: "16px",
    fontWeight: "900",
    lineHeight: 1.2,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

const switcherWrapStyle = {
    padding: "18px 20px 20px",
};

const switcherHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
};

const switcherTitleStyle = {
    color: COLORS.title,
    fontSize: "14px",
    fontWeight: "800",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1.2,
};

const switcherMetaStyle = {
    color: COLORS.muted,
    fontSize: "13px",
    lineHeight: 1.35,
};

const addRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) 180px",
    gap: "12px",
    marginBottom: "16px",
};

const inputStyle = {
    width: "100%",
    background: "#000",
    color: COLORS.text,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "18px",
    padding: "18px 16px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "15px",
};

const addButtonStyle = {
    width: "100%",
    background: COLORS.accentStrong,
    color: COLORS.buttonText,
    border: "none",
    borderRadius: "18px",
    padding: "18px 16px",
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "15px",
    boxShadow: "0 0 20px rgba(125, 211, 252, 0.22)",
};

const accountsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
};

const accountCardBaseStyle = {
    borderRadius: "22px",
    padding: "14px",
    minWidth: 0,
    display: "grid",
    gap: "12px",
    transition: "all 0.18s ease",
};

const accountHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
};

const accountIdStyle = {
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: 1.25,
    wordBreak: "break-word",
};

const accountMetaGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "8px",
};

const accountMetaCardStyle = {
    borderRadius: "16px",
    padding: "12px 10px",
    textAlign: "center",
    background: "rgba(255, 255, 255, 0.03)",
    border: `1px solid ${COLORS.border}`,
};

const accountMetaLabelStyle = {
    color: COLORS.muted,
    fontSize: "11px",
    lineHeight: 1.2,
    marginBottom: "5px",
};

const accountMetaValueStyle = {
    color: COLORS.text,
    fontSize: "13px",
    fontWeight: "800",
    lineHeight: 1.25,
    wordBreak: "break-word",
};

const accountActionsStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 92px",
    gap: "10px",
};

const selectButtonStyle = {
    width: "100%",
    borderRadius: "16px",
    padding: "14px 14px",
    border: "none",
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "13px",
};

const deleteButtonStyle = {
    borderRadius: "16px",
    padding: "14px 14px",
    border: `1px solid rgba(248, 113, 113, 0.30)`,
    background: COLORS.dangerBg,
    color: COLORS.danger,
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "13px",
};

const emptyStateStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "20px",
    background: COLORS.panelBgStrong,
    padding: "24px",
    textAlign: "center",
    color: COLORS.muted,
};

function formatCurrency(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return "-";
    }

    return `${numericValue.toLocaleString("de-DE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })} $`;
}

function sanitizeAccountId(value) {
    return String(value || "").trim().toUpperCase();
}

function getResolvedDetectedAccountId(detail) {
    if (!detail || typeof detail !== "object") {
        return "";
    }

    return sanitizeAccountId(
        detail.resolvedAccountId || detail.accountName || detail.accountId || ""
    );
}

function getAccountCardStyle(isActive) {
    return {
        ...accountCardBaseStyle,
        border: `1px solid ${isActive ? COLORS.borderStrong : COLORS.border}`,
        background: isActive
            ? "linear-gradient(180deg, rgba(125, 211, 252, 0.10), rgba(255, 255, 255, 0.04))"
            : COLORS.panelBgStrong,
        boxShadow: isActive ? "0 0 24px rgba(125, 211, 252, 0.14)" : "none",
    };
}

function getSelectButtonStyle(isActive) {
    return {
        ...selectButtonStyle,
        background: isActive ? COLORS.accentStrong : "rgba(255, 255, 255, 0.06)",
        color: isActive ? COLORS.buttonText : COLORS.text,
        border: isActive ? "none" : `1px solid ${COLORS.border}`,
    };
}

function getProductLabel(productType) {
    const value = String(productType || "").trim();

    if (!value) {
        return "-";
    }

    return value.toUpperCase();
}

function getPhaseLabel(accountPhase) {
    const value = String(accountPhase || "").trim();

    if (!value) {
        return "-";
    }

    return value.toUpperCase();
}

function getDefaultNewAccountId(accounts) {
    const numbers = accounts
        .map((account) => {
            const match = String(account?.id || "").match(/APEX-(\d+)/i);
            return match ? Number(match[1]) : null;
        })
        .filter((value) => Number.isFinite(value));

    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const padded = String(nextNumber).padStart(6, "0");

    return `APEX-${padded}`;
}

function resolveSafeAccounts() {
    const accounts = getAccounts();
    return Array.isArray(accounts) ? accounts : [];
}

function getInitialAccounts() {
    return resolveSafeAccounts();
}

function getInitialActiveAccountId() {
    const initialAccounts = resolveSafeAccounts();
    return initialAccounts[0]?.id || "";
}

function TradingLogo() {
    return (
        <svg
            width="38"
            height="38"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <rect x="8" y="10" width="48" height="44" rx="10" fill="rgba(2, 132, 199, 0.18)" />
            <path
                d="M16 42L25 33L33 37L47 21"
                stroke="#7dd3fc"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M42 21H47V26"
                stroke="#facc15"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M18 50H46"
                stroke="rgba(219, 234, 254, 0.45)"
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default function App() {
    const [accounts, setAccounts] = useState(getInitialAccounts);
    const [activeAccountId, setActiveAccountId] = useState(getInitialActiveAccountId);
    const [newAccountId, setNewAccountId] = useState("");

    const refreshAccounts = useCallback((preferredAccountId = "") => {
        const safePreferredAccountId = sanitizeAccountId(preferredAccountId);
        const nextAccounts = resolveSafeAccounts();

        setAccounts(nextAccounts);

        setActiveAccountId((currentActiveAccountId) => {
            const safeCurrentActiveAccountId = sanitizeAccountId(currentActiveAccountId);

            const hasPreferred = safePreferredAccountId
                ? nextAccounts.some((account) => account.id === safePreferredAccountId)
                : false;

            if (hasPreferred) {
                return safePreferredAccountId;
            }

            const hasCurrentActive = nextAccounts.some(
                (account) => account.id === safeCurrentActiveAccountId
            );

            if (hasCurrentActive) {
                return safeCurrentActiveAccountId;
            }

            return nextAccounts[0]?.id || "";
        });
    }, []);

    const handleDetectedAccount = useCallback(
        (detail) => {
            const resolvedAccountId = getResolvedDetectedAccountId(detail);

            if (!resolvedAccountId) {
                return;
            }

            upsertDetectedAccount({
                accountName: String(detail?.accountName || "").trim(),
                accountId: String(detail?.accountId || "").trim(),
                resolvedAccountId,
            });

            refreshAccounts(resolvedAccountId);
        },
        [refreshAccounts]
    );

    useEffect(() => {
        const handleStorageSync = () => {
            refreshAccounts();
        };

        const handleDetectedAccountEvent = (event) => {
            handleDetectedAccount(event?.detail || null);
        };

        window.addEventListener("storage", handleStorageSync);
        window.addEventListener("focus", handleStorageSync);
        window.addEventListener("tradovate-account-detected", handleDetectedAccountEvent);

        return () => {
            window.removeEventListener("storage", handleStorageSync);
            window.removeEventListener("focus", handleStorageSync);
            window.removeEventListener("tradovate-account-detected", handleDetectedAccountEvent);
        };
    }, [refreshAccounts, handleDetectedAccount]);

    function handleAddAccount() {
        const sanitizedId = sanitizeAccountId(newAccountId) || getDefaultNewAccountId(accounts);
        const alreadyExists = accounts.some((account) => account.id === sanitizedId);

        if (alreadyExists) {
            setActiveAccountId(sanitizedId);
            setNewAccountId("");
            return;
        }

        addAccount({
            id: sanitizedId,
        });

        refreshAccounts(sanitizedId);
        setNewAccountId("");
    }

    function handleDeleteAccount(accountIdToDelete) {
        const safeAccountIdToDelete = sanitizeAccountId(accountIdToDelete);

        if (!safeAccountIdToDelete) {
            return;
        }

        const currentIndex = accounts.findIndex(
            (account) => account.id === safeAccountIdToDelete
        );

        const fallbackAccount =
            accounts[currentIndex + 1] ||
            accounts[currentIndex - 1] ||
            null;

        deleteAccount(safeAccountIdToDelete);
        refreshAccounts(fallbackAccount?.id || "");
    }

    const activeAccount = useMemo(() => {
        return (
            accounts.find((account) => account.id === activeAccountId) ||
            accounts[0] ||
            null
        );
    }, [accounts, activeAccountId]);

    return (
        <div style={pageStyle}>
            <div style={contentStyle}>
                <div style={headerWrapStyle}>
                    <div style={heroStyle}>
                        <div style={heroGridStyle}>
                            <div style={logoWrapStyle}>
                                <div style={logoBadgeStyle}>
                                    <TradingLogo />
                                </div>

                                <div style={logoTextWrapStyle}>
                                    <div style={logoKickerStyle}>Trading Dashboard</div>
                                    <div style={logoSubStyle}>Focus. Risiko. Ausführung.</div>
                                </div>
                            </div>

                            <div style={titleWrapStyle}>
                                <h1 style={titleStyle}>
                                    Future <span style={titleAccentStyle}>Dashboard Execution</span>
                                </h1>
                                <p style={quoteStyle}>
                                    Disziplin vor Emotion. Klare Ausführung vor jeder Entscheidung.
                                </p>
                            </div>

                            <div style={heroRightStyle}>
                                <div style={pulseCardStyle}>
                                    <div style={pulseLabelStyle}>Aktiver Account</div>
                                    <div style={pulseValueStyle}>{activeAccount?.id || "-"}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={switcherWrapStyle}>
                        <div style={switcherHeaderStyle}>
                            <div style={switcherTitleStyle}>Account Switcher</div>
                            <div style={switcherMetaStyle}>
                                Aktiv: {activeAccount?.id || "-"} · Accounts: {accounts.length}
                            </div>
                        </div>

                        <div style={addRowStyle}>
                            <input
                                style={inputStyle}
                                type="text"
                                value={newAccountId}
                                onChange={(e) => setNewAccountId(e.target.value)}
                                placeholder={`Neue Apex ID, z. B. ${getDefaultNewAccountId(accounts)}`}
                            />

                            <button style={addButtonStyle} onClick={handleAddAccount}>
                                Account hinzufügen
                            </button>
                        </div>

                        {accounts.length === 0 ? (
                            <div style={emptyStateStyle}>Noch kein Account vorhanden.</div>
                        ) : (
                            <div style={accountsGridStyle}>
                                {accounts.map((account) => {
                                    const isActive = account.id === activeAccountId;

                                    return (
                                        <div key={account.id} style={getAccountCardStyle(isActive)}>
                                            <div style={accountHeaderStyle}>
                                                <div style={accountIdStyle}>{account.id}</div>
                                                <div
                                                    style={{
                                                        padding: "8px 12px",
                                                        borderRadius: "999px",
                                                        fontSize: "12px",
                                                        fontWeight: "800",
                                                        background: isActive
                                                            ? "rgba(34, 211, 238, 0.16)"
                                                            : "rgba(255, 255, 255, 0.06)",
                                                        color: isActive
                                                            ? COLORS.accentStrong
                                                            : COLORS.muted,
                                                        border: `1px solid ${isActive
                                                                ? "rgba(34, 211, 238, 0.26)"
                                                                : COLORS.border
                                                            }`,
                                                    }}
                                                >
                                                    {isActive ? "Aktiv" : "Bereit"}
                                                </div>
                                            </div>

                                            <div style={accountMetaGridStyle}>
                                                <div style={accountMetaCardStyle}>
                                                    <div style={accountMetaLabelStyle}>Modus</div>
                                                    <div style={accountMetaValueStyle}>
                                                        {getProductLabel(account.productType)}
                                                    </div>
                                                </div>

                                                <div style={accountMetaCardStyle}>
                                                    <div style={accountMetaLabelStyle}>Phase</div>
                                                    <div style={accountMetaValueStyle}>
                                                        {getPhaseLabel(account.accountPhase)}
                                                    </div>
                                                </div>

                                                <div style={accountMetaCardStyle}>
                                                    <div style={accountMetaLabelStyle}>Größe</div>
                                                    <div style={accountMetaValueStyle}>
                                                        {formatCurrency(account.accountSize)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={accountActionsStyle}>
                                                <button
                                                    style={getSelectButtonStyle(isActive)}
                                                    onClick={() => setActiveAccountId(account.id)}
                                                >
                                                    {isActive ? "Aktiver Account" : "Als aktiv setzen"}
                                                </button>

                                                <button
                                                    style={deleteButtonStyle}
                                                    onClick={() => handleDeleteAccount(account.id)}
                                                >
                                                    Löschen
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <Dashboard
                    accountId={activeAccountId}
                    activeAccountId={activeAccountId}
                    account={activeAccount}
                    activeAccount={activeAccount}
                    onAccountUpdated={() => refreshAccounts(activeAccountId)}
                />
            </div>
        </div>
    );
}