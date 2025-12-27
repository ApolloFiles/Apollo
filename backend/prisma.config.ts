import { defineConfig, env } from 'prisma/config';

if (typeof process.env.DATABASE_URL !== 'string') {
  //@ts-ignore
  await import('dotenv/config');
}

export default defineConfig({
  schema: 'prisma/',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
