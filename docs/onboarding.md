# Product Knowledge Bot: Staff Onboarding Guide (Soft Launch)

Welcome to the **Product Knowledge Bot**! This bot is designed to automatically extract descriptions, specifications, and features from messages you send to the internal WhatsApp number, securely mapped directly into our Database.

## Target Audience
Internal staff & administration only.

## How to use the Bot: The Happy Path
When receiving a message from the internal bot for an incomplete product:
1. **Send clear structured text:** 
   *Example: "Description: Beautiful wooden chair. Specs: Color is Brown, Weight is 15kg. Features: durable, easy-to-clean."*
2. **Send clean photos or PDFs:** Take a clear unblurred photo of the product tag, label, or datasheet. 

If sending proactively for a certain Product (without an active cooldown prompt), you must use the prefix:
`#PR[PRODUCT_ID]`
*Example:*
`#PR123 Here is the datasheet for the new desk.`

## Troubleshooting / Fallbacks
If the AI cannot parse your input, there are two common states you might trigger:

1. **ORPHANED** (Could not map to a Product)
   You didn't include a `#PR[ID]` token and the bot didn't have any active context for you. 
   **Fix:** The bot will reply asking you to specify the product. Use `#PR[ID]` in your next message.

2. **FAILED_VALIDATION** (Could not understand the data)
   The photo was too blurry, or the text lacked product information (e.g. "hi there").
   **Fix:** The bot will reply asking for clearer labels or better photos. Please reply with obvious keys `Description:`, `Specs:`, etc.

## Dashboard Overview
Inside the Whatszor Dashboard under **Knowledge Base**:
- You can monitor the **System Health** & **AI Ingestion Metrics**.
- Products with new extracted data will move to **Pending Review**.
- Click **Review** on a product to accept, reject, or force-apply conflicting specs manually.
- If a source completely failed, you can hit **Reprocess AI** within the dashboard timeline to manually trigger the AI extraction again via the Backend.

*Note: Never send PII or sensitive customer data to the Knowledge Bot.*
