"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import * as turf from "@turf/turf";
import { getAccessAlerts, getReports, subscribeReports, voteMeToo } from "@/lib/data";
import { CATEGORY_BY_ID, DEFAULT_CAMERA, DEMO_GEOMETRY, type LngLat } from "@/lib/geo/campus";
import { buildObstacles, findAhead, readObstacles } from "@/lib/geo/obstacles";
import { markAlerted, resetAlertMemory, wasAlertedToday } from "@/lib/geo/alertMemory";
import { useLocalStore } from "@/lib/useLocalStore";
import type { AccessAlert, Category, Report } from "@/lib/types";
import CompassStrip, { type CompassItem } from "@/components/hud/CompassStrip";
import StatusCorner from "@/components/hud/StatusCorner";
import AheadCard from "@/components/hud/AheadCard";
import FilterChips from "@/components/hud/FilterChips";
import AccessPanel, { DEFAULT_ACCESS_PROFILE } from "@/components/hud/AccessPanel";
import ReportSheet from "@/components/ReportSheet";
import NotificationBell from "@/components/NotificationBell";
import UserSwitcher from "@/components/UserSwitcher";
import { useLocation } from "./useLocation";
import type { CameraTarget } from "./CampusMap";

const CampusMap = dynamic(() => import("./CampusMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-cyan-300/70">
      LOADING CAMPUS…
    </div>
  ),
});

const NEARBY_M = 300;
const COMPASS_RANGE_M = 500;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function ControlButton({ label, icon, onClick, active }: { label: string; icon: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`hud-panel flex w-12 flex-col items-center rounded-xl py-1.5 text-base leading-none ${active ? "ring-1 ring-cyan-300 text-cyan-200" : "text-slate-100"}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate-400">{label}</span>
    </button>
  );
}

/** Opens `/?report=<id>` links from the inbox and the report flow. */
function ReportDeepLink({ onOpen }: { onOpen: (id: string) => void }) {
  const id = useSearchParams().get("report");
  useEffect(() => {
    if (id) onOpen(id);
  }, [id, onOpen]);
  return null;
}

export default function HomeScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<AccessAlert[]>([]);
  const [profile, updateProfile] = useLocalStore("cq-access-profile", DEFAULT_ACCESS_PROFILE);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const loc = useLocation(DEMO_GEOMETRY.walkPath);

  const [bearing, setBearing] = useState(DEFAULT_CAMERA.bearing);
  const [hidden, setHidden] = useState<Set<Category>>(() => new Set());
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [follow, setFollow] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([getReports(), getAccessAlerts()]).then(([r, a]) => {
        if (!alive) return;
        setReports(r);
        setAlerts(a);
      });
    load();
    const unsubscribe = subscribeReports(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const allObstacles = useMemo(() => buildObstacles(reports, alerts, profile.needs), [reports, alerts, profile.needs]);
  const readings = useMemo(() => readObstacles(loc.pos, allObstacles), [loc.pos, allObstacles]);

  const nearbyIds = useMemo(() => {
    if (!nearbyOnly) return null;
    const ids = new Set(reports.filter((r) => turf.distance(loc.pos, [r.lng, r.lat], { units: "meters" }) <= NEARBY_M).map((r) => r.id));
    for (const r of readings) if (r.distance <= NEARBY_M) ids.add(r.id);
    return ids;
  }, [nearbyOnly, reports, readings, loc.pos]);

  const mapReports = useMemo(() => (nearbyIds ? reports.filter((r) => nearbyIds.has(r.id)) : reports), [reports, nearbyIds]);
  const mapObstacles = useMemo(
    () => (nearbyIds ? allObstacles.filter((o) => nearbyIds.has(o.report.id)) : allObstacles),
    [allObstacles, nearbyIds],
  );

  const ahead = useMemo(() => {
    const found = findAhead(readings, loc.heading);
    return found && !dismissed.has(found.id) && !hidden.has(found.obstacle.report.category) ? found : null;
  }, [readings, loc.heading, dismissed, hidden]);
  const alerting = profile.alertsOn && ahead !== null;
  const nearestRelevant = readings.find((r) => r.obstacle.relevant) ?? null;

  const latest = useRef({ ahead, voice: profile.voice });
  useEffect(() => {
    latest.current = { ahead, voice: profile.voice };
  });

  const alertId = alerting ? ahead?.id : undefined;
  useEffect(() => {
    if (!alertId || wasAlertedToday(alertId)) return;
    markAlerted(alertId);
    navigator.vibrate?.([250, 120, 250]);
    const current = latest.current.ahead;
    if (latest.current.voice && current) {
      speak(`${current.obstacle.report.title}, ${Math.round(current.distance)} meters ahead. ${current.obstacle.alert.detour_text ?? ""}`);
    }
  }, [alertId]);

  const compassItems = useMemo<CompassItem[]>(() => {
    const items: CompassItem[] = readings
      .filter((r) => r.obstacle.relevant && r.distance <= COMPASS_RANGE_M && !hidden.has(r.obstacle.report.category))
      .map((r) => ({
        id: r.id,
        bearing: r.bearing,
        distance: r.distance,
        icon: r.obstacle.alert.impact === "blocks" ? "⛔" : "⚠",
        color: r.obstacle.color,
        label: r.obstacle.report.title,
      }));
    const obstacleIds = new Set(allObstacles.map((o) => o.report.id));
    for (const r of reports) {
      if (r.mission?.status !== "open" || obstacleIds.has(r.id) || hidden.has(r.category)) continue;
      const distance = turf.distance(loc.pos, [r.lng, r.lat], { units: "meters" });
      if (distance > COMPASS_RANGE_M) continue;
      items.push({
        id: r.id,
        bearing: turf.bearing(turf.point(loc.pos), turf.point([r.lng, r.lat])),
        distance,
        icon: "★",
        color: CATEGORY_BY_ID[r.category].color,
        label: `Mission: ${r.title}, ${r.mission.points} points`,
      });
    }
    return items;
  }, [readings, reports, allObstacles, hidden, loc.pos]);

  const selected = reports.find((r) => r.id === selectedId) ?? null;
  const openFromLink = useCallback((id: string) => {
    setSelectedId(id);
    setFollow(false);
  }, []);

  const toggleCategory = (c: Category) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const flyTo = (center: LngLat | undefined, extra: Partial<CameraTarget> = {}) =>
    setCameraTarget({ center, nonce: Date.now(), ...extra });

  const showDetour = (id: string) => {
    const o = allObstacles.find((x) => x.report.id === id);
    if (!o?.alert.detour_path) return;
    setFocusedId(id);
    setFollow(false);
    const coords = o.alert.detour_path.coordinates;
    flyTo(turf.center(o.alert.detour_path).geometry.coordinates as LngLat, {
      zoom: 17.9,
      bearing: turf.bearing(turf.point(coords[0]), turf.point(coords[coords.length - 1])),
    });
  };

  const startWalk = () => {
    resetAlertMemory();
    setDismissed(new Set());
    setFocusedId(null);
    setSelectedId(null);
    if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    setFollow(true);
    loc.startSim();
  };

  const stopWalk = () => {
    loc.stopSim();
    setFollow(false);
  };

  const glowColor = ahead?.obstacle.color ?? "#f59e0b";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05080f]">
      <CampusMap
        reports={mapReports}
        obstacles={mapObstacles}
        hiddenCategories={hidden}
        activeObstacleId={alerting ? (ahead?.id ?? null) : null}
        focusedObstacleId={focusedId}
        userPos={loc.pos}
        userHeading={loc.heading}
        follow={follow}
        flat={profile.flat}
        reducedMotion={reducedMotion}
        cameraTarget={cameraTarget}
        onReportClick={setSelectedId}
        onBearingChange={setBearing}
        onUserPan={() => setFollow(false)}
      />

      <div className="hud-vignette pointer-events-none absolute inset-0" />
      {alerting && <div className="edge-glow pointer-events-none absolute inset-0" style={{ "--glow": glowColor } as CSSProperties} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="pointer-events-auto">
          <CompassStrip heading={bearing} items={compassItems} onItemClick={setSelectedId} />
        </div>
        <div className="pointer-events-auto">
          <FilterChips hidden={hidden} nearbyOnly={nearbyOnly} onToggle={toggleCategory} onToggleNearby={() => setNearbyOnly((v) => !v)} />
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-col gap-2">
            <StatusCorner reports={reports} onOpenReport={setSelectedId} />
            {loc.offCampus && (
              <div className="hud-panel w-44 rounded-lg px-2 py-1 text-[10px] text-amber-200">Off campus: showing the demo position</div>
            )}
            {loc.error && <div className="hud-panel w-44 rounded-lg px-2 py-1 text-[10px] text-rose-300">{loc.error}</div>}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="flex gap-1.5">
              <NotificationBell />
              <UserSwitcher compact />
            </div>
            <ControlButton label="Alerts" icon="♿" onClick={() => setShowAccess(true)} active={profile.needs.length > 0} />
            <ControlButton label={profile.flat ? "3D" : "2D"} icon={profile.flat ? "🧊" : "🗺️"} onClick={() => updateProfile({ flat: !profile.flat })} />
            <ControlButton label="North" icon="🧭" onClick={() => flyTo(undefined, { bearing: 0 })} />
            <ControlButton
              label="Locate"
              icon="📍"
              active={loc.source === "gps"}
              onClick={() => {
                loc.startGps();
                setFollow(true);
              }}
            />
            <ControlButton label={loc.simulating ? "Stop" : "Walk"} icon={loc.simulating ? "⏹" : "🚶"} active={loc.simulating} onClick={loc.simulating ? stopWalk : startWalk} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
        <div className="pointer-events-auto">
          <AheadCard
            ahead={ahead}
            nearest={nearestRelevant}
            alerting={alerting}
            onShowDetour={showDetour}
            onDismiss={(id) => setDismissed((prev) => new Set(prev).add(id))}
            onAnswerStillBlocked={(id, yes) => {
              if (yes) voteMeToo(id);
              showToast(yes ? "Marked still blocked" : "Thanks, we'll ask others to check");
            }}
          />
        </div>
      </div>

      <Suspense fallback={null}>
        <ReportDeepLink onOpen={openFromLink} />
      </Suspense>
      {selected && <ReportSheet key={selected.id} report={selected} onClose={() => setSelectedId(null)} />}
      {showAccess && <AccessPanel profile={profile} onChange={updateProfile} onClose={() => setShowAccess(false)} />}
      {toast && (
        <div className="hud-panel absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-cyan-100" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
