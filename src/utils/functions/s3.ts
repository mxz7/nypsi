import { PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import s3 from "../../init/s3";
import { logger } from "../logger";

export async function putObject(key: string, body: Buffer, contentType: string) {
  const now = performance.now();

  try {
    const result = await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    logger.info(`s3: uploaded object ${key}`, {
      key,
      contentType,
      bytes: body.byteLength,
      eTag: result.ETag,
      versionId: result.VersionId,
      requestId: result.$metadata.requestId,
      attempts: result.$metadata.attempts,
      timeTaken: (performance.now() - now) / 1000,
    });

    return result;
  } catch (error) {
    logger.error(`s3: failed to upload object ${key}`, {
      key,
      contentType,
      bytes: body.byteLength,
      error,
      ...(error instanceof S3ServiceException && {
        fault: error.$fault,
        retryable: error.$retryable,
        statusCode: error.$metadata.httpStatusCode,
        requestId: error.$metadata.requestId,
        extendedRequestId: error.$metadata.extendedRequestId,
        attempts: error.$metadata.attempts,
        totalRetryDelay: error.$metadata.totalRetryDelay,
      }),
    });

    return false;
  }
}
