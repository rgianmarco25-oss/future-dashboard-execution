function pad(value) {
    return String(value).padStart(2, "0");
}

function toDateParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const map = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            map[part.type] = part.value;
        }
    }

    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    const second = Number(map.second);

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        weekday: map.weekday,
        dateKey: `${map.year}-${map.month}-${map.day}`,
        dateDisplay: `${pad(day)}.${pad(month)}.${year}`,
        timeKey: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
        timeDisplay: `${pad(hour)}:${pad(minute)}`,
        dateTimeDisplay: `${pad(day)}.${pad(month)}.${year}, ${pad(hour)}:${pad(minute)}`,
    };
}

function toMinutes(hour, minute) {
    return hour * 60 + minute;
}

function getDefaultSessionWindow(productType) {
    if (productType === "intraday") {
        return {
            openHour: 9,
            openMinute: 30,
            closeHour: 22,
            closeMinute: 0,
        };
    }

    return {
        openHour: 0,
        openMinute: 0,
        closeHour: 23,
        closeMinute: 59,
    };
}

function getSessionWindow(account) {
    const productType = account?.productType || "eod";
    return getDefaultSessionWindow(productType);
}

function isWeekend(weekday) {
    return weekday === "Sat" || weekday === "Sun";
}

export function getSessionContext(account, now = new Date()) {
    const timeZone = account?.timezone || "Europe/Zurich";
    const parts = toDateParts(now, timeZone);
    const sessionWindow = getSessionWindow(account);

    const currentMinutes = toMinutes(parts.hour, parts.minute);
    const openMinutes = toMinutes(sessionWindow.openHour, sessionWindow.openMinute);
    const closeMinutes = toMinutes(sessionWindow.closeHour, sessionWindow.closeMinute);

    const sessionOpen =
        !isWeekend(parts.weekday) &&
        currentMinutes >= openMinutes &&
        currentMinutes <= closeMinutes;

    const isIntradayPhase = account?.productType === "intraday" && sessionOpen;
    const isEodPhase = account?.productType === "eod" || !sessionOpen;

    return {
        timeZone,
        tradingDate: parts.dateKey,
        tradingDateDisplay: parts.dateDisplay,
        localTime: parts.timeKey,
        localTimeDisplay: parts.timeDisplay,
        localDateTimeDisplay: parts.dateTimeDisplay,
        weekday: parts.weekday,
        sessionOpen,
        isIntradayPhase,
        isEodPhase,
        sessionWindow: {
            ...sessionWindow,
            openLabel: `${pad(sessionWindow.openHour)}:${pad(sessionWindow.openMinute)}`,
            closeLabel: `${pad(sessionWindow.closeHour)}:${pad(sessionWindow.closeMinute)}`,
        },
    };
}

export function getDailySessionKey(account, now = new Date()) {
    const context = getSessionContext(account, now);
    return `${account?.id || "no-account"}__${context.tradingDate}`;
}

export function getActiveRuleMode(account, now = new Date()) {
    const context = getSessionContext(account, now);

    if (context.isIntradayPhase) {
        return "intraday";
    }

    return "eod";
}

export function shouldResetDailyValues(previousSessionKey, account, now = new Date()) {
    const currentSessionKey = getDailySessionKey(account, now);

    return {
        shouldReset: previousSessionKey !== currentSessionKey,
        currentSessionKey,
    };
}