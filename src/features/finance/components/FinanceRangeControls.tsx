import {ErpDateRangePicker} from "@/src/components/common";
import type {FinanceDateRange} from "@/src/types/finance";

type FinanceRangeControlsProps = {
  range: FinanceDateRange;
  error: string | null;
  onChange: (range: FinanceDateRange) => void;
  onApply: (range: FinanceDateRange) => void;
};

/** 财务驾驶舱的日期范围控件；只负责输入，不读取或修改业务数据。 */
export function FinanceRangeControls({range, error, onChange, onApply}: FinanceRangeControlsProps) {
  return (
    <div className="flex w-full max-w-full flex-col items-stretch sm:w-auto sm:items-end">
      <ErpDateRangePicker
        value={range}
        onChange={(nextRange) => {
          onChange(nextRange);
          onApply(nextRange);
        }}
        error={error}
        maxDays={366}
        requireComplete
        triggerClassName="md:w-32"
        startAriaLabel="资金趋势开始日期"
        endAriaLabel="资金趋势结束日期"
        ariaLabel="资金趋势日期范围"
      />
    </div>
  );
}
