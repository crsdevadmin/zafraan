# Secure Razorpay functions

Before deploying, configure the two Firebase secrets:

```sh
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
```

Use the Razorpay live key ID already configured for the storefront and its matching
secret. Then install and deploy:

```sh
cd functions
npm install
cd ..
firebase deploy --only functions
```

Every purchasable product must have a `productCatalog/{id}` document containing at
least `name`, `price`, `sizes`, and `visible`. The backend rejects products that are
missing from this server-owned catalog.
