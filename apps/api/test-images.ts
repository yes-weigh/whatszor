import * as cheerio from 'cheerio';

async function testImageScraping() {
    const url = 'https://yesweigh.in';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const baseUrl = new URL(url);
    const images: string[] = [];
    
    $('img').each(function() {
        const src = $(this).attr('src') || $(this).attr('data-src') || $(this).attr('data-lazy-src');
        if (!src) return;
        if (src.startsWith('data:')) return;
        
        // Resolve relative URLs
        try {
            const resolved = new URL(src, baseUrl.origin).href;
            if (!images.includes(resolved)) images.push(resolved);
        } catch {}
    });
    
    // Also grab og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) images.unshift(ogImage);
    
    console.log(`Found ${images.length} images:`);
    images.forEach((img, i) => console.log(`${i+1}. ${img}`));
}

testImageScraping().catch(console.error);
