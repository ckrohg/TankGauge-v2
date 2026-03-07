import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface CostChartData {
  name: string;
  cost: number;
  gallons: number;
}

interface CostChartProps {
  data: CostChartData[];
  groupBy: "day" | "week" | "month";
  isLoading?: boolean;
}

export default function MonthlyCostChart({ data, groupBy, isLoading = false }: CostChartProps) {
  const title = groupBy === 'day' ? 'Daily Cost Breakdown' : groupBy === 'week' ? 'Weekly Cost Breakdown' : 'Monthly Cost Breakdown';
  const description = groupBy === 'day' ? 'Cost and consumption per day' : groupBy === 'week' ? 'Cost and consumption per week' : 'Cost and consumption per month';

  if (isLoading) {
    return (
      <Card data-testid="card-monthly-cost-chart" className="border-0">
        <CardHeader>
          <CardTitle className="text-xl font-light">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-monthly-cost-chart" className="border-0">
      <CardHeader>
        <CardTitle className="text-xl font-light">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm font-light">
            No data available for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                label={{ value: "Gallons", angle: -90, position: "insideLeft", style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" } }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                label={{ value: "Cost ($)", angle: 90, position: "insideRight", style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px"
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar
                yAxisId="left"
                dataKey="gallons"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
                name="Gallons"
              />
              <Bar
                yAxisId="right"
                dataKey="cost"
                fill="hsl(var(--chart-3))"
                radius={[4, 4, 0, 0]}
                name="Cost ($)"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
