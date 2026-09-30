# 03 - Money and banking practices for the invoice app

Research date: 2026-09-30. Scope: NestJS + PostgreSQL invoice app, one line item per invoice, reviewers with core banking and digital wallet backgrounds.

Evidence labels used below: **[verified]** means I read the page text through a fetch. **[search-snippet]** means the claim comes from a search result summary of an authoritative page that I could not fetch directly (for example ATO returned HTTP 403). **[no authoritative source]** means I looked and did not find one.

---

## 1. Money representation

### 1.1 Storage: NUMERIC vs BIGINT minor units

| Aspect | `NUMERIC(p,s)` | `BIGINT` minor units |
|---|---|---|
| Exactness | Exact decimal | Exact integer |
| Currency exponent | Not needed to store; needed only when rounding | Needed on every read and write (JPY 0, USD 2, KWD 3). Wrong exponent means a 10x or 1000x error |
| Multiply by rate or percent | Natural: `qty * rate * pct / 100` | Must scale, then round, in app code |
| Human inspection in psql | Readable | Not readable without exponent |
| Speed | PG docs: "much slower than integer" [verified], irrelevant at this scale | Fastest |
| Fit for tax/rate/qty columns | Same type everywhere | Rates and quantities are not minor units, so you need NUMERIC anyway |

Recommendation: **NUMERIC for all money, rate and quantity columns.** Rationale: the formulas multiply amounts by fractional quantity and a percentage, so NUMERIC avoids a scale-round-unscale dance and keeps one numeric family in the schema. Integer minor units are the right choice when the domain is a ledger of already-rounded postings (Stripe, Adyen), which is a defensible alternative but buys nothing here.

Never use `money` type: PostgreSQL docs state its output and fractional precision depend on `lc_monetary`, and that `numeric` is preferred [verified: https://www.postgresql.org/docs/current/datatype-money.html]. Never use `real`/`double precision` for money (same page).

PostgreSQL facts worth citing [verified: https://www.postgresql.org/docs/current/datatype-numeric.html]:
- `numeric` max declared precision 1000; unconstrained up to 131072 digits before and 16383 after the point.
- `round(numeric)` rounds ties **away from zero**. `double precision` rounds to nearest even. This matters for policy in section 3: `HALF_UP` in the app matches what PG does for non-negative values.

### 1.2 Precision and scale

ISO 20022's `ActiveCurrencyAndAmount` is `xs:decimal` with `totalDigits=18`, `fractionDigits=5`, plus a mandatory `Ccy` attribute [search-snippet, from ISO 20022 schema material; the iso20022.org JSON-schema PDF was not machine-readable via fetch]. This is the closest thing to an industry-standard amount shape and is what a banking reviewer will recognise.

Recommended columns (one line item per invoice, all in the invoice currency):

| Column | Type | Note |
|---|---|---|
| `quantity` | `NUMERIC(18,4)` | CHECK `> 0` |
| `rate` (unit price) | `NUMERIC(19,4)` | CHECK `>= 0`. Unit prices can legitimately carry more than 2 decimals |
| `tax_rate` (percent) | `NUMERIC(7,4)` | CHECK `BETWEEN 0 AND 100` (fits 8.875 and 10) |
| `sub_total`, `tax_amount`, `discount`, `total_amount`, `total_paid` | `NUMERIC(19,4)` | 15 integer digits, 4 decimals: covers KWD (3 dp) with headroom |
| `currency` | `CHAR(3)` | CHECK `~ '^[A-Z]{3}$'`; validate against a code list in the app |

Why scale 4 and not the currency's exponent: the column scale must be one value for all currencies, and KWD needs 3. The **application** rounds every stored amount to the currency exponent (section 2) before insert, so persisted values always have at most `exponent` significant decimals. If a reviewer pushes on this: an optional CHECK such as `total_amount = round(total_amount, CASE currency WHEN 'JPY' THEN 0 WHEN 'KWD' THEN 3 ELSE 2 END)` is possible but couples the schema to a currency list; I would document it as a known trade-off instead.

### 1.3 JSON serialization

What the reference APIs do:

| Source | Representation | Evidence |
|---|---|---|
| Stripe | Integer in the currency's minor unit, currency as a separate lowercase field. "enter 1099 to charge 10.99 USD", "10 to charge 10 JPY" | [verified: https://docs.stripe.com/currencies] |
| Adyen | Integer `value` in minor units; decimals per currency (AUD/USD/GBP/EUR/SGD 2, JPY/VND 0, KWD 3) | [verified: https://docs.adyen.com/development-resources/currency-codes/] |
| Google `google.type.Money` | `currency_code` (ISO 4217), `units` (int64 whole units), `nanos` (int32, 1e-9), with sign-consistency rules | [verified: https://github.com/googleapis/googleapis/blob/master/google/type/money.proto] |
| ISO 20022 | Decimal with mandatory `Ccy` attribute, 18 total / 5 fraction digits | [search-snippet] |

Options for this API:

1. **Decimal strings** (`"amount": "1234.50"`, `"currency": "AUD"`). Exact, human-readable, mirrors ISO 20022 semantics (decimal plus currency), no exponent lookup for clients, immune to IEEE 754 loss. Cost: clients must parse strings.
2. Minor-unit integers (Stripe/Adyen style). Exact, but every consumer needs the ISO 4217 exponent table, and the rate/percent fields still need decimals.
3. JSON numbers. Rejected: `JSON.parse` yields IEEE 754 doubles; anything a client round-trips can drift. No authoritative payments API I checked uses plain JSON numbers for money.

Recommendation: **decimal strings with fixed scale equal to the currency exponent** (`"100.00"` for AUD, `"1000"` for JPY, `"1.500"` for KWD), with `currency` alongside. On input, accept a string; if the assignment's sample payloads use JSON numbers for `quantity`/`rate`, accept numbers on input too but convert via `String(n)` into the decimal library and never do arithmetic on the JS number. **Open point for the parent:** if the assignment's response contract shows numbers (e.g. `"totalAmount": 110`), returning strings may fail an automated checker. In that case emit numbers only for that contract and document the risk. I cannot know which without the brief.

### 1.4 JS library

| Library | Verdict | Facts |
|---|---|---|
| **decimal.js** | **Recommended** | Arbitrary precision decimal. Add, subtract, multiply exact; division rounded to configured precision. Default precision 20, default rounding `ROUND_HALF_UP` (4). Nine rounding modes including `ROUND_HALF_EVEN`. `Decimal.clone()` gives an isolated config. `toString()` may use exponent notation (thresholds `toExpNeg -7`, `toExpPos 21`) so always serialize with `toFixed(exponent)` [verified: https://mikemcl.github.io/decimal.js/] |
| big.js | Acceptable, smaller | Multiplication exact; only `div`/`sqrt`/negative `pow` use `Big.DP` (default 20) and `Big.RM` (default 1 = half up). Four modes: down, half up, half even, up. `toFixed` never uses exponent notation [verified: https://mikemcl.github.io/big.js/] |
| dinero.js v2 | Not recommended here | Integer minor units only, rejects non-integers; multiply/allocate take scaled amounts; eight rounding functions incl. `halfEven`; bigint entry point. Designed for a minor-unit domain and adds a currency-object model; overkill for `qty * rate * pct / 100` [search-snippet: https://www.dinerojs.com/core-concepts/amount] |

Recommendation: decimal.js via `Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })`, wrapped in one small `Money` helper (`roundTo(currency)`, `toFixedString(currency)`). node-postgres returns any type without a registered parser as a **string** [verified general rule: https://node-postgres.com/features/types], so NUMERIC columns arrive as strings; convert with `new Decimal(str)`. With TypeORM/Prisma, use a column transformer or Prisma `Decimal` so values never pass through `number`.

---

## 2. ISO 4217 minor units and symbols

Source: SIX (maintenance agency) List One, XML, `Pblshd` 2026-09-17 [verified: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml]. SIX notes the latest amendment reflects Bulgaria adopting the euro on 2026-01-01 (Amendment 180) [verified: https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html]. Note the SIX path really is spelled `iso-currrency` (three r).

| Code | Name | Minor units | Display symbol (CLDR `en`) | Common disambiguated form |
|---|---|---|---|---|
| AUD | Australian Dollar | 2 | `A$` | "AU$" is common informally; CLDR `en` uses `A$`; `$` in en-AU |
| USD | US Dollar | 2 | `$` | `US$` when other dollars are present |
| GBP | Pound Sterling | 2 | `£` | |
| EUR | Euro | 2 | `€` | |
| SGD | Singapore Dollar | 2 | CLDR `en` gives the code `SGD`; narrow `$` | `S$` is the common local form (en-SG) |
| JPY | Yen | 0 | `¥` | |
| VND | Dong | 0 | `₫` | |
| KWD | Kuwaiti Dinar | 3 | CLDR `en` gives the code `KWD`, no narrow symbol | `KD` / `د.ك` locally |

Symbols source: Unicode CLDR `en` currency data [verified via cldr-json: https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-numbers-full/main/en/currencies.json]. Correction to the brief: CLDR uses **`A$`** for AUD in `en`, not `AU$`; and it has no `S$` in the base `en` locale (that comes from `en-SG`). Do not hard-code symbols. Use `Intl.NumberFormat(locale, { style: 'currency', currency })`, which reads CLDR, and store only the ISO code. Symbols are presentation and must never be persisted or used in the API.

Implementation note: keep a tiny in-repo `{ AUD: 2, USD: 2, GBP: 2, EUR: 2, SGD: 2, JPY: 0, VND: 0, KWD: 3 }` map or `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` for exponent. Validate `currency` against the supported set and reject others with 422 rather than guessing an exponent.

---

## 3. Rounding

### 3.1 What the tax authorities say

| Authority | Guidance | Evidence |
|---|---|---|
| ATO (Australia, GST) | Single taxable sale on an invoice: round GST to the nearest cent, 0.5 cent rounds **up**. Multiple sales: either the "total invoice rule" (total then round) or the "taxable supply rule" (round each then add). Supplier and customer need not use the same rule | [search-snippet of https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices ; page returned 403 to fetch]. The wording matches ATO's public tax invoices page. Legislative basis: Indirect Tax Legislation Amendment Act 2000 explanatory memorandum (403 to fetch) |
| HMRC (UK, VAT) | Invoice traders may round the total VAT payable on an invoice; the long-standing concession allows rounding **down** to a whole penny because it is tax neutral (supplier output tax and customer input tax move together). Line-level VAT may be rounded up and down but must not be systematically rounded down. VAT Notice 700 para 17.5 has the detail (rounding to 1/10 penny etc.) | [verified: https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec12010 ; line-level statement from search-snippet of HMRC VAT Notice 700 material] |
| IRAS (Singapore, GST) | May round total GST on the invoice to the nearest cent. Total GST may be computed by summing line GST or by applying the rate to the total excl. GST; both accepted if applied consistently | [search-snippet of IRAS Record Keeping Guide and GST e-Tax guides; PDF was not machine-readable] |

Not found: none of the three publishes a mandatory HALF_EVEN (banker's) rule for tax invoices. ATO explicitly says half-cent rounds up. **[no authoritative source for banker's rounding on tax invoices]**.

### 3.2 HALF_UP vs HALF_EVEN

- HALF_UP (ties away from zero on the amounts we produce, which are non-negative): matches ATO wording, is what a human checking with a calculator expects, is the default in decimal.js and big.js, and equals PostgreSQL `round(numeric)` and the numeric-cast behaviour [PG docs, verified]. So an app value and a `SELECT round(...)` in psql agree.
- HALF_EVEN: statistically unbiased over millions of roundings, so it is a legitimate choice for interest accrual and FX in banking. For a single tax figure on one invoice, bias is irrelevant, and it would disagree with PG `round()` and with ATO's "0.5 upward".

### 3.3 When to round: per line vs per invoice

The app has exactly one line item, so "per line" and "per invoice" produce the same number. That removes the ATO/IRAS rule choice; state this explicitly in the design notes.

### 3.4 Recommended policy (one policy)

1. Compute in exact decimals with no intermediate rounding until each derived amount is produced.
2. `sub_total = round(quantity * rate, exp)`, `tax_amount = round(sub_total * tax_rate / 100, exp)` using **ROUND_HALF_UP**, where `exp` is the ISO 4217 minor unit of the invoice currency. Tax is computed from the already-rounded `sub_total` so the printed figures re-add exactly.
3. `discount` must be supplied with at most `exp` decimals (reject otherwise, do not silently round).
4. `total_amount = sub_total + tax_amount - discount` and `balance_amount = total_amount - total_paid` are then exact sums and need no rounding.
5. Persist only rounded values; the DB never recomputes tax.

Rationale: matches ATO's stated rule for a single taxable sale, is acceptable under HMRC (rounded both ways at line level) and IRAS (nearest cent), agrees with PG `round()`, and every printed figure on the invoice foots exactly. A reviewer from banking will ask "why not banker's?": answer that tax authorities specify nearest with half-up and the single line item removes aggregation bias; note that HALF_EVEN would be the pick for accrual/interest ledgers.

---

## 4. Validation invariants and DB CHECK constraints

### 4.1 Proposed constraints

Postgres CHECK passes when the expression is true **or NULL** [verified: https://www.postgresql.org/docs/current/ddl-constraints.html], so pair every CHECK with `NOT NULL`. CHECKs cannot reference other rows.

```
quantity      > 0
rate          >= 0
tax_rate      BETWEEN 0 AND 100
sub_total     >= 0
tax_amount    >= 0
discount      >= 0
total_amount  >= 0                                   -- implies discount <= sub_total + tax_amount
total_amount  = sub_total + tax_amount - discount    -- exact on already-rounded values
total_paid    >= 0
total_paid    <= total_amount                        -- no overpayment (decision, see 4.3)
due_date      >= issue_date
currency      ~ '^[A-Z]{3}$'
status        IN ('DRAFT','PENDING','PAID')          -- OVERDUE is never stored
status <> 'PAID' OR total_paid = total_amount        -- Paid implies fully paid
```

`balance_amount`: either store it and add `balance_amount = total_amount - total_paid`, or (cleaner) declare it `GENERATED ALWAYS AS (total_amount - total_paid) STORED`. Stored generated columns are computed on write, must use immutable expressions, cannot reference other generated columns and cannot be written directly [verified: https://www.postgresql.org/docs/current/ddl-generated-columns.html]. That makes the "balance = total - paid" invariant impossible to violate. Same option exists for `total_amount`, but keeping total as a real column with the CHECK above lets the app own the rounding policy and lets the DB verify it.

Not enforceable as CHECK, keep in the service: tax = round(subtotal x rate) (needs currency exponent), currency is a supported code, and any cross-row rule.

### 4.2 Discount cap

Is capping at subTotal or subTotal + tax reasonable? Analysis:
- The assignment formula applies tax to the **full** subTotal and subtracts the discount **after** tax. So the discount behaves like a post-tax credit against the amount payable, not like a price reduction.
- The floor that must hold for the invoice to make sense is `total_amount >= 0`, i.e. `discount <= sub_total + tax_amount`. That is the natural cap under the given formula and is a one-line CHECK.
- Capping at `sub_total` is what you would do if the discount were a pre-tax price reduction. It is stricter than the formula requires and would reject inputs the formula produces valid results for. I would not add it as an invented rule; mention it as a stricter alternative.

### 4.3 Tax authority position on discounts (pre-tax vs post-tax)

- HMRC VAT Notice 700: an unconditional discount that the customer takes means the tax value is based on the **discounted** amount; prompt-payment discounts base value on the amount actually paid, but VAT is declared on the undiscounted price if you must account before knowing whether the discount is taken; contingent discounts use the full amount and are later adjusted by credit note [verified: https://www.gov.uk/guidance/vat-guide-notice-700].
- IRAS: for a discount on the selling price, GST is charged on the **net discounted price** (10% off a $2,000 sofa set means GST on $1,800). Prompt payment discount: since 1 Apr 2020 GST is on the discounted price only if the customer fulfils the terms [search-snippet: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/charging-gst-(output-tax)/common-scenarios---do-i-charge-gst/gst-on-discounts-and-rebates].
- ATO: I did not find a direct ATO page stating "GST on the discounted price". ATO's rebate page discusses adjusting GST when a rebate reduces the price after the fact [search-snippet: https://www.ato.gov.au/Business/GST/In-detail/Rules-for-specific-transactions/GST-and-rebates/]. **[no authoritative ATO page located for pre-tax discounts; treat as unconfirmed]**.

Consequence: HMRC and IRAS both treat a genuine price discount as reducing the taxable value (pre-tax). The assignment's formula (tax on full subTotal, discount after tax) is therefore closer to a settlement or post-tax credit and would overstate tax if the discount were a price reduction. We follow the assignment and document it in the README as a deliberate simplification: "discount is an absolute amount applied after tax; it does not reduce the taxable base".

Decision needed on overpayment (`total_paid <= total_amount`): I recommend rejecting overpayment with 422 for this assignment. Real systems would record it as customer credit; out of scope.

---

## 5. Idempotency keys for POST create endpoints

### 5.1 IETF draft summary

`draft-ietf-httpapi-idempotency-key-header`, latest is **-07, dated 2025-10-15**, Standards Track intent. Datatracker listed expiry as 18 April 2026, so as of today (2026-09-30) it is a lapsed Internet-Draft that has not become an RFC. Cite it as "draft" and state the version [verified text: https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.txt ; status per https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/]. Check the datatracker again before submission in case a -08 appears.

Requirements as I read them (note most are SHOULD, not MUST):

| Situation | Draft-07 text | Status code |
|---|---|---|
| Header syntax | Item Structured Header (RFC 8941); value MUST be a String. UUID or similar random identifier recommended | n/a |
| Uniqueness | Key "MUST be unique and MUST NOT be reused with another request with a different request payload" | n/a |
| Key missing where the resource requires it | Resource SHOULD reply 400 | 400 |
| Same key, different payload | Resource SHOULD reply 422 with a body linking to relevant documentation | 422 |
| Same key while original still in flight | Resource SHOULD respond with a resource conflict error | 409 |
| Expiry | Resource MAY require time-based keys and purge on expiry; SHOULD define and publish the expiry policy | n/a |
| Fingerprint | Optional mechanism generated from request payload (checksum, field match, digest) | n/a |

### 5.2 Stripe implementation

[verified: https://docs.stripe.com/api/idempotent_requests and https://docs.stripe.com/error-low-level]
- Header `Idempotency-Key`, up to 255 characters, V4 UUID suggested; POST only (GET/DELETE are idempotent by definition).
- Saves the status code and body of the **first execution** for a key, whether success or failure, including 500s; replays return the same result and carry `Idempotent-Replayed: true`.
- Keys may be pruned after at least 24 hours; a reused key after pruning creates a new request.
- Incoming parameters are compared with the original; a mismatch returns an error.
- Results are saved only after the endpoint begins executing. Parameter validation failures and requests that conflict with a concurrently executing one are **not** saved and can be retried. Concurrent conflict maps to HTTP 409.

### 5.3 Recommended design

Decision on "missing key": the draft says the server SHOULD 400 only for operations that document the key as required. For this assignment I recommend the header be **optional** on `POST /invoices` (and `POST .../payments` if built), so that a plain client and any automated test without the header still work. When present, full semantics apply. Document this.

Table:

```
idempotency_keys
  scope            text        NOT NULL      -- API client / tenant id, or 'anonymous'
  idem_key         text        NOT NULL      -- CHECK length <= 255
  request_hash     bytea       NOT NULL      -- sha256 of method + path + canonical JSON body
  response_status  int         NOT NULL
  response_body    jsonb       NOT NULL
  resource_id      uuid                       -- created invoice id, for traceability
  created_at       timestamptz NOT NULL DEFAULT now()
  expires_at       timestamptz NOT NULL       -- created_at + 24h
  PRIMARY KEY (scope, idem_key)
```

Fingerprint: SHA-256 over method, route, and a canonical JSON serialization (sorted keys, decimals normalized) of the validated DTO, not the raw bytes, so key order or `1.0` vs `1` does not cause false 422s.

Algorithm (race-safe, single transaction, READ COMMITTED):

1. Validate the request first. If validation fails, return 4xx and store nothing (matches Stripe: validation failures are not saved).
2. `BEGIN`.
3. `INSERT INTO idempotency_keys (scope, idem_key, request_hash, response_status, response_body, expires_at) VALUES (..., 0, 'null', now()+interval '24 hours') ON CONFLICT (scope, idem_key) DO NOTHING RETURNING *`. PostgreSQL guarantees an atomic insert-or-conflict outcome under concurrency [verified for DO UPDATE wording: https://www.postgresql.org/docs/current/sql-insert.html]; with DO NOTHING, RETURNING yields no row on conflict.
4. **Row returned (we own the key):** create the invoice in the same transaction, `UPDATE idempotency_keys SET response_status, response_body, resource_id`, `COMMIT`, respond 201.
5. **No row returned (key exists):** `SELECT` the row (a new statement in READ COMMITTED sees the committed row).
   - If `expires_at < now()`: treat as absent. Use `ON CONFLICT (scope, idem_key) DO UPDATE SET ... WHERE idempotency_keys.expires_at < now()` in step 3 to atomically reclaim expired keys, or delete expired rows in a periodic job.
   - If `request_hash` differs: 422 `idempotency_key_reused` with a docs link.
   - Else replay stored `response_status` and `response_body` with `Idempotent-Replayed: true`.

Why this is race-safe: the key row and the invoice row commit or roll back together, so there is no window with an orphaned "in progress" key after a crash, and no double-create. A concurrent duplicate that arrives while the first transaction is uncommitted waits on the unique index entry and, once the first commits, takes the conflict path and replays. Two caveats: (a) this wait-on-unique-index behaviour is standard PostgreSQL behaviour but I did not find it spelled out in the pages I fetched, so cover it with an integration test that fires N parallel identical POSTs and asserts exactly one invoice; (b) the draft's 409 is then only reachable if you want a non-blocking variant: set `SET LOCAL lock_timeout = '2s'` and map the timeout to 409. That optional mapping is a cheap way to honour the draft's 409 wording.

Alternative (two-phase, Stripe-like): commit an `in_progress` row first, do the work in a second transaction, return 409 for in-flight duplicates. More moving parts (stuck-key recovery, lease timeout) for no benefit at this scale. Not recommended.

Also add a unique business-level guard only if the assignment defines a natural key (e.g. invoice number); idempotency keys do not replace that.

---

## 6. Business date and "today" for overdue

Facts:
- PostgreSQL `date` has no time zone, 4 bytes, resolution one day; `timestamptz` is stored as UTC and rendered in the session `TimeZone` [verified: https://www.postgresql.org/docs/current/datatype-datetime.html]. Therefore store `due_date` and `issue_date` as `DATE`, and audit fields (`created_at`) as `timestamptz`.
- Core banking distinguishes wall-clock **system date** from **business (processing) date**. The business date advances at End-of-Day rollover (branch cut-off, holiday calendar), not at midnight. Oracle's banking docs describe branch dates changing "during the End-of-Day (EOD) process" with holiday maintenance [verified fragment: https://docs.oracle.com/en/industries/financial-services/microservices-common/14.8.1.0.0/cmcug/system-dates.html]. A generic explanation of business date vs activity date also exists in vendor help pages, but I found no ISO or regulator definition **[no authoritative standard source]**.

Overdue definition: `status <> 'PAID' AND due_date < today`. An invoice due today is not yet overdue.

Recommendation:
1. Introduce an injectable `Clock`/`BusinessDateProvider` in NestJS with one method `today(): string` returning `YYYY-MM-DD` for a **configured IANA business time zone** (`BUSINESS_TIMEZONE`, default something explicit like `Australia/Sydney`, decided once and documented; UTC is acceptable if the brief gives no locale). Implement with `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`, or Temporal if the runtime supports it. This is the app-level analogue of a bank's business date.
2. Never call `CURRENT_DATE` or `now()` in the overdue predicate. Pass `today` as a bound query parameter: `WHERE status <> 'PAID' AND due_date < $1`. One value per request keeps a list response internally consistent and lets a status filter (`?status=overdue`) be pushed into SQL and paginated correctly.
3. Derive `effectiveStatus` in one pure function `deriveStatus(stored, dueDate, today)` used by both the mapper and the SQL-filter builder tests. Never persist OVERDUE.
4. Tests: override the provider with a fixed clock (`{ today: () => '2026-09-30' }`); boundary cases due yesterday, due today, due tomorrow, and Paid with past due date. Optionally test the timezone converter around midnight (for example 2026-09-30T14:30Z is already 2026-10-01 in Sydney).
5. State the simplification in the README: a per-invoice or per-currency time zone and an EOD-driven business date are the production model; a single configured zone is the assessment model.

---

## 7. Settlement-adjacent value-adds

Candidates and cost:

| Idea | Banking credibility | Cost | Notes |
|---|---|---|---|
| Append-only payment ledger, `total_paid` derived from it | Very high: mirrors journal/posting model; audit trail, no destructive updates | Low: one `payments` table (id, invoice_id, amount, currency, paid_at, idempotency ref), INSERT only; no UPDATE/DELETE grants or a trigger blocking them | Cache `total_paid` on the invoice inside the same transaction, or compute `SUM` on read. Keep the CHECK `total_paid <= total_amount` |
| Pessimistic row lock `SELECT ... FOR UPDATE` when recording a payment | High: standard way to serialize concurrent postings against one account-like row | Very low: one statement in the payment transaction | PG: blocks concurrent UPDATE/DELETE/lock of the row until the transaction ends; under READ COMMITTED a waiting `FOR UPDATE` returns the updated row; under REPEATABLE READ/SERIALIZABLE it errors if the row changed [verified: https://www.postgresql.org/docs/current/explicit-locking.html] |
| Optimistic locking (version column) | Medium | Low, but needs retry logic and a 409 path | Fowler: Optimistic Offline Lock suits infrequent conflicts; Pessimistic Offline Lock suits frequent conflicts or costly failed work [verified: https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html, https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html]. Two payments hitting one invoice, each a short DB transaction, favour the lock |
| Invoice state machine (Draft, Pending, Paid) | Medium-high | Low if kept to one transition function | Paid is reached automatically when balance hits zero; enforce allowed transitions and forbid edits to amounts after Pending |
| Maker-checker (four-eyes) | High conceptually [Wikipedia summary only, plus Oracle FLEXCUBE docs mention dual control; no regulator page fetched] | High: needs users, roles, an approval table, and a second actor | Skip for the assignment; mention in README as a future control |

Recommendation (pick 2, both cheap):

1. **Append-only payment ledger with derived `total_paid` and balance**, plus the DB CHECKs in section 4. This is the single most recognisable banking pattern and it makes `balanceAmount = totalAmount - totalPaid` honest.
2. **`SELECT ... FOR UPDATE` on the invoice row inside the payment-recording transaction** (READ COMMITTED), then re-check `balance >= amount`, insert the ledger row, update the cached `total_paid` and status, commit. Reuse the section 5 idempotency table for `POST /invoices/:id/payments` so a retried payment cannot double-post.

Treat the state machine as a by-product: implement `Paid` as derived from `balance = 0` and document the allowed transitions in a short table. Do not build maker-checker.

Caveat: I do not have the assignment brief in this task, so if no payment-recording endpoint is required, keep this as a documented design note plus the DB constraints rather than extra code. Unrequested features are scope risk.

---

## Source index

- SIX ISO 4217 List One XML (published 2026-09-17): https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
- SIX data standards page (Amendment 180): https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html
- Unicode CLDR en currencies: https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-numbers-full/main/en/currencies.json
- Stripe currencies and amounts: https://docs.stripe.com/currencies
- Stripe idempotent requests: https://docs.stripe.com/api/idempotent_requests
- Stripe advanced error handling (idempotency, 409): https://docs.stripe.com/error-low-level
- Adyen currency codes and decimals: https://docs.adyen.com/development-resources/currency-codes/
- Google `Money`: https://github.com/googleapis/googleapis/blob/master/google/type/money.proto
- ISO 20022 JSON schema generation (context for amount type): https://www.iso20022.org/sites/default/files/media/file/ISO_20022_Generation_of_JSON_Schema_Draft_2020_12_for_ISO_20022_2013_10June2025.pdf
- IETF draft-07: https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.txt ; https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- PostgreSQL numeric: https://www.postgresql.org/docs/current/datatype-numeric.html
- PostgreSQL money: https://www.postgresql.org/docs/current/datatype-money.html
- PostgreSQL date/time: https://www.postgresql.org/docs/current/datatype-datetime.html
- PostgreSQL constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL generated columns: https://www.postgresql.org/docs/current/ddl-generated-columns.html
- PostgreSQL INSERT ON CONFLICT: https://www.postgresql.org/docs/current/sql-insert.html
- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- node-postgres types: https://node-postgres.com/features/types
- decimal.js: https://mikemcl.github.io/decimal.js/
- big.js: https://mikemcl.github.io/big.js/
- Dinero.js amount: https://www.dinerojs.com/core-concepts/amount
- ATO tax invoices (rounding rules): https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
- HMRC VATREC12010 (rounding concession): https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec12010
- HMRC VAT Notice 700 (discounts): https://www.gov.uk/guidance/vat-guide-notice-700
- IRAS GST on discounts: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/charging-gst-(output-tax)/common-scenarios---do-i-charge-gst/gst-on-discounts-and-rebates
- IRAS invoicing customers: https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/invoicing-price-display-and-record-keeping/invoicing-customers
- Oracle banking system dates: https://docs.oracle.com/en/industries/financial-services/microservices-common/14.8.1.0.0/cmcug/system-dates.html
- Fowler, Money: https://martinfowler.com/eaaCatalog/money.html
- Fowler, Optimistic / Pessimistic Offline Lock: https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html , https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html
- Maker-checker (secondary, not authoritative): https://en.wikipedia.org/wiki/Maker-checker

## Gaps and confidence

- ATO and IRAS primary pages could not be fetched (403 / unreadable PDF); their rounding rules rest on search-result summaries of those pages. Re-check the ATO tax invoices page and IRAS e-Tax guides before quoting them verbatim in the README.
- No authoritative source found for banker's rounding on tax invoices, or for an ATO statement on pre-tax discounts.
- The ISO 20022 (18,5) figure comes from a search summary of the schema definition, not from a fetched ISO page.
- The concurrent-insert-waits behaviour in section 5.3 is standard PostgreSQL behaviour but was not confirmed in the pages fetched; verify with the parallel-request integration test.
