import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ConsumptionChartProps {
  data: Array<{ date: string; gallons: number }>;
  groupBy: "day" | "week" | "month";
}

export default function ConsumptionChart({ data, groupBy }: ConsumptionChartProps) {
  const title = groupBy === 'day' ? 'Daily Consumption' : groupBy === 'week' ? 'Weekly Consumption' : 'Monthly Consumption';
  
  return (
    <Card className="border-0" data-testid="card-consumption-chart">
      <CardHeader>
        <CardTitle className="text-xl font-light">{title}</CardTitle>
        <CardDescription className="text-xs">Gallons used over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm font-light">
            No data available for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                label={{ value: 'Gallons', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" } }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="gallons" 
                stroke="hsl(var(--chart-1))" 
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
                activeDot={{ r: 5 }}
                name="Gallons"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
