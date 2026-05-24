require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

const app = express();

// ─── Nodemailer Transporter Setup ────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

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

// ─── Nodemailer Order Confirmation Dispatcher ────────────────────────────────
async function sendOrderConfirmationEmail(orderId) {
    if (!supabase) {
        console.warn('⚠️ Supabase not initialized, cannot fetch order details for email.');
        return;
    }

    try {
        console.log(`✉️ Fetching order details to dispatch email for order: ${orderId}`);
        
        // 1. Fetch Order Details from Supabase
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderErr || !order) {
            throw new Error(orderErr ? orderErr.message : 'Order not found');
        }

        // 2. Fetch Order Items (with SVG markup) from Supabase
        const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);

        if (itemsErr || !items) {
            throw new Error(itemsErr ? itemsErr.message : 'Order items not found');
        }

        const emailTo = order.customer_email;
        if (!emailTo) {
            console.warn('⚠️ No customer email found on order, skipping email dispatch.');
            return;
        }

        // 3. Build detailed email confirmation body
        let itemsHtml = '';
        const attachments = [];

        items.forEach((item, index) => {
            itemsHtml += `
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-family: sans-serif;">
                    <h3 style="margin-top: 0; color: #ff007f; font-size: 1.15rem;">Custom Neon Sign #${index + 1}</h3>
                    <p style="margin: 6px 0; color: #1e1b4b;"><strong>Sign Text:</strong> "${item.text}"</p>
                    <p style="margin: 6px 0; color: #475569;"><strong>Font Name:</strong> ${item.font_name}</p>
                    <p style="margin: 6px 0; color: #475569;"><strong>Color Theme:</strong> ${item.color_name}</p>
                    <p style="margin: 6px 0; color: #475569;"><strong>Dimensions:</strong> ${item.width_cm}cm x ${item.height_cm}cm</p>
                    <p style="margin: 6px 0; color: #475569;"><strong>Backing Material:</strong> ${item.backing}</p>
                    <p style="margin: 6px 0; color: #ff007f; font-weight: 700;"><strong>Price:</strong> $${item.price.toFixed(2)}</p>
                </div>
            `;

            // If there's SVG markup, attach it as a file!
            if (item.svg_markup) {
                attachments.push({
                    filename: `design-custom-sign-${index + 1}.svg`,
                    content: item.svg_markup,
                    contentType: 'image/svg+xml'
                });
            }
        });

        const adminEmail = process.env.SMTP_USER || 'info@nanoneons.com';

        const mailOptions = {
            from: `"Nano Neons" <${adminEmail}>`,
            to: emailTo,
            cc: adminEmail, // Send copy to admin to help create the order!
            subject: `🎨 Order Confirmed - Your Custom Neon Design [Order ID: ${orderId}]`,
            html: `
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #1e1b4b; padding: 20px; background: #ffffff;">
                    <div style="text-align: center; padding: 20px 0;">
                        <h2 style="margin: 0; font-weight: 800; font-size: 24px; color: #1e1b4b;">Order Confirmed!</h2>
                        <p style="color: #64748b; margin-top: 5px;">Your digital neon design and order receipt</p>
                    </div>
                    
                    <div style="background: #ff007f; color: #ffffff; padding: 18px 24px; border-radius: 12px; margin-bottom: 30px;">
                        <h3 style="margin: 0; font-size: 16px;">Reference Order ID: <strong>${orderId}</strong></h3>
                        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.95;">Thank you for your order. Your custom neon layout has been sent directly to our neon artisans for handcrafted creation.</p>
                    </div>

                    <h2 style="font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Order Details</h2>
                    ${itemsHtml}

                    <div style="background: #f1f5f9; border-radius: 12px; padding: 16px 24px; margin-top: 30px;">
                        <p style="margin: 6px 0; color: #475569;"><strong>Customer Name:</strong> ${order.customer_name || 'Valued Customer'}</p>
                        <p style="margin: 6px 0; color: #475569;"><strong>Shipping Address:</strong> ${order.shipping_address || 'Provided in details'}</p>
                        <p style="margin: 6px 0; font-size: 1.1rem; color: #10b981;"><strong>Total Amount Paid:</strong> $${order.total_price.toFixed(2)}</p>
                    </div>

                    <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; color: #64748b; font-size: 12px;">
                        <p>Questions? Contact our support at info@nanoneons.com</p>
                        <p>&copy; 2026 Nano Neons. All rights reserved.</p>
                    </div>
                </div>
            `,
            attachments: attachments
        };

        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Order Confirmation Email sent successfully:', info.messageId);
        } else {
            console.warn('⚠️ SMTP Credentials missing in .env. Here is the simulated email transmission:');
            console.log(`[SIMULATION] To: ${emailTo} | CC: ${adminEmail}`);
            console.log(`[SIMULATION] Attaching ${attachments.length} design files.`);
        }

    } catch (err) {
        console.error('❌ Failed to process order email notification:', err);
    }
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
                // Dispatch confirmation email with customizer design attachment
                sendOrderConfirmationEmail(orderId).catch(err => console.error('Email dispatcher error:', err));
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

        // Dispatch email confirmation asynchronously with design attachments
        sendOrderConfirmationEmail(order.id).catch(err => console.error('Email dispatcher error:', err));

        res.json({ success: true, orderId: order.id });
    } catch (err) {
        console.error('Order submission error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Submit Quote Request ────────────────────────────────────────────────
app.post('/api/quote', async (req, res) => {
    try {
        const { name, email, phone, text, color, size, backing, location, notes, fileBase64, fileName } = req.body;
        
        console.log('Received Quote Request:', { name, email, phone, text, color, size, backing, location });

        let quoteId = 'Q-' + Math.floor(100000 + Math.random() * 900000);

        if (supabase) {
            try {
                const { error } = await supabase
                    .from('quote_requests')
                    .insert([{
                        quote_id: quoteId,
                        name,
                        email,
                        phone,
                        text,
                        color,
                        size,
                        backing,
                        location,
                        notes,
                        file_name: fileName,
                        file_data: fileBase64
                    }]);

                if (error) {
                    console.error('❌ Supabase quote_requests insert error:', error.message);
                    return res.status(500).json({ success: false, error: error.message });
                }
                
                console.log('✅ Quote saved to Supabase:', quoteId);
            } catch (dbErr) {
                console.error('❌ Database exception during quote insert:', dbErr.message);
                return res.status(500).json({ success: false, error: dbErr.message });
            }
        } else {
            console.log('ℹ️ Supabase not configured. Simulating quote storage.');
        }

        res.json({ success: true, quoteId });
    } catch (err) {
        console.error('Quote submission API error:', err);
        res.status(500).json({ error: err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Neon Sign Creator running at http://localhost:${PORT}\n`);
    });
}

module.exports = app;
