export const DEFAULT_CALENDAR_TIMEZONE = "Pacific/Auckland";

export function localDateInTimeZone(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function localDateTimePartsInTimeZone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
  };
}

function dateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? "00";
}

export function localDateTimeInputInTimeZone(
  timeZone: string,
  value: Date | string,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return `${dateTimePart(parts, "year")}-${dateTimePart(parts, "month")}-${dateTimePart(parts, "day")}T${dateTimePart(parts, "hour")}:${dateTimePart(parts, "minute")}`;
}

export function instantFromLocalDateTimeInTimeZone(
  timeZone: string,
  value: string,
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    throw new RangeError("Choose a valid date and time.");
  }

  const [, year, month, day, hour, minute] = match;
  const targetUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  let guess = targetUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const projected = localDateTimePartsInTimeZone(timeZone, new Date(guess));
    const [projectedYear, projectedMonth, projectedDay] = projected.date
      .split("-")
      .map(Number);
    const [projectedHour, projectedMinute] = projected.time
      .split(":")
      .map(Number);
    const projectedUtc = Date.UTC(
      projectedYear,
      projectedMonth - 1,
      projectedDay,
      projectedHour,
      projectedMinute,
    );
    const adjustment = targetUtc - projectedUtc;

    if (adjustment === 0) {
      break;
    }

    guess += adjustment;
  }

  const candidate = new Date(guess);
  if (localDateTimeInputInTimeZone(timeZone, candidate) !== value) {
    throw new RangeError(
      "That local time is not available in the roster calendar timezone. Choose another time.",
    );
  }

  return candidate;
}

export function mondayWeekStartInTimeZone(
  timeZone: string,
  date = new Date(),
) {
  const [year, month, day] = localDateInTimeZone(timeZone, date)
    .split("-")
    .map(Number);
  const localCalendarDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (localCalendarDate.getUTCDay() + 6) % 7;
  localCalendarDate.setUTCDate(localCalendarDate.getUTCDate() - daysSinceMonday);
  return localCalendarDate.toISOString().slice(0, 10);
}
