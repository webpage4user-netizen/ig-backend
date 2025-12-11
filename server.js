const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// Browser Instance holder
let browser;

// Function to start browser
async function startBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        });
        console.log("Browser Launched!");
    }
    return browser;
}

startBrowser();

app.get('/get-insta-info', async (req, res) => {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'Username required' });

    // Clean username (remove @ if present)
    const cleanUser = username.replace('@', '').trim();

    try {
        const browserInstance = await startBrowser();
        const page = await browserInstance.newPage();
        
        // Instagram restricts non-logged in users, so we set a mobile User Agent to look like a phone
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');

        console.log(`Scraping profile: ${cleanUser}`);
        
        // Visit profile
        const response = await page.goto(`https://www.instagram.com/${cleanUser}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if(response.status() === 404) {
            await page.close();
            return res.json({ success: false, message: 'User not found' });
        }

        // Extract Data using Meta Tags (Reliable for public data)
        const data = await page.evaluate(() => {
            const imageEl = document.querySelector('meta[property="og:image"]');
            const descEl = document.querySelector('meta[property="og:description"]');
            
            return {
                image: imageEl ? imageEl.content : null,
                desc: descEl ? descEl.content : null
            };
        });

        await page.close();

        if (data.image) {
            // Parse description for stats (e.g., "100 Followers, 50 Following...")
            let stats = { followers: 'Unknown', following: 'Unknown' };
            if (data.desc) {
                const parts = data.desc.split(' - ')[0].split(', '); // "100 Followers, 20 Following, 10 Posts"
                parts.forEach(p => {
                    if(p.includes('Followers')) stats.followers = p.replace('Followers', '').trim();
                    if(p.includes('Following')) stats.following = p.replace('Following', '').trim();
                });
            }

            res.json({ 
                success: true, 
                username: cleanUser,
                dp: data.image,
                followers: stats.followers,
                following: stats.following,
                about: data.desc // Full bio string
            });
        } else {
            res.json({ success: false, message: 'Profile restricted or Login Wall hit' });
        }

    } catch (error) {
        console.error("Scraping failed:", error.message);
        // Agar browser crash ho jaye toh restart karo
        if (browser) await browser.close();
        browser = null;
        res.status(500).json({ success: false, error: 'Server Busy. Try again.' });
    }
});

app.get('/', (req, res) => {
    res.send('Instagram Scraper Backend Running!');
});

app.listen(port, () => {
    console.log(`Insta Server running on port ${port}`);
});
