const response = await fetch('http://localhost:3000/health');
if (response.ok) {
  console.log('Health check passed');
  process.exit(0);
} else {
  console.log('Health check failed');
  process.exit(1);
}