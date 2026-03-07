import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface DailyConsumption {
  date: string;
  gallonsUsed: number;
  cost: number;
  pricePerGallon: number;
}

interface WeeklyConsumption {
  weekStart: string;
  weekEnd: string;
  gallonsUsed: number;
  cost: number;
  avgPricePerGallon: number;
  daysInWeek: number;
}

interface MonthlyConsumption {
  month: string;
  year: number;
  totalGallons: number;
  totalCost: number;
  avgDailyUsage: number;
  daysInPeriod: number;
}

export type GroupBy = "day" | "week" | "month";

interface ConsumptionTableProps {
  dailyData: DailyConsumption[];
  weeklyData?: WeeklyConsumption[];
  monthlyData?: MonthlyConsumption[];
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  isLoading?: boolean;
}

export default function ConsumptionTable({
  dailyData,
  weeklyData,
  monthlyData,
  groupBy,
  onGroupByChange,
  isLoading = false,
}: ConsumptionTableProps) {

  if (isLoading) {
    return (
      <Card data-testid="card-consumption-table">
        <CardHeader>
          <CardTitle>Consumption & Cost</CardTitle>
          <CardDescription>Detailed breakdown of usage and expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const renderDailyTable = () => (
    <Table data-testid="table-daily-consumption">
      <TableHeader>
        <TableRow>
          <TableHead data-testid="header-date">Date</TableHead>
          <TableHead data-testid="header-gallons" className="text-right">Gallons Used</TableHead>
          <TableHead data-testid="header-cost" className="text-right">Cost</TableHead>
          <TableHead data-testid="header-price" className="text-right">Price/Gal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dailyData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No consumption data available
            </TableCell>
          </TableRow>
        ) : (
          dailyData.slice(0, 30).map((row, index) => (
            <TableRow key={`${row.date}-${index}`} data-testid={`row-daily-${index}`}>
              <TableCell data-testid={`cell-date-${index}`}>
                {new Date(row.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </TableCell>
              <TableCell data-testid={`cell-gallons-${index}`} className="text-right">
                {row.gallonsUsed.toFixed(1)}
              </TableCell>
              <TableCell data-testid={`cell-cost-${index}`} className="text-right">
                ${row.cost.toFixed(2)}
              </TableCell>
              <TableCell data-testid={`cell-price-${index}`} className="text-right">
                ${row.pricePerGallon.toFixed(2)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const renderWeeklyTable = () => (
    <Table data-testid="table-weekly-consumption">
      <TableHeader>
        <TableRow>
          <TableHead data-testid="header-week">Week</TableHead>
          <TableHead data-testid="header-gallons" className="text-right">Gallons Used</TableHead>
          <TableHead data-testid="header-cost" className="text-right">Cost</TableHead>
          <TableHead data-testid="header-avg-price" className="text-right">Avg Price/Gal</TableHead>
          <TableHead data-testid="header-days" className="text-right">Days</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!weeklyData || weeklyData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No consumption data available
            </TableCell>
          </TableRow>
        ) : (
          [...weeklyData].reverse().map((row, index) => (
            <TableRow key={`${row.weekStart}-${index}`} data-testid={`row-weekly-${index}`}>
              <TableCell data-testid={`cell-week-${index}`}>
                {new Date(row.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(row.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </TableCell>
              <TableCell data-testid={`cell-gallons-${index}`} className="text-right">
                {row.gallonsUsed.toFixed(1)}
              </TableCell>
              <TableCell data-testid={`cell-cost-${index}`} className="text-right">
                ${row.cost.toFixed(2)}
              </TableCell>
              <TableCell data-testid={`cell-avg-price-${index}`} className="text-right">
                ${row.avgPricePerGallon.toFixed(2)}
              </TableCell>
              <TableCell data-testid={`cell-days-${index}`} className="text-right">
                {row.daysInWeek}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const renderMonthlyTable = () => (
    <Table data-testid="table-monthly-consumption">
      <TableHeader>
        <TableRow>
          <TableHead data-testid="header-month">Month</TableHead>
          <TableHead data-testid="header-gallons" className="text-right">Gallons Used</TableHead>
          <TableHead data-testid="header-cost" className="text-right">Cost</TableHead>
          <TableHead data-testid="header-avg-price" className="text-right">Avg Price/Gal</TableHead>
          <TableHead data-testid="header-days" className="text-right">Days</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!monthlyData || monthlyData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No consumption data available
            </TableCell>
          </TableRow>
        ) : (
          monthlyData.map((row, index) => (
            <TableRow key={`${row.month}-${row.year}-${index}`} data-testid={`row-monthly-${index}`}>
              <TableCell data-testid={`cell-month-${index}`}>
                {row.month}
              </TableCell>
              <TableCell data-testid={`cell-gallons-${index}`} className="text-right">
                {row.totalGallons.toFixed(1)}
              </TableCell>
              <TableCell data-testid={`cell-cost-${index}`} className="text-right">
                ${row.totalCost.toFixed(2)}
              </TableCell>
              <TableCell data-testid={`cell-avg-price-${index}`} className="text-right">
                ${row.totalGallons > 0 ? (row.totalCost / row.totalGallons).toFixed(2) : '0.00'}
              </TableCell>
              <TableCell data-testid={`cell-days-${index}`} className="text-right">
                {row.daysInPeriod}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <Card data-testid="card-consumption-table">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Consumption & Cost</CardTitle>
            <CardDescription>Detailed breakdown of usage and expenses</CardDescription>
          </div>
          <Select value={groupBy} onValueChange={(value) => onGroupByChange(value as GroupBy)}>
            <SelectTrigger data-testid="select-groupby" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day" data-testid="option-day">Daily</SelectItem>
              <SelectItem value="week" data-testid="option-week">Weekly</SelectItem>
              <SelectItem value="month" data-testid="option-month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {groupBy === "day" && renderDailyTable()}
        {groupBy === "week" && renderWeeklyTable()}
        {groupBy === "month" && renderMonthlyTable()}
      </CardContent>
    </Card>
  );
}
