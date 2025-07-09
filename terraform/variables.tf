variable "env_vars" {
  description = "Environment variables to pass to the Lambda function"
  type        = map(string)
  default     = {}
}
variable "timeout" {
  description = "Timeout for the Lambda function in seconds"
  type        = number
  default     = 10
}

variable "memory_size" {
  description = "Memory size for the Lambda function in MB"
  type        = number
  default     = 128
}
variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}
variable "environment" {
  description = "Deployment environment: local or prod"
  type        = string
  default     = "prod"
}
variable "secret_name" {
  description = "Name of the AWS SecretsManager secret"
  type        = string
  default     = "coach-connect-secrets" # <<<<< Update if needed!
}