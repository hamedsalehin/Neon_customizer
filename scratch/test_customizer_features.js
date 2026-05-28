const puppeteer = require('puppeteer-core');

async function testFeatures() {
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
        await page.goto('https://neon.rgbsigns.com/customizer.html', { waitUntil: 'networkidle2' });

        console.log('⏳ Waiting for page initialization...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Click a font card in the gallery
        console.log('👇 Clicking on a font card...');
        await page.evaluate(() => {
            const fontCard = document.querySelector('.font-item');
            if (fontCard) fontCard.click();
            else console.error('Font item not found!');
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click a color button
        console.log('👇 Clicking on a neon color button...');
        await page.evaluate(() => {
            const colorBtn = document.querySelector('.neon-color-button');
            if (colorBtn) colorBtn.click();
            else console.error('Neon color button not found!');
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click a backing option card
        console.log('👇 Clicking on a backing style option...');
        await page.evaluate(() => {
            const backingCard = document.querySelector('.bb-card');
            if (backingCard) backingCard.click();
            else console.error('bb-card not found!');
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click a backing color swatch
        console.log('👇 Clicking on a backing color swatch...');
        await page.evaluate(() => {
            const swatch = document.querySelector('.color-swatch');
            if (swatch) swatch.click();
            else console.error('color-swatch not found!');
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click "Add to Cart"
        console.log('👇 Clicking "Add to Cart"...');
        await page.click('#add-to-cart-btn');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if item is in localStorage cart
        const cartData = await page.evaluate(() => {
            return localStorage.getItem('neon_cart');
        });

        console.log('🛒 localStorage neon_cart contents:', cartData);

    } catch (e) {
        console.error('❌ Error during interaction test:', e);
    } finally {
        await browser.close();
        console.log('🔒 Browser closed.');
    }
}

testFeatures();
