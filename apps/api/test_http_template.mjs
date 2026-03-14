import Fastify from 'fastify';

// we just want to test if the route fails, but that requires full app boot.
// Let's write a node script to POST via http to the local server
import http from 'http';

const postData = JSON.stringify({
    name: "test_http_template_" + Date.now(),
    category: "MARKETING",
    language: "en_US",
    messageText: "Hello this is a simple text",
    footerText: "",
    headerMediaId: "",
    buttons: []
});

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/templates',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Bearer test' // Wait I need auth! Let's just bypass or get auth
    }
}, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => console.log(res.statusCode, rawData));
});

req.on('error', (e) => console.error(e));
req.write(postData);
req.end();
