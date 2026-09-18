import {
  del,
  head,
  issueSignedToken,
  presignUrl,
  type HeadBlobResult,
} from "@vercel/blob";

const UPLOAD_URL_TTL_MS = 10 * 60 * 1000;
const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;

export async function createPrivateUploadUrl(input: {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
}) {
  const validUntil = Date.now() + UPLOAD_URL_TTL_MS;
  const signed = await issueSignedToken({
    pathname: input.pathname,
    operations: ["put"],
    validUntil,
    maximumSizeInBytes: input.maximumSizeInBytes,
    allowedContentTypes: [input.contentType],
  });

  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation: "put",
    pathname: input.pathname,
    validUntil,
    maximumSizeInBytes: input.maximumSizeInBytes,
    allowedContentTypes: [input.contentType],
    allowOverwrite: false,
    addRandomSuffix: false,
  });

  return { url: presignedUrl, expiresAt: new Date(validUntil).toISOString() };
}

export async function createPrivateDownloadUrl(pathname: string) {
  const validUntil = Date.now() + DOWNLOAD_URL_TTL_MS;
  const signed = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });

  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
    useCache: true,
  });

  return { url: presignedUrl, expiresAt: new Date(validUntil).toISOString() };
}

export async function privateBlobMetadata(pathname: string): Promise<HeadBlobResult> {
  return head(pathname);
}

export async function deletePrivateBlob(pathname: string) {
  await del(pathname);
}
