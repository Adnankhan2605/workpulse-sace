import type { GeofenceStatus, OfficeGeofenceConfig } from "./types";

export const DEFAULT_OFFICE_GEOFENCE: OfficeGeofenceConfig = {
  enabled: true,
  officeName: "SACE Headquarters",
  latitude: 17.385044,
  longitude: 78.486671,
  radiusMeters: 100,
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Computes exact great-circle distance in meters between two WGS-84 coordinates
 * using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export interface GeofenceEvaluation {
  distanceMeters: number;
  radiusMeters: number;
  allowed: boolean;
  status: GeofenceStatus;
}

export function evaluateGeofence(
  userLat: number,
  userLon: number,
  config: OfficeGeofenceConfig,
): GeofenceEvaluation {
  const distanceMeters = calculateHaversineDistanceMeters(
    userLat,
    userLon,
    config.latitude,
    config.longitude,
  );

  if (!config.enabled) {
    return {
      distanceMeters,
      radiusMeters: config.radiusMeters,
      allowed: true,
      status: "Bypassed",
    };
  }

  const inside = distanceMeters <= config.radiusMeters;
  return {
    distanceMeters,
    radiusMeters: config.radiusMeters,
    allowed: inside,
    status: inside ? "Inside Office" : "Out of Bounds",
  };
}

export interface CapturedCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/**
 * Requests high-accuracy GPS coordinates via browser Geolocation API with clear
 * user-facing guidance when permission is blocked, unavailable, or times out.
 */
export function requestCurrentPosition(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
): Promise<CapturedCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser or device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(position.coords.accuracy ?? 0),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Location permission is blocked. Please allow location access in your browser site settings and try again.",
            ),
          );
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new Error(
              "Unable to determine your GPS location. Ensure device location services / GPS are enabled.",
            ),
          );
          return;
        }
        if (err.code === err.TIMEOUT) {
          reject(
            new Error(
              "Location request timed out. Move to an area with clearer GPS/Wi-Fi signal and retry.",
            ),
          );
          return;
        }
        reject(new Error(err.message || "Failed to acquire current GPS coordinates."));
      },
      options,
    );
  });
}

export function formatDistanceMeters(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters} m`;
}
