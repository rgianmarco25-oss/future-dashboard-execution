import { useEffect, useState } from "react";
import { getAccountById, getJournal, saveJournal } from "../utils/storage";
import { getSessionContext } from "../utils/sessionUtils";
import * as csvImportUtils from "../utils/csvImportUtils";
import { formatDate, formatDateTime } from "../utils/dateFormat";

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
};

const BASE_INSTRUMENT_OPTIONS = ["MNQM26", "NQM26", "ES"];

const wrapperStyle = {
    width: "100%",
};

const infoCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "14px",
    background: COLORS.cardBg,
    color: COLORS.neutral,
    marginBottom: "16px",
};

const infoGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const infoItemStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px",
    background: "rgba(255, 255, 255, 0.02)",
    textAlign: "center",
};

const infoLabelStyle = {
    fontSize: "13px",
    color: COLORS.label,
    marginBottom: "6px",
    lineHeight: 1.35,
};

const infoValueStyle = {
    fontSize: "15px",
    fontWeight: "700",
    color: COLORS.neutral,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

const buttonRowStyle = {
    marginBottom: "16px",
};

const labelStyle = {
    display: "block",
    color: COLORS.label,
    fontSize: "14px",
    marginBottom: "8px",
    textAlign: "center",
};

const inputStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    outline: "none",
};

const textareaStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    resize: "vertical",
    outline: "none",
};

const cardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "16px",
    background: COLORS.cardBg,
    display: "grid",
    gap: "12px",
};

const entriesListStyle = {
    display: "grid",
    gap: "12px",
};

const formRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const titleInputRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 220px) minmax(220px, 1fr) minmax(120px, 180px)",
    gap: "12px",
};

const buttonStyle = {
    width: "100%",
    background: COLORS.buttonBg,
    color: COLORS.buttonText,
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: "700",
    cursor: "pointer",
};

const deleteButtonStyle = {
    ...buttonStyle,
    width: "auto",
    padding: "10px 16px",
};

const emptyStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "18px",
    textAlign: "center",
    color: COLORS.label,
    background: COLORS.cardBg,
};

const readonlyValueStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    wordBreak: "break-word",
};

const noticeStyle = {
    borderRadius: "16px",
    padding: "14px 16px",
    marginBottom: "16px",
    lineHeight: 1.45,
    border: `1px solid ${COLORS.okBorder}`,
    background: COLORS.okBg,
    color: COLORS.okText,
};

function createId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `journal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const raw = normalizeText(value);

    if (!raw) {
        return null;
    }

    const negative = raw.includes("(") && raw.includes(")");
    let text = raw
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/[()]/g, "")
        .replace(/−/g, "-")
        .replace(/–/g, "-")
        .replace(/USD|EUR|CHF/gi, "");

    if (text.includes(",") && text.includes(".")) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (text.includes(",") && !text.includes(".")) {
        const lastPart = text.split(",").pop() || "";

        if (lastPart.length === 1 || lastPart.length === 2) {
            text = text.replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    }

    const parsed = Number(text);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return negative ? -Math.abs(parsed) : parsed;
}

function formatMoney(value) {
    const parsed = parseFlexibleNumber(value);
    const safeValue = parsed !== null ? parsed : 0;

    return `${safeValue.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function getInstrumentOptions(currentValue) {
    const safeValue = normalizeText(currentValue);

    if (!safeValue) {
        return BASE_INSTRUMENT_OPTIONS;
    }

    if (BASE_INSTRUMENT_OPTIONS.includes(safeValue)) {
        return BASE_INSTRUMENT_OPTIONS;
    }

    return [safeValue, ...BASE_INSTRUMENT_OPTIONS];
}

function createEmptyEntry(tradingDate) {
    return {
        id: createId(),
        date: tradingDate,
        instrument: "MNQM26",
        contracts: "1",
        title: "",
        note: "",
        result: "",
    };
}

function normalizeImportedEntry(entry, index) {
    return {
        id: entry?.id || `import_trade_${index + 1}`,
        date: normalizeText(entry?.date),
        instrument: normalizeText(entry?.instrument) || "-",
        contracts: normalizeText(entry?.contracts) || "-",
        title: normalizeText(entry?.title) || "Trade",
        note: normalizeText(entry?.note) || "-",
        result: formatMoney(entry?.result),
        pnl: parseFlexibleNumber(entry?.result) ?? 0,
    };
}

export default function JournalPanel({
    accountId,
    account: accountProp,
    journalEntries,
}) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const [entriesByAccount, setEntriesByAccount] = useState({});
    const [, setCsvVersion] = useState(0);

    useEffect(() => {
        const handleCsvRefresh = () => {
            setCsvVersion((prev) => prev + 1);
        };

        window.addEventListener("tradovate-csv-imports-updated", handleCsvRefresh);
        window.addEventListener("storage", handleCsvRefresh);
        window.addEventListener("focus", handleCsvRefresh);

        return () => {
            window.removeEventListener("tradovate-csv-imports-updated", handleCsvRefresh);
            window.removeEventListener("storage", handleCsvRefresh);
            window.removeEventListener("focus", handleCsvRefresh);
        };
    }, []);

    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;

    const account = {
        ...(storedAccount || {}),
        ...(accountProp || {}),
        id: resolvedAccountId || accountProp?.id || storedAccount?.id || "",
        timezone:
            accountProp?.timezone ||
            storedAccount?.timezone ||
            "Europe/Zurich",
    };

    const sessionContext = getSessionContext(account);

    const localEntries = resolvedAccountId
        ? entriesByAccount[resolvedAccountId] ||
        journalEntries ||
        getJournal(resolvedAccountId)
        : [];

    const importData =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : null;

    const importedJournalData =
        resolvedAccountId &&
            importData &&
            typeof csvImportUtils.buildJournalData === "function"
            ? csvImportUtils.buildJournalData(importData, resolvedAccountId)
            : {
                readOnly: false,
                fileName: "",
                importedAt: "",
                stats: {
                    trades: 0,
                    totalPnL: 0,
                    winners: 0,
                    losers: 0,
                    contracts: 0,
                },
                entries: [],
            };

    const importedEntries = Array.isArray(importedJournalData.entries)
        ? importedJournalData.entries.map(normalizeImportedEntry)
        : [];

    const isCsvMode = Boolean(importedJournalData.readOnly && importedEntries.length > 0);
    const entries = isCsvMode ? importedEntries : localEntries;

    const totalTrades = isCsvMode ? importedJournalData.stats?.trades || importedEntries.length : entries.length;
    const totalPnl = isCsvMode ? importedJournalData.stats?.totalPnL || 0 : 0;
    const winnerCount = isCsvMode ? importedJournalData.stats?.winners || 0 : 0;
    const loserCount = isCsvMode ? importedJournalData.stats?.losers || 0 : 0;

    function persistEntries(updated) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        setEntriesByAccount((prev) => ({
            ...prev,
            [resolvedAccountId]: updated,
        }));

        saveJournal(resolvedAccountId, updated);
    }

    function handleAddEntry() {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        const updated = [createEmptyEntry(sessionContext.tradingDate), ...entries];
        persistEntries(updated);
    }

    function handleDeleteEntry(entryId) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        const updated = entries.filter((entry) => entry.id !== entryId);
        persistEntries(updated);
    }

    function handleChange(entryId, field, value) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        const updated = entries.map((entry) =>
            entry.id === entryId
                ? {
                    ...entry,
                    [field]: value,
                }
                : entry
        );

        persistEntries(updated);
    }

    if (!resolvedAccountId) {
        return <div style={emptyStyle}>Kein Account gewählt.</div>;
    }

    if (isCsvMode) {
        return (
            <div style={wrapperStyle}>
                <div style={infoCardStyle}>
                    <div style={infoGridStyle}>
                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Position History Datei</div>
                            <div style={infoValueStyle}>
                                {importedJournalData.fileName || "-"}
                            </div>
                        </div>

                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Import Zeit</div>
                            <div style={infoValueStyle}>
                                {formatDateTime(importedJournalData.importedAt)}
                            </div>
                        </div>

                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Trades erkannt</div>
                            <div style={infoValueStyle}>{totalTrades}</div>
                        </div>
                    </div>
                </div>

                <div style={infoCardStyle}>
                    <div style={infoGridStyle}>
                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Total PnL</div>
                            <div style={infoValueStyle}>{formatMoney(totalPnl)}</div>
                        </div>

                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Gewinner</div>
                            <div style={infoValueStyle}>{winnerCount}</div>
                        </div>

                        <div style={infoItemStyle}>
                            <div style={infoLabelStyle}>Verlierer</div>
                            <div style={infoValueStyle}>{loserCount}</div>
                        </div>
                    </div>
                </div>

                <div style={noticeStyle}>
                    Position History CSV Import ist aktiv. Das Journal zeigt jetzt importierte Trades read only an.
                </div>

                {entries.length === 0 ? (
                    <div style={emptyStyle}>Noch keine importierten Trade Einträge vorhanden.</div>
                ) : (
                    <div style={entriesListStyle}>
                        {entries.map((entry, index) => (
                            <div key={entry.id} style={cardStyle}>
                                <div
                                    style={{
                                        color: COLORS.neutral,
                                        fontSize: "15px",
                                        fontWeight: "700",
                                        lineHeight: 1.35,
                                    }}
                                >
                                    Import Trade {index + 1}
                                    {entry.instrument !== "-" ? ` · ${entry.instrument}` : ""}
                                </div>

                                <div style={titleInputRowStyle}>
                                    <div>
                                        <label style={labelStyle}>Datum</label>
                                        <div style={readonlyValueStyle}>
                                            {formatDate(entry.date)}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Title</label>
                                        <div style={readonlyValueStyle}>
                                            {entry.title || "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Result</label>
                                        <div style={readonlyValueStyle}>
                                            {entry.result || "-"}
                                        </div>
                                    </div>
                                </div>

                                <div style={formRowStyle}>
                                    <div>
                                        <label style={labelStyle}>Instrument</label>
                                        <div style={readonlyValueStyle}>
                                            {entry.instrument || "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Contracts</label>
                                        <div style={readonlyValueStyle}>
                                            {entry.contracts || "-"}
                                        </div>
                                    </div>
                                </div>

                                <div style={formRowStyle}>
                                    <div>
                                        <label style={labelStyle}>Note</label>
                                        <div style={readonlyValueStyle}>
                                            {entry.note || "-"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            <div style={infoCardStyle}>
                <div style={infoGridStyle}>
                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Trading Date</div>
                        <div style={infoValueStyle}>{formatDate(sessionContext.tradingDate)}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Timezone</div>
                        <div style={infoValueStyle}>{sessionContext.timeZone}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Local Time</div>
                        <div style={infoValueStyle}>{sessionContext.localTime}</div>
                    </div>
                </div>
            </div>

            <div style={buttonRowStyle}>
                <button style={buttonStyle} onClick={handleAddEntry}>
                    Add Entry
                </button>
            </div>

            {entries.length === 0 ? (
                <div style={emptyStyle}>Noch keine Journal Einträge vorhanden.</div>
            ) : (
                <div style={entriesListStyle}>
                    {entries.map((entry, index) => (
                        <div key={entry.id} style={cardStyle}>
                            <div
                                style={{
                                    color: COLORS.neutral,
                                    fontSize: "15px",
                                    fontWeight: "700",
                                    lineHeight: 1.35,
                                }}
                            >
                                Entry {index + 1}
                                {entry.instrument ? ` · ${entry.instrument}` : ""}
                            </div>

                            <div style={titleInputRowStyle}>
                                <div>
                                    <label style={labelStyle}>Date</label>
                                    <input
                                        style={inputStyle}
                                        type="date"
                                        value={entry.date}
                                        onChange={(e) =>
                                            handleChange(entry.id, "date", e.target.value)
                                        }
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Title</label>
                                    <input
                                        style={inputStyle}
                                        type="text"
                                        value={entry.title}
                                        onChange={(e) =>
                                            handleChange(entry.id, "title", e.target.value)
                                        }
                                        placeholder="Trade review"
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Result</label>
                                    <input
                                        style={inputStyle}
                                        type="text"
                                        value={entry.result}
                                        onChange={(e) =>
                                            handleChange(entry.id, "result", e.target.value)
                                        }
                                        placeholder="+2R"
                                    />
                                </div>
                            </div>

                            <div style={formRowStyle}>
                                <div>
                                    <label style={labelStyle}>Instrument</label>
                                    <select
                                        style={inputStyle}
                                        value={entry.instrument || "MNQM26"}
                                        onChange={(e) =>
                                            handleChange(entry.id, "instrument", e.target.value)
                                        }
                                    >
                                        {getInstrumentOptions(entry.instrument).map((instrument) => (
                                            <option key={instrument} value={instrument}>
                                                {instrument}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={labelStyle}>Contracts</label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={entry.contracts ?? "1"}
                                        onChange={(e) =>
                                            handleChange(entry.id, "contracts", e.target.value)
                                        }
                                    />
                                </div>
                            </div>

                            <div style={formRowStyle}>
                                <div>
                                    <label style={labelStyle}>Note</label>
                                    <textarea
                                        style={textareaStyle}
                                        value={entry.note}
                                        onChange={(e) =>
                                            handleChange(entry.id, "note", e.target.value)
                                        }
                                        placeholder="Setup, execution, mistakes, lessons learned"
                                        rows={4}
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    style={deleteButtonStyle}
                                    onClick={() => handleDeleteEntry(entry.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}