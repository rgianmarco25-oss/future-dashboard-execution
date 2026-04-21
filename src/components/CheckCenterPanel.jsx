import { useMemo } from "react";
import * as csvImportUtils from "../utils/csvImportUtils";

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    neutral: "#38bdf8",
    cardBg: "rgba(15, 23, 42, 0.72)",
};

const EMPTY_IMPORT = Object.freeze({
    fileName: "",
    importedAt: "",
    headers: [],
    rows: [],
    previewRows: [],
    rawText: "",
    errors: [],
});

function cleanValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function resolveAccountId({
    resolvedAccountId,
    activeAccountId,
    accountId,
    account,
    currentAccount,
    selectedAccount,
}) {
    return cleanValue(
        resolvedAccountId ||
        activeAccountId ||
        accountId ||
        account?.id ||
        account?.accountId ||
        currentAccount?.id ||
        currentAccount?.accountId ||
        selectedAccount?.id ||
        selectedAccount?.accountId
    );
}

function formatImportedAt(value) {
    const raw = cleanValue(value);

    if (!raw) {
        return "Kein Zeitstempel";
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
        return raw;
    }

    return date.toLocaleString("de-CH");
}

function getImportState(importFile, { key, label, required }) {
    const safeImport = importFile || EMPTY_IMPORT;
    const fileName = cleanValue(safeImport.fileName);
    const rows = Array.isArray(safeImport.rows) ? safeImport.rows : [];
    const errors = Array.isArray(safeImport.errors) ? safeImport.errors : [];
    const importedAt = cleanValue(safeImport.importedAt);

    const isImported = fileName.length > 0;
    const isEmpty = isImported && rows.length === 0;
    const isMissing = required && !isImported;

    return {
        key,
        label,
        required,
        fileName,
        importedAt,
        importedAtLabel: formatImportedAt(importedAt),
        rowCount: rows.length,
        errors,
        isImported,
        isEmpty,
        isMissing,
    };
}

function getStatusMeta(entry) {
    if (entry.isMissing) {
        return {
            label: "Fehlt",
            color: COLORS.danger,
            borderColor: "rgba(239, 68, 68, 0.35)",
        };
    }

    if (entry.isEmpty) {
        return {
            label: "Leer",
            color: COLORS.warning,
            borderColor: "rgba(245, 158, 11, 0.35)",
        };
    }

    if (entry.isImported) {
        return {
            label: "Importiert",
            color: COLORS.positive,
            borderColor: "rgba(34, 197, 94, 0.35)",
        };
    }

    return {
        label: "Nicht importiert",
        color: COLORS.muted,
        borderColor: "rgba(148, 163, 184, 0.25)",
    };
}

function getOverallMeta(requiredMissingCount, emptyCount, hasResolvedAccountId) {
    if (!hasResolvedAccountId) {
        return {
            label: "Kein aktiver Account",
            color: COLORS.warning,
            detail: "Bitte zuerst einen Account wählen.",
        };
    }

    if (requiredMissingCount > 0) {
        return {
            label: "Fehler",
            color: COLORS.danger,
            detail:
                requiredMissingCount === 1
                    ? "1 Pflichtdatei fehlt"
                    : `${requiredMissingCount} Pflichtdateien fehlen`,
        };
    }

    if (emptyCount > 0) {
        return {
            label: "Prüfen",
            color: COLORS.warning,
            detail:
                emptyCount === 1
                    ? "1 Datei ist leer"
                    : `${emptyCount} Dateien sind leer`,
        };
    }

    return {
        label: "OK",
        color: COLORS.positive,
        detail: "Alle Pflichtdateien vorhanden",
    };
}

export default function CheckCenterPanel(props) {
    const resolvedAccountId = resolveAccountId(props);

    const parsedImports = useMemo(() => {
        if (!resolvedAccountId) {
            return {};
        }

        return csvImportUtils.getAllParsedImports(resolvedAccountId) || {};
    }, [resolvedAccountId]);

    const fileChecks = useMemo(() => {
        const ordersState = getImportState(parsedImports.orders, {
            key: "orders",
            label: "Orders CSV",
            required: true,
        });

        const fillsState = getImportState(parsedImports.trades, {
            key: "fills",
            label: "Fills CSV",
            required: true,
        });

        const accountBalanceHistoryState = getImportState(parsedImports.cashHistory, {
            key: "accountBalanceHistory",
            label: "Account Balance History CSV",
            required: true,
        });

        const performanceState = getImportState(parsedImports.performance, {
            key: "performance",
            label: "Performance CSV",
            required: false,
        });

        const positionHistoryState = getImportState(parsedImports.positionHistory, {
            key: "positionHistory",
            label: "Position History CSV",
            required: false,
        });

        return [
            ordersState,
            fillsState,
            accountBalanceHistoryState,
            performanceState,
            positionHistoryState,
        ];
    }, [parsedImports]);

    const requiredMissingCount = useMemo(() => {
        return fileChecks.filter((entry) => entry.isMissing).length;
    }, [fileChecks]);

    const emptyCount = useMemo(() => {
        return fileChecks.filter((entry) => entry.isEmpty).length;
    }, [fileChecks]);

    const importedCount = useMemo(() => {
        return fileChecks.filter((entry) => entry.isImported).length;
    }, [fileChecks]);

    const errorItems = useMemo(() => {
        const items = [];

        if (!resolvedAccountId) {
            items.push("Kein aktiver Account gewählt.");
            return items;
        }

        fileChecks.forEach((entry) => {
            if (entry.isMissing) {
                items.push(`${entry.label} fehlt.`);
            }

            if (entry.isEmpty) {
                items.push(`${entry.label} ist leer und hat 0 Zeilen.`);
            }

            entry.errors.forEach((errorText) => {
                const text = cleanValue(errorText);

                if (text) {
                    items.push(`${entry.label}: ${text}`);
                }
            });
        });

        return items;
    }, [fileChecks, resolvedAccountId]);

    const overallMeta = useMemo(() => {
        return getOverallMeta(
            requiredMissingCount,
            emptyCount,
            Boolean(resolvedAccountId)
        );
    }, [requiredMissingCount, emptyCount, resolvedAccountId]);

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 24,
                padding: 20,
                boxShadow: COLORS.shadow,
                color: COLORS.text,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 18,
                }}
            >
                <div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 700,
                            color: COLORS.title,
                            marginBottom: 6,
                        }}
                    >
                        Check Center
                    </div>

                    <div
                        style={{
                            fontSize: 13,
                            color: COLORS.muted,
                        }}
                    >
                        Account: {resolvedAccountId || "Kein aktiver Account"}
                    </div>
                </div>

                <div
                    style={{
                        minWidth: 220,
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 18,
                        padding: 14,
                    }}
                >
                    <div
                        style={{
                            fontSize: 12,
                            color: COLORS.muted,
                            marginBottom: 6,
                        }}
                    >
                        Gesamtampel
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <span
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                background: overallMeta.color,
                                display: "inline-block",
                                boxShadow: `0 0 12px ${overallMeta.color}`,
                            }}
                        />

                        <div>
                            <div
                                style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: overallMeta.color,
                                }}
                            >
                                {overallMeta.label}
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    color: COLORS.muted,
                                }}
                            >
                                {overallMeta.detail}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                }}
            >
                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 18,
                        padding: 14,
                    }}
                >
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                        Importiert
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{importedCount}</div>
                </div>

                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 18,
                        padding: 14,
                    }}
                >
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                        Fehlende Pflichtdateien
                    </div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 700,
                            color: requiredMissingCount > 0 ? COLORS.danger : COLORS.text,
                        }}
                    >
                        {requiredMissingCount}
                    </div>
                </div>

                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 18,
                        padding: 14,
                    }}
                >
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                        Leere Dateien
                    </div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 700,
                            color: emptyCount > 0 ? COLORS.warning : COLORS.text,
                        }}
                    >
                        {emptyCount}
                    </div>
                </div>

                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 18,
                        padding: 14,
                    }}
                >
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                        Fehlerübersicht
                    </div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 700,
                            color: errorItems.length > 0 ? COLORS.danger : COLORS.text,
                        }}
                    >
                        {errorItems.length}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                }}
            >
                {fileChecks.map((entry) => {
                    const statusMeta = getStatusMeta(entry);

                    return (
                        <div
                            key={entry.key}
                            style={{
                                background: COLORS.cardBg,
                                border: `1px solid ${statusMeta.borderColor}`,
                                borderRadius: 18,
                                padding: 14,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 12,
                                    marginBottom: 10,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 15,
                                        fontWeight: 700,
                                        color: COLORS.text,
                                    }}
                                >
                                    {entry.label}
                                </div>

                                <div
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: statusMeta.color,
                                    }}
                                >
                                    {statusMeta.label}
                                </div>
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    color: COLORS.muted,
                                    marginBottom: 6,
                                }}
                            >
                                Datei: {entry.fileName || "Keine Datei"}
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    color: COLORS.muted,
                                    marginBottom: 6,
                                }}
                            >
                                Zeilen: {entry.rowCount}
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    color: COLORS.muted,
                                }}
                            >
                                Importiert: {entry.isImported ? entry.importedAtLabel : "Nein"}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    background: COLORS.cardBg,
                    border: `1px solid ${COLORS.borderStrong}`,
                    borderRadius: 18,
                    padding: 14,
                }}
            >
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: COLORS.text,
                        marginBottom: 10,
                    }}
                >
                    Fehlerübersicht
                </div>

                {errorItems.length === 0 ? (
                    <div
                        style={{
                            fontSize: 13,
                            color: COLORS.positive,
                        }}
                    >
                        Keine offenen Fehler.
                    </div>
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gap: 8,
                        }}
                    >
                        {errorItems.map((item, index) => (
                            <div
                                key={`${item}-${index}`}
                                style={{
                                    fontSize: 13,
                                    color: COLORS.danger,
                                    background: "rgba(239, 68, 68, 0.08)",
                                    border: "1px solid rgba(239, 68, 68, 0.18)",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                }}
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}