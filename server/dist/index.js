"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const seed_1 = require("./seed");
const realtime_1 = require("./realtime");
const port = Number(process.env.PORT || 4000);
const app = (0, app_1.createApp)();
if (process.env.SEED_ON_START !== '0') {
    const result = (0, seed_1.seedDatabase)(false);
    if (result.seeded)
        console.log(`[nexus] seeded demo dataset: ${result.users} users, ${result.games} games`);
}
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`[nexus] API listening on http://0.0.0.0:${port}`);
});
// Realtime multiplayer shares the HTTP server (path: /ws).
(0, realtime_1.attachRealtime)(server);
