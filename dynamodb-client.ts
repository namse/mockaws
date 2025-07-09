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
const endpoint = process.env.DYNAMODB_ENDPOINT;

if (!accessKeyId || !secretAccessKey) {
  console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required');
  process.exit(1);
}

if (!region) {
  console.error('Error: AWS_REGION environment variable is required');
  process.exit(1);
}

if (!endpoint) {
  console.error('Error: DYNAMODB_ENDPOINT environment variable is required');
  process.exit(1);
}

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const tableName = 'test-table';

async function testCreateTable() {
  console.log('Testing CreateTable...');
  
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
    const response = await client.send(command);
    console.log('CreateTable successful:', response.TableDescription?.TableName);
  } catch (error) {
    console.error('CreateTable failed:', error);
  }
}

async function testPutItem() {
  console.log('Testing PutItem...');
  
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
    console.log('PutItem successful');
  } catch (error) {
    console.error('PutItem failed:', error);
  }
}

async function testGetItem() {
  console.log('Testing GetItem...');
  
  const command = new GetCommand({
    TableName: tableName,
    Key: {
      id: 'test-id-1'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('GetItem successful:', response.Item);
  } catch (error) {
    console.error('GetItem failed:', error);
  }
}

async function testUpdateItem() {
  console.log('Testing UpdateItem...');
  
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
    console.log('UpdateItem successful:', response.Attributes);
  } catch (error) {
    console.error('UpdateItem failed:', error);
  }
}

async function testQuery() {
  console.log('Testing Query...');
  
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
    console.log('Query successful:', response.Items);
  } catch (error) {
    console.error('Query failed:', error);
  }
}

async function testTransactWrite() {
  console.log('Testing TransactWrite...');
  
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
    console.log('TransactWrite successful');
  } catch (error) {
    console.error('TransactWrite failed:', error);
  }
}

async function testDeleteItem() {
  console.log('Testing DeleteItem...');
  
  const command = new DeleteCommand({
    TableName: tableName,
    Key: {
      id: 'test-id-2'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DeleteItem successful');
  } catch (error) {
    console.error('DeleteItem failed:', error);
  }
}

async function runTests() {
  console.log('Starting DynamoDB Mock Server tests...\n');
  
  await testCreateTable();
  console.log('');
  
  await testPutItem();
  console.log('');
  
  await testGetItem();
  console.log('');
  
  await testUpdateItem();
  console.log('');
  
  await testQuery();
  console.log('');
  
  await testTransactWrite();
  console.log('');
  
  await testDeleteItem();
  console.log('');
  
  console.log('All DynamoDB tests completed!');
}

runTests().catch(console.error);