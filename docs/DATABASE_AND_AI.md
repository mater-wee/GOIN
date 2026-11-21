# Database and AI Guide

How to work with the GOIN backend's database and how to turn on AI receipt reading. Run every command from the `server` folder unless stated otherwise.

---

## Part 1: The database

### What it is

GOIN uses **SQLite**, which is built into Node.js. There is nothing to install or configure. The database file is created automatically the first time you run `npm start`.

### Where the data lives

Everything is in `server/data/`. Git ignores this folder, so the data is never committed.

| Path | Contents |
|---|---|
| `server/data/goin.db` | The database. `goin.db-wal` and `goin.db-shm` next to it are SQLite's working files and belong with it. |
| `server/data/evidence/` | Uploaded receipts, saved under random file names |
| `server/data/tesseract/` | The OCR language model, downloaded once (`eng.traineddata`, about 5 MB) |

### Tables

| Table | What it holds |
|---|---|
| `tickets` | One row per submitted ticket: event details, order number, prices, the evidence file name, the receipt reading (`extraction`), the check results (`checks`), and `issue_count`. `listing_id` is empty until the listing is confirmed on Stellar. |
| `sessions` | Wallet sign-ins. Only a hash of each token is stored. They expire after 12 hours. |
| `challenges` | One-time sign-in messages. They expire after 5 minutes. |
| `ocr_cache` | Saved receipt readings, so the same file isn't read twice |

Each row in `tickets` records which contract it belongs to (`contract_id`). If you redeploy the contract, old rows stay in the database but the app no longer shows them.

### Look at the data

1. Download **DB Browser for SQLite** (free): https://sqlitebrowser.org
2. Open it, click **Open Database Read Only**, and choose `server/data/goin.db`.
3. Use the **Browse Data** tab to view a table, or **Execute SQL** to run a query.

Use **read-only** mode while the server is running, so you don't edit data underneath it.

Useful queries:

```sql
-- Listings that are live on-chain, newest first
SELECT listing_id, event_name, event_date, venue, resale_price_php, issue_count, seller
FROM tickets WHERE listing_id IS NOT NULL ORDER BY listing_id DESC;

-- Drafts that were submitted but never listed on-chain (deleted after 24 hours)
SELECT id, event_name, seller, created_at FROM tickets WHERE listing_id IS NULL;

-- Listings whose receipt didn't fully match
SELECT listing_id, event_name, issue_count, checks FROM tickets WHERE issue_count > 0;
```

### Back up and restore

**Back up:**
1. Stop the server (Ctrl + C in its terminal).
2. Copy the whole `server/data` folder somewhere safe.
3. Start the server again.

**Restore:**
1. Stop the server.
2. Replace `server/data` with your copy.
3. Start the server.

Always copy the whole folder, not just `goin.db`. The evidence files are separate, and the `-wal` file may hold recent changes.

### Reset

| Goal | How |
|---|---|
| Re-read receipts (e.g. after changing the AI model) | Not needed. The cache already tracks which model was used. To clear it anyway, run `DELETE FROM ocr_cache;` with the server stopped. |
| Sign everyone out | Run `DELETE FROM sessions;` with the server stopped. |
| Start completely fresh | Stop the server and delete the `server/data` folder. |

⚠ **Starting fresh deletes the off-chain details and receipts of every existing listing.** The listings stay on Stellar, but the app then shows them without event names or evidence. Don't do this in the middle of a demo. A full reset is safest together with redeploying the contract, so both start empty.

### Automatic cleanup

Every hour, and each time it starts, the server deletes expired sign-ins and drafts that never reached Stellar within 24 hours, along with their evidence files. Confirmed listings are never deleted automatically.

### After redeploying the contract

1. Run the deploy script. It updates `contracts/deployments/testnet.json`.
2. Update `GOIN_CONTRACT_ID` in `frontend/src/config.ts`.
3. **Restart the server.** It reads the contract ID only when it starts.

### Store the data somewhere else

Create `server/.env` (see Part 2, step 2) and add:

```
DATA_DIR=D:\goin-data
```

### Before a real launch

SQLite on one machine is fine for the bootcamp demo. For real users:
- Move evidence files to private cloud storage (for example Amazon S3 or Supabase Storage).
- Move the database to a managed one (for example PostgreSQL), or at least back it up automatically.
- Run the backend behind HTTPS.

---

## Part 2: AI receipt reading

### How it works without AI (the default)

With no setup, the server reads receipts with **OCR** (Tesseract, which runs on your machine) and extracts the details with **built-in rules**. This costs nothing, needs no account, and no data leaves your computer. It read every field of `samples/sample-receipt.png` correctly in testing.

The rules work best on clear receipts with labels such as "Event:", "Venue:", and "Ticket Price:". Photos, unusual layouts, or receipts without labels are where an AI model helps.

### What the AI adds

When AI is on, the server sends the **text** that OCR read (never the image) to an AI model, which picks out the same 7 details. Its answers take priority over the rules, and the rules fill in anything it misses. The AI only suggests values: it doesn't approve tickets or decide whether they're real.

### Turn it on

**Step 1: Choose a provider and get an API key.**

Any provider with an OpenAI-compatible API works. These are common choices:

| Provider | `LLM_BASE_URL` | Get a key | Cost |
|---|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | [Google AI Studio](https://aistudio.google.com) → Get API key | Free tier available |
| Groq | `https://api.groq.com/openai/v1` | [console.groq.com](https://console.groq.com) → API Keys | Free plan available |
| OpenAI | `https://api.openai.com/v1` | [platform.openai.com](https://platform.openai.com) → API keys | Paid |
| Ollama (runs on your PC) | `http://localhost:11434/v1` | No key needed. Install from [ollama.com](https://ollama.com), then download a model with `ollama pull <model>`. | Free, and the text never leaves your computer |

For `LLM_MODEL`, copy the exact model ID from your provider's models page. A small, fast model is enough for this task. At the time of writing, Groq lists `openai/gpt-oss-20b` and `openai/gpt-oss-120b` as its production text models ([source](https://unified.to/blog/how_to_get_a_groq_api_key_and_connect_it_to_your_product)), and Google's compatibility guide uses a Gemini Flash model in its examples ([Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)). Model names change often, so check the provider's current list.

**Step 2: Create the settings file.** In PowerShell, from the `server` folder:

```
Copy-Item .env.example .env
```

**Step 3: Edit `server/.env`.** Remove the `#` at the start of the three `LLM_` lines and fill them in. For example, with Groq:

```
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=paste-your-key-here
LLM_MODEL=openai/gpt-oss-20b
```

For Ollama, `LLM_API_KEY` can be any text (for example `ollama`), because the server only turns AI on when all three values are set.

**Step 4: Restart the server.** Press Ctrl + C, then `npm start`.

**Step 5: Check that it's on.** Any of these confirm it:
- The server terminal prints `AI extraction on (your-model-name)` when it starts.
- http://localhost:8787/api/health shows `"ai": true`.
- On the Sell page, after you upload a receipt, the message says "…with AI assistance".
- In the admin's review panel, the note says "plus AI extraction".

### Troubleshooting

If the Sell page shows **"AI extraction was unavailable, so only the built-in rules were used"**, the server terminal prints the reason:

| Message in the server terminal | Cause | Fix |
|---|---|---|
| `AI provider returned 401` or `403` | Wrong or expired API key | Create a new key and update `LLM_API_KEY` |
| `AI provider returned 404` | Wrong model ID or base URL | Copy the model ID exactly. The base URL must end before `/chat/completions`. |
| `AI provider returned 400` | The model doesn't support JSON mode | Choose a different model from the provider |
| `AI provider returned 429` | Free-tier rate limit reached | Wait a minute, or upgrade the plan |
| `fetch failed` or a timeout | No internet, or Ollama isn't running | Check your connection, or start Ollama |

Readings that fail like this are not cached, so uploading the receipt again retries the AI.

### Turn it off

Put a `#` back in front of `LLM_API_KEY` in `server/.env`, then restart the server.

### Privacy and safety

- **The API key stays on the server.** It's read from `server/.env`, which Git ignores. Never put it in the `frontend` folder or commit it, because anything in the frontend is visible to every visitor.
- **What gets sent:** the receipt's text, which can include the buyer's name, email, or order number. Choose a provider whose data terms you're comfortable with. Some free tiers may use what you send to improve their models. Ollama keeps everything on your computer.
- **Untrusted receipts:** a receipt could contain text written to trick the AI. The server tells the model to ignore instructions in the receipt, accepts only well-formed values (valid dates, prices within range, categories from the list), and only shows them as suggestions that the seller and administrator can see and correct.
