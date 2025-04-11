import os
import boto3
import json
import gzip
import base64
import logging

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

s3 = boto3.client("s3")
BUCKET_NAME = os.environ["BUCKET_NAME"]
PREFIX = os.environ["PREFIX"]


def lambda_handler(event, context):
    compressed_payload = base64.b64decode(event["awslogs"]["data"])
    decompressed_payload = gzip.decompress(compressed_payload)
    log_data = json.loads(decompressed_payload)

    for log_event in log_data["logEvents"]:
        key = f"{PREFIX}log_{log_event['id']}_{log_event['timestamp']}.json"

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=json.dumps(log_event["message"]),
            ContentType="application/json",
        )

        logger.info(f"Stored log to s3://{BUCKET_NAME}/{key}")
