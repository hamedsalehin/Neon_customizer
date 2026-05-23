require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();

const PORT = process.env.PORT || 3000;

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

let supabase;
if (supabaseUrl && supabaseKey && supabaseUrl !== 'YOUR_SUPABASE_URL') {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`✅ Supabase connected: ${supabaseUrl}`);
} else {
    console.warn('⚠️  Supabase credentials missing.');
}

// ─── Stripe ──────────────────────────────────────────────────────────────────
let stripe;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'YOUR_STRIPE_SECRET_KEY') {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe connected');
} else {
    console.warn('⚠️  Stripe credentials missing – payment features disabled.');
}

// ─── Stripe Webhook (raw body needed BEFORE json parser) ─────────────────────
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orderId = session.metadata.order_id;
        const customerEmail = session.customer_details?.email;

        console.log(`💰 Payment confirmed for order: ${orderId}`);

        // Mark order as paid in Supabase
        if (supabase && orderId) {
            const { error } = await supabase
                .from('orders')
                .update({
                    payment_status: 'paid',
                    stripe_session_id: session.id,
                    customer_email: customerEmail || undefined
                })
                .eq('id', orderId);

            if (error) {
                console.error('Failed to update order payment status:', error);
            } else {
                console.log(`✅ Order ${orderId} marked as paid`);
            }
        }
    }

    res.json({ received: true });
});

// ─── JSON body parser (after webhook route) ───────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API: Verify Payment (called by confirmation page after Stripe redirects) ──
app.get('/api/verify-payment', async (req, res) => {
    const { session_id, order_id } = req.query;
    if (!stripe || !session_id) return res.json({ paid: false });

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const paid = session.payment_status === 'paid';

        if (paid && supabase && order_id) {
            await supabase
                .from('orders')
                .update({
                    payment_status: 'paid',
                    stripe_session_id: session_id
                })
                .eq('id', order_id);
            console.log(`✅ Order ${order_id} verified and marked as paid`);
        }

        res.json({ paid, customerEmail: session.customer_details?.email });
    } catch (err) {
        console.error('Verify payment error:', err.message);
        res.json({ paid: false });
    }
});

// ─── API: Create Stripe Checkout Session ──────────────────────────────────────
app.post('/api/create-checkout', async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Payment system not configured.' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured.' });

    const { customer_name, customer_email, shipping_address, items, total_price } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty.' });
    }

    try {
        // 1. Save a PENDING order to Supabase first
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                customer_name,
                customer_email,
                shipping_address,
                total_price,
                payment_status: 'pending'
            }])
            .select()
            .single();

        if (orderError) throw orderError;

        // 2. Save order items
        const orderItems = items.map(item => ({
            order_id: order.id,
            text: item.text,
            font_name: item.fontName,
            color_name: item.colorName,
            width_cm: item.widthCm,
            height_cm: item.heightCm,
            backing: item.backing,
            price: item.price,
            svg_markup: item.svgMarkup
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) throw itemsError;

        // 3. Build Stripe line items
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: `Neon Sign — "${item.text}"`,
                    description: `${item.fontName} · ${item.colorName} · ${item.widthCm}×${item.heightCm}cm · ${item.backing} backing`
                },
                unit_amount: Math.round(item.price * 100) // Stripe expects cents
            },
            quantity: 1
        }));

        // 4. Create Stripe Checkout Session
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            customer_email: customer_email || undefined,
            metadata: {
                order_id: order.id,
                customer_name: customer_name || ''
            },
            success_url: `${baseUrl}/confirmation.html?id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/cart.html`
        });

        res.json({ url: session.url });

    } catch (err) {
        console.error('Checkout session error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Save Order (legacy / fallback without Stripe) ───────────────────────
app.post('/api/orders', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Database not configured.' });

    const { customer_name, customer_email, shipping_address, items, total_price } = req.body;

    try {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{ customer_name, customer_email, shipping_address, total_price, payment_status: 'free' }])
            .select()
            .single();

        if (orderError) throw orderError;

        const orderItems = items.map(item => ({
            order_id: order.id,
            text: item.text,
            font_name: item.fontName,
            color_name: item.colorName,
            width_cm: item.widthCm,
            height_cm: item.heightCm,
            backing: item.backing,
            price: item.price,
            svg_markup: item.svgMarkup
        }));

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        res.json({ success: true, orderId: order.id });
    } catch (err) {
        console.error('Order submission error:', err);
        res.status(500).json({ error: err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Neon Sign Creator running at http://localhost:${PORT}\n`);
    });
}

module.exports = app;
