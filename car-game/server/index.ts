import { server } from './app.ts';

const serverPort = Number.parseInt(process.env.PAPER_KART_SERVER_PORT ?? '2567', 10);
const serverHost = process.env.PAPER_KART_SERVER_HOST ?? '0.0.0.0';

await server.listen(serverPort, serverHost);
console.log(`Paper Kart multiplayer server: http://localhost:${serverPort}`);
