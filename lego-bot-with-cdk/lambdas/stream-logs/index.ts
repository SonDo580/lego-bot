import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  Context,
  CloudWatchLogsEvent,
  CloudWatchLogsDecodedData,
} from "aws-lambda";
import * as zlib from "zlib";
import * as util from "util";

const s3 = new S3Client();
const BUCKET_NAME = process.env.BUCKET_NAME!;
const PREFIX = process.env.PREFIX || "";

const gunzip = util.promisify(zlib.gunzip);

export const handler = async (event: CloudWatchLogsEvent, context: Context) => {
  const compressedPayload = Buffer.from(event.awslogs.data, "base64");
  const decompressed = await gunzip(compressedPayload);
  const logData = JSON.parse(
    decompressed.toString()
  ) as CloudWatchLogsDecodedData;

  for (const logEvent of logData.logEvents) {
    const key = `${PREFIX}log_${logEvent.id}_${logEvent.timestamp}.json`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(logEvent.message),
      ContentType: "application/json",
    });

    await s3.send(command);

    console.log(`Stored log to s3://${BUCKET_NAME}/${key}`);
  }
};
