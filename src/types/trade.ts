export type TradeOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type TradePosition = 'BUY' | 'SELL';
export type TradingSession = 'Asian' | 'London' | 'New York' | 'Overlap' | 'Other';

export interface Trade {
  id: string;
  dateTime: string; // ISO format: YYYY-MM-DDTHH:mm
  instrument: string; // e.g. "XAUUSD"
  position: TradePosition;
  strategy: string; // e.g. "Liquidity Sweep + CHoCH", "Order Block", "FVG Fill"
  session?: string; // e.g. "London", "New York", "Asian", "Overlap"
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;
  lotSize: number;
  riskAmount: number; // in account currency
  riskPercentage: number; // e.g. 1.0 for 1%
  outcome: TradeOutcome;
  grossProfit: number; // gross PnL
  commission: number; // broker commission/fee
  swap: number; // overnight swap (can be negative or positive)
  netProfit: number; // grossProfit - commission + swap
  rMultiple?: number; // realized Risk-to-Reward ratio (e.g. 2.5R)
  screenshotUrl?: string; // base64 or URL
  notes?: string;
  entryReason?: string; // technical / market context reason
  postTradeEvaluation?: string; // post-trade review & lessons
  disciplineRating?: number; // 1 to 5
  executionNotes?: string;
  isDemo?: boolean; // explicitly marks demo sample data
  createdAt?: string;
  updatedAt?: string;
}

export interface TradeFilter {
  search: string;
  outcome: 'ALL' | TradeOutcome;
  position: 'ALL' | TradePosition;
  strategy: string;
  instrument: string;
  session: string;
  startDate: string;
  endDate: string;
  sortBy: 'date-desc' | 'date-asc' | 'profit-desc' | 'profit-asc' | 'lot-desc';
}
