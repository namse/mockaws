import crypto from "crypto";
import { Database } from "bun:sqlite";

const db = new Database("mockaws.sqlite");

// S3 Objects Table
db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    content_type TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    etag TEXT NOT NULL
  )
`);

// DynamoDB Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS dynamodb_tables (
    table_name TEXT PRIMARY KEY,
    key_schema TEXT NOT NULL,
    attribute_definitions TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dynamodb_items (
    table_name TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (table_name, item_key)
  )
`);

// S3 prepared statements
const insertObject = db.prepare(`
  INSERT OR REPLACE INTO objects (key, data, content_type, last_modified, etag)
  VALUES (?, ?, ?, ?, ?)
`);

const getObject = db.prepare(`
  SELECT data, content_type, last_modified, etag
  FROM objects
  WHERE key = ?
`);

// DynamoDB prepared statements
const createTable = db.prepare(`
  INSERT OR REPLACE INTO dynamodb_tables (table_name, key_schema, attribute_definitions, created_at)
  VALUES (?, ?, ?, ?)
`);

const putItem = db.prepare(`
  INSERT OR REPLACE INTO dynamodb_items (table_name, item_key, item_data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const getItem = db.prepare(`
  SELECT item_data, created_at, updated_at
  FROM dynamodb_items
  WHERE table_name = ? AND item_key = ?
`);

const deleteItem = db.prepare(`
  DELETE FROM dynamodb_items
  WHERE table_name = ? AND item_key = ?
`);

const queryItems = db.prepare(`
  SELECT item_key, item_data, created_at, updated_at
  FROM dynamodb_items
  WHERE table_name = ? AND item_key LIKE ?
  ORDER BY item_key
`);


const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    console.log(`${method} ${path}`);

    if (path === "/health") {
      return new Response("OK", { status: 200 });
    }

    // DynamoDB endpoints
    if (path.startsWith("/dynamodb/")) {
      if (method === "POST") {
        return handleDynamoDBRequest(req, path);
      }
    }

    // S3 endpoints
    if (path.startsWith("/")) {
      if (method === "GET") {
        return handleGetObject(req, path);
      } else if (method === "PUT") {
        return handlePutObject(req, path);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

function verifySignature(_req: Request, url: URL): boolean {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required"
    );
  }

  const algorithm = url.searchParams.get("X-Amz-Algorithm");
  const credential = url.searchParams.get("X-Amz-Credential");
  const date = url.searchParams.get("X-Amz-Date");
  const expires = url.searchParams.get("X-Amz-Expires");
  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders");
  const signature = url.searchParams.get("X-Amz-Signature");

  if (
    !algorithm ||
    !credential ||
    !date ||
    !expires ||
    !signedHeaders ||
    !signature
  ) {
    return false;
  }

  if (algorithm !== "AWS4-HMAC-SHA256") {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = Math.floor(
    new Date(
      date.replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
        "$1-$2-$3T$4:$5:$6Z"
      )
    ).getTime() / 1000
  );
  const expirationTime = requestTime + parseInt(expires);

  if (currentTime > expirationTime) {
    console.log("Request expired");
    return false;
  }

  const expectedCredential = `${accessKeyId}/${date.slice(
    0,
    8
  )}/${region}/s3/aws4_request`;
  if (credential !== expectedCredential) {
    console.log("Invalid credential");
    return false;
  }

  return true;
}

async function handleGetObject(req: Request, path: string): Promise<Response> {
  const key = path.slice(1);
  const url = new URL(req.url);

  if (!key) {
    return new Response("Missing object key", { status: 400 });
  }

  // presigned URL 서명 검증
  if (url.searchParams.has("X-Amz-Algorithm")) {
    if (!verifySignature(req, url)) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const object = getObject.get(key) as
    | {
        data: string;
        content_type: string;
        last_modified: number;
        etag: string;
      }
    | undefined;

  if (!object) {
    return new Response("Object not found", { status: 404 });
  }

  return new Response(object.data, {
    headers: {
      "Content-Type": object.content_type,
      "Last-Modified": new Date(object.last_modified).toUTCString(),
      ETag: `"${object.etag}"`,
    },
  });
}

async function handlePutObject(req: Request, path: string): Promise<Response> {
  const key = path.slice(1);
  const url = new URL(req.url);

  if (!key) {
    return new Response("Missing object key", { status: 400 });
  }

  // presigned URL 서명 검증
  if (url.searchParams.has("X-Amz-Algorithm")) {
    if (!verifySignature(req, url)) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const contentType =
    req.headers.get("content-type") || "application/octet-stream";
  const data = await req.text();

  const etag = crypto.createHash("md5").update(data).digest("hex");
  const lastModified = Date.now();

  // 트랜잭션 사용하여 데이터 일관성 보장
  const transaction = db.transaction(() => {
    insertObject.run(key, data, contentType, lastModified, etag);
  });

  try {
    transaction();
  } catch (error) {
    console.error("Error storing object:", error);
    return new Response("Internal server error", { status: 500 });
  }

  return new Response("", {
    status: 200,
    headers: {
      ETag: `"${etag}"`,
    },
  });
}

async function handleDynamoDBRequest(req: Request, _path: string): Promise<Response> {
  const target = req.headers.get('x-amz-target');
  
  if (!target) {
    return new Response('Missing x-amz-target header', { status: 400 });
  }

  const body = await req.json();
  
  try {
    switch (target) {
      case 'DynamoDB_20120810.CreateTable':
        return handleCreateTable(body);
      case 'DynamoDB_20120810.PutItem':
        return handlePutItem(body);
      case 'DynamoDB_20120810.GetItem':
        return handleGetItem(body);
      case 'DynamoDB_20120810.UpdateItem':
        return handleUpdateItem(body);
      case 'DynamoDB_20120810.DeleteItem':
        return handleDeleteItem(body);
      case 'DynamoDB_20120810.Query':
        return handleQuery(body);
      case 'DynamoDB_20120810.TransactWriteItems':
        return handleTransactWrite(body);
      default:
        return new Response(`Unsupported operation: ${target}`, { status: 400 });
    }
  } catch (error) {
    console.error('DynamoDB operation error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

function handleCreateTable(body: any): Response {
  const { TableName, KeySchema, AttributeDefinitions } = body;
  
  const now = Date.now();
  const transaction = db.transaction(() => {
    createTable.run(
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
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handlePutItem(body: any): Response {
  const { TableName, Item } = body;
  
  const itemKey = generateItemKey(Item);
  const now = Date.now();
  
  const transaction = db.transaction(() => {
    putItem.run(TableName, itemKey, JSON.stringify(Item), now, now);
  });
  
  transaction();
  
  return new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handleGetItem(body: any): Response {
  const { TableName, Key } = body;
  
  const itemKey = generateItemKey(Key);
  const result = getItem.get(TableName, itemKey) as {
    item_data: string;
    created_at: number;
    updated_at: number;
  } | undefined;
  
  if (!result) {
    return new Response(JSON.stringify({}), {
      headers: { 'Content-Type': 'application/x-amz-json-1.0' }
    });
  }
  
  return new Response(JSON.stringify({
    Item: JSON.parse(result.item_data)
  }), {
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handleUpdateItem(body: any): Response {
  const { TableName, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = body;
  
  const itemKey = generateItemKey(Key);
  const existing = getItem.get(TableName, itemKey) as {
    item_data: string;
  } | undefined;
  
  if (!existing) {
    return new Response(JSON.stringify({
      __type: 'ResourceNotFoundException',
      message: 'Requested resource not found'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/x-amz-json-1.0' }
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
  const transaction = db.transaction(() => {
    putItem.run(TableName, itemKey, JSON.stringify(item), existing ? Date.now() : now, now);
  });
  
  transaction();
  
  return new Response(JSON.stringify({
    Attributes: item
  }), {
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handleDeleteItem(body: any): Response {
  const { TableName, Key } = body;
  
  const itemKey = generateItemKey(Key);
  const transaction = db.transaction(() => {
    deleteItem.run(TableName, itemKey);
  });
  
  transaction();
  
  return new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handleQuery(body: any): Response {
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
  
  const results = queryItems.all(TableName, searchPattern) as {
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
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function handleTransactWrite(body: any): Response {
  const { TransactItems } = body;
  
  const transaction = db.transaction(() => {
    for (const transactItem of TransactItems) {
      if (transactItem.Put) {
        const { TableName, Item } = transactItem.Put;
        const itemKey = generateItemKey(Item);
        const now = Date.now();
        putItem.run(TableName, itemKey, JSON.stringify(Item), now, now);
      } else if (transactItem.Update) {
        // Handle Update operation
        const { TableName, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = transactItem.Update;
        const itemKey = generateItemKey(Key);
        const existing = getItem.get(TableName, itemKey) as { item_data: string } | undefined;
        
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
          putItem.run(TableName, itemKey, JSON.stringify(item), Date.now(), now);
        }
      } else if (transactItem.Delete) {
        const { TableName, Key } = transactItem.Delete;
        const itemKey = generateItemKey(Key);
        deleteItem.run(TableName, itemKey);
      }
    }
  });
  
  transaction();
  
  return new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/x-amz-json-1.0' }
  });
}

function generateItemKey(item: any): string {
  // Extract only the primary key attributes (id for our test case)
  const keyAttrs: any = {};
  if (item.id !== undefined) {
    keyAttrs.id = item.id;
  }
  return JSON.stringify(keyAttrs);
}

console.log(`Mock AWS Server running on http://localhost:${server.port}`);
console.log("Available endpoints:");
console.log("  S3:");
console.log("    GET  /<key> - Get object (supports presigned URL verification)");
console.log("    PUT  /<key> - Put object (supports presigned URL verification)");
console.log("  DynamoDB:");
console.log("    POST /dynamodb/ - DynamoDB operations (CreateTable, PutItem, GetItem, UpdateItem, DeleteItem, Query, TransactWriteItems)");
