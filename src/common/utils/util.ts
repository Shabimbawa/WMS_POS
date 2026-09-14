import dayjs from 'dayjs'

/** App-wide date display format: "September 1, 2026". */
export const DATE_DISPLAY_FORMAT = 'MMMM D, YYYY'

export const DateParser = (dateString: string): string => {
  return dayjs(dateString).format(DATE_DISPLAY_FORMAT);
}
export const TimeParser = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}