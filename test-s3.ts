import { S3Client, GetObjectCommand, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

const s3Client = new S3Client({
  region: config.region,
  endpoint: config.s3Endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

async function testPutObject() {
  console.log('Testing PUT object...');
  
  const putCommand = new PutObjectCommand({
    Bucket: config.bucketName,
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
    Bucket: config.bucketName,
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

async function testGetNonExistentObject() {
  console.log('Testing GET non-existent object...');
  
  const getCommand = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: 'non-existent-file.txt',
  });

  try {
    const response = await s3Client.send(getCommand);
    const body = await response.Body?.transformToString();
    console.log('GET non-existent object unexpected success:', { body, contentType: response.ContentType });
  } catch (error: any) {
    console.log('GET non-existent object correctly failed:', error.name, error.message);
  }
}

async function testPresignedUrl() {
  console.log('Testing presigned URL...');
  
  const putCommand = new PutObjectCommand({
    Bucket: config.bucketName,
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
    Bucket: config.bucketName,
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

export async function runS3Tests() {
  console.log('=== S3 TESTS ===');
  await testPutObject();
  console.log('');
  
  await testGetObject();
  console.log('');

  await testGetNonExistentObject();
  console.log('');
  
  await testPresignedUrl();
  console.log('');
  
  await testPresignedGetUrl();
  console.log('');
}

if (require.main === module) {
  runS3Tests().catch(console.error);
}