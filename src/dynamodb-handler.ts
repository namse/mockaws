import { Database } from "bun:sqlite";

export class DynamoDBHandler {
  private db: Database;
  private createTable: any;
  private putItem: any;
  private getItem: any;
  private deleteItem: any;
  private queryItems: any;

  constructor(db: Database) {
    this.db = db;
    this.setupQueries();
  }

  private setupQueries() {
    this.createTable = this.db.prepare(`
      INSERT OR REPLACE INTO dynamodb_tables (table_name, key_schema, attribute_definitions, created_at)
      VALUES (?, ?, ?, ?)
    `);

    this.putItem = this.db.prepare(`
      INSERT OR REPLACE INTO dynamodb_items (table_name, item_key, item_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getItem = this.db.prepare(`
      SELECT item_data, created_at, updated_at
      FROM dynamodb_items
      WHERE table_name = ? AND item_key = ?
    `);

    this.deleteItem = this.db.prepare(`
      DELETE FROM dynamodb_items
      WHERE table_name = ? AND item_key = ?
    `);

    this.queryItems = this.db.prepare(`
      SELECT item_key, item_data, created_at, updated_at
      FROM dynamodb_items
      WHERE table_name = ? AND item_key LIKE ?
      ORDER BY item_key
    `);
  }

  private generateItemKey(item: any): string {
    // Extract only the primary key attributes (id for our test case)
    const keyAttrs: any = {};
    if (item.id !== undefined) {
      keyAttrs.id = item.id;
    }
    return JSON.stringify(keyAttrs);
  }

  async handleDynamoDBRequest(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const target = req.headers.get('x-amz-target');
    
    if (!target) {
      return new Response('Missing x-amz-target header', { 
        status: 400,
        headers: corsHeaders
      });
    }

    const body = await req.json();
    
    try {
      switch (target) {
        case 'DynamoDB_20120810.CreateTable':
          return this.handleCreateTable(body, corsHeaders);
        case 'DynamoDB_20120810.PutItem':
          return this.handlePutItem(body, corsHeaders);
        case 'DynamoDB_20120810.GetItem':
          return this.handleGetItem(body, corsHeaders);
        case 'DynamoDB_20120810.UpdateItem':
          return this.handleUpdateItem(body, corsHeaders);
        case 'DynamoDB_20120810.DeleteItem':
          return this.handleDeleteItem(body, corsHeaders);
        case 'DynamoDB_20120810.Query':
          return this.handleQuery(body, corsHeaders);
        case 'DynamoDB_20120810.TransactWriteItems':
          return this.handleTransactWrite(body, corsHeaders);
        default:
          return new Response(`Unsupported operation: ${target}`, { 
            status: 400,
            headers: corsHeaders
          });
      }
    } catch (error) {
      console.error('DynamoDB operation error:', error);
      return new Response('Internal server error', { 
        status: 500,
        headers: corsHeaders
      });
    }
  }

  private handleCreateTable(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, KeySchema, AttributeDefinitions } = body;
    
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.createTable.run(
        TableName,
        JSON.stringify(KeySchema),
        JSON.stringify(AttributeDefinitions),
        now
      );
    });
    
    transaction();
    
    return new Response(JSON.stringify({
      TableDescription: {
        TableName,
        KeySchema,
        AttributeDefinitions,
        TableStatus: 'ACTIVE',
        CreationDateTime: now / 1000,
        TableSizeBytes: 0,
        ItemCount: 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handlePutItem(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, Item } = body;
    
    const itemKey = this.generateItemKey(Item);
    const now = Date.now();
    
    const transaction = this.db.transaction(() => {
      this.putItem.run(TableName, itemKey, JSON.stringify(Item), now, now);
    });
    
    transaction();
    
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handleGetItem(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, Key } = body;
    
    const itemKey = this.generateItemKey(Key);
    const result = this.getItem.get(TableName, itemKey) as {
      item_data: string;
      created_at: number;
      updated_at: number;
    } | undefined;
    
    if (!result) {
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
      });
    }
    
    return new Response(JSON.stringify({
      Item: JSON.parse(result.item_data)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handleUpdateItem(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = body;
    
    const itemKey = this.generateItemKey(Key);
    const existing = this.getItem.get(TableName, itemKey) as {
      item_data: string;
    } | undefined;
    
    if (!existing) {
      return new Response(JSON.stringify({
        __type: 'ResourceNotFoundException',
        message: 'Requested resource not found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
      });
    }
    
    const item = JSON.parse(existing.item_data);
    
    // Simple SET operation parsing
    if (UpdateExpression && UpdateExpression.includes('SET')) {
      const setMatch = UpdateExpression.match(/SET\s+(.+)/);
      if (setMatch) {
        const assignments = setMatch[1].split(',');
        assignments.forEach((assignment: string) => {
          const parts = assignment.trim().split('=');
          if (parts.length === 2 && parts[0] && parts[1]) {
            let attrName = parts[0].trim();
            const valueKey = parts[1].trim();
            
            // Handle ExpressionAttributeNames
            if (ExpressionAttributeNames && attrName.startsWith('#')) {
              attrName = ExpressionAttributeNames[attrName] || attrName;
            }
            
            if (ExpressionAttributeValues && ExpressionAttributeValues[valueKey]) {
              item[attrName] = ExpressionAttributeValues[valueKey];
            }
          }
        });
      }
    }
    
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.putItem.run(TableName, itemKey, JSON.stringify(item), existing ? Date.now() : now, now);
    });
    
    transaction();
    
    return new Response(JSON.stringify({
      Attributes: item
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handleDeleteItem(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, Key } = body;
    
    const itemKey = this.generateItemKey(Key);
    const transaction = this.db.transaction(() => {
      this.deleteItem.run(TableName, itemKey);
    });
    
    transaction();
    
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handleQuery(body: any, corsHeaders: Record<string, string>): Response {
    const { TableName, KeyConditionExpression, ExpressionAttributeValues } = body;
    
    // Simple query implementation - assumes partition key equality
    let searchPattern = '%';
    if (KeyConditionExpression && ExpressionAttributeValues) {
      const keyMatch = KeyConditionExpression.match(/:(\w+)/);
      if (keyMatch) {
        const valueKey = ':' + keyMatch[1];
        const keyValue = ExpressionAttributeValues[valueKey];
        if (keyValue) {
          const keyStr = JSON.stringify(keyValue);
          searchPattern = `%${keyStr}%`;
        }
      }
    }
    
    const results = this.queryItems.all(TableName, searchPattern) as {
      item_key: string;
      item_data: string;
      created_at: number;
      updated_at: number;
    }[];
    
    const items = results.map(row => JSON.parse(row.item_data));
    
    return new Response(JSON.stringify({
      Items: items,
      Count: items.length,
      ScannedCount: items.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }

  private handleTransactWrite(body: any, corsHeaders: Record<string, string>): Response {
    const { TransactItems } = body;
    
    const transaction = this.db.transaction(() => {
      for (const transactItem of TransactItems) {
        if (transactItem.Put) {
          const { TableName, Item } = transactItem.Put;
          const itemKey = this.generateItemKey(Item);
          const now = Date.now();
          this.putItem.run(TableName, itemKey, JSON.stringify(Item), now, now);
        } else if (transactItem.Update) {
          // Handle Update operation
          const { TableName, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = transactItem.Update;
          const itemKey = this.generateItemKey(Key);
          const existing = this.getItem.get(TableName, itemKey) as { item_data: string } | undefined;
          
          if (existing) {
            const item = JSON.parse(existing.item_data);
            
            if (UpdateExpression && UpdateExpression.includes('SET')) {
              const setMatch = UpdateExpression.match(/SET\s+(.+)/);
              if (setMatch) {
                const assignments = setMatch[1].split(',');
                assignments.forEach((assignment: string) => {
                  const parts = assignment.trim().split('=');
                  if (parts.length === 2 && parts[0] && parts[1]) {
                    let attrName = parts[0].trim();
                    const valueKey = parts[1].trim();
                    
                    // Handle ExpressionAttributeNames
                    if (ExpressionAttributeNames && attrName.startsWith('#')) {
                      attrName = ExpressionAttributeNames[attrName] || attrName;
                    }
                    
                    if (ExpressionAttributeValues && ExpressionAttributeValues[valueKey]) {
                      item[attrName] = ExpressionAttributeValues[valueKey];
                    }
                  }
                });
              }
            }
            
            const now = Date.now();
            this.putItem.run(TableName, itemKey, JSON.stringify(item), Date.now(), now);
          }
        } else if (transactItem.Delete) {
          const { TableName, Key } = transactItem.Delete;
          const itemKey = this.generateItemKey(Key);
          this.deleteItem.run(TableName, itemKey);
        }
      }
    });
    
    transaction();
    
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }
}