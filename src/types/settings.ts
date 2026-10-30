export type CurrencyCode = 'USD' | 'IDR' | 'EUR';

export interface AppSettings {
  currency: CurrencyCode;
  currencySymbol: string;
  startingBalance: number;
  // XAUUSD specific broker specifications
  xauusdContractSize: number; // typically 100 for standard lot (100 oz), 10 for mini, 1 for micro
  xauusdPointValue: number; // e.g. 0.01 for gold with 2 decimals
  xauusdTickSize?: number; // default 0.01
  xauusdTickValue?: number; // default 1.00 for 100 oz standard lot
  xauusdMinLot?: number; // default 0.01
  xauusdLotStep?: number; // default 0.01
  defaultLeverage?: number; // e.g. 500 for 1:500
  brokerCommissionPerLot: number; // e.g. $6 per standard lot roundturn
  // Risk management parameters
  defaultRiskPercent: number; // e.g. 1.0%
  maxTradeRiskPercent?: number; // e.g. 2.0%
  maxTradeRiskAmount?: number; // e.g. $200
  maxDailyLossPercent: number; // e.g. 3.0%
  maxDailyLossAmount: number; // e.g. $300
  maxConsecutiveLossLimit: number; // e.g. 3 trades
  maxDrawdownLimitPercent?: number; // e.g. 10.0%
  resetTimezone?: string; // e.g. 'WIB (UTC+7)'
  targetMonthlyReturnPercent: number; // e.g. 8%
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'USD',
  currencySymbol: '$',
  startingBalance: 10000,
  xauusdContractSize: 100, // standard 100 oz
  xauusdPointValue: 0.01,
  xauusdTickSize: 0.01,
  xauusdTickValue: 1.00,
  xauusdMinLot: 0.01,
  xauusdLotStep: 0.01,
  defaultLeverage: 500,
  brokerCommissionPerLot: 6,
  defaultRiskPercent: 1.0,
  maxTradeRiskPercent: 2.0,
  maxTradeRiskAmount: 200,
  maxDailyLossPercent: 3.0,
  maxDailyLossAmount: 300,
  maxConsecutiveLossLimit: 3,
  maxDrawdownLimitPercent: 10.0,
  resetTimezone: 'WIB (UTC+7)',
  targetMonthlyReturnPercent: 8,
};
