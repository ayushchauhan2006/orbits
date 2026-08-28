const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadBackups() {
  console.log("Starting safe orbital data backup...");
  
  const endpoints = [
    { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json', file: 'active-real.json' },
    { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=json', file: 'debris-real.json' },
    { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=json', file: 'iridium-real.json' },
    { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=json', file: 'fengyun-real.json' }
  ];

  for (const { url, file } of endpoints) {
    try {
      console.log(`Downloading ${file}...`);
      const res = await fetch(url);
      const text = await res.text();

      // Check if it's actually JSON before saving
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
        console.log(`SUCCESS: Saved ${parsed.length} objects to ${file}`);
      } else {
        console.error(`FAILED: CelesTrak response for ${file} was not an array.`);
      }
    } catch (err) {
      console.error(`FAILED to download ${file}: ${err.message}`);
    }

    // Wait 2 seconds between downloads to prevent CelesTrak rate-limiting
    await sleep(2000);
  }
  console.log("Backup routine completed.");
}

downloadBackups();