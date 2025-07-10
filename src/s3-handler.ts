import crypto from "crypto";
import { Database } from "bun:sqlite";

export interface S3Object {
  data: string;
  content_type: string;
  last_modified: number;
  etag: string;
}

export class S3Handler {
  private db: Database;
  private insertObject: any;
  private getObject: any;

  constructor(db: Database) {
    this.db = db;
    this.setupQueries();
  }

  private setupQueries() {
    this.insertObject = this.db.prepare(`
      INSERT OR REPLACE INTO objects (key, data, content_type, last_modified, etag)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getObject = this.db.prepare(`
      SELECT data, content_type, last_modified, etag
      FROM objects
      WHERE key = ?
    `);
  }

  verifySignature(req: Request, url: URL): boolean {
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

  async handleGetObject(req: Request, path: string, corsHeaders: Record<string, string>): Promise<Response> {
    const key = path.slice(1);
    const url = new URL(req.url);

    if (!key) {
      return new Response("Missing object key", { 
        status: 400,
        headers: corsHeaders
      });
    }

    // presigned URL 서명 검증
    if (url.searchParams.has("X-Amz-Algorithm")) {
      if (!this.verifySignature(req, url)) {
        return new Response("Invalid signature", { 
          status: 403,
          headers: corsHeaders
        });
      }
    }

    const object = this.getObject.get(key) as S3Object | undefined;

    if (!object) {
      const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>NoSuchKey</Code>
    <Message>The specified key does not exist.</Message>
    <Key>${key}</Key>
    <RequestId>1234567890</RequestId>
    <HostId>mock-aws-server</HostId>
</Error>`;
      return new Response(errorXml, { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
      });
    }

    return new Response(object.data, {
      headers: {
        ...corsHeaders,
        "Content-Type": object.content_type,
        "Last-Modified": new Date(object.last_modified).toUTCString(),
        ETag: `"${object.etag}"`,
      },
    });
  }

  async handlePutObject(req: Request, path: string, corsHeaders: Record<string, string>): Promise<Response> {
    const key = path.slice(1);
    const url = new URL(req.url);

    if (!key) {
      return new Response("Missing object key", { 
        status: 400,
        headers: corsHeaders
      });
    }

    // presigned URL 서명 검증
    if (url.searchParams.has("X-Amz-Algorithm")) {
      if (!this.verifySignature(req, url)) {
        return new Response("Invalid signature", { 
          status: 403,
          headers: corsHeaders
        });
      }
    }

    const contentType =
      req.headers.get("content-type") || "application/octet-stream";
    const data = await req.text();

    const etag = crypto.createHash("md5").update(data).digest("hex");
    const lastModified = Date.now();

    // 트랜잭션 사용하여 데이터 일관성 보장
    const transaction = this.db.transaction(() => {
      this.insertObject.run(key, data, contentType, lastModified, etag);
    });

    try {
      transaction();
    } catch (error) {
      console.error("Error storing object:", error);
      return new Response("Internal server error", { 
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response("", {
      status: 200,
      headers: {
        ...corsHeaders,
        ETag: `"${etag}"`,
      },
    });
  }
}