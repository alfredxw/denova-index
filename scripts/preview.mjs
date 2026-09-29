import { createFixture } from './browser/fixture.mjs';
const host = await createFixture(Number(process.env.PORT || 4381));
console.log('Scripted development preview (no live model): ' + host.url);
process.on('SIGINT', async () => { await host.close(); process.exit(0); });
