/**
 * Utility functions for timezone-independent date parsing and formatting.
 * This completely prevents timezone shift errors (e.g., June 25 shifting to June 24).
 */

export const isLocaleMDY = (): boolean => {
  try {
    const str = new Date(2006, 0, 2).toLocaleDateString(); // Jan 2, 2006
    const idxJan = str.indexOf("1");
    const idxTwo = str.indexOf("2");
    if (idxJan !== -1 && idxTwo !== -1 && idxJan < idxTwo) {
      return true; // MM/DD/YYYY
    }
  } catch (e) {
    // fallback
  }
  return false; // DD/MM/YYYY
};

/**
 * Takes any date value (JS Date, string, or number) and returns an ISO string pointing strictly
 * to the midnight of the intended calendar day (e.g., "YYYY-MM-DDT00:00:00.000Z"),
 * completely resolving any timezone/DST discrepancies by comparing UTC and local proximity.
 */
export const toUTCMidnightISO = (val: any): string => {
  if (val === null || val === undefined || val === "") return "";
  
  // If it's a string, let's first handle some standard custom formats to bypass standard Date parsing ambiguities
  if (typeof val === "string") {
    const str = val.trim();
    if (!str) return "";

    // Support numeric strings containing Excel serial dates
    const num = Number(str);
    if (!isNaN(num) && num > 25000 && num < 120000) {
      return toUTCMidnightISO(num);
    }

    // 1. If it starts with YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      return new Date(Date.UTC(year, month - 1, day)).toISOString();
    }

    // 2. If it is standard DD/MM/YYYY or MM/DD/YYYY
    const dmyOrMdyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmyOrMdyMatch) {
      let a = parseInt(dmyOrMdyMatch[1], 10);
      let b = parseInt(dmyOrMdyMatch[2], 10);
      const year = parseInt(dmyOrMdyMatch[3], 10);
      
      let day = a;
      let month = b;
      if (a > 12 && b <= 12) {
        day = a;
        month = b;
      } else if (b > 12 && a <= 12) {
        day = b;
        month = a;
      } else {
        if (isLocaleMDY()) {
          day = b;
          month = a;
        } else {
          day = a;
          month = b;
        }
      }
      return new Date(Date.UTC(year, month - 1, day)).toISOString();
    }
  }

  // 3. Handle numbers (could be Excel serial or Unix timestamp)
  if (typeof val === "number") {
    if (val > 25000 && val < 120000) {
      // Excel serial number
      const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())).toISOString();
      }
      return "";
    }
    if (val > 20000000000) {
      const dObj = new Date(val); // Milliseconds
      if (!isNaN(dObj.getTime())) {
        return toUTCMidnightISO(dObj);
      }
    }
    if (val > 100000000) {
      const dObj = new Date(val * 1000); // Seconds
      if (!isNaN(dObj.getTime())) {
        return toUTCMidnightISO(dObj);
      }
    }
  }

  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else {
    d = new Date(val);
  }

  if (isNaN(d.getTime())) return "";

  // Calculate distance to local midnight
  const localHours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3600000;
  const distLocal = Math.min(localHours, 24 - localHours);

  // Calculate distance to UTC midnight
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + d.getUTCMilliseconds() / 3600000;
  const distUtc = Math.min(utcHours, 24 - utcHours);

  let year: number;
  let month: number;
  let day: number;

  if (distLocal <= distUtc) {
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  } else {
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    day = d.getUTCDate();
  }

  return new Date(Date.UTC(year, month, day)).toISOString();
};

/**
 * Format any date value into a localized display string (e.g. DD/MM/YYYY or MM/DD/YYYY)
 * without any timezone shift.
 */
export const formatDateForDisplay = (dateVal: any): string => {
  if (!dateVal) return "N/A";
  try {
    const iso = toUTCMidnightISO(dateVal);
    if (!iso) return String(dateVal);
    
    const parts = iso.split("T")[0].split("-");
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    
    if (isLocaleMDY()) {
      return `${month}/${day}/${year}`;
    } else {
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    // fallback
  }
  return String(dateVal);
};

/**
 * Format any date value into a standard date input field format (YYYY-MM-DD)
 * without any timezone shift.
 */
export const formatDateToInputString = (dateVal: any): string => {
  if (!dateVal) return new Date().toISOString().split("T")[0];
  try {
    const iso = toUTCMidnightISO(dateVal);
    if (iso) {
      return iso.split("T")[0];
    }
  } catch (e) {
    // fallback
  }
  return new Date().toISOString().split("T")[0];
};
