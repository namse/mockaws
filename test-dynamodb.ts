import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocument,
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { config } from './config';

const dynamodbClient = new DynamoDBClient({
  region: config.region,
  endpoint: config.s3Endpoint, // DynamoDB도 같은 엔드포인트 사용
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

const docClient = DynamoDBDocument.from(dynamodbClient);

async function testDynamoDBCreateTable() {
  console.log('Testing DynamoDB CreateTable...');
  
  const command = new CreateTableCommand({
    TableName: config.tableName,
    KeySchema: [
      { AttributeName: '$p', KeyType: 'HASH' },
      { AttributeName: '$s', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: '$p', AttributeType: 'S' },
      { AttributeName: '$s', AttributeType: 'S' }
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
    TableName: config.tableName,
    Item: {
      $p: 'SessionDoc/id=test-session-1',
      $s: '_',
      name: 'Test Session',
      value: 42,
      active: true,
      $v: 1
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
    TableName: config.tableName,
    Key: {
      $p: 'SessionDoc/id=test-session-1',
      $s: '_'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Get successful:', response.Item);
  } catch (error) {
    console.error('DynamoDB Get failed:', error);
  }
}

async function testDynamoDBGetNonExistent() {
  console.log('Testing DynamoDB Get non-existent item...');
  
  const command = new GetCommand({
    TableName: config.tableName,
    Key: {
      $p: 'SessionDoc/id=non-existent-id',
      $s: '_'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Get non-existent item result:', response.Item ? 'Found item' : 'No item (expected)');
  } catch (error) {
    console.error('DynamoDB Get non-existent item failed:', error);
  }
}

async function testDynamoDBUpdate() {
  console.log('Testing DynamoDB Update...');
  
  const command = new UpdateCommand({
    TableName: config.tableName,
    Key: {
      $p: 'SessionDoc/id=test-session-1',
      $s: '_'
    },
    UpdateExpression: 'SET #name = :name, #value = :value, #v = :v',
    ExpressionAttributeNames: {
      '#name': 'name',
      '#value': 'value',
      '#v': '$v'
    },
    ExpressionAttributeValues: {
      ':name': 'Updated Test Session',
      ':value': 100,
      ':v': 2
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
  
  // Add multiple items for querying
  await docClient.send(new PutCommand({
    TableName: config.tableName,
    Item: {
      $p: 'PaymentVerifingOrderList',
      $s: 'order-1',
      orderId: 'order-1',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z'
    }
  }));

  await docClient.send(new PutCommand({
    TableName: config.tableName,
    Item: {
      $p: 'PaymentVerifingOrderList',
      $s: 'order-2',
      orderId: 'order-2',
      status: 'verified',
      createdAt: '2024-01-02T00:00:00Z'
    }
  }));

  await docClient.send(new PutCommand({
    TableName: config.tableName,
    Item: {
      $p: 'PaymentVerifingOrderList',
      $s: 'order-3',
      orderId: 'order-3',
      status: 'pending',
      createdAt: '2024-01-03T00:00:00Z'
    }
  }));

  const command = new QueryCommand({
    TableName: config.tableName,
    KeyConditionExpression: '#p = :pk',
    ExpressionAttributeNames: { '#p': '$p' },
    ExpressionAttributeValues: {
      ':pk': 'PaymentVerifingOrderList'
    },
    Limit: 10
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Query successful:', response.Items?.length, 'items found');
    console.log('Items:', response.Items);
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
          TableName: config.tableName,
          Item: {
            $p: 'IdentitiesOfUserIndex/id=user-1',
            $s: 'identity-1',
            userId: 'user-1',
            identityType: 'email',
            identityValue: 'user@example.com'
          }
        }
      },
      {
        Update: {
          TableName: config.tableName,
          Key: { 
            $p: 'SessionDoc/id=test-session-1',
            $s: '_'
          },
          UpdateExpression: 'SET #value = :value, #v = :v',
          ExpressionAttributeNames: {
            '#value': 'value',
            '#v': '$v'
          },
          ExpressionAttributeValues: {
            ':value': 500,
            ':v': 3
          }
        }
      },
      {
        Put: {
          TableName: config.tableName,
          Item: {
            $p: 'IdentitiesOfUserIndex/id=user-1',
            $s: 'identity-2',
            userId: 'user-1',
            identityType: 'phone',
            identityValue: '+1-555-0123'
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
    TableName: config.tableName,
    Key: {
      $p: 'PaymentVerifingOrderList',
      $s: 'order-2'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Delete successful');
  } catch (error) {
    console.error('DynamoDB Delete failed:', error);
  }
}

async function testDynamoDBConditionalPut() {
  console.log('Testing DynamoDB Conditional Put (create if not exists)...');
  
  const command = new PutCommand({
    TableName: config.tableName,
    Item: {
      $p: 'SessionDoc/id=conditional-test',
      $s: '_',
      name: 'Conditional Test Session',
      value: 999,
      $v: 1
    },
    ConditionExpression: 'attribute_not_exists(#p)',
    ExpressionAttributeNames: { '#p': '$p' }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Conditional Put (create) successful');
  } catch (error) {
    console.error('DynamoDB Conditional Put (create) failed:', error);
  }
}

async function testDynamoDBOptimisticUpdate() {
  console.log('Testing DynamoDB Optimistic Update...');
  
  const command = new PutCommand({
    TableName: config.tableName,
    Item: {
      $p: 'SessionDoc/id=conditional-test',
      $s: '_',
      name: 'Updated Conditional Test Session',
      value: 1000,
      $v: 2
    },
    ConditionExpression: 'attribute_exists(#p) AND #v = :expectedVersion',
    ExpressionAttributeNames: { '#p': '$p', '#v': '$v' },
    ExpressionAttributeValues: { ':expectedVersion': 1 }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Optimistic Update successful');
  } catch (error) {
    console.error('DynamoDB Optimistic Update failed:', error);
  }
}

async function testDynamoDBUserIdentityQuery() {
  console.log('Testing DynamoDB User Identity Query...');
  
  const command = new QueryCommand({
    TableName: config.tableName,
    KeyConditionExpression: '#p = :pk',
    ExpressionAttributeNames: { '#p': '$p' },
    ExpressionAttributeValues: {
      ':pk': 'IdentitiesOfUserIndex/id=user-1'
    }
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB User Identity Query successful:', response.Items?.length, 'identities found');
    console.log('Identities:', response.Items);
  } catch (error) {
    console.error('DynamoDB User Identity Query failed:', error);
  }
}

async function testDynamoDBPaginatedQuery() {
  console.log('Testing DynamoDB Paginated Query...');
  
  const command = new QueryCommand({
    TableName: config.tableName,
    KeyConditionExpression: '#p = :pk',
    ExpressionAttributeNames: { '#p': '$p' },
    ExpressionAttributeValues: {
      ':pk': 'PaymentVerifingOrderList'
    },
    Limit: 2
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB Paginated Query successful:', response.Items?.length, 'items found');
    console.log('Has more items:', !!response.LastEvaluatedKey);
    console.log('LastEvaluatedKey:', response.LastEvaluatedKey);
  } catch (error) {
    console.error('DynamoDB Paginated Query failed:', error);
  }
}

async function testDynamoDBTransactWriteWithCondition() {
  console.log('Testing DynamoDB TransactWrite with Conditions...');
  
  const command = new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: config.tableName,
          Item: {
            $p: 'UserDoc/id=user-1',
            $s: '_',
            userId: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
            $v: 1
          },
          ConditionExpression: 'attribute_not_exists(#p)',
          ExpressionAttributeNames: { '#p': '$p' }
        }
      },
      {
        Put: {
          TableName: config.tableName,
          Item: {
            $p: 'UserEmailIndex/email=john@example.com',
            $s: '_',
            userId: 'user-1',
            email: 'john@example.com'
          }
        }
      }
    ]
  });

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB TransactWrite with Conditions successful');
  } catch (error) {
    console.error('DynamoDB TransactWrite with Conditions failed:', error);
  }
}

export async function runDynamoDBTests() {
  console.log('=== DYNAMODB TESTS ===');
  await testDynamoDBCreateTable();
  console.log('');
  
  await testDynamoDBPut();
  console.log('');
  
  await testDynamoDBGet();
  console.log('');

  await testDynamoDBGetNonExistent();
  console.log('');
  
  await testDynamoDBUpdate();
  console.log('');
  
  await testDynamoDBQuery();
  console.log('');
  
  await testDynamoDBTransactWrite();
  console.log('');
  
  await testDynamoDBDelete();
  console.log('');

  await testDynamoDBConditionalPut();
  console.log('');

  await testDynamoDBOptimisticUpdate();
  console.log('');

  await testDynamoDBUserIdentityQuery();
  console.log('');

  await testDynamoDBPaginatedQuery();
  console.log('');

  await testDynamoDBTransactWriteWithCondition();
  console.log('');
}

if (require.main === module) {
  runDynamoDBTests().catch(console.error);
}