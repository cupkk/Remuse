const queries = [
    'glass bottle plant',
    'denim tote bag',
    'circuit board macro',
    'paper bag mockup',
    'macrame wall hanging',
    'glass perfume bottle',
    'sewing machine thread',
    'plant in coffee cup',
    'mechanical keyboard',
    'resin jewelry',
    'vintage metal tin',
    'cat in cardboard box'
];

async function run() {
    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        try {
            const res = await fetch('https://unsplash.com/napi/search/photos?query=' + encodeURIComponent(q) + '&per_page=1');
            const data = await res.json();
            if (data && data.results && data.results.length > 0) {
                console.log(`Image ${i + 1}: ${data.results[0].id}`);
            } else {
                console.log(`Image ${i + 1}: NO RESULT`);
            }
        } catch (e) {
            console.error(`Image ${i + 1} ERROR:`, e.message);
        }
    }
}

run();