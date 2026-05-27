const puppeteer = require('puppeteer-core');
const path = require('path');

async function runTest() {
    console.log('🚀 Launching Google Chrome...');
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Listen for console logs
        page.on('console', msg => {
            console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        // Listen for page errors
        page.on('pageerror', err => {
            console.error(`[BROWSER PAGEERROR]:`, err.stack || err);
        });

        // Listen for failed requests
        page.on('requestfailed', req => {
            console.warn(`[BROWSER REQUEST FAILED]: ${req.method()} ${req.url()} - ${req.failure()?.errorText || 'Unknown error'}`);
        });

        console.log('🌐 Navigating to login.html...');
        await page.goto('https://neon.rgbsigns.com/login.html', { waitUntil: 'networkidle2' });

        console.log('🔍 Page loaded. Verifying Supabase initialization status...');
        
        // Check window.supabase and init errors
        const initResult = await page.evaluate(async () => {
            const supabase = await window.supabaseInitPromise;
            return {
                hasSupabaseGlobal: !!window.supabase,
                hasSupabaseInitPromiseResolved: !!supabase,
                supabaseInitError: window.supabaseInitError || null,
                supabaseGlobalType: typeof window.supabase,
                createClientType: window.supabase ? typeof window.supabase.createClient : 'undefined'
            };
        });

        console.log('📊 Initialization status from browser context:', JSON.stringify(initResult, null, 2));

        // Now, let's switch to Registration mode to try a test signup
        console.log('切换 to Register tab...');
        await page.click('#tab-register');
        await new Promise(resolve => setTimeout(resolve, 500)); // wait for transition

        // Type registration credentials
        console.log('📝 Typing signup credentials...');
        await page.type('#input-name', 'Test User');
        await page.type('#input-email', 'tahasalehine@gmail.com');
        await page.type('#input-password', 'TestPassword123!');

        // Submit form
        console.log('✉️ Submitting registration form...');
        await page.click('#btn-submit');

        // Wait a few seconds for database roundtrip / action
        console.log('⏳ Waiting for signup response...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Fetch display message
        const messageBoxContent = await page.evaluate(() => {
            const msgBox = document.getElementById('message-display');
            return msgBox ? {
                text: msgBox.textContent,
                className: msgBox.className,
                display: window.getComputedStyle(msgBox).display
            } : null;
        });

        console.log('💬 Message Box state:', JSON.stringify(messageBoxContent, null, 2));

    } catch (e) {
        console.error('❌ Error during browser test:', e);
    } finally {
        await browser.close();
        console.log('🔒 Browser closed.');
    }
}

runTest();
