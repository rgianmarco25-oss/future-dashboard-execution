import { useState } from "react";
import {
    getAccountProfile,
    saveAccountProfile,
    updateAccount,
} from "../utils/storage";

function createDefaultProfile(accountId) {
    return {
        name: "",
        accountId: accountId || "",
        timezone: "Europe/Zurich",
    };
}

const panelStyle = {
    background: "#050816",
    border: "1px solid rgba(255, 215, 0, 0.12)",
    borderRadius: "24px",
    padding: "28px",
    marginTop: "24px",
    boxShadow: "0 0 30px rgba(0, 0, 0, 0.25)",
};

const titleStyle = {
    textAlign: "center",
    color: "#f3d27a",
    fontSize: "20px",
    fontWeight: "700",
    marginBottom: "20px",
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "12px",
};

const labelStyle = {
    display: "block",
    color: "#f3d27a",
    fontSize: "14px",
    marginBottom: "8px",
    textAlign: "center",
};

const inputStyle = {
    width: "100%",
    background: "#000",
    color: "#f3d27a",
    border: "1px solid rgba(255, 215, 0, 0.35)",
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
};

const activeBoxStyle = {
    marginTop: "16px",
    padding: "18px",
    border: "1px solid rgba(255, 215, 0, 0.12)",
    borderRadius: "16px",
    background: "rgba(0, 0, 0, 0.2)",
    color: "#f3d27a",
    textAlign: "center",
    fontSize: "16px",
};

function normalizeBalance(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function AccountProfilePanel({ accountId, account, onAccountUpdated }) {
    const [profile, setProfile] = useState(() => {
        if (!accountId) {
            return createDefaultProfile("");
        }

        const stored = getAccountProfile(accountId);

        return {
            ...createDefaultProfile(accountId),
            ...(stored || {}),
            accountId,
        };
    });

    const [accountForm, setAccountForm] = useState(() => {
        return {
            productType: account?.productType || "eod",
            accountPhase: account?.accountPhase || "eval",
            accountSize: account?.accountSize || 50000,
            currentBalance: account?.currentBalance || account?.accountSize || 50000,
        };
    });

    function handleProfileChange(field, value) {
        const updated = {
            ...profile,
            [field]: value,
        };

        setProfile(updated);

        if (accountId) {
            const stored = getAccountProfile(accountId) || {};

            saveAccountProfile(accountId, {
                ...stored,
                ...updated,
                accountId,
            });
        }
    }

    function handleAccountChange(field, value) {
        const updated = {
            ...accountForm,
            [field]: value,
        };

        if (field === "accountSize") {
            const nextSize = Number(value);
            updated.accountSize = nextSize;

            if (
                Number(accountForm.currentBalance) === Number(accountForm.accountSize) ||
                !Number.isFinite(Number(accountForm.currentBalance))
            ) {
                updated.currentBalance = nextSize;
            }
        }

        if (field === "currentBalance") {
            updated.currentBalance = normalizeBalance(value, accountForm.currentBalance);
        }

        setAccountForm(updated);

        if (accountId) {
            updateAccount(accountId, {
                productType: updated.productType,
                accountPhase: updated.accountPhase,
                accountSize: Number(updated.accountSize),
                currentBalance: normalizeBalance(
                    updated.currentBalance,
                    Number(updated.accountSize)
                ),
            });

            if (typeof onAccountUpdated === "function") {
                onAccountUpdated();
            }
        }
    }

    return (
        <div style={panelStyle}>
            <div style={titleStyle}>Account Profil</div>

            <div style={gridStyle}>
                <div>
                    <label style={labelStyle}>Name</label>
                    <input
                        style={inputStyle}
                        type="text"
                        value={profile.name}
                        onChange={(e) => handleProfileChange("name", e.target.value)}
                        placeholder="Apex 50K Eval"
                    />
                </div>

                <div>
                    <label style={labelStyle}>Account Id</label>
                    <input
                        style={inputStyle}
                        type="text"
                        value={accountId || ""}
                        readOnly
                    />
                </div>

                <div>
                    <label style={labelStyle}>Timezone</label>
                    <select
                        style={inputStyle}
                        value={profile.timezone}
                        onChange={(e) => handleProfileChange("timezone", e.target.value)}
                    >
                        <option value="Europe/Zurich">Europe/Zurich</option>
                        <option value="Europe/Berlin">Europe/Berlin</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="Asia/Dubai">Asia/Dubai</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                    </select>
                </div>

                <div>
                    <label style={labelStyle}>Produkt</label>
                    <select
                        style={inputStyle}
                        value={accountForm.productType}
                        onChange={(e) => handleAccountChange("productType", e.target.value)}
                    >
                        <option value="eod">EOD</option>
                        <option value="intraday">Intraday</option>
                    </select>
                </div>

                <div>
                    <label style={labelStyle}>Phase</label>
                    <select
                        style={inputStyle}
                        value={accountForm.accountPhase}
                        onChange={(e) => handleAccountChange("accountPhase", e.target.value)}
                    >
                        <option value="eval">Eval</option>
                        <option value="pa">PA</option>
                    </select>
                </div>

                <div>
                    <label style={labelStyle}>Größe</label>
                    <select
                        style={inputStyle}
                        value={accountForm.accountSize}
                        onChange={(e) => handleAccountChange("accountSize", Number(e.target.value))}
                    >
                        <option value={25000}>25K</option>
                        <option value={50000}>50K</option>
                        <option value={100000}>100K</option>
                        <option value={150000}>150K</option>
                    </select>
                </div>

                <div>
                    <label style={labelStyle}>Aktuelle Balance</label>
                    <input
                        style={inputStyle}
                        type="number"
                        value={accountForm.currentBalance}
                        onChange={(e) => handleAccountChange("currentBalance", e.target.value)}
                        placeholder="50000"
                    />
                </div>
            </div>

            <div style={activeBoxStyle}>
                Aktiv: {profile.name || "-"}, {accountId || "-"}, {profile.timezone || "-"}, {String(accountForm.productType).toUpperCase()}, {String(accountForm.accountPhase).toUpperCase()}, {Number(accountForm.accountSize).toLocaleString("de-DE")}, Balance {Number(accountForm.currentBalance).toLocaleString("de-DE")} $
            </div>
        </div>
    );
}