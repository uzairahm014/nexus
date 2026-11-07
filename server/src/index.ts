import { createApp } from './app';
import { seedDatabase } from './seed';

const port = Number(process.env.PORT || 4000);
const app = createApp();

if (process.env.SEED_ON_START !== '0') {
  const result = seedDatabase(false);
  if (result.seeded) console.log(`[nexus] seeded demo dataset: ${result.users} users, ${result.games} games`);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[nexus] API listening on http://0.0.0.0:${port}`);
});
