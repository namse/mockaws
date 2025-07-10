#!/bin/bash

docker-compose -f docker-compose-dynamodb-local.yml down
docker-compose -f docker-compose-dynamodb-local.yml up --build --abort-on-container-exit dynamodb-test-client-local
docker-compose -f docker-compose-dynamodb-local.yml down