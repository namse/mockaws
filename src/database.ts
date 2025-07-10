import { Database } from "bun:sqlite";

export class DatabaseManager {
  private db: Database;

  constructor() {
    this.db = new Database("mockaws.sqlite");
    this.setupTables();
  }

  private setupTables() {
    // S3 Objects Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS objects (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        content_type TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        etag TEXT NOT NULL
      )
    `);

    // DynamoDB Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dynamodb_tables (
        table_name TEXT PRIMARY KEY,
        key_schema TEXT NOT NULL,
        attribute_definitions TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dynamodb_items (
        table_name TEXT NOT NULL,
        item_key TEXT NOT NULL,
        item_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (table_name, item_key)
      )
    `);
  }

  getDatabase(): Database {
    return this.db;
  }
}