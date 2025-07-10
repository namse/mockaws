#!/bin/bash

docker-compose -f docker-compose-s3.yml down
docker-compose -f docker-compose-s3.yml up --build --abort-on-container-exit s3-test-client
docker-compose -f docker-compose-s3.yml down