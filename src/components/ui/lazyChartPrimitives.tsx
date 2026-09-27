/**
 * Compatibility entry kept for older feature imports. Chart primitives must
 * remain synchronous: React.lazy cannot safely wrap Recharts forwardRef
 * components and previously caused a production update-depth crash.
 */
export {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "./recharts";

export type {DefaultLegendContentProps, LegendPayload, TooltipContentProps} from "./recharts";
