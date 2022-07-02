export default interface SqlDatabase {
  query(query: string, values?: any[]): Promise<any>;

  getConnection(): Promise<{
    query(query: string, values?: any[]): Promise<any>;
    release(): void;
  }>;

  isAvailable(): Promise<boolean>;

  shutdown(): Promise<void>;
}
