import { useEffect, useRef, useState } from "react"
import {
    CSV_TYPES,
    clearAllStoredCsvImports,
    clearStoredCsvImport,
    getAllParsedImports,
    getImportedAccounts,
    importAndStoreCsvFiles,
} from "../utils/csvImportUtils"
import { formatDateTime } from "../utils/dateFormat"
import { saveAccountBalanceHistory } from "../utils/storage"

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    label: "#94a3b8",
    neutral: "#dbeafe",
    inputBg: "#000",
    cardBg: "rgba(255, 255, 255, 0.03)",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
    okBg: "rgba(34, 211, 238, 0.16)",
    okBorder: "rgba(34, 211, 238, 0.35)",
    okText: "#67e8f9",
    warningBg: "rgba(124, 45, 18, 0.22)",
    warningBorder: "rgba(251, 146, 60, 0.35)",
    warningText: "#fdba74",
}

const FILE_CARDS = [
    {
        type: CSV_TYPES.ACCOUNT_BALANCE_HISTORY,
        title: "Account Balance History",
        usage: "LiveCard und Risk",
    },
    {
        type: CSV_TYPES.POSITION_HISTORY,
        title: "Position History",
        usage: "Journal, Positions und Risk",
    },
    {
        type: CSV_TYPES.ORDERS,
        title: "Orders",
        usage: "OrdersPanel",
    },
    {
        type: CSV_TYPES.FILLS,
        title: "Fills",
        usage: "Orders Ausführungen",
    },
    {
        type: CSV_TYPES.PERFORMANCE,
        title: "Performance",
        usage: "Risk Zusatzwerte",
    },
]

const wrapperStyle = {
    width: "100%",
    display: "grid",
    gap: "16px",
}

const cardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "16px",
    background: COLORS.cardBg,
    display: "grid",
    gap: "12px",
}

const rowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
}

const buttonStyle = {
    background: COLORS.buttonBg,
    color: COLORS.buttonText,
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: "700",
    cursor: "pointer",
}

const ghostButtonStyle = {
    ...buttonStyle,
    background: "rgba(255,255,255,0.06)",
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
}

const dangerButtonStyle = {
    ...buttonStyle,
    background: "rgba(248, 113, 113, 0.14)",
    color: "#fca5a5",
    border: "1px solid rgba(248, 113, 113, 0.30)",
}

const infoBoxStyle = {
    borderRadius: "16px",
    padding: "14px 16px",
    lineHeight: 1.45,
    border: `1px solid ${COLORS.okBorder}`,
    background: COLORS.okBg,
    color: COLORS.okText,
}

const warningBoxStyle = {
    borderRadius: "16px",
    padding: "14px 16px",
    lineHeight: 1.45,
    border: `1px solid ${COLORS.warningBorder}`,
    background: COLORS.warningBg,
    color: COLORS.warningText,
}

const titleStyle = {
    color: COLORS.neutral,
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: 1.3,
}

const labelStyle = {
    color: COLORS.label,
    fontSize: "13px",
    lineHeight: 1.35,
}

const valueStyle = {
    color: COLORS.neutral,
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: 1.35,
    wordBreak: "break-word",
}

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
}

const infoItemStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px",
    background: "rgba(255, 255, 255, 0.02)",
    display: "grid",
    gap: "6px",
}

const accountBadgeWrapStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
}

const accountBadgeStyle = {
    borderRadius: "999px",
    padding: "8px 12px",
    border: `1px solid ${COLORS.borderStrong}`,
    background: "rgba(255,255,255,0.04)",
    color: COLORS.neutral,
    fontSize: "13px",
    fontWeight: "700",
}

function getRowCount(imported) {
    return Array.isArray(imported?.rows) ? imported.rows.length : 0
}

function getAccountCount(imported) {
    return imported?.byAccount ? Object.keys(imported.byAccount).length : 0
}

function getImportedTypeLabel(type) {
    const match = FILE_CARDS.find((entry) => entry.type === type)
    return match ? match.title : type
}

function syncImportedAccountsToStorage(importData) {
    const balanceImport = importData?.accountBalanceHistory

    if (!balanceImport?.byAccount) {
        return
    }

    Object.entries(balanceImport.byAccount).forEach(([accountKey, rows]) => {
        if (!Array.isArray(rows) || rows.length === 0) {
            return
        }

        saveAccountBalanceHistory(accountKey, rows)
    })
}

function dispatchImportEvents(importData) {
    window.dispatchEvent(
        new CustomEvent("tradovate-csv-imports-updated", {
            detail: {
                updatedAt: new Date().toISOString(),
            },
        })
    )

    const accounts = getImportedAccounts(importData)

    accounts.forEach((item) => {
        window.dispatchEvent(
            new CustomEvent("tradovate-account-detected", {
                detail: {
                    accountName: item.accountName || "",
                    accountId: item.accountId || "",
                    resolvedAccountId: item.id || "",
                },
            })
        )
    })
}

export default function CsvImportPanel({ accountId, account, onAccountUpdated }) {
    const inputRef = useRef(null)
    const [, forceRefresh] = useState(0)
    const [isBusy, setIsBusy] = useState(false)
    const [message, setMessage] = useState("")

    useEffect(() => {
        const handleRefresh = () => {
            forceRefresh((prev) => prev + 1)
        }

        window.addEventListener("storage", handleRefresh)
        window.addEventListener("focus", handleRefresh)
        window.addEventListener("tradovate-csv-imports-updated", handleRefresh)

        return () => {
            window.removeEventListener("storage", handleRefresh)
            window.removeEventListener("focus", handleRefresh)
            window.removeEventListener("tradovate-csv-imports-updated", handleRefresh)
        }
    }, [])

    const importData = getAllParsedImports()
    const importedAccounts = getImportedAccounts(importData)
    const activeAccountId = accountId || account?.id || "-"

    async function handleImportFiles(event) {
        const files = Array.from(event.target.files || [])

        if (files.length === 0) {
            return
        }

        setIsBusy(true)

        try {
            const result = await importAndStoreCsvFiles(files)

            syncImportedAccountsToStorage(result.mergedImports)
            dispatchImportEvents(result.mergedImports)

            if (typeof onAccountUpdated === "function") {
                onAccountUpdated()
            }

            const messageParts = []

            if (result.savedTypes.length > 0) {
                messageParts.push(`${result.savedTypes.length} CSV importiert`)
            }

            if (result.skippedFiles.length > 0) {
                messageParts.push(`${result.skippedFiles.length} Datei nicht erkannt`)
            }

            setMessage(messageParts.join(" · ") || "Import abgeschlossen")
            forceRefresh((prev) => prev + 1)
        } catch (error) {
            setMessage(error?.message || "Import fehlgeschlagen")
        } finally {
            setIsBusy(false)

            if (event.target) {
                event.target.value = ""
            }
        }
    }

    function handleRemoveImport(type) {
        const nextImports = clearStoredCsvImport(type)
        dispatchImportEvents(nextImports)

        if (typeof onAccountUpdated === "function") {
            onAccountUpdated()
        }

        setMessage(`${getImportedTypeLabel(type)} entfernt`)
        forceRefresh((prev) => prev + 1)
    }

    function handleClearAll() {
        const nextImports = clearAllStoredCsvImports()
        dispatchImportEvents(nextImports)

        if (typeof onAccountUpdated === "function") {
            onAccountUpdated()
        }

        setMessage("Alle CSV Importe wurden entfernt")
        forceRefresh((prev) => prev + 1)
    }

    return (
        <div style={wrapperStyle}>
            <div style={cardStyle}>
                <div style={titleStyle}>CSV Import Center</div>

                <div style={labelStyle}>Aktiver Account: {activeAccountId}</div>

                <div style={rowStyle}>
                    <button
                        style={buttonStyle}
                        onClick={() => inputRef.current?.click()}
                        disabled={isBusy}
                    >
                        {isBusy ? "Import läuft..." : "CSV Dateien importieren"}
                    </button>

                    <button
                        style={dangerButtonStyle}
                        onClick={handleClearAll}
                        disabled={isBusy}
                    >
                        Alle Importe löschen
                    </button>

                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,text/csv"
                        multiple
                        onChange={handleImportFiles}
                        style={{ display: "none" }}
                    />
                </div>

                <div style={infoBoxStyle}>
                    Erlaubte Dateien: Account Balance History, Position History, Orders, Fills, Performance.
                </div>

                <div style={infoBoxStyle}>
                    Fills reichert Orders mit Fill Preis, Fill Zeit, Fill Anzahl und Kommission an.
                </div>

                {message ? <div style={warningBoxStyle}>{message}</div> : null}
            </div>

            <div style={cardStyle}>
                <div style={titleStyle}>Erkannte Accounts</div>

                {importedAccounts.length === 0 ? (
                    <div style={labelStyle}>Noch kein Account aus CSV erkannt.</div>
                ) : (
                    <div style={accountBadgeWrapStyle}>
                        {importedAccounts.map((item) => (
                            <div key={item.id} style={accountBadgeStyle}>
                                {item.accountName || item.id}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {FILE_CARDS.map((item) => {
                const imported = importData?.[item.type] || null

                return (
                    <div key={item.type} style={cardStyle}>
                        <div style={rowStyle}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={titleStyle}>{item.title}</div>
                                <div style={labelStyle}>{item.usage}</div>
                            </div>

                            <button
                                style={ghostButtonStyle}
                                onClick={() => handleRemoveImport(item.type)}
                                disabled={!imported || isBusy}
                            >
                                Entfernen
                            </button>
                        </div>

                        {!imported ? (
                            <div style={labelStyle}>Noch nicht importiert.</div>
                        ) : (
                            <div style={gridStyle}>
                                <div style={infoItemStyle}>
                                    <div style={labelStyle}>Datei</div>
                                    <div style={valueStyle}>{imported.meta?.fileName || "-"}</div>
                                </div>

                                <div style={infoItemStyle}>
                                    <div style={labelStyle}>Import Zeit</div>
                                    <div style={valueStyle}>
                                        {formatDateTime(imported.meta?.importedAt)}
                                    </div>
                                </div>

                                <div style={infoItemStyle}>
                                    <div style={labelStyle}>Zeilen</div>
                                    <div style={valueStyle}>{getRowCount(imported)}</div>
                                </div>

                                <div style={infoItemStyle}>
                                    <div style={labelStyle}>Accounts</div>
                                    <div style={valueStyle}>{getAccountCount(imported)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}