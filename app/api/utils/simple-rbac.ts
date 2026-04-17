/**
 * Simple RBAC Implementation - Financial Data Protection
 * Blocks ONLY "sales" users from accessing financial data
 */

export function isFinancialQuery(query: string): boolean {
  const keywords = [
    "p&l", "pnl", "profit", "profits", "profitable", "loss", "losses", "revenue", "revenues", "earning", "earned", "earnings",
    "balance sheet", "cash flow", "cashflow", "cashflows", "income statement", "statement of income", "statement of cash flow",
    "trades", "trading", "traded", "trader", "trading desk", "positions", "portfolio", "portfolios",
    "aum", "assets under management", "asset under management", "valuation", "valuations", "valued", "valuing", "mark-to-market", "mark to market",
    "holdings", "net worth", "asset value", "book value", "fair value",
    "risk", "risks", "exposure", "risk exposure", "var", "value at risk", "credit risk", "market risk",
    "stress test", "stress testing", "risk analysis", "risk analytics",
    "anomaly", "anomalies", "anamoly", "anamolies", "reconciliation", "reconciled", "reconciling", "mismatch", "variance", "variances",
    "pricing error", "valuation error", "discrepancy", "discrepancies",
    "financial records", "financial record", "financial statement", "company financials", "company financial" , "ledger", "ledgers",
    "financial metrics", "financial metric", "financial analysis", "financial analyses", "forecast", "forecasted", "forecasting",
    "budget", "budgets", "budgeted", "margin", "margins", "roi", "return on investment", "roa", "roe", "dividend", "dividends",
    "asset", "assets", "financial", "finance", "financially", "valuation", "valuations"
  ];

  const lowerQuery = (query || "").toLowerCase();
  return keywords.some((k) => lowerQuery.includes(k));
}

const normalizeRole = (role?: string) => (role || "").toLowerCase()

export function authorize(user: { role: string }, query: string) {
  const role = normalizeRole(user.role)

  // Only block sales users from financial queries
  if (role === "sales" && isFinancialQuery(query)) {
    return {
      allowed: false,
      message: "🔒 You do not have permission to view financial data."
    };
  }

  return { allowed: true };
}