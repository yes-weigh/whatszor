const cheerio = require('cheerio');
async function run() {
    try {
        const response = await fetch('https://yesweigh.in');
        const html = await response.text();
        const $ = cheerio.load(html);
        console.log("Title:", $('title').text());
        console.log("Description:", $('meta[name="description"]').attr('content'));
        console.log("Body length:", $('body').html()?.length);
        console.log("Raw text sample:", $('body').text().replace(/\s+/g, ' ').substring(0, 200));
    } catch(e) { console.error(e); }
}
run();
