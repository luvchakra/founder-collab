# CRM: Leads, Conversations & Reputation

CRM runs your pipeline from first message to won customer: conversations from WhatsApp,
Instagram and Facebook, leads, opportunities, a lost-business recovery queue, reviews, and a
customer profile that pulls in data from every other licensed module.

Last updated: 2026-10-17

## Navigation

**Overview**: Dashboard, Inbox, Conversations, Potential Lost Business, Reviews
**Sales**: Leads, Sales Opportunities, Follow-ups, Exceptions
**Administration**: Channels, WhatsApp, Routing Rules

> **Inbox vs. Conversations**: **Inbox** is a ticket list — tickets you log by hand with
> **New ticket**, each with a status (open, pending, closed) and an assignee, plus
> **Customer 360** and **Convert to prospect** on each row. Incoming messages don't create
> tickets; they arrive in **Conversations**, where you read the thread and reply.

## Daily workflows

- **Dashboard** — a read-only launchpad. "Potential Lost Business" tiles (unanswered
  messages, unanswered social questions, reviews needing action, overdue leads, stale
  opportunities, open high-intent conversations, open exceptions) link straight to the
  working screen; **Pipeline & operations** covers new leads, open opportunities, pipeline
  and won value, response SLA, open conversations, unanswered commercial interactions,
  overdue follow-ups and quote follow-ups.
- **Conversations** — filters (Needs response / Assigned to me / Overdue / High intent, plus
  channel, status and owner) next to a three-column inbox (one column on a phone). Opening a
  conversation shows the linked lead or opportunity, the message timeline with delivery
  status, products the customer is interested in (with live stock, **Add product** and
  **Waitlist**), **Generate summary** (AI), **Assign** and **Not actionable**. A high-intent
  *comment* offers **Create Lead / Create Opportunity / Create Task** (lead and opportunity
  need a known contact).
  - **Replying** works for WhatsApp only. Instagram conversations show "Sending replies from
    here isn't supported for Instagram yet"; Facebook Messenger has no reply box. Inside
    Meta's 24-hour service window you write a free-form reply, **Send image** (image URL and
    caption) or **Send template**; once the window closes only approved templates can be
    sent — a Meta rule.
  - **Suggested reply (template)** is a canned reply picked by keyword — not AI.
  - **Check before sending** runs an AI check that flags things like "Unsupported claim" or
    "Overly long"; it never blocks **Send**.
  - **Draft with AI** — see [AI-drafted WhatsApp replies](#ai-drafted-whatsapp-replies), which
    also covers **Send automatically**.
- **Leads** — a list with inline status editing (10 stages from new through
  won/lost/disqualified) and inline owner reassignment, both directly in the
  row.
- **Sales Opportunities** — Kanban view by default (drag a card to change
  its stage) or a List view (toggle in the page), which additionally lets
  you edit deal value and reassign owner inline. Pipeline and won value
  totals are shown as summary cards.
- **Follow-up Queue** — one worklist across leads, opportunities and conversations, with
  tabs for All / Due today / Overdue / Upcoming / Unassigned / High priority, filters for
  owner, source, channel and priority, and an inline **Complete** button.
- **Potential Lost Business** — every unanswered commercial message, oldest first, with an
  intent picked by keyword rules (not AI) that you can **Correct**. Actions: **Respond**,
  **Convert ▾** (Lead / Opportunity / Task) or ✕ "Not relevant".
- **Reviews** — **Connect location** for your Google Business Profile and **Sync now** to
  pull reviews (both need the channel-connections permission), then **Generate AI draft**
  and **Approve & publish** a response (both need the review-publishing permission).
- **Analytics** and **Reactivation** pages exist but aren't in the CRM menu yet; open
  them from the address bar at `…/crm/analytics` and `…/crm/reactivation`. Analytics shows
  30-day response performance (median first response, SLA compliance, unresolved by age, per
  channel and per owner) and the Discovery → CRM and CRM → Service funnels when those modules
  are licensed. Reactivation lists customers worth contacting again by simple rules (gone
  quiet, an old lead with a new signal, a waited-for item back in stock, a service likely due
  again). Nothing is sent automatically.
- **Exceptions** — open cross-module problems that need a decision: a
  Service job with a parts shortage (choose how to resolve it, with an
  optional note) and an opportunity that needs an assessment (**Request
  assessment** in one click, or open it in Service once it exists).
- **Customer 360** (open from any contact) — one screen combining an AI customer summary
  (**Generate summary**), a Buying Intent score (0–100, calculated when you click **Calculate
  score** / **Recalculate**, with each contributing signal and its evidence), contacts, relationship
  timeline, open opportunities, follow-ups, products of interest, recent
  conversations, notes, and outstanding balance. If licensed, it also pulls
  in Discovery's prospect/signal data, Inventory's order history and
  Finance's e-invoice status, and Service's job history — sections just
  don't appear if that module isn't licensed for you.

## Working a sales opportunity

Open a sales opportunity for its detail page: its **Journey**, **Linked records**, the **Next
action** (**Add next action**), **Follow-ups** (**Add follow-up**), the **Products** the
customer wants (**Change quantity**, or pick an alternative), **Contacts** for a company
customer (add one, or make one primary) and a **History**. With other modules licensed it
also offers hand-offs, each optional:

- **Inventory fulfillment** — set **Fulfillment** and **Confirm**, then **Request inventory
  fulfillment** turns the products into a sales order without leaving CRM; if only part is in
  stock you choose **Fulfill available quantity** or **Wait for complete quantity**.
- **Assessment** — set **Assessment** and **Confirm**; **Request FSM assessment** sends it to
  Service, and **Open in FSM** shows it there. The status and outcome show back here.
- **FSM quote** — **Create FSM quote** (needs at least one product and a recorded assessment
  outcome) creates the Service estimate; once it exists, **Create job in FSM**.

## AI-drafted WhatsApp replies

On a WhatsApp conversation, inside the 24-hour window, **Draft with AI** writes an answer to
the customer's latest message from your business's own recorded facts only: opening hours,
address, phone, email, website and "About the business" (fill them in on the Business page
under **Contact details for customer replies**), up to 40 active products with their
recorded prices, saved offering knowledge, and that customer's own recent orders and jobs.

- The draft is labelled "AI draft — based on …" with the facts it used.
- When it can't answer confidently from those facts, or the message is about a complaint,
  refund, payment, cancellation, order change or opt-out, it says "AI couldn't answer this
  from your business details — reply yourself."
- **Use this draft** only puts the text in the reply box. Nothing is sent until a person
  clicks **Send** (which needs the permission to send messages).
- Each message is drafted once and kept; it uses AI credits.
- Anyone who can open CRM can draft. An agent connected to WonderArk's MCP server with a
  business API key can request the same draft (`draft_whatsapp_reply`); it is saved for the
  team, never sent.

### Draft for review or Send automatically

On CRM → WhatsApp, open **AI replies** under the connection and choose:

- **Draft for review** (the default) — nothing is sent without a person, as above.
- **Send automatically** — each new customer message is answered by AI straight away, and
  the answer is sent without a person, but only when all of these hold:
  - the answer comes from your business details or your products and prices (questions
    about orders, jobs or anything else stay for a person);
  - the AI is confident, and the message isn't about a complaint, refund, payment,
    cancellation, order change or opt-out;
  - it is inside WhatsApp's 24-hour window, it's the customer's latest message and nobody
    has replied yet;
  - fewer than 100 automatic replies were sent by your business today, and fewer than 3 in
    that conversation;
  - the customer hasn't opted out: a customer who sends just **STOP** (or UNSUBSCRIBE /
    OPT OUT) gets no automatic replies again;
  - your CRM licence is active and AI replies haven't been switched off for the platform.

Each message gets at most one automatic reply, even if WhatsApp delivers it twice. In the
conversation, an automatic reply is labelled "Sent automatically by AI — based on …" with
the facts it used; if WhatsApp refuses it, it shows **Failed**. A message that wasn't
answered automatically stays for a person, and **Draft with AI** works as usual. On CRM → Conversations, a
WhatsApp conversation shows one line with the current mode (and, for the latest message,
why it wasn't sent automatically) and a **Change in settings** link. Changing the mode needs
the channel-connections permission and is recorded in the audit log; so is every automatic
reply. Automatic replies use AI credits.

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
   - **WhatsApp:** **CRM → WhatsApp**. Paste the **Phone number ID** and an **Access token** from Meta and click **Connect WhatsApp**.
     WonderArk checks them against Meta immediately — a bad token fails right
     away instead of silently breaking on your first customer message — and
     never shows the token again. **Disconnect** removes the connection.
   - **Instagram and Facebook Messenger:** **CRM → Channels**. Create a channel
     if you don't have one, then under "Connected accounts" pick the provider
          and paste in the Page ID (the "Page/number/location ID" field) and an access token from
     Meta's dashboard. Google Business Messages is listed there too, but WonderArk doesn't
     receive messages from it. The channel's "instant reply" setting currently has no effect:
     incoming messages always wait for a person.
7. **WhatsApp templates**: on the WhatsApp screen, register any templates
   you've already had approved in Meta's dashboard (name, language, variable
   count) so the reply composer can use them once the 24-hour free window
   closes. WonderArk doesn't submit templates to Meta for you — only Meta's
   own dashboard does that.
8. **Click-to-chat links** (also on the WhatsApp screen): create a link with
   a label, your WhatsApp number (country code, no +), a pre-filled message and
   an optional product/source/campaign, then **Create link**. Share it on a bio, a flyer or an
   ad;
   each link counts the conversations it brought in. **Deactivate** retires a
   link.
9. **Google Business Profile (Reviews)** has no webhook and is connected on
   the **Reviews** screen: enter an Account ID, Location ID and access token,
   then use **Sync now** to pull reviews on demand.
10. **Monitoring**: WhatsApp connections show a live status badge
    (connected / degraded / reauthorization required / disconnected /
    provider error) with plain-language next steps — **Check now** when Meta
    is rate-limiting or not responding, a reconnect form with a fresh token
    when authorization has expired — and are also rechecked automatically once a day.

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
unanswered commercial messages (reminder → owner escalation → manager escalation). The delay
times are pre-set, and the one thing you configure here is **who the escalation manager
is**. Escalations aren't run automatically yet, so treat this as setup for now too.

## Who can configure what

CRM access is controlled by the business's shared **Users & access** pages (avatar menu →
**Admin** → the business's **Users & access** chip; see [Users, roles and
invitations](/help/getting-started#users-roles-and-invitations)). Connecting WhatsApp, its templates and click-to-chat links, and connecting or syncing
Google reviews need the channel-connections permission, which **Owner** and **Admin** have. **Sales Manager** works the day-to-day pipeline (leads,
opportunities, follow-ups, messaging, review responses) but can't connect channels or sync
reviews. Creating channels and connected Instagram or Messenger accounts on **Channels**
currently isn't limited by role: any CRM member can do it.

