const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;
const s3Endpoint = process.env.S3_ENDPOINT;
const dynamodbEndpoint = process.env.DYNAMODB_ENDPOINT;

if (!accessKeyId || !secretAccessKey) {
  console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required');
  process.exit(1);
}

if (!region) {
  console.error('Error: AWS_REGION environment variable is required');
  process.exit(1);
}

if (!s3Endpoint) {
  console.error('Error: S3_ENDPOINT environment variable is required');
  process.exit(1);
}

if (!dynamodbEndpoint) {
  console.error('Error: DYNAMODB_ENDPOINT environment variable is required');
  process.exit(1);
}

export const config = {
  accessKeyId,
  secretAccessKey,
  region,
  s3Endpoint,
  dynamodbEndpoint,
  bucketName: 'test-bucket',
  tableName: 'test-table',
};