"use client";
import distance from "@turf/distance";
import { useState } from "react";
import { getReport, submitProof } from "@/lib/mock";
import type { Mission, NewProof } from "@/lib/types";

async function proofPhotoDataUrl(file: File) {
 let width: number; let height: number; let draw: (context: CanvasRenderingContext2D, width: number, height: number) => void; let release: () => void = () => {};
 try {
  const bitmap = await createImageBitmap(file);
  width = bitmap.width; height = bitmap.height;
  draw = (context, targetWidth, targetHeight) => context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  release = () => bitmap.close();
 } catch {
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the proof image.")); reader.onerror = () => reject(new Error("Could not read the proof image.")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("The selected proof image could not be decoded.")); element.src = source; });
  width = image.naturalWidth; height = image.naturalHeight;
  draw = (context, targetWidth, targetHeight) => context.drawImage(image, 0, 0, targetWidth, targetHeight);
 }
 const scale = Math.min(1, 900 / Math.max(width, height));
 const canvas = document.createElement("canvas");
 canvas.width = Math.max(1, Math.round(width * scale));
 canvas.height = Math.max(1, Math.round(height * scale));
 const context = canvas.getContext("2d");
 if (!context) throw new Error("Could not process the selected proof image.");
 draw(context, canvas.width, canvas.height);
 release();
 return canvas.toDataURL("image/jpeg", 0.72);
}

export function ProofCapture({ mission, onClose, onSubmitted }: { mission: Mission; onClose: () => void; onSubmitted: () => void }) {
 const [photo, setPhoto] = useState<File>(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 async function send() {
  setError("");
  if (!photo) { setError("Add a proof photo before submitting."); return; }
  setBusy(true);
  try {
   const report = await getReport(mission.report_id);
   if (!report) throw new Error("The report pin is unavailable, so proof cannot be verified.");
   // Test mode: simulate the user's GPS at the mission pin to avoid location-permission prompts.
   const testLocation = { lat: report.lat, lng: report.lng };
   const meters = distance([testLocation.lng, testLocation.lat], [report.lng, report.lat], { units: "meters" });
   if (meters > 50) throw new Error(`You are ${Math.round(meters)} m from the report pin. Proof must be captured within 50 m.`);
    const proof: NewProof = { photo_url: await proofPhotoDataUrl(photo), lat: testLocation.lat, lng: testLocation.lng };
   await submitProof(mission.id, proof);
   onSubmitted();
  } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit proof."); }
  finally { setBusy(false); }
 }
 return <div className="fixed inset-0 z-50 grid place-items-center bg-[#15271e]/50 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-[28px] bg-white p-6"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#829087]">Mission proof</p><h2 className="mt-2 text-xl font-extrabold">{mission.report_title}</h2></div><button onClick={onClose} className="text-2xl text-[#8b958d]" aria-label="Close">×</button></div><p className="mt-3 text-sm text-[#68766d]">{mission.proof_needed}</p><label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d8e1d2] bg-[#f7f9f3] p-5 text-center"><span className="text-3xl">📷</span><span className="mt-2 text-sm font-bold">Take a photo or upload proof</span><span className="mt-1 text-xs text-[#8a968d]">Camera access is requested on supported phones</span><input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0])} className="sr-only"/></label>{photo && <p className="mt-2 truncate text-xs text-[#557244]">Selected: {photo.name}</p>}<p className="mt-3 flex gap-2 text-xs text-[#78857c]"><span>◎</span> Test location is simulated at the report pin (0 m away; 50 m limit).</p>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button onClick={send} disabled={busy} className="mt-5 w-full rounded-xl bg-[#203b2d] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit for review"}</button></section></div>;
}
