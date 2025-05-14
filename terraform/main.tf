provider "aws" {
  region = var.aws_region
}

variable "environment" {
  description = "Deployment environment (local, test, prod)"
  default     = "local"
}

####################
# Package Lambda Zip Automatically
####################
data "external" "build_lambda" {
  program = ["bash", "${path.module}/package.sh"]
}

####################
# IAM Role for Lambda
####################
resource "aws_iam_role" "lambda_exec" {
  name = "lambda_exec_role_${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

####################
# Lambda Function
####################
resource "aws_lambda_function" "app" {
  function_name    = "my-node-app-${var.environment}"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.handler"
  runtime          = "nodejs18.x"
  filename         = data.external.build_lambda.result["zip_path"]
  source_code_hash = filebase64sha256(data.external.build_lambda.result["zip_path"])
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = var.env_vars
  }
}

####################
# API Gateway Setup
####################
resource "aws_api_gateway_rest_api" "api" {
  name        = "my-api-${var.environment}"
  description = "API Gateway for Node.js Lambda (${var.environment})"
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.app.invoke_arn
}

resource "aws_lambda_permission" "apigw" {
  statement_id = "AllowAPIGatewayInvoke-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  # Only trigger deployment when Lambda code changes
  triggers = {
    redeployment = sha1(jsonencode({
      lambda_version = aws_lambda_function.app.source_code_hash
    }))
  }

  depends_on = [
    aws_api_gateway_integration.lambda
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "stage" {
  stage_name    = var.environment
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.deployment.id
}

output "invoke_url" {
  description = "Public URL for the API"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.stage.stage_name}/"
}
