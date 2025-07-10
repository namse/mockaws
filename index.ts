import { DatabaseManager } from "./src/database";
import { S3Handler } from "./src/s3-handler";
import { DynamoDBHandler } from "./src/dynamodb-handler";

const dbManager = new DatabaseManager();
const db = dbManager.getDatabase();
const s3Handler = new S3Handler(db);
const dynamoDBHandler = new DynamoDBHandler(db);


const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-amz-target, x-amz-date, x-amz-security-token',
  'Access-Control-Max-Age': '86400'
};


const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    console.log(`${method} ${path}`);

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }

    if (path === "/health") {
      return new Response("OK", { 
        status: 200,
        headers: corsHeaders
      });
    }

    // DynamoDB endpoints - check for x-amz-target header first
    if (method === "POST" && req.headers.get('x-amz-target')) {
      return dynamoDBHandler.handleDynamoDBRequest(req, corsHeaders);
    }

    // Handle root path POST without x-amz-target as 404
    if (method === "POST" && path === "/" && !req.headers.get('x-amz-target')) {
      return new Response("Bad Request - Missing x-amz-target header", { 
        status: 400,
        headers: corsHeaders
      });
    }

    // S3 endpoints
    if (path.startsWith("/")) {
      if (method === "GET") {
        return s3Handler.handleGetObject(req, path, corsHeaders);
      } else if (method === "PUT") {
        return s3Handler.handlePutObject(req, path, corsHeaders);
      }
    }

    return new Response("Not Found", { 
      status: 404,
      headers: corsHeaders
    });
  },
});


console.log(`Mock AWS Server running on http://localhost:${server.port}`);
console.log("Available endpoints:");
console.log("  S3:");
console.log("    GET  /<key> - Get object (supports presigned URL verification)");
console.log("    PUT  /<key> - Put object (supports presigned URL verification)");
console.log("  DynamoDB:");
console.log("    POST /dynamodb/ - DynamoDB operations (CreateTable, PutItem, GetItem, UpdateItem, DeleteItem, Query, TransactWriteItems)");
