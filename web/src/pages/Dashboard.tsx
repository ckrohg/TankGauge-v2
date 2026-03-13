import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import TankGauge from "@/components/TankGauge";
import MetricCard from "@/components/MetricCard";
import StatCard from "@/components/StatCard";
import TankLevelChart from "@/components/TankLevelChart";
import PriceChart from "@/components/PriceChart";
import MonthlyCostChart from "@/components/MonthlyCostChart";
import ConsumptionChart from "@/components/ConsumptionChart";
import ConsumptionTable from "@/components/ConsumptionTable";
import DeliveryHistoryTable from "@/components/DeliveryHistoryTable";
import PaymentHistoryTable from "@/components/PaymentHistoryTable";
import { Droplet, DollarSign, Calendar, TrendingDown, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, subMonths, subDays, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TankReading, Delivery, Payment, Settings } from "@/types";

function parseDateOnly(dateInput: string | Date): Date {
  const dateString = dateInput instanceof Date ? dateInput.toISOString() : dateInput;
  const dateOnly = dateString.split('T')[0].split(' ')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface Analytics {
  dailyAverage: number;
  weeklyAverage: number;
  monthlyAverage: number;
  estimatedDaysUntilEmpty: number;
  costSinceLastDelivery: number;
  avgCostPerDay: number;
}

interface Last28DaysStats {
  totalGallons: number;
  totalCost: number;
  avgDailyGallons: number;
  avgDailyCost: number;
  daysWithData: number;
}

interface MonthlyStats {
  month: string;
  year: number;
  totalGallons: number;
  totalCost: number;
  avgDailyUsage: number;
  daysInPeriod: number;
}

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

type DatePreset = '7d' | '28d' | '1m' | '3m' | 'custom';
export type GroupBy = "day" | "week" | "month";

export default function Dashboard() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: subMonths(new Date(), 12).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [activePreset, setActivePreset] = useState<DatePreset>('custom');
  const [groupBy, setGroupBy] = useState<GroupBy>('week');

  const { data: latestReading } = useQuery<TankReading>({
    queryKey: ["/api/readings/latest"],
    refetchInterval: 60000, // Refetch every 60 seconds to update "Last sync" after automated scrapes
  });

  const { data: readings = [] } = useQuery<TankReading[]>({
    queryKey: ["/api/readings", { 
      startDate: dateRange.start, 
      endDate: dateRange.end 
    }],
  });

  const { data: deliveries = [] } = useQuery<Delivery[]>({
    queryKey: ["/api/deliveries"],
  });

  const { data: latestDelivery } = useQuery<Delivery>({
    queryKey: ["/api/deliveries/latest"],
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
  });

  const { data: last28DaysStats } = useQuery<Last28DaysStats>({
    queryKey: ["/api/analytics/last-28-days"],
  });

  const { data: monthlyStats = [] } = useQuery<MonthlyStats[]>({
    queryKey: ["/api/analytics/monthly", { 
      startDate: dateRange.start, 
      endDate: dateRange.end 
    }],
  });

  const { data: dailyConsumption = [] } = useQuery<DailyConsumption[]>({
    queryKey: ["/api/analytics/daily", { 
      startDate: dateRange.start, 
      endDate: dateRange.end 
    }],
  });

  const { data: weeklyConsumption = [] } = useQuery<WeeklyConsumption[]>({
    queryKey: ["/api/analytics/weekly", { 
      startDate: dateRange.start, 
      endDate: dateRange.end 
    }],
  });

  const { data: maxGallonsData } = useQuery<{ maxGallons: number }>({
    queryKey: ["/api/readings/max-gallons"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/scrape");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/readings/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/last-28-days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/daily"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/weekly"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/monthly"] });
      queryClient.invalidateQueries({ queryKey: ["/api/readings/max-gallons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Data refreshed",
        description: "Latest tank data has been fetched successfully.",
      });
    },
    onError: (error: any) => {
      const isAuthError = error?.message?.includes("Unauthorized") || error?.status === 401;
      
      // Extract server-provided error message if available
      const errorMessage = error?.error || error?.message || "Failed to fetch latest data. Please try again.";
      
      toast({
        title: isAuthError ? "Authentication required" : "Refresh failed",
        description: isAuthError 
          ? "Your session has expired. Please sign in again to refresh data."
          : errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    setActivePreset('custom');
  };

  const handlePresetChange = (preset: string) => {
    if (!preset) return;
    
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (preset) {
      case '7d':
        start = subDays(now, 7);
        break;
      case '28d':
        start = subDays(now, 28);
        break;
      case '1m':
        start = startOfMonth(subMonths(endOfMonth(now), 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case '3m':
        start = subMonths(now, 3);
        break;
      default:
        return;
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
    setActivePreset(preset as DatePreset);
  };

  // Deduplicate tank level data by date - show only latest reading per day
  const tankLevelData = (() => {
    const dataByDate = new Map<string, { date: string; level: number; timestamp: number }>();

    readings.forEach(r => {
      const dateKey = format(new Date(r.scrapedAt), "yyyy-MM-dd");
      const displayDate = format(new Date(r.scrapedAt), "MMM d");
      const timestamp = new Date(r.scrapedAt).getTime();
      const level = parseFloat(r.levelPercentage);

      const existing = dataByDate.get(dateKey);
      // Keep the latest reading for each day
      if (!existing || timestamp > existing.timestamp) {
        dataByDate.set(dateKey, { date: displayDate, level, timestamp });
      }
    });

    // Sort by date (respects the date range filter from readings query)
    return Array.from(dataByDate.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ date, level }) => ({ date, level }));
  })();

  // Combine market prices from tank readings with delivery prices for price history chart
  // Note: readings are already filtered by backend based on date range
  const priceData = (() => {
    const dataMap = new Map<string, { date: string; marketPrice?: number; deliveryPrice?: number }>();
    
    // Date range for filtering (add 1 day to end to include entire day, matching backend logic)
    const rangeStart = new Date(dateRange.start);
    const rangeEnd = new Date(dateRange.end);
    rangeEnd.setDate(rangeEnd.getDate() + 1); // Include full end day
    
    // Add market prices from tank readings (already filtered by backend)
    readings.forEach(r => {
      // Skip readings without price data
      if (!r.pricePerGallon) return;
      
      const dateKey = format(new Date(r.scrapedAt), 'yyyy-MM-dd');
      const displayDate = format(new Date(r.scrapedAt), 'MMM d, yy');
      const existing = dataMap.get(dateKey);
      dataMap.set(dateKey, {
        date: displayDate,
        marketPrice: parseFloat(r.pricePerGallon),
        deliveryPrice: existing?.deliveryPrice,
      });
    });
    
    // Add delivery prices (locked-in prices at delivery time)
    // Filter deliveries by date range (backend doesn't filter these)
    deliveries
      .filter(d => {
        const date = parseDateOnly(d.deliveryDate);
        return date >= rangeStart && date < rangeEnd;
      })
      .forEach(d => {
        const date = parseDateOnly(d.deliveryDate);
        const dateKey = format(date, 'yyyy-MM-dd');
        const displayDate = format(date, 'MMM d, yy');
        const existing = dataMap.get(dateKey);
        dataMap.set(dateKey, {
          date: displayDate,
          marketPrice: existing?.marketPrice,
          deliveryPrice: parseFloat(d.pricePerGallon),
        });
      });
    
    // Sort by date and return
    return Array.from(dataMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, data]) => data);
  })();

  const deliveryTableData = deliveries.slice(0, 10).map((d) => ({
    date: format(parseDateOnly(d.deliveryDate), "MMM d, yyyy"),
    amount: parseFloat(d.amountGallons),
    pricePerGallon: parseFloat(d.pricePerGallon),
    totalCost: parseFloat(d.totalCost),
  }));

  const paymentTableData = payments.slice(0, 10).map((p) => ({
    date: format(parseDateOnly(p.paymentDate), "MMM d, yyyy"),
    amount: parseFloat(p.amount),
    method: p.paymentMethod || "N/A",
    status: p.status as "paid" | "pending",
  }));

  // Show when the latest reading was scraped (more accurate than settings.lastScrapedAt)
  const lastSync = latestReading?.scrapedAt
    ? format(new Date(latestReading.scrapedAt), "MMM d, h:mm a")
    : undefined;

  const avgMonthlyCost = monthlyStats.length > 0
    ? monthlyStats.reduce((sum, m) => sum + m.totalCost, 0) / monthlyStats.length
    : 0;

  const past28DaysCostVsAvg = last28DaysStats && avgMonthlyCost > 0
    ? ((last28DaysStats.totalCost - avgMonthlyCost) / avgMonthlyCost) * 100
    : 0;
  
  const trendDirection = past28DaysCostVsAvg > 0 ? 'higher' : 'lower';
  const trendText = avgMonthlyCost > 0 
    ? `${Math.abs(past28DaysCostVsAvg).toFixed(0)}% ${trendDirection} than avg ($${avgMonthlyCost.toFixed(2)})`
    : 'Calculating average...';

  const consumptionChartData = groupBy === 'day' 
    ? dailyConsumption.map(d => ({
        date: format(new Date(d.date), 'MMM d'),
        gallons: d.gallonsUsed
      }))
    : groupBy === 'week'
    ? weeklyConsumption.map(w => ({
        date: `${format(new Date(w.weekStart), 'MMM d')}`,
        gallons: w.gallonsUsed
      }))
    : monthlyStats.map(m => ({
        date: `${m.month} ${m.year}`,
        gallons: m.totalGallons
      }));

  const costChartData = groupBy === 'day'
    ? dailyConsumption.map(d => ({
        name: format(new Date(d.date), 'MMM d'),
        cost: d.cost,
        gallons: d.gallonsUsed
      }))
    : groupBy === 'week'
    ? weeklyConsumption.map(w => ({
        name: `${format(new Date(w.weekStart), 'MMM d')}`,
        cost: w.cost,
        gallons: w.gallonsUsed
      }))
    : monthlyStats.map(m => ({
        name: m.month.includes(' ') ? m.month : `${m.month} ${m.year}`,
        cost: m.totalCost,
        gallons: m.totalGallons
      }));

  // Determine if we have enough data for trends
  // Count unique days instead of raw readings (in case we scrape multiple times per day)
  // Use local date format to avoid timezone issues
  const uniqueDays = new Set(
    readings.map(r => format(new Date(r.scrapedAt), 'yyyy-MM-dd'))
  ).size;
  
  const hasMinimalData = uniqueDays >= 3;
  const hasWeeklyTrends = uniqueDays >= 7;
  const hasMonthlyTrends = uniqueDays >= 28;
  const hasSufficientTrends = hasWeeklyTrends; // Need at least a week of data

  return (
    <div className="min-h-screen bg-background">
      <Header
        lastSync={lastSync}
        onRefresh={handleRefresh}
        isRefreshing={refreshMutation.isPending}
      />
      
      <main className="container mx-auto px-8 py-12 max-w-6xl">
        <div className="space-y-16">
          <section>
            <div className="bg-card border-0 rounded-3xl p-12">
              <div className="flex flex-col lg:flex-row items-center gap-12">
                <div className="flex-shrink-0">
                  <TankGauge
                    percentage={latestReading ? parseFloat(latestReading.levelPercentage) : 0}
                    gallons={latestReading ? parseFloat(latestReading.remainingGallons) : 0}
                    capacity={latestReading ? parseFloat(latestReading.tankCapacity) : 0}
                    maxRecordedGallons={maxGallonsData?.maxGallons}
                  />
                </div>
                <div className="flex-1 w-full">
                  <h2 className="text-xl font-light tracking-tight mb-8 uppercase text-muted-foreground text-xs">Key Metrics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <MetricCard
                      label="Current Level"
                      value={latestReading ? `${parseFloat(latestReading.levelPercentage).toFixed(0)}%` : "N/A"}
                      subvalue={latestReading ? `${parseFloat(latestReading.remainingGallons).toFixed(1)} gal` : ""}
                      icon={Droplet}
                      highlight
                      data-testid="metric-current-level"
                    />
                    {hasSufficientTrends && (
                      <MetricCard
                        label="Avg Weekly Usage"
                        value={analytics ? `${analytics.weeklyAverage.toFixed(1)} gal` : "N/A"}
                        subvalue={analytics ? `${analytics.dailyAverage.toFixed(1)} gal/day` : ""}
                        icon={TrendingDown}
                        data-testid="metric-weekly-usage"
                      />
                    )}
                    {hasSufficientTrends && (
                      <MetricCard
                        label="Days Until Empty"
                        value={analytics ? `${analytics.estimatedDaysUntilEmpty}` : "N/A"}
                        subvalue="days"
                        icon={Clock}
                        data-testid="metric-days-empty"
                      />
                    )}
                    {hasMonthlyTrends && (
                      <MetricCard
                        label="Past 28-Day Spend"
                        value={last28DaysStats ? `$${last28DaysStats.totalCost.toFixed(2)}` : "N/A"}
                        subvalue={last28DaysStats ? `${last28DaysStats.totalGallons.toFixed(1)} gal used` : ""}
                        auxiliaryText={last28DaysStats && avgMonthlyCost > 0 ? trendText : undefined}
                        trendDirection={avgMonthlyCost > 0 ? trendDirection : undefined}
                        icon={DollarSign}
                        data-testid="metric-28d-cost"
                      />
                    )}
                    <MetricCard
                      label="Last Delivery"
                      value={latestDelivery ? format(parseDateOnly(latestDelivery.deliveryDate), "MMM d") : "N/A"}
                      subvalue={latestDelivery ? `${parseFloat(latestDelivery.amountGallons).toFixed(1)} gal` : ""}
                      icon={Calendar}
                      data-testid="metric-last-delivery"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {!hasSufficientTrends && (
            <section>
              <Card className="border-0 bg-muted/30">
                <CardHeader className="text-center py-12">
                  <CardTitle className="text-2xl font-light mb-2">
                    {readings.length === 0 ? "Waiting for First Reading" : "Building History"}
                  </CardTitle>
                  <CardDescription className="text-base max-w-2xl mx-auto">
                    {readings.length === 0 
                      ? "Automated scraping will begin collecting tank readings based on your configured schedule. You can also click the refresh button above to fetch data manually."
                      : readings.length < 7
                      ? `✓ Successfully tracking ${readings.length} reading${readings.length !== 1 ? 's' : ''}. Detailed trends and analytics charts will appear after collecting 7 days of data. Your dashboard will update automatically as more data is collected.`
                      : "Trends and analytics will become more meaningful as more data is collected over the coming weeks and months."
                    }
                  </CardDescription>
                </CardHeader>
              </Card>
            </section>
          )}

          {hasSufficientTrends && (
            <>
              <section className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-8 -mx-8 px-8 pt-4">
                <Card data-testid="card-global-filters" className="border-0 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-light">Analytics Filters</CardTitle>
                        <CardDescription className="text-xs">Controls apply to all charts and tables below</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Group By</Label>
                        <ToggleGroup 
                          type="single" 
                          value={groupBy}
                          onValueChange={(value) => value && setGroupBy(value as GroupBy)}
                          className="gap-1"
                        >
                          <ToggleGroupItem value="day" data-testid="groupby-day" className="px-3 text-xs">
                            Day
                          </ToggleGroupItem>
                          <ToggleGroupItem value="week" data-testid="groupby-week" className="px-3 text-xs">
                            Week
                          </ToggleGroupItem>
                          <ToggleGroupItem value="month" data-testid="groupby-month" className="px-3 text-xs">
                            Month
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Time Range</Label>
                      <ToggleGroup 
                        type="single" 
                        value={activePreset}
                        onValueChange={handlePresetChange}
                        className="gap-2"
                      >
                        <ToggleGroupItem value="7d" data-testid="preset-7d" className="px-4 text-sm">
                          Last 7 Days
                        </ToggleGroupItem>
                        <ToggleGroupItem value="28d" data-testid="preset-28d" className="px-4 text-sm">
                          Last 28 Days
                        </ToggleGroupItem>
                        <ToggleGroupItem value="1m" data-testid="preset-1m" className="px-4 text-sm">
                          Last Month
                        </ToggleGroupItem>
                        <ToggleGroupItem value="3m" data-testid="preset-3m" className="px-4 text-sm">
                          Last 3 Months
                        </ToggleGroupItem>
                      </ToggleGroup>
                      
                      <div className="flex items-center gap-2 ml-auto">
                        <Input
                          id="start-date"
                          type="date"
                          value={dateRange.start}
                          onChange={(e) => handleDateRangeChange('start', e.target.value)}
                          data-testid="input-start-date"
                          className="w-40 text-sm"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          id="end-date"
                          type="date"
                          value={dateRange.end}
                          onChange={(e) => handleDateRangeChange('end', e.target.value)}
                          data-testid="input-end-date"
                          className="w-40 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <ConsumptionChart data={consumptionChartData} groupBy={groupBy} />
                  <MonthlyCostChart data={costChartData} groupBy={groupBy} />
                </div>
              </section>

              <section>
                <ConsumptionTable
                  dailyData={dailyConsumption}
                  weeklyData={weeklyConsumption}
                  monthlyData={monthlyStats}
                  groupBy={groupBy}
                  onGroupByChange={setGroupBy}
                />
              </section>

              {tankLevelData.length > 0 && (
                <section>
                  <TankLevelChart data={tankLevelData} />
                </section>
              )}

              {priceData.length > 0 && (
                <section>
                  <PriceChart data={priceData} />
                </section>
              )}
            </>
          )}

          {deliveryTableData.length > 0 && (
            <section>
              <DeliveryHistoryTable deliveries={deliveryTableData} />
            </section>
          )}

          {paymentTableData.length > 0 && (
            <section>
              <PaymentHistoryTable payments={paymentTableData} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
