const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
    console.log('🔑 Checking Resend configuration...');
    console.log('MAIL_FROM:', process.env.MAIL_FROM);
    console.log('MAIL_TO:', process.env.MAIL_TO);
    console.log('API Key exists:', !!process.env.RESEND_API_KEY);

    const fromEmail = process.env.MAIL_FROM || 'onboarding@resend.dev';

    try {
        console.log('📧 Attempting to send test email to MAIL_TO (admin)...');
        const adminRes = await resend.emails.send({
            from: `Nano Neons <${fromEmail}>`,
            to: [process.env.MAIL_TO || 'nanosign1@gmail.com'],
            subject: '🧪 Resend Admin Test Email',
            html: '<h1>Resend Admin Test Email</h1><p>If you see this, sending emails to admin works!</p>'
        });
        
        console.log('📊 Admin Email Result:', JSON.stringify(adminRes, null, 2));

        console.log('📧 Attempting to send test email to tahasalehine@gmail.com...');
        const customerRes = await resend.emails.send({
            from: `Nano Neons <${fromEmail}>`,
            to: ['tahasalehine@gmail.com'],
            subject: '🧪 Resend Customer Test Email',
            html: '<h1>Resend Customer Test Email</h1><p>If you see this, sending emails to customers works!</p>'
        });
        
        console.log('📊 Customer Email Result:', JSON.stringify(customerRes, null, 2));
    } catch (e) {
        console.error('❌ Exception thrown during email send:', e);
    }
}

testEmail();
