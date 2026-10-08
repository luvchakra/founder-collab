# CRM: Leads, Conversations & Reputation

CRM runs your pipeline from first message to won customer: a unified inbox
across WhatsApp/Instagram/Facebook/Google, leads, opportunities, a
lost-business recovery queue, and a full customer profile that pulls in
data from every other licensed module.

## Navigation

**Overview**: Dashboard, Inbox, Conversations, Potential Lost Business,
Reviews, Analytics, Reactivation
**Sales**: Leads, Sales Opportunities, Follow-ups, Exceptions
**Administration**: Channels, WhatsApp, Routing Rules

> **Inbox vs. Conversations**: you'll notice two inbox-shaped screens.
> **Inbox** is a simple ticket list — one ticket per enquiry, with a status
> (open, pending, closed), an assignee, and a **New ticket** form for logging
> one by hand. **Conversations** is the unified inbox described below, where
> you read the message thread and reply. Use Conversations day to day for
> WhatsApp, Instagram and Facebook messages.

## Daily workflows

- **Dashboard** — a read-only launchpad. "Potential Lost Business" tiles
  (unanswered messages, unanswered social questions, reviews needing
  action, overdue leads, stale opportunities, open high-intent
  conversations) link straight to the relevant working screen; a second
  section covers pipeline metrics (new leads, open opportunities, pipeline
  and won value, response SLA).
- **Conversations** — filters (Needs response / Assigned to me / Overdue /
  High intent, plus channel/status/owner dropdowns) next to a three-column
  inbox (collapses to one column on mobile). Opening a conversation shows
  linked lead/opportunity, an on-demand AI summary, products the customer's
  interested in (with live stock and a waitlist option), the full message
  timeline with delivery status, and one-click **Create Lead / Create
  Opportunity / Create Task** on high-intent messages. Replying to WhatsApp
  uses a free-form composer with an AI-suggested draft while you're inside
  Meta's 24-hour service window, and switches to pre-approved templates once
  that window closes — a Meta platform rule, not something WonderArk can
  turn off. Instagram comment replies must happen inside Instagram itself;
  WonderArk shows a reminder banner rather than a broken reply box.
- **Leads** — a list with inline status editing (10 stages from new through
  won/lost/disqualified) and inline owner reassignment, both directly in the
  row.
- **Sales Opportunities** — Kanban view by default (drag a card to change
  its stage) or a List view (toggle in the page), which additionally lets
  you edit deal value and reassign owner inline. Pipeline and won value
  totals are shown as summary cards.
- **Follow-up Queue** — one worklist across leads, opportunities, and
  conversations that need action, with tabs for Due today / Overdue /
  Upcoming / Unassigned / High priority, and an inline "Complete" button so
  you never have to leave the list.
- **Potential Lost Business** — every unanswered commercial message across
  every channel, oldest (most urgent) first, with an AI-guessed intent you
  can correct, and one-click actions: Respond, or Convert into a Lead /
  Opportunity / Task, or dismiss as Not Relevant.
- **Reviews** — connect your Google Business Profile location(s), sync
  reviews on demand, and draft + publish AI-assisted responses (publishing
  requires the review-publishing permission).
- **Analytics** — response performance over the last 30 days: median first
  response time, SLA compliance, unresolved interactions by age, response
  time per channel and per owner/team member, and a channel-by-channel
  comparison of leads and opportunities. If Discovery is licensed you also
  get the Discovery → CRM funnel, and if Service is licensed the CRM →
  Service funnel; without those modules the sections are simply left out.
  It can be exported as a report.
- **Reactivation** — customers worth reaching out to again, found by simple
  rules each time you open the page: a previously active customer who has
  gone quiet, an old lead with a fresh signal, an item someone was waiting on
  that is back in stock, and a completed service that is plausibly due
  again. Each row names the reason and a suggested action and links to the
  customer. Nothing is sent automatically — you decide and act from the
  customer's page.
- **Exceptions** — open cross-module problems that need a decision: a
  Service job with a parts shortage (choose how to resolve it, with an
  optional note) and an opportunity that needs an assessment (**Request
  assessment** in one click, or open it in Service once it exists).
- **Customer 360** (open from any contact) — one screen combining an AI
  customer summary, a calculated Buying Intent score (0–100, with each
  contributing signal and its evidence shown), contacts, relationship
  timeline, open opportunities, follow-ups, products of interest, recent
  conversations, notes, and outstanding balance. If licensed, it also pulls
  in Discovery's prospect/signal data, Inventory's order history and
  Finance's e-invoice status, and Service's job history — sections just
  don't appear if that module isn't licensed for you.

## Working a sales opportunity

Open a sales opportunity for its detail page: its **Journey**, **Linked
records**, the **Next action**, **Follow-ups**, the **Products** the customer
wants, **Contacts** (add one, or make one primary) and a **History**. With
other modules licensed it also offers hand-offs, each optional:

- **Inventory fulfillment** — **Request inventory fulfillment** turns the
  products into a sales order without leaving CRM; if only part of the
  quantity is in stock you choose **Fulfill available quantity** or **Wait for
  complete quantity**.
- **Assessment** — when an opportunity needs a site or remote assessment,
  **Request FSM assessment** sends it to Service and the status and outcome
  show back here.
- **FSM quote** — **Create job in FSM** starts the Service quote or job for
  the opportunity.

## Connecting a channel (WhatsApp / Instagram / Facebook)

This is the one genuinely technical setup step in the platform, and it
needs both a WonderArk admin and whoever manages your Meta (Facebook)
developer account. WonderArk never creates the Meta App or completes its
consent screen for you — you bring your own Meta App, and WonderArk
connects to it.

1. **Create (or reuse) a Meta App** at developers.facebook.com and add the
   relevant product — "WhatsApp" for WhatsApp Business, or
   "Instagram"/"Messenger" for Instagram DMs and Facebook Messenger.
2. **Copy the App Secret** from the Meta App dashboard. Set it as an
   environment variable on your WonderArk deployment: `CRM_WHATSAPP_APP_SECRET`
   for WhatsApp, or `CRM_META_APP_SECRET` for Instagram/Messenger. WonderArk
   uses this to verify every incoming webhook really came from Meta.
3. **Invent a verify token** (any secret string of your choosing) and set it
   in *two* places: WonderArk's `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` (or
   `CRM_META_WEBHOOK_VERIFY_TOKEN`) environment variable, and the "Verify
   Token" field when you configure the webhook in the Meta dashboard. Meta
   uses this once to confirm you own the endpoint before sending real
   traffic.
4. **Point Meta's webhook at WonderArk.** In the Meta dashboard's Webhooks
   section, set the callback URL to:
   - `https://<your-domain>/api/webhooks/crm-whatsapp` for WhatsApp
   - `https://<your-domain>/api/webhooks/crm-meta` for Instagram or Messenger
     (both subscribe to this same URL)

   Subscribe to the message-received field (and, for Instagram, "comments"
   too, so comment replies can be recovered).
5. **Set the environment variables before connecting anything** — the
   webhook will reject incoming events with "not configured" until both the
   app secret and verify token are set.
6. **Back inside WonderArk**, connect the channel where it lives:
   - **WhatsApp:** **CRM → WhatsApp**. Paste the **Phone number ID** and an
     **Access token** from Meta (or from WhatsApp's Embedded Signup flow).
     WonderArk checks them against Meta immediately — a bad token fails right
     away instead of silently breaking on your first customer message — and
     never shows the token again. **Disconnect** removes the connection.
   - **Instagram and Facebook Messenger:** **CRM → Channels**. Create a channel
     if you don't have one, then under "Connected accounts" pick the provider
     and paste in the Page ID (the "Page/number/location ID" field) and an access
     token from Meta's dashboard.
7. **WhatsApp templates**: on the WhatsApp screen, register any templates
   you've already had approved in Meta's dashboard (name, language, variable
   count) so the reply composer can use them once the 24-hour free window
   closes. WonderArk doesn't submit templates to Meta for you — only Meta's
   own dashboard does that.
8. **Click-to-chat links** (also on the WhatsApp screen): create a link with
   a label, your WhatsApp number (country code, no +), a pre-filled message and
   an optional product/source/campaign. Share it on a bio, a flyer or an ad;
   each link counts the conversations it brought in. **Deactivate** retires a
   link.
9. **Google Business Profile (Reviews)** has no webhook and is connected on
   the **Reviews** screen: enter an Account ID, Location ID and access token,
   then use **Sync now** to pull reviews on demand.
10. **Monitoring**: WhatsApp connections show a live status badge
    (connected / degraded / reauthorization required / disconnected /
    provider error) with plain-language next steps — **Check now** when Meta
    is rate-limiting or not responding, a reconnect form with a fresh token
    when authorization has expired — and are also rechecked automatically on
    a schedule, so you don't have to notice a problem yourself.

If a message doesn't arrive: check the connection badge first, then that the
two environment variables above are set on the deployment (the webhook rejects
events with "not configured" until they are) and that Meta's webhook shows the
same verify token and callback URL.

## Routing rules & escalation

**Routing Rules** currently configure the *structure* of how incoming
messages should be assigned by channel — the page says plainly that nothing
yet applies these rules automatically to a live message; treat it as a
staging area, not a working automation, for now.

**Escalation**, on the same page, is a fixed three-step ladder for
unanswered commercial messages (reminder → owner escalation → manager
escalation). The delay times are pre-set and not yet editable from the UI;
the one thing you configure here is **who the escalation manager is** — the
person unresolved messages ultimately land on.

## Who can configure what

CRM access is controlled by the business's shared **Users & access** pages
(avatar menu → **Admin** → the business's **Users & access** chip; see Getting
Started §8). Notably:
**Owner** and **Admin** are the only roles that can manage channel
connections and routing/escalation settings. **Sales Manager** can work the
full day-to-day pipeline (leads, opportunities, follow-ups, messaging,
reviews, analytics) but cannot touch channel or routing configuration.
