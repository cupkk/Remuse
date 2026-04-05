import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyCuratedGiftCopy, type NfcGiftShowcaseRecord } from '../shared/nfcGiftShowcaseCopy.ts';

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const OUTPUT_JSON_PATH = path.join(APP_ROOT, 'shared', 'nfcGiftDemos.generated.json');

async function main() {
  const raw = await fs.readFile(OUTPUT_JSON_PATH, 'utf8');
  const dataset = JSON.parse(raw) as NfcGiftShowcaseRecord[];
  const polished = dataset.map((entry) => applyCuratedGiftCopy(entry));

  await fs.writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(polished, null, 2)}\n`, 'utf8');
  console.log(`[nfc] 已润色 ${polished.length} 个 NFC 展页文案`);
}

main().catch((error) => {
  console.error('[nfc] 润色 NFC 展页文案失败', error);
  process.exitCode = 1;
});
