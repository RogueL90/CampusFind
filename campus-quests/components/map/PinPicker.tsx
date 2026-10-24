"use client";

import dynamic from "next/dynamic";

export interface PinValue {
  lat: number;
  lng: number;
  /** Set only when `withRadius` is on (lost items). */
  radiusM: number | null;
}

export interface PinPickerProps {
  value?: PinValue | null;
  onChange: (value: PinValue) => void;
  withRadius?: boolean;
  defaultRadiusM?: number;
  height?: number;
}

const PinPickerMap = dynamic(() => import("./PinPickerMap"), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-slate-900" />,
});

/** Small flat campus map: tap to drop a pin, optionally with an area radius. */
export default function PinPicker(props: PinPickerProps) {
  return <PinPickerMap {...props} />;
}
