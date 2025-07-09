import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import crypto from 'crypto';
import { Database } from 'bun:sqlite';

const db = new Database('s3-storage.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    content_type TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    etag TEXT NOT NULL
  )
`);

const insertObject = db.prepare(`
  INSERT OR REPLACE INTO objects (key, data, content_type, last_modified, etag)
  VALUES (?, ?, ?, ?, ?)
`);

const getObject = db.prepare(`
  SELECT data, content_type, last_modified, etag
  FROM objects
  WHERE key = ?
`);

const deleteObject = db.prepare(`
  DELETE FROM objects
  WHERE key = ?
`);

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    
    console.log(`${method} ${path}`);
    
    if (path === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    
    if (path.startsWith('/')) {
      if (method === 'GET') {
        return handleGetObject(req, path);
      } else if (method === 'PUT') {
        return handlePutObject(req, path);
      }
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

function verifySignature(req: Request, url: URL): boolean {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required');
  }
  
  const algorithm = url.searchParams.get('X-Amz-Algorithm');
  const credential = url.searchParams.get('X-Amz-Credential');
  const date = url.searchParams.get('X-Amz-Date');
  const expires = url.searchParams.get('X-Amz-Expires');
  const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders');
  const signature = url.searchParams.get('X-Amz-Signature');
  
  if (!algorithm || !credential || !date || !expires || !signedHeaders || !signature) {
    return false;
  }
  
  if (algorithm !== 'AWS4-HMAC-SHA256') {
    return false;
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = Math.floor(new Date(date.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')).getTime() / 1000);
  const expirationTime = requestTime + parseInt(expires);
  
  if (currentTime > expirationTime) {
    console.log('Request expired');
    return false;
  }
  
  const expectedCredential = `${accessKeyId}/${date.slice(0, 8)}/${region}/s3/aws4_request`;
  if (credential !== expectedCredential) {
    console.log('Invalid credential');
    return false;
  }
  
  return true;
}

async function handleGetObject(req: Request, path: string): Promise<Response> {
  const key = path.slice(1);
  const url = new URL(req.url);
  
  if (!key) {
    return new Response('Missing object key', { status: 400 });
  }
  
  // presigned URL 서명 검증
  if (url.searchParams.has('X-Amz-Algorithm')) {
    if (!verifySignature(req, url)) {
      return new Response('Invalid signature', { status: 403 });
    }
  }
  
  const object = getObject.get(key) as {
    data: string;
    content_type: string;
    last_modified: number;
    etag: string;
  } | undefined;
  
  if (!object) {
    return new Response('Object not found', { status: 404 });
  }
  
  return new Response(object.data, {
    headers: {
      'Content-Type': object.content_type,
      'Last-Modified': new Date(object.last_modified).toUTCString(),
      'ETag': `"${object.etag}"`,
    },
  });
}

async function handlePutObject(req: Request, path: string): Promise<Response> {
  const key = path.slice(1);
  const url = new URL(req.url);
  
  if (!key) {
    return new Response('Missing object key', { status: 400 });
  }
  
  // presigned URL 서명 검증
  if (url.searchParams.has('X-Amz-Algorithm')) {
    if (!verifySignature(req, url)) {
      return new Response('Invalid signature', { status: 403 });
    }
  }
  
  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  const data = await req.text();
  
  const etag = crypto.createHash('md5').update(data).digest('hex');
  const lastModified = Date.now();
  
  // 트랜잭션 사용하여 데이터 일관성 보장
  const transaction = db.transaction(() => {
    insertObject.run(key, data, contentType, lastModified, etag);
  });
  
  try {
    transaction();
  } catch (error) {
    console.error('Error storing object:', error);
    return new Response('Internal server error', { status: 500 });
  }
  
  return new Response('', {
    status: 200,
    headers: {
      'ETag': `"${etag}"`,
    },
  });
}

console.log(`S3 Mock Server running on http://localhost:${server.port}`);
console.log('Available endpoints:');
console.log('  GET  /<key> - Get object (supports presigned URL verification)');
console.log('  PUT  /<key> - Put object (supports presigned URL verification)');