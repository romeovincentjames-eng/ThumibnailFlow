# Stripe paywall setup

ThumbnailFlow Batch uses points as the paywall. The app creates a local billing account cookie, sends users to Stripe Checkout, and credits points from Stripe webhooks.

## Products and prices

Create these recurring monthly prices in Stripe:

- Starter: `$19/mo`, `300` points
- Creator: `$49/mo`, `900` points
- Pro: `$99/mo`, `2,000` points
- Agency: `$199/mo`, `4,500` points

Create these one-time prices:

- Top-up 200: `$15`, `200` points
- Top-up 500: `$29`, `500` points
- Top-up 1500: `$79`, `1,500` points

Copy each Stripe price ID into `.env.local`:

```bash
STRIPE_PRICE_STARTER=
STRIPE_PRICE_CREATOR=
STRIPE_PRICE_PRO=
STRIPE_PRICE_AGENCY=
STRIPE_PRICE_TOPUP_200=
STRIPE_PRICE_TOPUP_500=
STRIPE_PRICE_TOPUP_1500=
```

## Required environment values

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Webhook endpoint

Local endpoint:

```text
http://localhost:3000/api/stripe/webhook
```

Production endpoint:

```text
https://your-domain.com/api/stripe/webhook
```

Listen for these events:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Point costs

- `5` points = analyze a YouTube link
- `5` points = generate thumbnail prompt and creative copy
- `25-40` points = generate one AI thumbnail concept (`30` points currently)
- `25-40` points = regenerate one thumbnail (`30` points currently)
- `10-20` points = create a set of 3 alternate formats (`15` points currently)
- `10-25` points = apply generated title, description, and thumbnail to YouTube (`15` points currently)
- `50-80` points = typical full batch for one video
- Failed generation steps refund unused reserved points
