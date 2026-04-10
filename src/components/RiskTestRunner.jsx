import { useState } from "react";
import { buildApexRiskSnapshot } from "../utils/apexRiskSnapshot";
import { buildRiskLimitState } from "../utils/riskLimitState";

const COLORS = {
    panelBg: "rgba(255, 255, 255, 0.04)",
    panelBgStrong: "rgba(255, 255, 255, 0.06)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
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
};

const MODES = [
    { value: "EVAL_EOD", label: "EVAL EOD" },
    { value: "EVAL_INTRADAY", label: "EVAL Intraday" },
    { value: "PA_EOD", label: "PA EOD" },
    { value: "PA_INTRADAY", label: "PA Intraday" },
];

const ACCOUNT_SIZES = [25000, 50000, 100000, 150000];

const TEST_CASES = [
    {
        key: "green",
        label: "Grün",
        build: (maxContracts) => ({
            liveContracts: 0,
            plannedContracts: 0,
            currentInstrumentContracts: 0,
            expectedStatus: maxContracts <= 1 ? "yellow" : "green",
            expectedLiveOverLimit: false,
        }),
    },
    {
        key: "yellow",
        label: "Gelb",
        build: (maxContracts) => ({
            liveContracts: Math.max(maxContracts - 1, 0),
            plannedContracts: 1,
            currentInstrumentContracts: Math.max(maxContracts - 1, 0),
            expectedStatus: "yellow",
            expectedLiveOverLimit: false,
        }),
    },
    {
        key: "red_entry",
        label: "Rot Entry",
        build: (maxContracts) => ({
            liveContracts: 0,
            plannedContracts: Math.max(maxContracts + 1, 1),
            currentInstrumentContracts: 0,
            expectedStatus: "red",
            expectedLiveOverLimit: false,
        }),
    },
    {
        key: "red_live",
        label: "Rot Live",
        build: (maxContracts) => ({
            liveContracts: Math.max(maxContracts + 1, 1),
            plannedContracts: 1,
            currentInstrumentContracts: Math.max(maxContracts + 1, 1),
            expectedStatus: "red",
            expectedLiveOverLimit: true,
        }),
    },
];

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function formatAccountSizeLabel(value) {
    const numeric = toNumber(value, 0);

    if (numeric <= 0) {
        return "–";
    }

    return `${Math.round(numeric / 1000)}K`;
}

function formatDateTime(value) {
    if (!value) {
        return "–";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "–";
    }

    return date.toLocaleString("de-CH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function buildDummyAccount(accountSize) {
    return {
        id: `test-${accountSize}`,
        displayName: `TEST-${accountSize}`,
        accountSize,
        currentBalance: accountSize,
        startingBalance: accountSize,
    };
}

function getStatusColors(status) {
    if (status === "red") {
        return {
            border: "rgba(248, 113, 113, 0.45)",
            background: "rgba(248, 113, 113, 0.10)",
            text: "#fecaca",
        };
    }

    if (status === "yellow") {
        return {
            border: "rgba(250, 204, 21, 0.45)",
            background: "rgba(250, 204, 21, 0.10)",
            text: "#fde68a",
        };
    }

    if (status === "green") {
        return {
            border: "rgba(74, 222, 128, 0.45)",
            background: "rgba(74, 222, 128, 0.10)",
            text: "#bbf7d0",
        };
    }

    return {
        border: COLORS.border,
        background: COLORS.panelBg,
        text: COLORS.text,
    };
}

function getPassColors(pass) {
    return pass
        ? {
            border: "rgba(74, 222, 128, 0.45)",
            background: "rgba(74, 222, 128, 0.10)",
            text: "#bbf7d0",
        }
        : {
            border: "rgba(248, 113, 113, 0.45)",
            background: "rgba(248, 113, 113, 0.10)",
            text: "#fecaca",
        };
}

function evaluateSingleCase({ mode, accountSize, testCase }) {
    try {
        const initialSnapshot = buildApexRiskSnapshot({
            account: buildDummyAccount(accountSize),
            mode,
            accountSize,
            balanceHistoryRows: [],
            currentBalance: accountSize,
            currentContracts: 0,
        });

        const maxContracts = toNumber(initialSnapshot?.maxContracts, 0);

        if (maxContracts <= 0) {
            return {
                mode,
                accountSize,
                caseKey: testCase.key,
                caseLabel: testCase.label,
                pass: false,
                expectedStatus: "n/a",
                actualStatus: "n/a",
                reason: "Max Kontrakte ist 0.",
                maxContracts,
                liveContracts: 0,
                plannedContracts: 0,
                openAfterEntry: 0,
                safeSize: 0,
                freeSlotsAfterEntry: 0,
                liveOverLimit: false,
            };
        }

        const scenario = testCase.build(maxContracts);

        const liveContracts = toNumber(scenario.liveContracts, 0);
        const plannedContracts = toNumber(scenario.plannedContracts, 0);
        const currentInstrumentContracts = toNumber(
            scenario.currentInstrumentContracts,
            liveContracts
        );

        const snapshot = buildApexRiskSnapshot({
            account: buildDummyAccount(accountSize),
            mode,
            accountSize,
            balanceHistoryRows: [],
            currentBalance: accountSize,
            currentContracts: liveContracts,
        });

        const resolvedMaxContracts = toNumber(snapshot?.maxContracts, maxContracts);
        const safeSize = Math.max(resolvedMaxContracts - liveContracts, 0);

        const state = buildRiskLimitState({
            maxContracts: resolvedMaxContracts,
            safeSize,
            currentContracts: liveContracts,
            plannedContracts,
            currentInstrumentContracts,
            openAfterEntry: liveContracts + plannedContracts,
            instrumentAfterEntry: currentInstrumentContracts + plannedContracts,
            freeSlotsNow: resolvedMaxContracts - liveContracts,
            freeSlotsAfterEntry: resolvedMaxContracts - (liveContracts + plannedContracts),
            liveOverLimit: liveContracts > resolvedMaxContracts,
        });

        const actualStatus = state.sharedStatus;
        const expectedStatus = scenario.expectedStatus;
        const liveOverLimitValue = Boolean(state?.blocks?.liveOverLimit?.value);

        const blockStatuses = Object.values(state.blocks || {}).map(
            (block) => block?.status
        );

        const allBlocksMatch = blockStatuses.every(
            (status) => status === expectedStatus
        );

        const pass =
            actualStatus === expectedStatus &&
            allBlocksMatch &&
            liveOverLimitValue === scenario.expectedLiveOverLimit;

        let reason = state.sharedReason || "";

        if (!pass) {
            reason = [
                `Erwartet ${expectedStatus}`,
                `bekommen ${actualStatus}`,
                `Live Überlimit erwartet ${scenario.expectedLiveOverLimit ? "Ja" : "Nein"}`,
                `bekommen ${liveOverLimitValue ? "Ja" : "Nein"}`,
            ].join(" · ");
        }

        return {
            mode,
            accountSize,
            caseKey: testCase.key,
            caseLabel: testCase.label,
            pass,
            expectedStatus,
            actualStatus,
            reason,
            maxContracts: resolvedMaxContracts,
            liveContracts,
            plannedContracts,
            openAfterEntry: state.openAfterEntry,
            safeSize: state.safeSize,
            freeSlotsAfterEntry: state.freeSlotsAfterEntry,
            liveOverLimit: liveOverLimitValue,
        };
    } catch (error) {
        return {
            mode,
            accountSize,
            caseKey: testCase.key,
            caseLabel: testCase.label,
            pass: false,
            expectedStatus: "n/a",
            actualStatus: "error",
            reason: error instanceof Error ? error.message : "Unbekannter Fehler",
            maxContracts: 0,
            liveContracts: 0,
            plannedContracts: 0,
            openAfterEntry: 0,
            safeSize: 0,
            freeSlotsAfterEntry: 0,
            liveOverLimit: false,
        };
    }
}

function buildAllResults() {
    const results = [];

    for (const mode of MODES) {
        for (const accountSize of ACCOUNT_SIZES) {
            for (const testCase of TEST_CASES) {
                results.push(
                    evaluateSingleCase({
                        mode: mode.value,
                        accountSize,
                        testCase,
                    })
                );
            }
        }
    }

    return results;
}

function buildInitialRunState() {
    return {
        results: buildAllResults(),
        runCount: 1,
        lastRunAt: new Date().toISOString(),
    };
}

function SummaryCard({ label, value, color }) {
    return (
        <div
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${color}`,
                borderRadius: 16,
                padding: 14,
                minHeight: 78,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>

            <div
                style={{
                    color,
                    fontSize: 18,
                    fontWeight: 800,
                }}
            >
                {String(value)}
            </div>
        </div>
    );
}

function ResultCard({ result }) {
    const colors = getPassColors(result.pass);
    const expectedColors = getStatusColors(result.expectedStatus);
    const actualColors = getStatusColors(result.actualStatus);

    return (
        <div
            style={{
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: 16,
                padding: 14,
                display: "grid",
                gap: 10,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 14,
                        fontWeight: 800,
                    }}
                >
                    {formatAccountSizeLabel(result.accountSize)} · {result.caseLabel}
                </div>

                <div
                    style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: 999,
                        padding: "6px 12px",
                        color: colors.text,
                        background: colors.background,
                        fontSize: 11,
                        fontWeight: 800,
                    }}
                >
                    {result.pass ? "PASS" : "FAIL"}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                }}
            >
                <div
                    style={{
                        border: `1px solid ${expectedColors.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: expectedColors.background,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Erwartet
                    </div>
                    <div
                        style={{
                            color: expectedColors.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.expectedStatus}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${actualColors.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: actualColors.background,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Ergebnis
                    </div>
                    <div
                        style={{
                            color: actualColors.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.actualStatus}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Max
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.maxContracts}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Live
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.liveContracts}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Geplant
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.plannedContracts}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Offen nach Entry
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.openAfterEntry}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Safe Size
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.safeSize}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Slots nach Entry
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.freeSlotsAfterEntry}
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.panelBg,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 10,
                            marginBottom: 4,
                        }}
                    >
                        Live Überlimit
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {result.liveOverLimit ? "Ja" : "Nein"}
                    </div>
                </div>
            </div>

            <div
                style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                    color: result.pass ? COLORS.textSoft : COLORS.red,
                    fontSize: 12,
                    lineHeight: 1.45,
                }}
            >
                {result.reason || "–"}
            </div>
        </div>
    );
}

export default function RiskTestRunner() {
    const [runState, setRunState] = useState(() => buildInitialRunState());

    const results = runState.results;
    const total = results.length;
    const passed = results.filter((result) => result.pass).length;
    const failed = total - passed;

    function handleReRun() {
        setRunState({
            results: buildAllResults(),
            runCount: runState.runCount + 1,
            lastRunAt: new Date().toISOString(),
        });
    }

    return (
        <div
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 20,
                padding: 18,
                boxShadow: COLORS.shadow,
                display: "grid",
                gap: 14,
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
                            fontSize: 16,
                            fontWeight: 800,
                        }}
                    >
                        Risk Test Runner
                    </div>

                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 13,
                            marginTop: 4,
                        }}
                    >
                        Automatischer Durchlauf über 4 Modi, 4 Kontogrössen und 4 Kernfälle
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleReRun}
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
                    Durchlauf neu rechnen
                </button>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                }}
            >
                <SummaryCard label="Gesamt" value={total} color={COLORS.cyan} />
                <SummaryCard label="Pass" value={passed} color={COLORS.green} />
                <SummaryCard
                    label="Fail"
                    value={failed}
                    color={failed > 0 ? COLORS.red : COLORS.textSoft}
                />
                <SummaryCard label="Durchlauf" value={runState.runCount} color={COLORS.purple} />
                <SummaryCard
                    label="Letzter Lauf"
                    value={formatDateTime(runState.lastRunAt)}
                    color={COLORS.yellow}
                />
            </div>

            {MODES.map((mode) => {
                const modeResults = results.filter((result) => result.mode === mode.value);
                const modePass = modeResults.every((result) => result.pass);

                return (
                    <div
                        key={mode.value}
                        style={{
                            border: `1px solid ${modePass ? "rgba(74, 222, 128, 0.30)" : "rgba(248, 113, 113, 0.30)"}`,
                            borderRadius: 18,
                            padding: 14,
                            background: "rgba(255,255,255,0.02)",
                            display: "grid",
                            gap: 12,
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
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 14,
                                    fontWeight: 800,
                                }}
                            >
                                {mode.label}
                            </div>

                            <div
                                style={{
                                    border: `1px solid ${modePass ? "rgba(74, 222, 128, 0.45)" : "rgba(248, 113, 113, 0.45)"}`,
                                    borderRadius: 999,
                                    padding: "6px 12px",
                                    color: modePass ? "#bbf7d0" : "#fecaca",
                                    background: modePass
                                        ? "rgba(74, 222, 128, 0.10)"
                                        : "rgba(248, 113, 113, 0.10)",
                                    fontSize: 11,
                                    fontWeight: 800,
                                }}
                            >
                                {modePass ? "PASS" : "FAIL"}
                            </div>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 10,
                            }}
                        >
                            {modeResults.map((result) => (
                                <ResultCard
                                    key={`${result.mode}-${result.accountSize}-${result.caseKey}`}
                                    result={result}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}