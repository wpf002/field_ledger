/**
 * Integration providers. Each entry says how a farm connects (OAuth, Plaid Link,
 * server API key, public data, file, or partner program), which environment
 * variables turn it on, and how to pull data into provider-neutral records.
 * Network calls follow each provider's public API reference; nothing here runs
 * until the listed credentials are configured.
 */
import {
  emptyBatch, mapPlaidTransaction, mapStripeBalanceTxn, mapSquarePayment, mapQboInvoice, mapQboBill, mapQboCustomer, mapQboVendor,
  mapQboPurchase, mapQboSalesReceipt, mapXeroInvoice, mapFreshbooksInvoice, mapFreshbooksExpense, mapNassPrice,
  mapPaypalTxn, mapFinicityTxn, mapMxTxn, mapAmsRow, mapBarchartQuote, mapArmsRow, FUTURES,
  type PaypalTxn, type FinicityTxn, type MxTxn, type AmsRow, type BarchartQuote, type ArmsRow,
  type ExternalBatch, type PlaidTransaction, type StripeBalanceTxn, type SquarePayment, type QboInvoice, type QboBill, type QboParty,
  type QboPurchase, type QboSalesReceipt, type XeroInvoice, type FreshbooksInvoice, type FreshbooksExpense, type NassRow,
} from "@fl/core";

export type AuthKind = "oauth2" | "plaid_link" | "connect_url" | "credentials" | "server_key" | "public" | "file" | "webhook" | "partner";
export type CredentialField = { key: string; label: string; secret?: boolean; placeholder?: string };
export type Tokens = { accessToken: string; refreshToken?: string; expiresIn?: number; externalAccountId?: string; label?: string };
export type SyncContext = { accessToken: string; externalAccountId: string | null; cursor: Record<string, unknown>; since: Date; farm: { commodities: string[]; state: string | null } };
export type Provider = {
  key: string; name: string; category: string; phase: 1 | 2 | 3; auth: AuthKind; env: string[]; pulls: string; docs: string;
  authorizeUrl?: (state: string, redirectUri: string) => string;
  exchange?: (code: string, redirectUri: string, query: Record<string, string>) => Promise<Tokens>;
  refresh?: (refreshToken: string) => Promise<Tokens>;
  sync?: (ctx: SyncContext) => Promise<{ batch: ExternalBatch; cursor?: Record<string, unknown> }>;
  /** credentials: fields the farm enters (stored sealed, passed to sync as JSON in accessToken). */
  fields?: CredentialField[];
  verify?: (creds: Record<string, string>) => Promise<{ label?: string }>;
  /** connect_url: create the remote user and return the hosted connect page. */
  connectUrl?: (o: { farmId: string; redirectUri: string; externalAccountId?: string | null }) => Promise<{ url: string; externalAccountId: string }>;
};

const env = (k: string) => process.env[k] ?? "";
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

// ---------- QuickBooks Online ----------
const QBO_BASE = () => (env("QBO_ENVIRONMENT") === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com");
async function qboToken(body: Record<string, string>): Promise<Tokens> {
  const t = await json<{ access_token: string; refresh_token: string; expires_in: number }>(await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST", headers: { Authorization: basic(env("QBO_CLIENT_ID"), env("QBO_CLIENT_SECRET")), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form(body),
  }));
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in };
}
async function qboQuery<T>(ctx: SyncContext, entity: string, where = ""): Promise<T[]> {
  const out: T[] = [];
  for (let start = 1; ; start += 1000) {
    const q = `select * from ${entity}${where} startposition ${start} maxresults 1000`;
    const r = await json<{ QueryResponse: Record<string, T[]> }>(await fetch(`${QBO_BASE()}/v3/company/${ctx.externalAccountId}/query?${qs({ query: q, minorversion: "75" })}`, { headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: "application/json" } }));
    const rows = r.QueryResponse[entity] ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ---------- Plaid ----------
const PLAID_BASE = () => `https://${env("PLAID_ENV") || "sandbox"}.plaid.com`;
const plaidPost = <T>(path: string, body: Record<string, unknown>) => fetch(`${PLAID_BASE()}${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env("PLAID_CLIENT_ID"), secret: env("PLAID_SECRET"), ...body }),
}).then((r) => json<T>(r));
export const plaid = {
  linkToken: (userId: string) => plaidPost<{ link_token: string }>("/link/token/create", { client_name: "Acreflow", user: { client_user_id: userId }, products: ["transactions"], country_codes: ["US"], language: "en" }),
  exchange: async (publicToken: string): Promise<Tokens> => {
    const r = await plaidPost<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
    return { accessToken: r.access_token, externalAccountId: r.item_id };
  },
};

// ---------- Xero ----------
async function xeroToken(body: Record<string, string>): Promise<Tokens> {
  const t = await json<{ access_token: string; refresh_token: string; expires_in: number }>(await fetch("https://identity.xero.com/connect/token", {
    method: "POST", headers: { Authorization: basic(env("XERO_CLIENT_ID"), env("XERO_CLIENT_SECRET")), "Content-Type": "application/x-www-form-urlencoded" }, body: form(body),
  }));
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in };
}

// ---------- FreshBooks ----------
async function freshbooksToken(body: Record<string, string>): Promise<Tokens> {
  const t = await json<{ access_token: string; refresh_token: string; expires_in: number }>(await fetch("https://api.freshbooks.com/auth/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env("FRESHBOOKS_CLIENT_ID"), client_secret: env("FRESHBOOKS_CLIENT_SECRET"), ...body }),
  }));
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in };
}

// ---------- Square ----------
const SQUARE_BASE = () => (env("SQUARE_ENVIRONMENT") === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com");
async function squareToken(body: Record<string, string>): Promise<Tokens> {
  const t = await json<{ access_token: string; refresh_token?: string; expires_at?: string; merchant_id?: string }>(await fetch(`${SQUARE_BASE()}/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/json", "Square-Version": "2024-10-17" }, body: JSON.stringify({ client_id: env("SQUARE_APPLICATION_ID"), client_secret: env("SQUARE_APPLICATION_SECRET"), ...body }),
  }));
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_at ? Math.floor((Date.parse(t.expires_at) - Date.now()) / 1000) : undefined, externalAccountId: t.merchant_id };
}

// ---------- PayPal ----------
const PAYPAL_BASE = () => (env("PAYPAL_ENVIRONMENT") === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");
async function paypalToken(c: Record<string, string>) {
  const t = await json<{ access_token: string }>(await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: basic(c.clientId ?? "", c.secret ?? ""), "Content-Type": "application/x-www-form-urlencoded" }, body: form({ grant_type: "client_credentials" }),
  }));
  return t.access_token;
}

// ---------- Finicity (Mastercard Open Finance) ----------
const FINICITY = "https://api.finicity.com";
async function finicityHeaders() {
  const h = { "Finicity-App-Key": env("FINICITY_APP_KEY"), "Content-Type": "application/json", Accept: "application/json" };
  const t = await json<{ token: string }>(await fetch(`${FINICITY}/aggregation/v2/partners/authentication`, { method: "POST", headers: h, body: JSON.stringify({ partnerId: env("FINICITY_PARTNER_ID"), partnerSecret: env("FINICITY_PARTNER_SECRET") }) }));
  return { ...h, "Finicity-App-Token": t.token };
}

// ---------- MX ----------
const MX_BASE = () => (env("MX_ENVIRONMENT") === "production" ? "https://api.mx.com" : "https://int-api.mx.com");
const mxHeaders = () => ({ Authorization: basic(env("MX_CLIENT_ID"), env("MX_API_KEY")), Accept: "application/vnd.mx.api.v1+json", "Content-Type": "application/json" });

// ---------- USDA AMS Market News ----------
const AMS_BASE = "https://marsapi.ams.usda.gov/services/v1.2/reports";

export const PROVIDERS: Provider[] = [
  {
    key: "quickbooks", name: "QuickBooks Online", category: "Accounting", phase: 1, auth: "oauth2", env: ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET"],
    pulls: "Customers, vendors, invoices, bills, cash purchases, sales receipts", docs: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice",
    authorizeUrl: (state, redirect) => `https://appcenter.intuit.com/connect/oauth2?${qs({ client_id: env("QBO_CLIENT_ID"), response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: redirect, state })}`,
    exchange: async (code, redirect, q) => ({ ...(await qboToken({ grant_type: "authorization_code", code, redirect_uri: redirect })), externalAccountId: q.realmId }),
    refresh: (rt) => qboToken({ grant_type: "refresh_token", refresh_token: rt }),
    sync: async (ctx) => {
      const since = ctx.since.toISOString().slice(0, 10);
      const where = ` where MetaData.LastUpdatedTime >= '${since}'`;
      const b = emptyBatch();
      b.parties.push(...(await qboQuery<QboParty>(ctx, "Customer")).map(mapQboCustomer), ...(await qboQuery<QboParty>(ctx, "Vendor")).map(mapQboVendor));
      b.docs.push(...(await qboQuery<QboInvoice>(ctx, "Invoice", where)).map(mapQboInvoice), ...(await qboQuery<QboBill>(ctx, "Bill", where)).map(mapQboBill));
      b.txns.push(...(await qboQuery<QboPurchase>(ctx, "Purchase", where)).map(mapQboPurchase), ...(await qboQuery<QboSalesReceipt>(ctx, "SalesReceipt", where)).map(mapQboSalesReceipt));
      return { batch: b };
    },
  },
  {
    key: "plaid", name: "Bank Accounts (Plaid)", category: "Banking", phase: 1, auth: "plaid_link", env: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
    pulls: "Checking, savings, and card transactions with incremental sync", docs: "https://plaid.com/docs/api/products/transactions/#transactionssync",
    sync: async (ctx) => {
      const b = emptyBatch();
      let cursor = (ctx.cursor.cursor as string | undefined) ?? undefined;
      for (let page = 0; page < 50; page++) {
        const r = await plaidPost<{ added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>("/transactions/sync", { access_token: ctx.accessToken, cursor, count: 500 });
        b.txns.push(...r.added.map(mapPlaidTransaction));
        cursor = r.next_cursor;
        if (!r.has_more) break;
      }
      return { batch: b, cursor: { cursor } };
    },
  },
  {
    key: "square", name: "Square", category: "Payments", phase: 1, auth: "oauth2", env: ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET"],
    pulls: "Market and farm-store sales, processing fees, refunds", docs: "https://developer.squareup.com/reference/square/payments-api/list-payments",
    authorizeUrl: (state) => `${SQUARE_BASE()}/oauth2/authorize?${qs({ client_id: env("SQUARE_APPLICATION_ID"), scope: "PAYMENTS_READ MERCHANT_PROFILE_READ", session: "false", state })}`,
    exchange: (code) => squareToken({ grant_type: "authorization_code", code }),
    refresh: (rt) => squareToken({ grant_type: "refresh_token", refresh_token: rt }),
    sync: async (ctx) => {
      const b = emptyBatch();
      let cursor: string | undefined;
      do {
        const r = await json<{ payments?: SquarePayment[]; cursor?: string }>(await fetch(`${SQUARE_BASE()}/v2/payments?${qs({ begin_time: ctx.since.toISOString(), limit: "100", ...(cursor ? { cursor } : {}) })}`, { headers: { Authorization: `Bearer ${ctx.accessToken}`, "Square-Version": "2024-10-17" } }));
        for (const p of r.payments ?? []) b.txns.push(...mapSquarePayment(p));
        cursor = r.cursor;
      } while (cursor);
      return { batch: b };
    },
  },
  {
    key: "stripe", name: "Stripe", category: "Payments", phase: 1, auth: "oauth2", env: ["STRIPE_CONNECT_CLIENT_ID", "STRIPE_SECRET_KEY"],
    pulls: "Online sales, deposits, refunds, and fees (read-only Connect)", docs: "https://docs.stripe.com/api/balance_transactions/list",
    authorizeUrl: (state, redirect) => `https://connect.stripe.com/oauth/authorize?${qs({ response_type: "code", client_id: env("STRIPE_CONNECT_CLIENT_ID"), scope: "read_only", redirect_uri: redirect, state })}`,
    exchange: async (code) => {
      const t = await json<{ stripe_user_id: string }>(await fetch("https://connect.stripe.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` }, body: form({ grant_type: "authorization_code", code }) }));
      // Calls run with the platform key on behalf of the connected account.
      return { accessToken: "platform", externalAccountId: t.stripe_user_id };
    },
    sync: async (ctx) => {
      const b = emptyBatch();
      let after: string | undefined;
      for (let page = 0; page < 100; page++) {
        const r = await json<{ data: StripeBalanceTxn[]; has_more: boolean }>(await fetch(`https://api.stripe.com/v1/balance_transactions?${qs({ limit: "100", "created[gte]": String(Math.floor(ctx.since.getTime() / 1000)), ...(after ? { starting_after: after } : {}) })}`, { headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Stripe-Account": ctx.externalAccountId ?? "" } }));
        for (const t of r.data) b.txns.push(...mapStripeBalanceTxn(t));
        if (!r.has_more || !r.data.length) break;
        after = r.data[r.data.length - 1]!.id;
      }
      return { batch: b };
    },
  },
  {
    key: "xero", name: "Xero", category: "Accounting", phase: 2, auth: "oauth2", env: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
    pulls: "Sales invoices and bills with contacts", docs: "https://developer.xero.com/documentation/api/accounting/invoices",
    authorizeUrl: (state, redirect) => `https://login.xero.com/identity/connect/authorize?${qs({ response_type: "code", client_id: env("XERO_CLIENT_ID"), redirect_uri: redirect, scope: "openid profile email accounting.transactions.read accounting.contacts.read offline_access", state })}`,
    exchange: async (code, redirect) => {
      const t = await xeroToken({ grant_type: "authorization_code", code, redirect_uri: redirect });
      const conns = await json<{ tenantId: string; tenantName: string }[]>(await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${t.accessToken}` } }));
      return { ...t, externalAccountId: conns[0]?.tenantId, label: conns[0]?.tenantName };
    },
    refresh: (rt) => xeroToken({ grant_type: "refresh_token", refresh_token: rt }),
    sync: async (ctx) => {
      const b = emptyBatch();
      for (let page = 1; page < 100; page++) {
        const r = await json<{ Invoices: XeroInvoice[] }>(await fetch(`https://api.xero.com/api.xro/2.0/Invoices?page=${page}`, { headers: { Authorization: `Bearer ${ctx.accessToken}`, "Xero-tenant-id": ctx.externalAccountId ?? "", Accept: "application/json", "If-Modified-Since": ctx.since.toUTCString() } }));
        for (const i of r.Invoices) { const d = mapXeroInvoice(i); if (d) b.docs.push(d); }
        if (r.Invoices.length < 100) break;
      }
      return { batch: b };
    },
  },
  {
    key: "freshbooks", name: "FreshBooks", category: "Accounting", phase: 2, auth: "oauth2", env: ["FRESHBOOKS_CLIENT_ID", "FRESHBOOKS_CLIENT_SECRET"],
    pulls: "Invoices and expenses", docs: "https://www.freshbooks.com/api/invoices",
    authorizeUrl: (state, redirect) => `https://auth.freshbooks.com/oauth/authorize?${qs({ client_id: env("FRESHBOOKS_CLIENT_ID"), response_type: "code", redirect_uri: redirect, state })}`,
    exchange: async (code, redirect) => {
      const t = await freshbooksToken({ grant_type: "authorization_code", code, redirect_uri: redirect });
      const me = await json<{ response: { business_memberships: { business: { account_id: string; name: string } }[] } }>(await fetch("https://api.freshbooks.com/auth/api/v1/users/me", { headers: { Authorization: `Bearer ${t.accessToken}` } }));
      const biz = me.response.business_memberships[0]?.business;
      return { ...t, externalAccountId: biz?.account_id, label: biz?.name };
    },
    refresh: (rt) => freshbooksToken({ grant_type: "refresh_token", refresh_token: rt }),
    sync: async (ctx) => {
      const b = emptyBatch();
      const get = <T>(path: string) => fetch(`https://api.freshbooks.com/accounting/account/${ctx.externalAccountId}${path}`, { headers: { Authorization: `Bearer ${ctx.accessToken}` } }).then((r) => json<{ response: { result: T } }>(r));
      const inv = await get<{ invoices: FreshbooksInvoice[] }>("/invoices/invoices?per_page=100");
      for (const i of inv.response.result.invoices) { const d = mapFreshbooksInvoice(i); if (d) b.docs.push(d); }
      const exp = await get<{ expenses: FreshbooksExpense[] }>("/expenses/expenses?per_page=100");
      b.txns.push(...exp.response.result.expenses.map(mapFreshbooksExpense));
      return { batch: b };
    },
  },
  {
    key: "usda_nass", name: "USDA NASS Prices", category: "Market Data", phase: 2, auth: "server_key", env: ["USDA_NASS_API_KEY"],
    pulls: "Monthly prices received for the farm's commodities and state", docs: "https://quickstats.nass.usda.gov/api",
    sync: async (ctx) => {
      const b = emptyBatch();
      for (const commodity of ctx.farm.commodities) {
        const r = await json<{ data: NassRow[] }>(await fetch(`https://quickstats.nass.usda.gov/api/api_GET/?${qs({ key: env("USDA_NASS_API_KEY"), source_desc: "SURVEY", commodity_desc: commodity, statisticcat_desc: "PRICE RECEIVED", freq_desc: "MONTHLY", year__GE: String(new Date().getUTCFullYear() - 1), ...(ctx.farm.state ? { state_name: ctx.farm.state.toUpperCase() } : { agg_level_desc: "NATIONAL" }), format: "JSON" })}`));
        for (const row of r.data) { const p = mapNassPrice(row, `${commodity}-${ctx.farm.state ?? "US"}`); if (p) b.prices.push(p); }
      }
      return { batch: b };
    },
  },
  {
    key: "paypal", name: "PayPal", category: "Payments", phase: 2, auth: "credentials", env: [],
    fields: [{ key: "clientId", label: "Client ID" }, { key: "secret", label: "Secret", secret: true }],
    pulls: "Direct-to-consumer sales, refunds, and fees", docs: "https://developer.paypal.com/docs/api/transaction-search/v1/",
    verify: async (c) => { await paypalToken(c); return { label: "PayPal" }; },
    sync: async (ctx) => {
      const token = await paypalToken(JSON.parse(ctx.accessToken) as Record<string, string>);
      const b = emptyBatch();
      // Transaction Search returns at most 31 days per request and three years of history.
      const floor = Date.now() - 3 * 365 * 86_400_000;
      for (let from = Math.max(ctx.since.getTime(), floor); from < Date.now(); from += 31 * 86_400_000) {
        const to = Math.min(from + 31 * 86_400_000 - 1000, Date.now());
        for (let page = 1; page <= 100; page++) {
          const r = await json<{ transaction_details: PaypalTxn[]; total_pages: number }>(await fetch(`${PAYPAL_BASE()}/v1/reporting/transactions?${qs({ start_date: new Date(from).toISOString(), end_date: new Date(to).toISOString(), fields: "transaction_info,payer_info", page_size: "500", page: String(page) })}`, { headers: { Authorization: `Bearer ${token}` } }));
          for (const t of r.transaction_details ?? []) b.txns.push(...mapPaypalTxn(t));
          if (page >= (r.total_pages ?? 1)) break;
        }
      }
      return { batch: b };
    },
  },
  {
    key: "finicity", name: "Bank Accounts (Finicity)", category: "Banking", phase: 2, auth: "connect_url", env: ["FINICITY_PARTNER_ID", "FINICITY_PARTNER_SECRET", "FINICITY_APP_KEY"],
    pulls: "Checking, savings, and card transactions (Mastercard Open Finance)", docs: "https://developer.mastercard.com/open-finance-us/documentation/",
    connectUrl: async ({ farmId, redirectUri, externalAccountId }) => {
      const h = await finicityHeaders();
      const kind = env("FINICITY_ENV") === "testing" ? "testing" : "active";
      const id = externalAccountId ?? (await json<{ id: string }>(await fetch(`${FINICITY}/aggregation/v2/customers/${kind}`, { method: "POST", headers: h, body: JSON.stringify({ username: `acreflow-${farmId.slice(0, 8)}-${Date.now()}`, firstName: "Acreflow", lastName: "Farm" }) }))).id;
      const g = await json<{ link: string }>(await fetch(`${FINICITY}/connect/v2/generate`, { method: "POST", headers: h, body: JSON.stringify({ partnerId: env("FINICITY_PARTNER_ID"), customerId: id, redirectUri }) }));
      return { url: g.link, externalAccountId: id };
    },
    sync: async (ctx) => {
      const h = await finicityHeaders();
      const b = emptyBatch();
      const from = Math.floor(ctx.since.getTime() / 1000), to = Math.floor(Date.now() / 1000);
      for (let start = 1; start < 100_000; start += 1000) {
        const r = await json<{ transactions: FinicityTxn[]; moreAvailable?: boolean }>(await fetch(`${FINICITY}/aggregation/v3/customers/${ctx.externalAccountId}/transactions?${qs({ fromDate: String(from), toDate: String(to), start: String(start), limit: "1000" })}`, { headers: h }));
        b.txns.push(...r.transactions.map(mapFinicityTxn));
        if (!r.moreAvailable) break;
      }
      return { batch: b };
    },
  },
  {
    key: "mx", name: "Bank Accounts (MX)", category: "Banking", phase: 2, auth: "connect_url", env: ["MX_CLIENT_ID", "MX_API_KEY"],
    pulls: "Checking, savings, and card transactions (MX Platform)", docs: "https://docs.mx.com/api-reference/platform-api/reference/list-transactions/",
    connectUrl: async ({ farmId, externalAccountId }) => {
      const guid = externalAccountId ?? (await json<{ user: { guid: string } }>(await fetch(`${MX_BASE()}/users`, { method: "POST", headers: mxHeaders(), body: JSON.stringify({ user: { metadata: JSON.stringify({ farmId }) } }) }))).user.guid;
      const w = await json<{ widget_url: { url: string } }>(await fetch(`${MX_BASE()}/users/${guid}/widget_urls`, { method: "POST", headers: mxHeaders(), body: JSON.stringify({ widget_url: { widget_type: "connect_widget" } }) }));
      return { url: w.widget_url.url, externalAccountId: guid };
    },
    sync: async (ctx) => {
      const b = emptyBatch();
      for (let page = 1; page <= 500; page++) {
        const r = await json<{ transactions: MxTxn[]; pagination: { current_page: number; total_pages: number } }>(await fetch(`${MX_BASE()}/users/${ctx.externalAccountId}/transactions?${qs({ from_date: ctx.since.toISOString().slice(0, 10), page: String(page), records_per_page: "100" })}`, { headers: mxHeaders() }));
        b.txns.push(...r.transactions.map(mapMxTxn));
        if (page >= r.pagination.total_pages) break;
      }
      return { batch: b };
    },
  },
  {
    key: "usda_ams", name: "USDA AMS Market News", category: "Market Data", phase: 2, auth: "credentials", env: ["USDA_AMS_API_KEY"],
    fields: [{ key: "reports", label: "Report IDs", placeholder: "e.g. 2886, 1281" }],
    pulls: "Local cash grain bids and livestock auction prices from the reports you pick", docs: "https://mymarketnews.ams.usda.gov/mymarketnews-api",
    verify: async (c) => {
      const ids = (c.reports ?? "").split(/[\s,]+/).filter(Boolean);
      if (!ids.length) throw new Error("Enter at least one report ID");
      return { label: `Reports ${ids.join(", ")}` };
    },
    sync: async (ctx) => {
      const b = emptyBatch();
      const ids = String((JSON.parse(ctx.accessToken) as Record<string, string>).reports ?? "").split(/[\s,]+/).filter(Boolean);
      for (const id of ids) {
        const r = await json<{ results?: AmsRow[] }>(await fetch(`${AMS_BASE}/${encodeURIComponent(id)}?${qs({ lastReports: "5" })}`, { headers: { Authorization: basic(env("USDA_AMS_API_KEY"), "") } }));
        for (const row of r.results ?? []) { const p = mapAmsRow(row, id); if (p) b.prices.push(p); }
      }
      return { batch: b };
    },
  },
  {
    key: "usda_ers", name: "USDA ERS Benchmarks", category: "Market Data", phase: 2, auth: "server_key", env: ["USDA_ERS_API_KEY"],
    pulls: "ARMS farm business ratios for peer comparison on Health", docs: "https://www.ers.usda.gov/developer/data-apis/arms-data-api",
    sync: async (ctx) => {
      const b = emptyBatch();
      const year = new Date().getUTCFullYear();
      const get = (state: string) => fetch(`https://api.ers.usda.gov/data/arms/surveydata?${qs({ api_key: env("USDA_ERS_API_KEY"), year: [year - 3, year - 2, year - 1].join(","), state, report: "farm business financial ratios", farmtype: "farm businesses" })}`).then((r) => json<{ data?: ArmsRow[] }>(r));
      // State-level ARMS estimates exist for the major farm states only; fall back to the US.
      let rows = ctx.farm.state ? (await get(ctx.farm.state.toLowerCase())).data ?? [] : [];
      if (!rows.length) rows = (await get("all")).data ?? [];
      for (const row of rows) { const m = mapArmsRow(row); if (m) b.benchmarks.push(m); }
      return { batch: b };
    },
  },
  {
    key: "futures", name: "Futures Prices (Barchart)", category: "Market Data", phase: 2, auth: "server_key", env: ["BARCHART_API_KEY"],
    pulls: "Front-month CME, CBOT, and ICE settlements for the farm's commodities", docs: "https://www.barchart.com/ondemand/api/getQuote",
    sync: async (ctx) => {
      const b = emptyBatch();
      const roots = [...new Set(ctx.farm.commodities.map((c) => (c === "CATTLE" ? ["CATTLE", "FEEDERS"] : [c])).flat().map((c) => FUTURES[c]?.root).filter(Boolean))];
      if (!roots.length) return { batch: b };
      const r = await json<{ results?: BarchartQuote[] }>(await fetch(`https://ondemand.websol.barchart.com/getQuote.json?${qs({ apikey: env("BARCHART_API_KEY"), symbols: roots.map((x) => `${x}*1`).join(",") })}`));
      for (const q of r.results ?? []) { const p = mapBarchartQuote(q); if (p) b.prices.push(p); }
      return { batch: b };
    },
  },
  {
    key: "perplexity", name: "Perplexity", category: "AI", phase: 3, auth: "server_key", env: ["PERPLEXITY_API_KEY"],
    pulls: "Web market research for the assistant (market questions only, never farm figures)", docs: "https://docs.perplexity.ai/api-reference/chat-completions-post",
  },
  { key: "nws", name: "Weather Forecast (NWS)", category: "Weather", phase: 2, auth: "public", env: [], pulls: "7-day forecast for the farm's coordinates", docs: "https://www.weather.gov/documentation/services-web-api" },
  { key: "webhook", name: "Zapier / Webhook", category: "Farm Software", phase: 2, auth: "webhook", env: [], pulls: "Records pushed from Farmbrite or any Zapier-connected app", docs: "docs/INTEGRATIONS.md" },
  { key: "cattlemax", name: "CattleMax", category: "Livestock", phase: 2, auth: "file", env: [], pulls: "Animal registry from a CattleMax CSV export", docs: "/import?table=animals" },
  { key: "farmbrite", name: "Farmbrite", category: "Farm Software", phase: 2, auth: "partner", env: [], pulls: "Livestock, crops, inventory (API access by request; Zapier works today)", docs: "https://www.farmbrite.com/integrations" },
  { key: "agriwebb", name: "AgriWebb", category: "Livestock", phase: 2, auth: "partner", env: [], pulls: "Mobs, movements, treatments, weights (partner GraphQL API)", docs: "https://www.agriwebb.com/partners" },
  { key: "agworld", name: "Agworld", category: "Crops", phase: 2, auth: "partner", env: [], pulls: "Fields, activities, field-level costs (partner API)", docs: "https://www.agworld.com" },
  { key: "john_deere", name: "John Deere Operations Center", category: "Equipment", phase: 3, auth: "partner", env: [], pulls: "Field boundaries, machine hours, planting and harvest (partner approval)", docs: "https://developer.deere.com" },
  { key: "trimble", name: "Trimble Ag", category: "Equipment", phase: 3, auth: "partner", env: [], pulls: "Field records and application data (partner program)", docs: "https://developer.trimble.com" },
];

export const providerByKey = (k: string) => PROVIDERS.find((p) => p.key === k);
export const configured = (p: Provider) => p.env.every((k) => !!process.env[k]);
