import dayjs from 'dayjs'

/** App-wide date display format: "September 1, 2026". */
export const DATE_DISPLAY_FORMAT = 'MMMM D, YYYY'

export const DateParser = (dateString: string): string => {
  return dayjs(dateString).format(DATE_DISPLAY_FORMAT);
}

/** Dates inside tables, POS and WMS alike: "09/01/2026". */
export const TABLE_DATE_FORMAT = 'MM/DD/YYYY'

export const fmtTableDate = (dateString: string): string =>
  dayjs(dateString).format(TABLE_DATE_FORMAT)

/** A timestamp inside a table: "09/01/2026 2:05 PM". */
export const fmtTableDateTime = (dateString: string): string =>
  dayjs(dateString).format(`${TABLE_DATE_FORMAT} h:mm A`)
export const TimeParser = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}