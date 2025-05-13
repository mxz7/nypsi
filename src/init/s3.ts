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

// backblaze doesn't support these headers
s3.middlewareStack.add(
  (next, context) => async (args) => {
    // @ts-expect-error stupid aws sdk I FUCKING HATE AWS
    const headers = args.request.headers;

    // List of unsupported checksum headers
    const checksumHeaders = [
      "x-amz-checksum-crc32",
      "x-amz-checksum-crc32c",
      "x-amz-checksum-crc64nvme",
      "x-amz-checksum-sha1",
      "x-amz-checksum-sha256",
      "x-amz-checksum-algorithm",
      "x-amz-checksum-mode",
    ];

    for (const header of checksumHeaders) {
      delete headers[header];
    }

    return next(args);
  },
  {
    step: "build",
    name: "removeChecksumHeaders",
    priority: "high",
  },
);

export default s3;
