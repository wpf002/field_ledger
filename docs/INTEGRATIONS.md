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

Not yet exercised against live accounts: QuickBooks, Plaid, Square, Stripe, Xero,
FreshBooks, USDA NASS. Partner programs required: Farmbrite API (Zapier works
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

Clients that only support OAuth for remote servers (claude.ai custom connectors,
ChatGPT apps) need an OAuth authorization server in front of `/mcp`; that is not
built yet.
