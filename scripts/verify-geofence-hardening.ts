import assert from "node:assert/strict";
import {
  distanceMeters,
  evaluateGeofence,
  evaluateGeofenceFix,
  validateGpsAccuracy,
  type GeofenceConfig,
} from "../src/lib/duty";

const center = { lat: 19.076, lng: 72.8777 };
const fence: GeofenceConfig = {
  enabled: true,
  lat: center.lat,
  lng: center.lng,
  radiusMeters: 200,
};

assert.equal(validateGpsAccuracy(25).ok, true, "a precise GPS fix is accepted");
assert.equal(validateGpsAccuracy(null).ok, false, "missing accuracy is rejected");
assert.equal(validateGpsAccuracy(Number.NaN).ok, false, "invalid accuracy is rejected");
assert.equal(validateGpsAccuracy(0).ok, false, "zero accuracy is rejected");
assert.equal(validateGpsAccuracy(101).ok, false, "an imprecise fix is rejected");

const atCenter = evaluateGeofenceFix(fence, center.lat, center.lng, 25);
assert.equal(atCenter.ok, true, "a precise fix at the centre is accepted");
assert.equal(atCenter.within, true, "centre fix is inside the fence");

const outside = evaluateGeofenceFix(fence, center.lat + 0.004, center.lng, 10);
assert.equal(outside.ok, false, "a point outside the hospital fence is rejected");
assert.equal(outside.within, false, "outside point cannot be marked within");

const 150mLat = 150 / 111_195;
const nearBoundary = evaluateGeofenceFix(fence, center.lat + 150mLat, center.lng, 60);
assert.equal(nearBoundary.ok, false, "GPS uncertainty crossing the fence boundary is rejected");
assert.match(nearBoundary.error || "", /uncertainty/i, "boundary uncertainty explains why punch was rejected");

const poorFix = evaluateGeofenceFix(fence, center.lat, center.lng, 130);
assert.equal(poorFix.ok, false, "poor-quality centre fix is rejected");
assert.match(poorFix.error || "", /accuracy/i, "poor GPS quality returns actionable guidance");

const missingFix = evaluateGeofenceFix(fence, center.lat, center.lng, null);
assert.equal(missingFix.ok, false, "geofenced attendance requires accuracy metadata");

const disabledFence = evaluateGeofenceFix({ ...fence, enabled: false }, center.lat, center.lng, null);
assert.equal(disabledFence.ok, true, "disabled geofencing preserves existing non-geofence behavior");

assert.ok(distanceMeters(center.lat, center.lng, center.lat + 150mLat, center.lng) > 140);
console.log("Geofence GPS accuracy regression tests PASSED");
