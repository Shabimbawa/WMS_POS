import { DatePicker } from "antd";
import dayjs, { type Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

/** A whole-month span: [first month, last month], both inclusive. */
export type MonthRange = [Dayjs, Dayjs];

/**
 * The API takes days, so a month span widens to cover both months in full:
 * June–August becomes 2026-06-01 to 2026-08-31.
 */
export const monthRangeParams = (range: MonthRange) => ({
  dateFrom: range[0].startOf("month").format("YYYY-MM-DD"),
  dateTo: range[1].endOf("month").format("YYYY-MM-DD"),
});

/** `months` back from the current one, inclusive: 3 gives May–July in July. */
export const lastMonths = (months: number): MonthRange => [
  dayjs().subtract(months - 1, "month"),
  dayjs(),
];

interface MonthRangePickerProps {
  value: MonthRange;
  onChange: (range: MonthRange) => void;
}

export function MonthRangePicker({ value, onChange }: MonthRangePickerProps) {
  return (
    <RangePicker
      picker="month"
      value={value}
      allowClear={false}
      format="MMMM YYYY"
      onChange={(next) => next && onChange(next as MonthRange)}
    />
  );
}
