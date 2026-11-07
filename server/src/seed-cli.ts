import { seedDatabase } from './seed';

const result = seedDatabase(process.argv.includes('--force'));
console.log(result.seeded ? `Seeded NEXUS: ${result.users} users, ${result.games} games.` : 'Database already contains data. Use --force to reseed.');
