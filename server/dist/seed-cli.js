"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seed_1 = require("./seed");
const result = (0, seed_1.seedDatabase)(process.argv.includes('--force'));
console.log(result.seeded ? `Seeded NEXUS: ${result.users} users, ${result.games} games.` : 'Database already contains data. Use --force to reseed.');
