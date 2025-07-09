import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;
const endpoint = process.env.S3_ENDPOINT;

if (!accessKeyId || !secretAccessKey) {
  console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required');
  process.exit(1);
}

if (!region) {
  console.error('Error: AWS_REGION environment variable is required');
  process.exit(1);
}

if (!endpoint) {
  console.error('Error: S3_ENDPOINT environment variable is required');
  process.exit(1);
}

const s3Client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const bucketName = 'test-bucket';

async function testPutObject() {
  console.log('Testing PUT object...');
  
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: 'test-file.txt',
    Body: 'Hello, World! This is a test file.',
    ContentType: 'text/plain',
  });

  try {
    const response = await s3Client.send(putCommand);
    console.log('PUT object successful:', response);
  } catch (error) {
    console.error('PUT object failed:', error);
  }
}

async function testGetObject() {
  console.log('Testing GET object...');
  
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: 'test-file.txt',
  });

  try {
    const response = await s3Client.send(getCommand);
    const body = await response.Body?.transformToString();
    console.log('GET object successful:', { body, contentType: response.ContentType });
  } catch (error) {
    console.error('GET object failed:', error);
  }
}

async function testPresignedUrl() {
  console.log('Testing presigned URL...');
  
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: 'presigned-test.txt',
    ContentType: 'text/plain',
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });
    console.log('Presigned URL generated:', presignedUrl);
    
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: 'Content uploaded via presigned URL',
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    
    console.log('Presigned URL upload:', response.ok ? 'successful' : 'failed');
    
    if (response.ok) {
      await testGetObject();
    }
  } catch (error) {
    console.error('Presigned URL failed:', error);
  }
}

async function testPresignedGetUrl() {
  console.log('Testing presigned GET URL...');
  
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: 'test-file.txt',
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    console.log('Presigned GET URL generated:', presignedUrl);
    
    const response = await fetch(presignedUrl);
    const content = await response.text();
    
    console.log('Presigned GET URL result:', response.ok ? 'successful' : 'failed');
    console.log('Content:', content);
  } catch (error) {
    console.error('Presigned GET URL failed:', error);
  }
}

async function runTests() {
  console.log('Starting S3 Mock Server tests...\n');
  
  await testPutObject();
  console.log('');
  
  await testGetObject();
  console.log('');
  
  await testPresignedUrl();
  console.log('');
  
  await testPresignedGetUrl();
  console.log('');
  
  console.log('All tests completed!');
}

runTests().catch(console.error);