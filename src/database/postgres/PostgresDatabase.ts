import { Pool, PoolClient, QueryResult } from 'pg';
import { ApolloConfig } from '../../global';
import SqlDatabase from '../SqlDatabase';

// not used now, might be useful later: gin dictionary that does not have any stop words (e.g. 'of', 'and', 'the', etc.) which would make it harder to search for words like 'of'
//   CREATE TEXT SEARCH DICTIONARY english_stem_nostop (Template = snowball, Language = english);
//   CREATE TEXT SEARCH CONFIGURATION public.english_nostop (COPY = pg_catalog.english);
//   ALTER TEXT SEARCH CONFIGURATION public.english_nostop ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part, word WITH english_stem_nostop;
export default class PostgresDatabase implements SqlDatabase {
  private pool: Pool;

  constructor(cfg: ApolloConfig['database']['postgres']) {
    this.pool = new Pool({
      host: cfg.host,
      port: cfg.port,

      user: cfg.username,
      password: cfg.password,
      database: cfg.database,

      ssl: cfg.ssl ? {rejectUnauthorized: false} : false,
      max: cfg.poolSize
    });

    this.pool.on('error', (err, _client) => {
      console.error('Unexpected error on PostgresClient', err);
    });
  }

  query(query: string, values?: any[]): Promise<QueryResult> {
    return this.pool.query(query, values);
  }

  async getConnection(): Promise<PoolClient> {
    return this.pool.connect();
  }

  isAvailable(): Promise<boolean> {
    return this.pool.query('SELECT 1;')
        .then(() => true)
        .catch(() => false);
  }

  async shutdown(): Promise<void> {
    return this.pool.end();
  }

  static escapeForLikePattern(input: string): string {
    return input.replace(/#/g, '##')
        .replace(/_/g, '#_')
        .replace(/%/g, '#%');
  }
}
