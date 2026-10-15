# Acreflow integrations

Every source is translated into Acreflow's own records (customers, vendors,
invoices, bills, ledger transactions, commodity prices) by the mappers in
`packages/core/src/integrations.ts`, then written by `applyExternalBatch`
(`packages/db/src/ingest.ts`). Re-syncing never duplicates: records are keyed on
the source's ID. Tokens are encrypted at rest (AES-256-GCM, key from
`INTEGRATIONS_KEY`, falling back to `AUTH_SECRET`).

## Turning a connector on

Set the variables on the API service, then use **Integrations** in the app.
OAuth redirect URI for every provider: `<PUBLIC_WEB_URL>/api/integrations/<key>/callback`.

| Provider | Key | Variables | Pulls |
|---|---|---|---|
| QuickBooks Online | `quickbooks` | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT` (`production` or sandbox) | Customers, vendors, invoices, bills, purchases, sales receipts |
| Plaid | `plaid` | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox`/`production`) | Bank and card transactions (`/transactions/sync`) |
| Square | `square` | `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_ENVIRONMENT` | Payments, fees, refunds |
| Stripe | `stripe` | `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_SECRET_KEY` | Balance transactions (read-only Connect) |
| Xero | `xero` | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | Sales invoices and bills |
| FreshBooks | `freshbooks` | `FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET` | Invoices, expenses |
| USDA NASS | `usda_nass` | `USDA_NASS_API_KEY` | Monthly prices received for the farm's crops and state |
| NWS forecast | `nws` | none (farm coordinates) | 7-day forecast |
| Webhook / Zapier | `webhook` | none | Pushed transactions and invoices |
| PayPal | `paypal` | `PAYPAL_ENVIRONMENT` (`sandbox` or live); each farm enters its own REST app Client ID and Secret | Sales, refunds, fees (Transaction Search, 31-day windows) |
| Finicity | `finicity` | `FINICITY_PARTNER_ID`, `FINICITY_PARTNER_SECRET`, `FINICITY_APP_KEY`, `FINICITY_ENV` (`testing` for test customers) | Bank and card transactions via Finicity Connect |
| MX | `mx` | `MX_CLIENT_ID`, `MX_API_KEY`, `MX_ENVIRONMENT` (`production` or integration) | Bank and card transactions via the MX Connect widget |
| USDA AMS Market News | `usda_ams` | `USDA_AMS_API_KEY`; each farm enters the report IDs it wants | Local cash grain bids and livestock auction prices |
| USDA ERS | `usda_ers` | `USDA_ERS_API_KEY` (data.gov key) | ARMS farm business financial ratios, shown as peer values on Health |
| Futures (Barchart) | `futures` | `BARCHART_API_KEY` | Front-month CBOT/CME/ICE prices for the farm's commodities |
| Perplexity | `perplexity` | `PERPLEXITY_API_KEY`, optional `PERPLEXITY_MODEL` (default `sonar`) | `market_research` assistant tool; only the market question is sent |

Finicity and MX open a hosted connect page; accounts linked there arrive on the
next sync. Server-key sources (NASS, ERS, futures) are switched on per farm with
**Connect**. Futures quotes and AMS prices land in `CommodityPrice`; the marketing
view uses a farm's inventory mark first and the front-month future when there's none.

Not yet exercised against live accounts: QuickBooks, Plaid, Square, Stripe, Xero,
FreshBooks, USDA NASS, PayPal, Finicity, MX, USDA AMS, USDA ERS, Barchart, Perplexity.
Mappers are unit-tested against documented payloads. The AMS endpoint and response
fields follow MARS API v1.2 as published; report layouts vary, so the mapper takes
the first average price field present. ERS parameters follow the ARMS API page
(`report=farm business financial ratios`); state-level estimates fall back to the US. Partner programs required: Farmbrite API (Zapier works
today through the webhook), AgriWebb, Agworld, John Deere Operations Center, Trimble.

## Webhook payload

`POST <url from Integrations>` with JSON:

```json
{
  "transactions": [{ "id": "z1", "date": "2026-09-28", "amount": -412.5, "description": "Mineral tubs", "category": "feed" }],
  "invoices": [{ "id": "i1", "number": "1001", "customer": "Kessler Cattle", "issued": "2026-09-20", "due": "2026-10-20", "total": 1500, "balance": 1500 }]
}
```

Amounts are dollars; negative is money out.

## CSV import

**Import** maps any CSV's columns to customers, vendors, invoices, bills, or
animals. CattleMax animal exports auto-map (tag, birth date, dam, sire, weights).

## Public API and MCP server

Create a token under **My Account → API & AI Connectors**. Scopes: **Read**
(summaries, statements, debt, inventory, receivables, health) and **Read +
Analyze** (adds forecasts, scenarios, insights, brief). Viewers get Read only.
Nothing exposed writes to the books or moves money.

- API: `GET <origin>/api/v1` lists endpoints; `GET /api/v1/<tool>`; `POST /api/v1/run_scenario`.
  Send `Authorization: Bearer afk_...`.
- MCP (Streamable HTTP, stateless): `<origin>/api/mcp`, same bearer token.

Claude Code:

```bash
claude mcp add --transport http acreflow https://<origin>/api/mcp --header "Authorization: Bearer afk_..."
```

claude.ai custom connectors and ChatGPT apps use OAuth instead of a pasted token.
Add `https://<origin>/api/mcp` as the connector URL; the client discovers the rest:

- `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728), pointed to by the
  `WWW-Authenticate` header on a 401 from `/mcp`
- `/.well-known/oauth-authorization-server` (RFC 8414)
- `POST /api/oauth/register`: dynamic client registration (public clients, https or
  loopback redirect URIs)
- `/oauth/authorize`: consent screen; the user picks the farm and Read or
  Read + Analyze (viewers get Read)
- `POST /api/oauth/token`: authorization code with PKCE S256, refresh tokens rotate

Access tokens last 1 hour, refresh tokens 30 days. A refresh fails once the user
loses membership in the farm.
