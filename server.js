const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// Browser Instance holder
let browser;

async function startBrowser() {
    if (!browser || !browser.isConnected()) {
        console.log("Launching Browser...");
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
    }
    return browser;
}

startBrowser();

app.get('/get-insta-info', async (req, res) => {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const cleanUser = username.replace('@', '').trim();

    try {
        const browserInstance = await startBrowser();
        const page = await browserInstance.newPage();
        
        // Mobile User Agent to ensure lightweight page load
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');

        console.log(`Fetching profile: ${cleanUser}`);
        
        const response = await page.goto(`https://www.instagram.com/${cleanUser}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if(response.status() === 404) {
            await page.close();
            return res.json({ success: false, message: 'User not found' });
        }

        // Extract Data from Meta Tags (Best for Public Info)
        const data = await page.evaluate(() => {
            const imageEl = document.querySelector('meta[property="og:image"]');
            const descEl = document.querySelector('meta[property="og:description"]');
            const titleEl = document.querySelector('meta[property="og:title"]');
            
            return {
                image: imageEl ? imageEl.content : null,
                desc: descEl ? descEl.content : null,
                title: titleEl ? titleEl.content : null
            };
        });

        await page.close();

        if (data.image) {
            // Parsing Logic: "100 Followers, 50 Following, 20 Posts - See Instagram photos..."
            let stats = { followers: '-', following: '-', posts: '-' };
            let bio = "Instagram User";
            let fullName = cleanUser;

            if (data.desc) {
                // Split description to get numbers
                const parts = data.desc.split(' - ')[0].split(', ');
                parts.forEach(p => {
                    if(p.includes('Followers')) stats.followers = p.replace('Followers', '').trim();
                    if(p.includes('Following')) stats.following = p.replace('Following', '').trim();
                    if(p.includes('Posts')) stats.posts = p.replace('Posts', '').trim();
                });
                
                // Try to extract bio from title or description end if possible, 
                // but usually meta tags don't have full bio. 
                // We'll use the stats we found.
            }

            if (data.title) {
                // Title format: "Name (@username) • Instagram photos and videos"
                const namePart = data.title.split(' (@')[0];
                if(namePart) fullName = namePart;
            }

            res.json({ 
                success: true, 
                username: cleanUser,
                fullName: fullName,
                dp: data.image,
                followers: stats.followers,
                following: stats.following,
                posts: stats.posts,
                about: `${fullName} • Instagram` // Fallback bio as meta desc doesn't always have it
            });
        } else {
            res.json({ success: false, message: 'Login Wall or Private' });
        }

    } catch (error) {
        console.error("Scraping error:", error.message);
        // Restart browser on crash
        if (browser) await browser.close();
        browser = null;
        res.status(500).json({ success: false, error: 'Server Busy' });
    }
});

app.get('/', (req, res) => {
    res.send('Insta Backend Ready');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
