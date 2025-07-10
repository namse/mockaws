#!/bin/bash

docker-compose -f docker-compose-s3-minio.yml down
docker-compose -f docker-compose-s3-minio.yml up --build --abort-on-container-exit s3-test-client-minio