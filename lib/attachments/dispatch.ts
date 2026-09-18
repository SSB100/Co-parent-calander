import { after } from "next/server";
import { deletePrivateBlob } from "@/lib/attachments/blob";

export function deletePrivateBlobsAfterResponse(pathnames: string[]) {
  const unique = [...new Set(pathnames.filter(Boolean))];
  if (unique.length === 0) return;

  after(async () => {
    for (const pathname of unique) {
      try {
        await deletePrivateBlob(pathname);
      } catch {}
    }
  });
}
