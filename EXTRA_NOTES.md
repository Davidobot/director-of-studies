To copy products/prices from live Stripe to test Stripe:

```bash
# Dry-run preview
make billing-copy-live-to-test

# Apply (creates/updates in test account)
make billing-copy-live-to-test APPLY=1
```