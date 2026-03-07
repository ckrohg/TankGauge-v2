import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface TankLevelChartProps {
  data: Array<{ date: string; level: number }>;
}

export default function TankLevelChart({ data }: TankLevelChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tank Level History</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm font-light">
            No tank level history available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                domain={[0, 100]}
                label={{ value: '%', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.375rem",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
              />
              {/* 80% max safe fill reference line */}
              <ReferenceLine 
                y={80} 
                stroke="hsl(var(--chart-5))" 
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ 
                  value: 'Max Safe Fill (80%)', 
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 12
                }}
              />
              <Line
                type="monotone"
                dataKey="level"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
