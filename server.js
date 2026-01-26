const path = require('path');
const express = require('express');
const Stripe = require('stripe');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 4242;

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY - Stripe checkout will fail.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16'
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/create-checkout-session', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(400).json({
      error: 'Missing Stripe configuration. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.'
    });
  }

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      payment_method_collection: 'always',
      subscription_data: {
        trial_period_days: 7
      },
      allow_promotion_codes: true,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Unable to start Stripe checkout.' });
  }
});

app.get('/confirm-checkout-session', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Missing STRIPE_SECRET_KEY.' });
  }
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription']
    });

    if (!session || session.status !== 'complete') {
      return res.status(400).json({ error: 'Checkout session not complete.' });
    }

    const subscription = session.subscription;
    const trialEnd = subscription && subscription.trial_end ? subscription.trial_end * 1000 : null;

    return res.json({
      status: 'active',
      trial_end: trialEnd
    });
  } catch (err) {
    console.error('Stripe confirmation error:', err);
    return res.status(500).json({ error: 'Unable to confirm checkout session.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
