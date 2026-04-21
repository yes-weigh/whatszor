import * as cheerio from 'cheerio';

fetch('https://yesweigh.in', { signal: AbortSignal.timeout(10000) })
  .then(res => res.text())
  .then(html => {
    const $ = cheerio.load(html);
    console.log("TITLE:", $('title').text());
    console.log("FIRST PARAGRAPH:", $('p').first().text());
  })
  .catch(console.error);
