import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.S3_KEY_ID,
    secretAccessKey: process.env.S3_KEY,
  },
});

s3.middlewareStack.add(
  (next, context) => async (args) => {
    // @ts-expect-error
    delete args.request.headers["x-amz-checksum-crc32"];
    // @ts-expect-error
    delete args.request.headers["x-amz-checksum-sha256"];
    return next(args);
  },
  {
    step: "build",
    name: "removeChecksumHeaders",
    priority: "high",
  },
);

export default s3;
