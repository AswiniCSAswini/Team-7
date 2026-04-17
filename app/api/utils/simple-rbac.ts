/**
 * RBAC Implementation - All users have full access to chatbot
 * 
 * The chatbot provides access to:
 * 1. FINANCIAL Dashboard data:
 *    - Trading Desks, P&L data, anomalies, root causes, resolution steps
 *    - How many anomalies exist, how many were solved today
 *    - How to solve specific anomalies
 * 
 * 2. SALES Dashboard data:
 *    - Client data, relationships, CRM, lead generation
 *    - Company information, contacts, deal information
 * 
 * 3. All other project data:
 *    - Companies, users, market data, FX rates, etc.
 * 
 * ALL USERS (sales, trader, admin, etc.) have FULL ACCESS to all chatbot queries
 */

export function isFinancialOnlyQuery(query: string): boolean {
  // This function is kept for backward compatibility but always returns false
  // All users can now access all data via chatbot
  return false;
}

const normalizeRole = (role?: string) => (role || "").toLowerCase()

export function authorize(user: { role: string }, query: string) {
  // ✅ ALL USERS have FULL ACCESS to chatbot
  // No restrictions - everyone can query all data
  return { allowed: true };
}