# Deposits API Purpose (PayOS)

Deposits module handles fiat top-up flow through PayOS.

## Routes

- POST /api/v1/deposits
  - create PayOS checkout context for current user
- GET /api/v1/deposits
  - list current user fiat deposits
- POST /api/v1/deposits/payos-webhook
  - receive webhook and update deposit status

## Current behavior

- Service calls PayOS SDK v2 resource API: paymentRequests.create(...)
- Webhook verification uses payOS.webhooks.verify(...)
- On successful payment, backend marks fiat deposit as paid and credits wallet flow in service layer

## Required PayOS env

- PAYOS_CLIENT_ID
- PAYOS_API_KEY
- PAYOS_CHECKSUM_KEY
- PAYOS_RETURN_URL
- PAYOS_CANCEL_URL

Production requires all variables above.
