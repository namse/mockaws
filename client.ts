import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';

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

const s3Client = new S3Client({
  region,
  endpoint: s3Endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const dynamodbClient = new DynamoDBClient({
  region,
  endpoint: dynamodbEndpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamodbClient);

const bucketName = 'test-bucket';
const tableName = 'test-table';

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

// DynamoDB test functions
async function testDynamoDBCreateTable() {
  console.log('Testing DynamoDB CreateTable...');
  
  const command = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  });

  try {
    const response = await dynamodbClient.send(command);
    console.log('DynamoDB CreateTable successful:', response.TableDescription?.TableName);
  } catch (error) {
    console.error('DynamoDB CreateTable failed:', error);
  }
}

async function testDynamoDBPut() {
  console.log('Testing DynamoDB Put...');
  
  const command = new PutCommand({
    TableName: tableName,
    Item: {
      id: 'test-id-1',
      name: 'Test Item',
      value: 42,
      active: true
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Put successful');
  } catch (error) {
    console.error('DynamoDB Put failed:', error);
  }
}

async function testDynamoDBGet() {
  console.log('Testing DynamoDB Get...');
  
  const command = new GetCommand({
    TableName: tableName,
    Key: {
      id: 'test-id-1'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Get successful:', response.Item);
  } catch (error) {
    console.error('DynamoDB Get failed:', error);
  }
}

async function testDynamoDBUpdate() {
  console.log('Testing DynamoDB Update...');
  
  const command = new UpdateCommand({
    TableName: tableName,
    Key: {
      id: 'test-id-1'
    },
    UpdateExpression: 'SET #name = :name, #value = :value',
    ExpressionAttributeNames: {
      '#name': 'name',
      '#value': 'value'
    },
    ExpressionAttributeValues: {
      ':name': 'Updated Test Item',
      ':value': 100
    },
    ReturnValues: 'ALL_NEW'
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Update successful:', response.Attributes);
  } catch (error) {
    console.error('DynamoDB Update failed:', error);
  }
}

async function testDynamoDBQuery() {
  console.log('Testing DynamoDB Query...');
  
  // Add another item for querying
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      id: 'test-id-2',
      name: 'Another Test Item',
      value: 200
    }
  }));
  
  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: {
      ':id': 'test-id-1'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Query successful:', response.Items);
  } catch (error) {
    console.error('DynamoDB Query failed:', error);
  }
}

async function testDynamoDBTransactWrite() {
  console.log('Testing DynamoDB TransactWrite...');
  
  const command = new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: {
            id: 'transact-1',
            name: 'Transaction Item 1',
            value: 300
          }
        }
      },
      {
        Update: {
          TableName: tableName,
          Key: { id: 'test-id-1' },
          UpdateExpression: 'SET #value = :value',
          ExpressionAttributeNames: {
            '#value': 'value'
          },
          ExpressionAttributeValues: {
            ':value': 500
          }
        }
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            id: 'transact-2',
            name: 'Transaction Item 2',
            value: 400
          }
        }
      }
    ]
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB TransactWrite successful');
  } catch (error) {
    console.error('DynamoDB TransactWrite failed:', error);
  }
}

async function testDynamoDBDelete() {
  console.log('Testing DynamoDB Delete...');
  
  const command = new DeleteCommand({
    TableName: tableName,
    Key: {
      id: 'test-id-2'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Delete successful');
  } catch (error) {
    console.error('DynamoDB Delete failed:', error);
  }
}

async function runTests() {
  console.log('Starting Mock AWS Server tests...\n');
  
  // S3 Tests
  console.log('=== S3 TESTS ===');
  await testPutObject();
  console.log('');
  
  await testGetObject();
  console.log('');
  
  await testPresignedUrl();
  console.log('');
  
  await testPresignedGetUrl();
  console.log('');
  
  // DynamoDB Tests
  console.log('=== DYNAMODB TESTS ===');
  await testDynamoDBCreateTable();
  console.log('');
  
  await testDynamoDBPut();
  console.log('');
  
  await testDynamoDBGet();
  console.log('');
  
  await testDynamoDBUpdate();
  console.log('');
  
  await testDynamoDBQuery();
  console.log('');
  
  await testDynamoDBTransactWrite();
  console.log('');
  
  await testDynamoDBDelete();
  console.log('');
  
  console.log('All tests completed!');
}

runTests().catch(console.error);