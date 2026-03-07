export interface Settings {
  id: string;
  userId: string;
  scrapingFrequency: string;
  scheduleWindow: string | null;
  scheduleOffsetMinutes: number | null;
  scheduleSeed: number | null;
  tankfarmUsername: string | null;
  tankfarmPassword: string | null;
  lastScrapedAt: string | null;
  consecutiveFailures: number;
  lastFailureReason: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TankReading {
  id: string;
  userId: string;
  levelPercentage: string;
  remainingGallons: string;
  tankCapacity: string;
  pricePerGallon: string | null;
  tankfarmLastUpdate: string | null;
  scrapedAt: string;
}

export interface Delivery {
  id: string;
  userId: string;
  deliveryDate: string;
  amountGallons: string;
  pricePerGallon: string;
  totalCost: string;
  scrapedAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  paymentDate: string;
  amount: string;
  paymentMethod: string | null;
  status: string;
  scrapedAt: string;
}

export interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}
