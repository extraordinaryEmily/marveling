const chrono = require('chrono-node');
const { DateTime } = require('luxon');

/**
 * Parse timeString relative to PST and return a JS Date (UTC) that represents the
 * PST wall-clock time (suitable for scheduling).
 *
 * Returns null if parse fails.
 */
function parsePST(timeString) {
  // Base reference date in PST
  const ourTime = DateTime.now().setZone('America/Los_Angeles');

  // Create a date with PST calendar values in the server's local timezone
  // This ensures Chrono calculates relative dates (tomorrow, next week, etc.) correctly
  const baseJs = new Date(ourTime.year, ourTime.month - 1, ourTime.day, ourTime.hour, ourTime.minute, ourTime.second);

  // Chrono parsing (relative to base date)
  const results = chrono.parse(timeString, baseJs);
  if (!results || results.length === 0) {
    return null;
  }

  const parsedJsDate = results[0].start.date();

  // Interpret that parsed JS date as a wall-clock PST time
  let pstDt = DateTime.fromJSDate(parsedJsDate).setZone('America/Los_Angeles', { keepLocalTime: true });
  // 🔧 PATCH: Fix Chrono "day ahead" issue
  const lowerInput = timeString.toLowerCase();
  const explicitToday = lowerInput.includes('today') || lowerInput.includes('tonight');
  if (explicitToday && pstDt.day === ourTime.plus({ days: 1 }).day) {
    pstDt = pstDt.minus({ days: 1 });
  }

  const backToUtc = pstDt.toUTC();
  return backToUtc.toJSDate();
}

/**
 * Validates if a string contains a legitimate date/time format.
 */
function isValidDateTime(str) {
  if (!str || str.length < 4) return false;

  const lower = str.toLowerCase();
  const daysOfWeek = ['monday','mon','tuesday','tue','tues','wednesday','wed','thursday','thu','thurs','friday','fri','saturday','sat','sunday','sun'];
  const months = ['january','jan','february','feb','march','mar','april','apr','may','june','jun','july','jul','august','aug','september','sept','sep','october','oct','november','nov','december','dec'];

  const hasDayOfWeek = daysOfWeek.some(day => lower.includes(day));
  const hasMonth = months.some(month => lower.includes(month));
  const hasDatePattern = /\d{1,2}[\/\-]\d{1,2}/.test(str);
  const hasTimePattern = /\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}/i.test(str);
  const hasRelativeDay = /\b(today|tomorrow|tonight|tmr|tmrw)\b/i.test(lower);

  const hasDateIndicator = hasDayOfWeek || hasMonth || hasDatePattern || hasRelativeDay;
  return hasDateIndicator && hasTimePattern;
}

/**
 * Validates and adjusts event time. 
 * - If user explicitly says "today"/"tonight" and time is past → reject
 * - If time is in the past (other days) → automatically adds 7 days
 * Returns { eventTime, debugInfo } or { eventTime: null, debugInfo } if invalid.
 */
function validateAndAdjustEventTime(timeString) {
  const now = DateTime.now().setZone('America/Los_Angeles');
  const debugInfo = { input: timeString, currentTimePST: now.toLocaleString(DateTime.DATETIME_FULL) };

  // Use parsePST to get a UTC JS Date that corresponds to the PST wall-clock
  let parsedUtcDate = parsePST(timeString);
  if (!parsedUtcDate) {
    debugInfo.error = 'Failed to parse time string';
    return { eventTime: null, debugInfo };
  }

  const eventTime = DateTime.fromJSDate(parsedUtcDate).setZone('America/Los_Angeles', { keepLocalTime: false });

  const lowerInput = timeString.toLowerCase();
  const explicitToday = lowerInput.includes('today') || lowerInput.includes('tonight');
  debugInfo.explicitToday = explicitToday;

  let finalEventTime = DateTime.fromJSDate(parsedUtcDate).setZone('America/Los_Angeles');

  // Handle past times
  if (finalEventTime < now) {
    if (explicitToday) {
      debugInfo.action = '❌ Rejected — user said today but that time has passed.';
      return { eventTime: null, debugInfo };
    }
    finalEventTime = finalEventTime.plus({ days: 7 });
    debugInfo.action = '⏩ Adjusted — event was in the past, so added 7 days.';
  } else {
    debugInfo.action = '✅ No adjustment needed — event time is in the future.';
  }

  // Safety: disallow events >24 days out
  const maxFuture = now.plus({ days: 24 });
  if (finalEventTime > maxFuture) {
    const daysAhead = finalEventTime.diff(now, 'days').toObject().days.toFixed(1);
    debugInfo.error = `❌ Too far in the future (${daysAhead} days ahead).`;
    debugInfo.isTooFarInFuture = true;
    return { eventTime: null, debugInfo };
  }

  const utcDate = finalEventTime.toUTC().toJSDate();
  debugInfo.finalEventTimeUTC = finalEventTime.toUTC().toFormat('fff');

  return { eventTime: utcDate, debugInfo };
}

module.exports = {
  isValidDateTime,
  validateAndAdjustEventTime,
  parsePST
};
