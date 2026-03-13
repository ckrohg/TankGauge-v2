import { type TankReading, type Delivery } from "../schema.js";

export interface DailyConsumption {
  date: string;
  gallonsUsed: number;
  cost: number;
  pricePerGallon: number;
}

export interface TankInventory {
  deliveryId: string;
  gallonsRemaining: number;
  pricePerGallon: number;
}

export interface MonthlyStats {
  month: string;
  year: number;
  totalGallons: number;
  totalCost: number;
  avgDailyUsage: number;
  daysInPeriod: number;
}

export interface ConsumptionAnalytics {
  dailyAverage: number;
  weeklyAverage: number;
  monthlyAverage: number;
  estimatedDaysUntilEmpty: number;
  costSinceLastDelivery: number;
  avgCostPerDay: number;
}

export interface Last28DaysStats {
  totalGallons: number;
  totalCost: number;
  avgDailyGallons: number;
  avgDailyCost: number;
  daysWithData: number;
}

export interface WeeklyConsumption {
  weekStart: string;
  weekEnd: string;
  gallonsUsed: number;
  cost: number;
  avgPricePerGallon: number;
  daysInWeek: number;
}

/**
 * Calculate the cost and weighted average price of consumed fuel using Weighted Average Cost.
 * 
 * WAC Approach: The tank is treated as a blended pool. When a delivery is added at a different
 * price, it blends with existing fuel to calculate a new average. Consumption is priced at this
 * blended rate until the next delivery changes the mix.
 * 
 * This implementation:
 * 1. Builds tank state by processing deliveries and readings chronologically
 * 2. Reconciles modeled inventory to actual readings at each checkpoint
 * 3. Uses market price (pricePerGallon from readings) when no delivery history exists
 * 4. For mid-interval deliveries, uses the post-delivery blended price (simplified approach)
 * 
 * @param gallonsConsumed - Amount of fuel consumed in this period
 * @param deliveries - All deliveries
 * @param readings - All readings to track inventory
 * @param currentReading - The reading where consumption occurred  
 * @param previousReading - The reading before consumption
 * @returns Object with totalCost and avgPricePerGallon for the consumed fuel
 */
function calculateConsumptionCost(
  gallonsConsumed: number,
  deliveries: Delivery[],
  readings: TankReading[],
  currentReading: TankReading,
  previousReading: TankReading
): { totalCost: number; avgPricePerGallon: number } {
  if (gallonsConsumed <= 0) {
    return { totalCost: 0, avgPricePerGallon: 0 };
  }

  // Sort deliveries and readings by date
  const sortedDeliveries = [...deliveries]
    .filter(d => new Date(d.deliveryDate) <= new Date(currentReading.scrapedAt))
    .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime());

  const sortedReadings = [...readings].sort(
    (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
  );

  // If no deliveries, use market price from reading as fallback
  if (sortedDeliveries.length === 0) {
    const marketPrice = parseFloat(previousReading.pricePerGallon || '0');
    return {
      totalCost: gallonsConsumed * marketPrice,
      avgPricePerGallon: marketPrice,
    };
  }

  // Track tank state: value and gallons
  let tankValue = 0;
  let tankGallons = 0;
  let weightedAvgPrice = 0;
  let deliveryIdx = 0;
  let prevReadingGallons = 0;

  // Process all readings up to and including previous reading
  for (let i = 0; i < sortedReadings.length; i++) {
    const reading = sortedReadings[i];
    const readingDate = new Date(reading.scrapedAt);
    const readingGallons = parseFloat(reading.remainingGallons);
    const marketPrice = parseFloat(reading.pricePerGallon || '0');
    
    // Add any deliveries that occurred up to this reading
    while (deliveryIdx < sortedDeliveries.length && 
           new Date(sortedDeliveries[deliveryIdx].deliveryDate) <= readingDate) {
      const d = sortedDeliveries[deliveryIdx];
      const dGallons = parseFloat(d.amountGallons);
      const dPrice = parseFloat(d.pricePerGallon);
      
      // Blend: new_avg = (old_value + delivery_value) / (old_gallons + delivery_gallons)
      tankValue += dGallons * dPrice;
      tankGallons += dGallons;
      weightedAvgPrice = tankGallons > 0 ? tankValue / tankGallons : 0;
      
      deliveryIdx++;
    }

    // Apply consumption between readings (if consumption detected)
    if (i > 0 && prevReadingGallons > readingGallons) {
      const consumed = prevReadingGallons - readingGallons;
      // Under WAC, consumption doesn't change the average price, just reduces inventory
      const consumedValue = consumed * weightedAvgPrice;
      tankValue = Math.max(0, tankValue - consumedValue);
      tankGallons = Math.max(0, tankGallons - consumed);
    }

    // Reconcile: Align modeled inventory to actual reading
    // This corrects for sensor drift, data gaps, and mid-season starts
    if (readingGallons > 0) {
      if (weightedAvgPrice === 0) {
        // No price yet - seed from market price
        weightedAvgPrice = marketPrice;
      }
      if (tankGallons !== readingGallons) {
        // Adjust to match reading, preserving weighted average price
        tankGallons = readingGallons;
        tankValue = readingGallons * weightedAvgPrice;
      }
    }
    
    prevReadingGallons = readingGallons;
    
    // Stop after processing previous reading
    if (reading.id === previousReading.id) break;
  }

  // Process any deliveries between previous and current reading
  // (Blend them before pricing the consumption)
  const currReadingDate = new Date(currentReading.scrapedAt);
  while (deliveryIdx < sortedDeliveries.length && 
         new Date(sortedDeliveries[deliveryIdx].deliveryDate) <= currReadingDate) {
    const d = sortedDeliveries[deliveryIdx];
    const dGallons = parseFloat(d.amountGallons);
    const dPrice = parseFloat(d.pricePerGallon);
    
    tankValue += dGallons * dPrice;
    tankGallons += dGallons;
    weightedAvgPrice = tankGallons > 0 ? tankValue / tankGallons : weightedAvgPrice;
    
    deliveryIdx++;
  }

  // Final fallback: ensure we have a price
  if (weightedAvgPrice === 0) {
    weightedAvgPrice = parseFloat(previousReading.pricePerGallon || '0');
  }

  // Price consumption at current weighted average
  const totalCost = gallonsConsumed * weightedAvgPrice;

  return {
    totalCost,
    avgPricePerGallon: weightedAvgPrice,
  };
}

/**
 * Calculate daily consumption between consecutive readings using Weighted Average Cost.
 * This accounts for the tank containing a blended mix of fuel from multiple deliveries at different prices.
 * When a delivery is added, the price is blended with existing tank contents to calculate a new weighted average.
 * All consumption is priced at this blended rate until the next delivery changes the mix.
 */
export function calculateDailyConsumption(
  readings: TankReading[],
  deliveries: Delivery[]
): DailyConsumption[] {
  if (readings.length < 2) return [];

  const sortedReadings = [...readings].sort(
    (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
  );

  const dailyData: DailyConsumption[] = [];

  for (let i = 1; i < sortedReadings.length; i++) {
    const current = sortedReadings[i];
    const previous = sortedReadings[i - 1];

    const gallonsUsed = parseFloat(previous.remainingGallons) - parseFloat(current.remainingGallons);
    
    // Only include if consumption is positive (ignore deliveries)
    if (gallonsUsed > 0) {
      // Calculate cost of actual fuel consumed using FIFO
      const { totalCost, avgPricePerGallon } = calculateConsumptionCost(
        gallonsUsed,
        deliveries,
        readings,
        current,
        previous
      );

      dailyData.push({
        date: new Date(current.scrapedAt).toISOString().split('T')[0],
        gallonsUsed,
        cost: totalCost,
        pricePerGallon: avgPricePerGallon,
      });
    }
  }

  return dailyData;
}

/**
 * Calculate monthly statistics
 */
export function calculateMonthlyStats(
  readings: TankReading[],
  deliveries: Delivery[]
): MonthlyStats[] {
  if (readings.length < 2) return [];

  const dailyData = calculateDailyConsumption(readings, deliveries);

  // Determine the full date range from readings
  const sortedReadings = [...readings].sort(
    (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
  );
  const firstDate = new Date(sortedReadings[0].scrapedAt);
  const lastDate = new Date(sortedReadings[sortedReadings.length - 1].scrapedAt);

  const monthlyMap = new Map<string, { gallons: number; cost: number; days: Set<string> }>();

  // Create entries for ALL months in the readings range
  const monthCursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  while (monthCursor <= lastDate) {
    const monthKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(monthKey, { gallons: 0, cost: 0, days: new Set() });
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }

  // Fill in actual consumption data
  dailyData.forEach((day) => {
    const date = new Date(day.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const stats = monthlyMap.get(monthKey);
    if (stats) {
      stats.gallons += day.gallonsUsed;
      stats.cost += day.cost;
      stats.days.add(day.date);
    }
  });

  const monthlyStats: MonthlyStats[] = [];
  monthlyMap.forEach((stats, monthKey) => {
    const [year, month] = monthKey.split('-');
    const daysInPeriod = stats.days.size;

    monthlyStats.push({
      month: new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      }),
      year: parseInt(year),
      totalGallons: stats.gallons,
      totalCost: stats.cost,
      avgDailyUsage: daysInPeriod > 0 ? stats.gallons / daysInPeriod : 0,
      daysInPeriod,
    });
  });

  // Sort ascending (oldest first) so charts display time left-to-right
  return monthlyStats.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return new Date(a.month).getMonth() - new Date(b.month).getMonth();
  });
}

/**
 * Calculate consumption analytics
 */
export function calculateConsumptionAnalytics(
  readings: TankReading[],
  deliveries: Delivery[]
): ConsumptionAnalytics | null {
  if (readings.length < 2) return null;

  const dailyData = calculateDailyConsumption(readings, deliveries);
  if (dailyData.length === 0) return null;

  const totalGallons = dailyData.reduce((sum, day) => sum + day.gallonsUsed, 0);
  const totalCost = dailyData.reduce((sum, day) => sum + day.cost, 0);
  const daysSpan = dailyData.length;

  const dailyAverage = totalGallons / daysSpan;
  const weeklyAverage = dailyAverage * 7;
  const monthlyAverage = dailyAverage * 30;

  // Get current tank level
  const latestReading = [...readings].sort(
    (a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
  )[0];

  const currentGallons = parseFloat(latestReading.remainingGallons);
  const estimatedDaysUntilEmpty = dailyAverage > 0 ? Math.floor(currentGallons / dailyAverage) : 0;

  // Cost since last delivery
  const latestDelivery = deliveries.length > 0
    ? [...deliveries].sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime())[0]
    : null;

  let costSinceLastDelivery = 0;
  let avgCostPerDay = 0;

  if (latestDelivery) {
    const readingsSinceDelivery = readings.filter(
      (r) => new Date(r.scrapedAt) >= new Date(latestDelivery.deliveryDate)
    );
    const dailySinceDelivery = calculateDailyConsumption(readingsSinceDelivery, deliveries);
    costSinceLastDelivery = dailySinceDelivery.reduce((sum, day) => sum + day.cost, 0);
    avgCostPerDay = dailySinceDelivery.length > 0 ? costSinceLastDelivery / dailySinceDelivery.length : 0;
  }

  return {
    dailyAverage,
    weeklyAverage,
    monthlyAverage,
    estimatedDaysUntilEmpty,
    costSinceLastDelivery,
    avgCostPerDay,
  };
}

/**
 * Calculate statistics for the last 28 days
 */
export function calculateLast28DaysStats(
  readings: TankReading[],
  deliveries: Delivery[]
): Last28DaysStats {
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  const recentReadings = readings.filter(
    (r) => new Date(r.scrapedAt) >= twentyEightDaysAgo
  );

  const dailyData = calculateDailyConsumption(recentReadings, deliveries);

  const totalGallons = dailyData.reduce((sum, day) => sum + day.gallonsUsed, 0);
  const totalCost = dailyData.reduce((sum, day) => sum + day.cost, 0);
  const daysWithData = dailyData.length;

  return {
    totalGallons,
    totalCost,
    avgDailyGallons: daysWithData > 0 ? totalGallons / daysWithData : 0,
    avgDailyCost: daysWithData > 0 ? totalCost / daysWithData : 0,
    daysWithData,
  };
}

/**
 * Calculate weekly consumption aggregation
 */
export function calculateWeeklyConsumption(
  readings: TankReading[],
  deliveries: Delivery[]
): WeeklyConsumption[] {
  if (readings.length < 2) return [];

  const dailyData = calculateDailyConsumption(readings, deliveries);

  // Determine the full date range from readings (not just consumption days)
  const sortedReadings = [...readings].sort(
    (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
  );
  const firstDate = new Date(sortedReadings[0].scrapedAt);
  const lastDate = new Date(sortedReadings[sortedReadings.length - 1].scrapedAt);

  // Build a map of consumption by week from daily data
  const weeklyMap = new Map<string, {
    start: Date;
    end: Date;
    gallons: number;
    cost: number;
    days: number;
    totalPrice: number;
  }>();

  // First, create entries for ALL weeks in the readings range (including zero-consumption weeks)
  const weekCursor = new Date(firstDate);
  weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay()); // Start of first week (Sunday)
  weekCursor.setHours(0, 0, 0, 0);

  while (weekCursor <= lastDate) {
    const weekKey = weekCursor.toISOString().split('T')[0];
    const weekEnd = new Date(weekCursor);
    weekEnd.setDate(weekCursor.getDate() + 6);
    weeklyMap.set(weekKey, {
      start: new Date(weekCursor),
      end: weekEnd,
      gallons: 0,
      cost: 0,
      days: 0,
      totalPrice: 0,
    });
    weekCursor.setDate(weekCursor.getDate() + 7);
  }

  // Then fill in actual consumption data
  dailyData.forEach((day) => {
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    const week = weeklyMap.get(weekKey);
    if (week) {
      week.gallons += day.gallonsUsed;
      week.cost += day.cost;
      week.days++;
      week.totalPrice += day.pricePerGallon * day.gallonsUsed;
    }
  });

  const weeklyData: WeeklyConsumption[] = [];
  weeklyMap.forEach((week) => {
    weeklyData.push({
      weekStart: week.start.toISOString().split('T')[0],
      weekEnd: week.end.toISOString().split('T')[0],
      gallonsUsed: week.gallons,
      cost: week.cost,
      avgPricePerGallon: week.gallons > 0 ? week.totalPrice / week.gallons : 0,
      daysInWeek: week.days,
    });
  });

  // Sort ascending (oldest first) so charts display time left-to-right
  return weeklyData.sort(
    (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
  );
}
