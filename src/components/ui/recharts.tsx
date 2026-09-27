/**
 * The only runtime boundary to the optional Recharts dependency.
 *
 * Recharts components are intentionally synchronous. React.lazy cannot safely
 * wrap forwardRef primitives such as ResponsiveContainer and caused a
 * maximum-update-depth crash on production finance routes. Vite keeps this
 * adapter in a separately cacheable chart chunk instead of the application
 * shell.
 */
export {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type {DefaultLegendContentProps, LegendPayload, TooltipContentProps} from "recharts";
