environment = "local"
aws_region = "us-east-1"
timeout     = 10
memory_size = 128
secret_name = "coach-connect-secrets"
env_vars = {
  NODE_ENV = "test"
  LOG_LEVEL = "info"
  API_KEY   = "test-1234"
}