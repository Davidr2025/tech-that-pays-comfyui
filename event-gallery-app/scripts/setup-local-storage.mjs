// One-time setup for local testing: creates the MinIO bucket (from
// docker-compose.yml) and makes it publicly readable, so the gallery and
// slideshow can load media directly the same way they would against a
// public R2/S3 bucket in production.
import { S3Client, CreateBucketCommand, PutBucketPolicyCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const endpoint = process.env.STORAGE_ENDPOINT ?? "http://localhost:9000";
const bucket = process.env.STORAGE_BUCKET ?? "event-gallery-media";
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID ?? "minioadmin";
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY ?? "minioadmin";

const s3 = new S3Client({
  region: "us-east-1",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Bucket "${bucket}" already exists.`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created bucket "${bucket}".`);
}

const publicReadPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    },
  ],
};

await s3.send(
  new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(publicReadPolicy) }),
);
console.log(`Set public-read policy on "${bucket}". Local storage is ready.`);
