const puppeteer = require('puppeteer-core');

async function testCustomizer() {
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

        console.log('🌐 Navigating to customizer.html...');
        await page.goto('https://neon.rgbsigns.com/customizer.html', { waitUntil: 'networkidle2' });

        console.log('⏳ Page loaded. Waiting for 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('🔍 Checking if customizer elements exist in DOM...');
        const elementStatus = await page.evaluate(() => {
            return {
                textInputExists: !!document.getElementById('text-input') || !!document.getElementById('quote-text') || !!document.querySelector('textarea') || !!document.querySelector('input[type="text"]'),
                canvasExists: !!document.getElementById('neon-canvas') || !!document.querySelector('canvas'),
                fontsDropdownExists: !!document.getElementById('font-select') || !!document.querySelector('.font-item'),
                saveToAccountBtnExists: !!document.getElementById('save-to-account-btn'),
                loadDesignsBtnExists: !!document.getElementById('load-designs-btn'),
                windowSupabaseExists: !!window.supabase,
                windowSupabaseInitPromiseExists: !!window.supabaseInitPromise
            };
        });

        console.log('📊 DOM elements status:', JSON.stringify(elementStatus, null, 2));

    } catch (e) {
        console.error('❌ Error during browser test:', e);
    } finally {
        await browser.close();
        console.log('🔒 Browser closed.');
    }
}

testCustomizer();
