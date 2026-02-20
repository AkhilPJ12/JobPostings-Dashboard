import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
    await page.goto('https://www.google.com/about/careers/applications/jobs/results?location=United%20States&sort_by=date&employment_type=INTERN&employment_type=TEMPORARY&employment_type=FULL_TIME', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    const html = await page.content();
    fs.writeFileSync('google-debug.html', html);
    await browser.close();
}
main();
