#!/bin/bash

docker-compose -f docker-compose-dynamodb.yml down
docker-compose -f docker-compose-dynamodb.yml up --build --abort-on-container-exit dynamodb-test-client
docker-compose -f docker-compose-dynamodb.yml down