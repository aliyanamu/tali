import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

// Demo user — Privy wallet created beforehand, seeded for local dev / demo.
await db
  .insert(schema.users)
  .values({
    linkedUserId: 'cmptj8akr00cd0dl1rv7vf7ay',
    email: 'i.fortland@gmail.com',
    linkedWalletId: 'l0frktpc4w0xk2sxtsw9cdbb',
    walletAddress: '0x8a5B7bBAba77920744bd91643cc0E16A8aCFF061',
  })
  .onConflictDoUpdate({
    target: schema.users.linkedUserId,
    set: {
      email: 'i.fortland@gmail.com',
      linkedWalletId: 'l0frktpc4w0xk2sxtsw9cdbb',
      walletAddress: '0x8a5B7bBAba77920744bd91643cc0E16A8aCFF061',
    },
  });
console.log('Seeded demo user: i.fortland@gmail.com');

await client.end();
