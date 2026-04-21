export default function AnimatedStatusSymbol() {
    return (
        <div
            style={{
                width: 112,
                height: 112,
                position: "relative",
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
            }}
        >
            <style>
                {`
                    @keyframes symbolPulse {
                        0% { transform: scale(0.96); opacity: 0.72; }
                        50% { transform: scale(1.06); opacity: 1; }
                        100% { transform: scale(0.96); opacity: 0.72; }
                    }

                    @keyframes symbolRing {
                        0% { transform: scale(0.88); opacity: 0.30; }
                        70% { transform: scale(1.18); opacity: 0; }
                        100% { transform: scale(1.18); opacity: 0; }
                    }

                    @keyframes symbolGlow {
                        0% { box-shadow: 0 0 0 rgba(34,211,238,0.00); }
                        50% { box-shadow: 0 0 22px rgba(34,211,238,0.16), 0 0 14px rgba(250,204,21,0.14); }
                        100% { box-shadow: 0 0 0 rgba(34,211,238,0.00); }
                    }

                    @keyframes symbolSweep {
                        0% { transform: translateX(-160%) skewX(-18deg); opacity: 0; }
                        18% { opacity: 0.14; }
                        100% { transform: translateX(250%) skewX(-18deg); opacity: 0; }
                    }

                    @keyframes iconTrophy {
                        0% { opacity: 1; transform: scale(1) rotate(0deg); }
                        26% { opacity: 1; transform: scale(1.06) rotate(-2deg); }
                        33% { opacity: 0; transform: scale(0.82) rotate(-8deg); }
                        100% { opacity: 0; transform: scale(0.82) rotate(-8deg); }
                    }

                    @keyframes iconCrown {
                        0% { opacity: 0; transform: scale(0.82) rotate(8deg); }
                        33% { opacity: 0; transform: scale(0.82) rotate(8deg); }
                        40% { opacity: 1; transform: scale(1.02) rotate(0deg); }
                        59% { opacity: 1; transform: scale(1.08) rotate(2deg); }
                        66% { opacity: 0; transform: scale(0.82) rotate(8deg); }
                        100% { opacity: 0; transform: scale(0.82) rotate(8deg); }
                    }

                    @keyframes iconDiamond {
                        0% { opacity: 0; transform: scale(0.82) rotate(-8deg); }
                        66% { opacity: 0; transform: scale(0.82) rotate(-8deg); }
                        73% { opacity: 1; transform: scale(1.02) rotate(0deg); }
                        92% { opacity: 1; transform: scale(1.08) rotate(-2deg); }
                        100% { opacity: 0; transform: scale(0.82) rotate(-8deg); }
                    }
                `}
            </style>

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "999px",
                    border: "1px solid rgba(34,211,238,0.22)",
                    animation: "symbolRing 2.8s ease-out infinite",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    inset: 10,
                    borderRadius: "999px",
                    border: "1px solid rgba(250,204,21,0.18)",
                    animation: "symbolRing 2.8s ease-out infinite 0.7s",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    inset: -18,
                    borderRadius: "999px",
                    background:
                        "radial-gradient(circle, rgba(34,211,238,0.10) 0%, rgba(34,211,238,0.00) 62%)",
                    animation: "symbolPulse 3.6s ease-in-out infinite",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    top: -8,
                    bottom: -8,
                    width: "30%",
                    background:
                        "linear-gradient(90deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.00) 100%)",
                    animation: "symbolSweep 5s linear infinite",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    width: 76,
                    height: 76,
                    borderRadius: "999px",
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid rgba(250,204,21,0.26)",
                    background:
                        "radial-gradient(circle at 30% 30%, rgba(250,204,21,0.28) 0%, rgba(34,211,238,0.12) 46%, rgba(15,23,42,0.94) 100%)",
                    animation: "symbolGlow 3.4s ease-in-out infinite",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <span
                    style={{
                        position: "absolute",
                        fontSize: 30,
                        lineHeight: 1,
                        animation: "iconTrophy 6s ease-in-out infinite",
                        filter: "drop-shadow(0 0 10px rgba(250,204,21,0.22))",
                    }}
                >
                    🏆
                </span>

                <span
                    style={{
                        position: "absolute",
                        fontSize: 30,
                        lineHeight: 1,
                        animation: "iconCrown 6s ease-in-out infinite",
                        filter: "drop-shadow(0 0 10px rgba(250,204,21,0.22))",
                    }}
                >
                    👑
                </span>

                <span
                    style={{
                        position: "absolute",
                        fontSize: 28,
                        lineHeight: 1,
                        color: "#67e8f9",
                        animation: "iconDiamond 6s ease-in-out infinite",
                        filter: "drop-shadow(0 0 10px rgba(34,211,238,0.22))",
                    }}
                >
                    ◆
                </span>
            </div>
        </div>
    );
}