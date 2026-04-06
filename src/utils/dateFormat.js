const DEFAULT_FALLBACK = "-";
const DEFAULT_TIMEZONE = "Europe/Zurich";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: DEFAULT_TIMEZONE,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DEFAULT_TIMEZONE,
});

function hasValue(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === "string" && value.trim() === "") {
        return false;
    }

    return true;
}

function isValidDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function buildLocalDate(
    year,
    month,
    day,
    hours = 0,
    minutes = 0,
    seconds = 0
) {
    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds)
    );

    return isValidDate(date) ? date : null;
}

function normalizeAmPmHours(hours, ampm) {
    let parsedHours = Number(hours);

    if (!ampm) {
        return parsedHours;
    }

    const upperAmPm = String(ampm).toUpperCase();

    if (upperAmPm === "AM" && parsedHours === 12) {
        return 0;
    }

    if (upperAmPm === "PM" && parsedHours < 12) {
        return parsedHours + 12;
    }

    return parsedHours;
}

export function parseDateValue(value) {
    if (!hasValue(value)) {
        return null;
    }

    if (value instanceof Date) {
        return isValidDate(value) ? value : null;
    }

    if (typeof value === "number") {
        const timestamp = value < 1e12 ? value * 1000 : value;
        const date = new Date(timestamp);
        return isValidDate(date) ? date : null;
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    if (/^\d+$/.test(text)) {
        const numeric = Number(text);

        if (Number.isFinite(numeric)) {
            const timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
            const date = new Date(timestamp);

            if (isValidDate(date)) {
                return date;
            }
        }
    }

    const deMatch = text.match(
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (deMatch) {
        const [, day, month, year, hours = "0", minutes = "0", seconds = "0"] = deMatch;
        return buildLocalDate(year, month, day, hours, minutes, seconds);
    }

    const isoMatch = text.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (isoMatch) {
        const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = isoMatch;
        return buildLocalDate(year, month, day, hours, minutes, seconds);
    }

    const usAmPmMatch = text.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i
    );

    if (usAmPmMatch) {
        const [, month, day, year, hours = "0", minutes = "0", seconds = "0", ampm = ""] =
            usAmPmMatch;

        return buildLocalDate(
            year,
            month,
            day,
            normalizeAmPmHours(hours, ampm),
            minutes,
            seconds
        );
    }

    const us24Match = text.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (us24Match) {
        const [, month, day, year, hours = "0", minutes = "0", seconds = "0"] = us24Match;
        return buildLocalDate(year, month, day, hours, minutes, seconds);
    }

    const normalizedText = text.includes(" ") ? text.replace(" ", "T") : text;
    const parsed = new Date(normalizedText);

    if (isValidDate(parsed)) {
        return parsed;
    }

    return null;
}

export function formatDate(value, fallback = DEFAULT_FALLBACK) {
    const parsed = parseDateValue(value);

    if (!parsed) {
        return fallback;
    }

    return DATE_FORMATTER.format(parsed);
}

export function formatDateTime(value, fallback = DEFAULT_FALLBACK) {
    const parsed = parseDateValue(value);

    if (!parsed) {
        return fallback;
    }

    return DATE_TIME_FORMATTER.format(parsed);
}

export function formatTime(value, fallback = DEFAULT_FALLBACK) {
    if (!hasValue(value)) {
        return fallback;
    }

    if (value instanceof Date) {
        if (!isValidDate(value)) {
            return fallback;
        }

        return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
    }

    if (typeof value === "number") {
        const timestamp = value < 1e12 ? value * 1000 : value;
        const date = new Date(timestamp);

        if (!isValidDate(date)) {
            return fallback;
        }

        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    const text = String(value).trim();

    if (!text) {
        return fallback;
    }

    const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);

    if (timeMatch) {
        const [, hours, minutes, , ampm = ""] = timeMatch;
        const normalizedHours = normalizeAmPmHours(hours, ampm);
        return `${pad(normalizedHours)}:${pad(minutes)}`;
    }

    const parsedDate = parseDateValue(text);

    if (!parsedDate) {
        return fallback;
    }

    return `${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
}

export function formatInstrumentDate(value, fallback = DEFAULT_FALLBACK) {
    return formatDate(value, fallback);
}