import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const FIVE_GB = 5 * 1024 * 1024 * 1024;

const buckets = [
  {
    id: "clip-source-videos",
    public: false,
    fileSizeLimit: FIVE_GB,
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"]
  },
  {
    id: "clip-exports",
    public: false,
    fileSizeLimit: FIVE_GB,
    allowedMimeTypes: ["video/mp4"]
  },
  {
    id: "clip-thumbnails",
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg"]
  }
];

export async function POST() {
  await requireUser();
  const admin = createAdminClient();
  const results = [];

  for (const bucket of buckets) {
    const existing = await admin.storage.getBucket(bucket.id);
    const operation = existing.error
      ? await admin.storage.createBucket(bucket.id, bucket)
      : await admin.storage.updateBucket(bucket.id, bucket);

    if (operation.error) {
      results.push({
        id: bucket.id,
        warning: operation.error.message,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: bucket.allowedMimeTypes
      });
      continue;
    }

    const refreshed = await admin.storage.getBucket(bucket.id);
    results.push({
      id: bucket.id,
      fileSizeLimit: refreshed.data?.file_size_limit ?? bucket.fileSizeLimit,
      allowedMimeTypes: refreshed.data?.allowed_mime_types ?? bucket.allowedMimeTypes
    });
  }

  return NextResponse.json({ buckets: results });
}
