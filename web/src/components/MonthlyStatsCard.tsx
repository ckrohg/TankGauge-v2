import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MonthlyStats {
  month: string;
  year: number;
  totalGallons: number;
  totalCost: number;
  avgDailyUsage: number;
  daysInPeriod: number;
}

interface MonthlyStatsCardProps {
  monthlyStats: MonthlyStats[];
}

export default function MonthlyStatsCard({ monthlyStats }: MonthlyStatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Total Gallons</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Avg Daily Usage</TableHead>
              <TableHead className="text-right">Days Tracked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyStats.map((stat, index) => (
              <TableRow key={index} data-testid={`row-monthly-stats-${index}`}>
                <TableCell className="font-medium">{stat.month}</TableCell>
                <TableCell className="text-right font-mono">{stat.totalGallons.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  ${stat.totalCost.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono">{stat.avgDailyUsage.toFixed(1)} gal</TableCell>
                <TableCell className="text-right font-mono">{stat.daysInPeriod}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
