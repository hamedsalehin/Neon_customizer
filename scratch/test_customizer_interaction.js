const puppeteer = require('puppeteer-core');

async function testInteraction() {
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

        console.log('🌐 Navigating to customizer.html...');
        await page.goto('http://localhost:3000/customizer.html', { waitUntil: 'networkidle2' });

        console.log('⏳ Waiting for DOM to be ready and fonts to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get inner HTML of neon-container
        const containerHTML = await page.evaluate(() => {
            const container = document.getElementById('neon-container');
            return container ? container.innerHTML : 'NOT FOUND';
        });

        console.log('📦 Initial neon-container innerHTML snippet:', containerHTML.substring(0, 300));

        // Let's try to type "Hello World" into the sign-text textarea
        console.log('📝 Typing "Hello World" into #sign-text...');
        await page.focus('#sign-text');
        // Clear existing text first
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        // Type new text
        await page.keyboard.type('Hello World');

        // Wait a second for rendering
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check neon-container HTML again
        const updatedContainerHTML = await page.evaluate(() => {
            const container = document.getElementById('neon-container');
            return container ? container.innerHTML : 'NOT FOUND';
        });

        console.log('📦 Updated neon-container innerHTML snippet:', updatedContainerHTML.substring(0, 300));

        // Let's check for any uncaught errors in global scope
        const errors = await page.evaluate(() => {
            return {
                lastError: window.lastError || null,
                fontSelectOptions: document.getElementById('global-font-gallery') ? document.getElementById('global-font-gallery').childElementCount : 0,
                colorSelectOptions: document.getElementById('global-color-grid') ? document.getElementById('global-color-grid').childElementCount : 0
            };
        });

        console.log('📊 Gallery counts & errors:', JSON.stringify(errors, null, 2));

    } catch (e) {
        console.error('❌ Error during interaction test:', e);
    } finally {
        await browser.close();
        console.log('🔒 Browser closed.');
    }
}

testInteraction();
