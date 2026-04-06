import { useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "tradeChecklistState";

const TRADE_CRITERIA = [
    { id: "tradeBias", label: "Trade im Bias" },
    { id: "beLevel", label: "BE Level" },
    { id: "sweep", label: "Sweep" },
    { id: "displacement", label: "Displacement" },
    { id: "legFvgClosed", label: "Leg FVG geschlossen" },
    { id: "fvgReaction", label: "FVG Reaktion" },
    { id: "fvgSize", label: "FVG Größe" },
    { id: "candleCount", label: "Anzahl Kerzen" },
];

const GOAL_ITEMS = [
    { id: "equalHL", label: "Equal H / L" },
    { id: "sessionHL", label: "Session H / L" },
    { id: "newsHL", label: "News H / L" },
    { id: "htfSwingPoint", label: "HTF Swing Point" },
    { id: "htfOb", label: "HTF OB" },
    { id: "htfFvg", label: "HTF FVG" },
];

const COLORS = {
    panelBg: "rgba(17, 24, 39, 0.96)",
    cardBg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(148, 163, 184, 0.22)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    text: "#e5eefb",
    muted: "#94a3b8",
    accent: "#7dd3fc",
    accentDark: "#0f172a",
    red: "#fb7185",
    redBg: "rgba(251, 113, 133, 0.18)",
    orange: "#fb923c",
    orangeBg: "rgba(251, 146, 60, 0.18)",
    green: "#22c55e",
    greenBg: "rgba(34, 197, 94, 0.18)",
    inputBg: "#020617",
};

const panelStyle = {
    width: "100%",
    maxWidth: "360px",
    borderRadius: "20px",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.panelBg,
    color: COLORS.text,
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
};

const headerStyle = {
    padding: "16px 16px 12px",
    borderBottom: `1px solid ${COLORS.border}`,
    background: "rgba(255, 255, 255, 0.03)",
};

const titleStyle = {
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: 1.3,
    marginBottom: "10px",
};

const progressHeaderStyle = {
    display: "grid",
    gap: "8px",
};

const progressLabelStyle = {
    width: "100%",
    borderRadius: "12px",
    padding: "10px 12px",
    textAlign: "center",
    fontWeight: "800",
    fontSize: "14px",
    lineHeight: 1.3,
};

const progressTrackStyle = {
    width: "100%",
    height: "10px",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
};

const sectionStyle = {
    padding: "14px 16px 16px",
};

const sectionTitleStyle = {
    color: COLORS.muted,
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "10px",
};

const listStyle = {
    display: "grid",
    gap: "8px",
};

const rowStyle = {
    display: "grid",
    gridTemplateColumns: "20px 1fr 24px",
    alignItems: "center",
    gap: "10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "12px",
    padding: "10px 12px",
    background: COLORS.cardBg,
};

const checkboxStyle = {
    width: "18px",
    height: "18px",
    margin: 0,
    cursor: "pointer",
    accentColor: COLORS.accent,
};

const rowLabelStyle = {
    fontSize: "14px",
    lineHeight: 1.35,
    color: COLORS.text,
};

const stateIconStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "800",
};

const optionCardStyle = {
    marginTop: "14px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px",
    background: COLORS.cardBg,
    display: "grid",
    gap: "12px",
};

const optionRowStyle = {
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    alignItems: "center",
    gap: "10px",
};

const optionTextStyle = {
    fontSize: "14px",
    lineHeight: 1.4,
    color: COLORS.text,
};

const infoGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
};

const infoCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px 10px",
    background: COLORS.cardBg,
    textAlign: "center",
};

const infoLabelStyle = {
    color: COLORS.muted,
    fontSize: "12px",
    marginBottom: "6px",
    lineHeight: 1.3,
};

const infoValueStyle = {
    color: COLORS.text,
    fontSize: "15px",
    fontWeight: "800",
    lineHeight: 1.3,
};

const footerStyle = {
    padding: "16px",
    borderTop: `1px solid ${COLORS.border}`,
    display: "grid",
    gap: "10px",
};

const resetButtonStyle = {
    width: "100%",
    border: "none",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: "800",
    fontSize: "14px",
    cursor: "pointer",
    background: COLORS.accent,
    color: COLORS.accentDark,
};

function createDefaultState() {
    const criteria = {};
    const goals = {};

    TRADE_CRITERIA.forEach((item) => {
        criteria[item.id] = false;
    });

    GOAL_ITEMS.forEach((item) => {
        goals[item.id] = false;
    });

    return {
        criteria,
        goals,
        countGoalsAsOnePoint: true,
    };
}

function getStorageKey(accountId) {
    return `${STORAGE_PREFIX}:${accountId || "default"}`;
}

function readStoredState(accountId) {
    if (typeof window === "undefined") {
        return createDefaultState();
    }

    try {
        const raw = window.localStorage.getItem(getStorageKey(accountId));

        if (!raw) {
            return createDefaultState();
        }

        const parsed = JSON.parse(raw);
        const defaults = createDefaultState();

        return {
            criteria: {
                ...defaults.criteria,
                ...(parsed.criteria || {}),
            },
            goals: {
                ...defaults.goals,
                ...(parsed.goals || {}),
            },
            countGoalsAsOnePoint:
                typeof parsed.countGoalsAsOnePoint === "boolean"
                    ? parsed.countGoalsAsOnePoint
                    : true,
        };
    } catch {
        return createDefaultState();
    }
}

function getProgressTheme(percent) {
    if (percent >= 70) {
        return {
            text: COLORS.green,
            bg: COLORS.greenBg,
            bar: COLORS.green,
        };
    }

    if (percent >= 40) {
        return {
            text: COLORS.orange,
            bg: COLORS.orangeBg,
            bar: COLORS.orange,
        };
    }

    return {
        text: COLORS.red,
        bg: COLORS.redBg,
        bar: COLORS.red,
    };
}

function getCheckedCount(map) {
    return Object.values(map).filter(Boolean).length;
}

export default function TradeChecklistPanel({ accountId }) {
    const [state, setState] = useState(() => readStoredState(accountId));

    useEffect(() => {
        setState(readStoredState(accountId));
    }, [accountId]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.localStorage.setItem(getStorageKey(accountId), JSON.stringify(state));
    }, [accountId, state]);

    const criteriaCheckedCount = useMemo(
        () => getCheckedCount(state.criteria),
        [state.criteria]
    );

    const goalsCheckedCount = useMemo(
        () => getCheckedCount(state.goals),
        [state.goals]
    );

    const totalPoints = state.countGoalsAsOnePoint
        ? TRADE_CRITERIA.length + 1
        : TRADE_CRITERIA.length + GOAL_ITEMS.length;

    const completedGoalPoints = state.countGoalsAsOnePoint
        ? goalsCheckedCount > 0
            ? 1
            : 0
        : goalsCheckedCount;

    const completedPoints = criteriaCheckedCount + completedGoalPoints;

    const percent = totalPoints > 0
        ? Math.round((completedPoints / totalPoints) * 100)
        : 0;

    const progressTheme = getProgressTheme(percent);

    function toggleCriteria(id) {
        setState((prev) => ({
            ...prev,
            criteria: {
                ...prev.criteria,
                [id]: !prev.criteria[id],
            },
        }));
    }

    function toggleGoal(id) {
        setState((prev) => ({
            ...prev,
            goals: {
                ...prev.goals,
                [id]: !prev.goals[id],
            },
        }));
    }

    function toggleGoalMode() {
        setState((prev) => ({
            ...prev,
            countGoalsAsOnePoint: !prev.countGoalsAsOnePoint,
        }));
    }

    function handleReset() {
        setState(createDefaultState());
    }

    function renderStatusIcon(isChecked) {
        return (
            <div
                style={{
                    ...stateIconStyle,
                    color: isChecked ? COLORS.green : COLORS.red,
                    background: isChecked
                        ? "rgba(34, 197, 94, 0.16)"
                        : "rgba(251, 113, 133, 0.16)",
                    border: `1px solid ${isChecked
                            ? "rgba(34, 197, 94, 0.28)"
                            : "rgba(251, 113, 133, 0.28)"
                        }`,
                }}
            >
                {isChecked ? "✓" : "✕"}
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <div style={titleStyle}>Trade Checkliste</div>

                <div style={progressHeaderStyle}>
                    <div
                        style={{
                            ...progressLabelStyle,
                            background: progressTheme.bg,
                            color: progressTheme.text,
                            border: `1px solid ${progressTheme.bar}`,
                        }}
                    >
                        {completedPoints} von {totalPoints} · {percent}%
                    </div>

                    <div style={progressTrackStyle}>
                        <div
                            style={{
                                width: `${percent}%`,
                                height: "100%",
                                borderRadius: "999px",
                                background: progressTheme.bar,
                                transition: "width 180ms ease",
                            }}
                        />
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Trade Kriterien</div>

                <div style={listStyle}>
                    {TRADE_CRITERIA.map((item) => {
                        const isChecked = Boolean(state.criteria[item.id]);

                        return (
                            <label key={item.id} style={rowStyle}>
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleCriteria(item.id)}
                                    style={checkboxStyle}
                                />
                                <div style={rowLabelStyle}>{item.label}</div>
                                {renderStatusIcon(isChecked)}
                            </label>
                        );
                    })}
                </div>

                <div style={{ ...sectionTitleStyle, marginTop: "18px" }}>
                    Ziele
                </div>

                <div style={listStyle}>
                    {GOAL_ITEMS.map((item) => {
                        const isChecked = Boolean(state.goals[item.id]);

                        return (
                            <label key={item.id} style={rowStyle}>
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleGoal(item.id)}
                                    style={checkboxStyle}
                                />
                                <div style={rowLabelStyle}>{item.label}</div>
                                {renderStatusIcon(isChecked)}
                            </label>
                        );
                    })}
                </div>

                <div style={optionCardStyle}>
                    <label style={optionRowStyle}>
                        <input
                            type="checkbox"
                            checked={state.countGoalsAsOnePoint}
                            onChange={toggleGoalMode}
                            style={checkboxStyle}
                        />
                        <div style={optionTextStyle}>
                            Ziele zählen gemeinsam als 1 Punkt
                        </div>
                    </label>
                </div>

                <div style={infoGridStyle}>
                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Kriterien</div>
                        <div style={infoValueStyle}>
                            {criteriaCheckedCount} / {TRADE_CRITERIA.length}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Ziele</div>
                        <div style={infoValueStyle}>
                            {goalsCheckedCount} / {GOAL_ITEMS.length}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Fortschritt</div>
                        <div style={infoValueStyle}>{percent}%</div>
                    </div>
                </div>
            </div>

            <div style={footerStyle}>
                <button style={resetButtonStyle} onClick={handleReset}>
                    Checkliste zurücksetzen
                </button>
            </div>
        </div>
    );
}