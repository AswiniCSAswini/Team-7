import { convertToModelMessages, streamText, UIMessage } from "ai"
import { cookies } from "next/headers"
import fs from "fs/promises"
import path from "path"
import companies from "@/data/companies.json"
import crm from "@/data/crm.json"
import assetManagement from "@/data/asset_management.json"
import investmentBanking from "@/data/investment_banking.json"
import trading from "@/data/trading.json"
import leadGeneration from "@/data/lead_generation.json"
import riskAnalysis from "@/data/risk_analysis.json"
import relationshipHistory from "@/data/relationship_history.json"
import trades from "@/data/trades.json"
import marketData from "@/data/market_data.json"
import fxRates from "@/data/fx_rates.json"
import { google } from "@ai-sdk/google"
import { authorize } from "@/app/api/utils/simple-rbac"

export const maxDuration = 30

async function getUserRoleFromSession(req: Request): Promise<string> {
  try {
    // Try to get session ID from cookie or body
    const cookieStore = await cookies()
    let sessionId = cookieStore.get("gs_session_id")?.value

    // If no cookie, try to extract from request body or headers
    if (!sessionId) {
      const authHeader = req.headers.get("x-session-id")
      if (authHeader) {
        sessionId = authHeader
      }
    }

    if (!sessionId) {
      return "unknown"
    }

    // Read sessions file
    const sessionsFile = path.join(process.cwd(), "data", "sessions.json")
    const data = await fs.readFile(sessionsFile, "utf-8")
    const sessionsData = JSON.parse(data) as { sessions: Array<{ sessionId: string; role: string }> }
    
    const session = sessionsData.sessions.find(s => s.sessionId === sessionId)
    return session?.role || "unknown"
  } catch (error) {
    console.error("[CHAT API] Error getting user role:", error)
    return "unknown"
  }
}

async function getDatabaseContext(userRole: string) {
  let tradingDesksData = null
  let anomaliesData: any[] = []

  // ===== FINANCIAL DATA (for trader/admin users) =====
  if (userRole === "trader" || userRole === "admin") {
    try {
      // Read trading desks from file
      const tradingFile = path.join(process.cwd(), "data", "trading_desks.json")
      const tradingContent = await fs.readFile(tradingFile, "utf-8")
      tradingDesksData = JSON.parse(tradingContent)

      // Calculate anomalies from trading desks
      if (tradingDesksData?.tradingDesks) {
        for (const desk of tradingDesksData.tradingDesks) {
          if (desk.status === "Anomaly") {
            const deskTrades = trades.trades.filter(trade => trade.desk_id === desk.desk_id)
            const rootCauses = []

            for (const trade of deskTrades) {
              const marketInfo = marketData.marketData.find(md => md.instrument === trade.instrument)
              if (marketInfo && marketInfo.status === "STALE") {
                rootCauses.push(`Stale market data used for ${trade.instrument} valuation`)
              }

              if (trade.currency !== "USD") {
                const fxPair = trade.currency === "EUR" ? "EUR/USD" : "USD/JPY"
                const fxInfo = fxRates.fxRates.find(fx => fx.currency_pair === fxPair && fx.status === "OLD")
                if (fxInfo) {
                  rootCauses.push(`Old ${fxPair} FX rate applied`)
                }
              }
            }

            anomaliesData.push({
              desk_id: desk.desk_id,
              desk_name: desk.desk_name,
              issue: "P&L Variance",
              reported_pnl: desk.pnl_reported,
              expected_pnl: desk.pnl_expected,
              variance: desk.variance,
              root_causes: rootCauses.length > 0 ? rootCauses : ["Multiple valuation discrepancies detected"],
              severity: Math.abs(desk.variance) > 10 ? "HIGH" : "MEDIUM"
            })
          }
        }
      }
    } catch (error) {
      console.error("[CHAT API] Error loading trading desks/anomalies:", error)
    }

    // FINANCIAL USER DATA
    return `
## Goldman Sachs Financial Dashboard Data

### Trading Desks Data
${JSON.stringify(tradingDesksData, null, 2)}

### Active Anomalies & P&L Reconciliation
${JSON.stringify({ anomalies: anomaliesData }, null, 2)}

### Trading Data
${JSON.stringify(trades, null, 2)}

### Market Data
${JSON.stringify(marketData, null, 2)}

### FX Rates Data
${JSON.stringify(fxRates, null, 2)}

### Risk Analysis Data
${JSON.stringify(riskAnalysis, null, 2)}
`
  }

  // ===== SALES DATA (for sales users) =====
  if (userRole === "sales") {
    return `
## Goldman Sachs Sales Dashboard Data

### Companies Overview
${JSON.stringify(companies, null, 2)}

### CRM Data (Contacts & Leadership)
${JSON.stringify(crm, null, 2)}

### Lead Generation Data
${JSON.stringify(leadGeneration, null, 2)}

### Asset Management Data
${JSON.stringify(assetManagement, null, 2)}

### Investment Banking Data
${JSON.stringify(investmentBanking, null, 2)}

### Relationship History Data
${JSON.stringify(relationshipHistory, null, 2)}
`
  }

  // DEFAULT: Return all data for admin/unknown users
  return `
## Goldman Sachs Complete Database

### Companies Overview
${JSON.stringify(companies, null, 2)}

### CRM Data (Contacts & Leadership)
${JSON.stringify(crm, null, 2)}

### Asset Management Data
${JSON.stringify(assetManagement, null, 2)}

### Investment Banking Data
${JSON.stringify(investmentBanking, null, 2)}

### Trading Data
${JSON.stringify(trading, null, 2)}

### Lead Generation Data
${JSON.stringify(leadGeneration, null, 2)}

### Risk Analysis Data
${JSON.stringify(riskAnalysis, null, 2)}

### Relationship History Data
${JSON.stringify(relationshipHistory, null, 2)}

### Trading Desks Data
${JSON.stringify(tradingDesksData, null, 2)}

### Market Data
${JSON.stringify(marketData, null, 2)}

### FX Rates Data
${JSON.stringify(fxRates, null, 2)}

### Trades Data
${JSON.stringify(trades, null, 2)}

### Active Anomalies
${JSON.stringify({ anomalies: anomaliesData }, null, 2)}
`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages } = body as { messages: UIMessage[] }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Get user role from session
    const userRole = await getUserRoleFromSession(req)

    console.log(`[CHAT API] User Role: ${userRole}`)
    console.log(`[CHAT API] Received ${messages.length} messages`)

    // Extract last message for authorization check
    const lastMsg = messages[messages.length - 1] as any
    const lastMessage = lastMsg?.parts?.map((p: any) => p.text || "").join(" ") || lastMsg?.text || ""

    // Perform RBAC authorization before calling LLM
    const auth = authorize({ role: userRole }, lastMessage);

    if (!auth.allowed) {
      console.log(`[CHAT API] Access Denied - Role: ${userRole}, Query: "${lastMessage}"`)
      return new Response(
        JSON.stringify({
          error: "Access Restricted",
          message: "You do not have permission to access this data."
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    console.log(`[CHAT API] Authorization Successful - Role: ${userRole}`)

    // Get database context FIRST with user role
    const databaseContext = await getDatabaseContext(userRole)

    // Build role-specific system prompt
    let systemPrompt = ``
    
    if (userRole === "sales") {
      systemPrompt = `You are an expert Sales AI Assistant for Goldman Sachs 360° Customer Intelligence Platform.

You have access to SALES DASHBOARD DATA ONLY:
- Companies and client information
- CRM data and contacts
- Lead generation and pipeline
- Asset management clients
- Investment banking relationships
- Relationship history

You MUST ONLY answer questions about:
✓ Client information and companies
✓ Sales relationships and contacts
✓ Lead generation and pipeline
✓ Investment banking deals
✓ Asset management clients
✓ Company profiles and industries

You CANNOT answer questions about:
✗ P&L data or financial performance
✗ Trading desks or trading positions
✗ Anomalies or P&L reconciliation
✗ Risk analysis or market data
✗ Trading desk variance or anomalies

CRITICAL: If user asks about financial/trading data, respond that this data is not available in Sales Dashboard.

DATA PROVIDED:
${databaseContext}`
    } else if (userRole === "trader" || userRole === "admin") {
      systemPrompt = `You are an expert Financial AI Assistant for Goldman Sachs Trading Platform.

You have access to FINANCIAL DASHBOARD DATA ONLY:
- Trading desks and P&L data
- Anomalies and reconciliation status
- Trading desk variance and performance
- Market data and FX rates
- Trades and risk analysis
- Root cause analysis for anomalies

You MUST answer questions about:
✓ How many anomalies exist
✓ How many anomalies were solved today
✓ Trading desk P&L and variance
✓ P&L reconciliation and analysis
✓ Anomaly root causes and resolution steps
✓ Market data and trading information

CRITICAL INSTRUCTIONS:
- When asked about anomalies, provide EXACT count with desk names and variance amounts
- Reference specific trading desk data from the provided data
- Provide detailed root causes for each anomaly
- Never make generic responses - always cite specific data values
- Include trading desk IDs and exact P&L figures

DATA PROVIDED:
${databaseContext}`
    } else {
      // Admin has access to all
      systemPrompt = `You are an expert AI Assistant for Goldman Sachs 360° Customer Intelligence Platform (Admin Access).

You have access to ALL DATA:
- Sales dashboard data (companies, CRM, leads, relationships)
- Financial dashboard data (trading desks, P&L, anomalies, trades)
- All business intelligence and market data

Answer any question using the complete database provided.

DATA PROVIDED:
${databaseContext}`
    }

    console.log(`[CHAT API] Initializing Gemini model...`)
    const model = google("gemini-2.5-flash")
    
    const convertedMessages = await convertToModelMessages(messages)
    console.log(`[CHAT API] Converted ${convertedMessages.length} messages for model`)

    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertedMessages,
      abortSignal: req.signal,
    })

    console.log(`[CHAT API] Stream initiated, returning response...`)
    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error(`[CHAT API ERROR]`, error)
    return new Response(
      JSON.stringify({ 
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}