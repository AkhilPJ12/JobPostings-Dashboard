import * as fs from 'fs';
const html = fs.readFileSync('/Users/akhil/Desktop/Projects/JobPostings-Dashboard/google-body.html', 'utf-8');
const scriptMatches = html.matchAll(/AF_initDataCallback\(\{key: 'ds:(\d+)',.*data:(.*), sideChannel:/g);
for (const match of scriptMatches) {
    const key = match[1];
    let dataStr = match[2];
    try {
        const data = JSON.parse(dataStr);
        console.log(`\n=== Script ds:${key} ===`);
        console.log(JSON.stringify(data).substring(0, 500));
    } catch (e) {
        console.log(`Failed to parse ds:${key}`);
    }
}
