import { savePhoto } from "@/lib/db";

const MAX_BYTES = 8 * 1024 * 1024;

/** multipart/form-data with a `photo` file -> { url } */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "No photo" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "Not an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo too large" }, { status: 413 });
  const url = await savePhoto(new Uint8Array(await file.arrayBuffer()), file.type);
  return Response.json({ url });
}
