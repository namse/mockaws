#!/bin/bash

# Run docker-compose with --abort-on-container-exit option
# This will stop all services when the test client exits
# Same as: npm run test
docker-compose up --build --abort-on-container-exit unified-test-client