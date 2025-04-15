# Lego Bot

A chatbot that helps users order Lego models through natural conversation

## AWS Service

- Lex
- Lambda
- DynamoDB
- S3
- IAM
- CloudWatch

## Features:

- chatbot interface via Lex
- input validation during dialog
- order saving on fulfillment
- logs streaming from cloudwatch logs to s3
- currently only supports 2 input slots

## Folder structure

```python
├── lambdas/               # Python Lambda functions
├── cfn-templates/         # Manually defined CloudFormation templates
└── lego-bot-with-cdk/     # CDK-based infrastructure (written in TypeScript)
```