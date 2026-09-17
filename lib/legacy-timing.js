/* Shared Legacy delivery timing. Extracted without changing the timing equations. */
(function(root){
'use strict';
const DEFAULTS_RDS = {
    MAX_GANTRY_SPEED_DEGPS: 12.0,
    MAX_MLC_SPEED_CMPS: 5.0,
    MAX_COLLIMATOR_SPEED_DEGPS: 9.0,
    MAX_GANTRY_ACCEL_DECEL_DEGPSS: 12.0,
    MAX_MLC_ACCEL_DECEL_CMPS2: 5.0,
    MAX_COLLIMATOR_ACCEL_DECEL_DEGPSS: 9.0
};
const DEFAULTS_TDS = {
    MAX_GANTRY_SPEED_DEGPS: 6.0,
    MAX_MLC_SPEED_CMPS: 2.5,
    MAX_COLLIMATOR_SPEED_DEGPS: 9.0,
    MAX_GANTRY_ACCEL_DECEL_DEGPSS: 4.8,
    MAX_MLC_ACCEL_DECEL_CMPS2: 2.5,
    MAX_COLLIMATOR_ACCEL_DECEL_DEGPSS: 9.0
};
function normalizeGantryAngleDiff(g1, g2) { let diff = Math.abs(g1 - g2); if (diff > 180) diff = 360 - diff; return diff; }

	            function normalizeAngle360(deg) {
	                const x = Number(deg);
	                if (!isFinite(x)) return null;
	                return ((x % 360) + 360) % 360;
	            }

	            function inferGantryRotationDirectionFromControlPoints(controlPoints) {
	                const cps = controlPoints || [];
	                if (!Array.isArray(cps) || cps.length < 3) return 'NONE';
	                let wrapUp = 0;    // prev ~ 359 -> next ~ 0  (CCW across 360)
	                let wrapDown = 0;  // prev ~ 0 -> next ~ 359 (CW across 0)
	                let pos = 0;
	                let neg = 0;
	                let prev = normalizeAngle360(cps[0]?.gantryAngle);
	                if (prev == null) return 'NONE';
	                for (let i = 1; i < cps.length; i++) {
	                    const next = normalizeAngle360(cps[i]?.gantryAngle);
	                    if (next == null) continue;
	                    const d = next - prev;
	                    if (d < -180) wrapUp += 1;
	                    else if (d > 180) wrapDown += 1;
	                    else if (d > 1e-6) pos += 1;
	                    else if (d < -1e-6) neg += 1;
	                    prev = next;
	                }
	                if (wrapUp > wrapDown) return 'CCW';
	                if (wrapDown > wrapUp) return 'CW';
	                if (pos > neg) return 'CCW';
	                if (neg > pos) return 'CW';
	                return 'NONE';
	            }

	            function getBeamGantryRotationDirection(beamData) {
	                if (!beamData || typeof beamData !== 'object') return 'NONE';
	                const raw = (beamData.gantryRotationDirection || '').toString().toUpperCase();
	                if (raw === 'CW' || raw === 'CCW') return raw;
	                if (beamData.__gantryRotationDirectionInferred) return beamData.__gantryRotationDirectionInferred;
	                const inferred = inferGantryRotationDirectionFromControlPoints(beamData.controlPoints);
	                beamData.__gantryRotationDirectionInferred = inferred;
	                return inferred;
	            }

	            function gantryAngleDeltaMagnitude(prevDeg, nextDeg, beamData) {
	                const prev = normalizeAngle360(prevDeg);
	                const next = normalizeAngle360(nextDeg);
	                if (prev == null || next == null) return 0;
	                const dir = getBeamGantryRotationDirection(beamData);
	                if (dir === 'CCW') return (next - prev + 360) % 360;
	                if (dir === 'CW') return (prev - next + 360) % 360;
	                return normalizeGantryAngleDiff(prev, next);
	            }
            function calculateContinuousMoveTimesForDistances(distances, vmax, amax) {
                if (!distances || distances.length === 0) return [];
                if (!isFinite(vmax) || vmax <= 0) return distances.map(() => Infinity);
                if (!isFinite(amax) || amax <= 0) return distances.map(d => Math.max(0, d) / vmax);

                const n = distances.length;
                const v = new Array(n + 1).fill(0);

                for (let i = 0; i < n; i++) {
                    const d = Math.max(0, distances[i]);
                    const vNextMax = Math.sqrt((v[i] * v[i]) + (2 * amax * d));
                    v[i + 1] = Math.min(vmax, vNextMax);
                }

                v[n] = 0;
                for (let i = n - 1; i >= 0; i--) {
                    const d = Math.max(0, distances[i]);
                    const vMaxFromNext = Math.sqrt((v[i + 1] * v[i + 1]) + (2 * amax * d));
                    v[i] = Math.min(v[i], vMaxFromNext);
                }

                for (let iter = 0; iter < 2; iter++) {
                    for (let i = 0; i < n; i++) {
                        const d = Math.max(0, distances[i]);
                        const vNextMax = Math.sqrt((v[i] * v[i]) + (2 * amax * d));
                        v[i + 1] = Math.min(v[i + 1], vmax, vNextMax);
                    }
                    v[n] = 0;
                    for (let i = n - 1; i >= 0; i--) {
                        const d = Math.max(0, distances[i]);
                        const vMaxFromNext = Math.sqrt((v[i + 1] * v[i + 1]) + (2 * amax * d));
                        v[i] = Math.min(v[i], vMaxFromNext);
                    }
                }

                const t = new Array(n);
                for (let i = 0; i < n; i++) {
                    const d = Math.max(0, distances[i]);
                    const denom = v[i] + v[i + 1];
                    t[i] = (denom > 1e-9) ? (2 * d / denom) : 0;
                }
                return t;
            }

            function calculateSegmentTimes(beamData, controlPoints, dataToProcess, primaryDoseRate, settings, getEffectiveMLCPositionsForCP=singleLayerPositions) {
                const currentMaxGantrySpeed=settings.maxGantrySpeedInput;
                const currentMaxMlcSpeedMMPS=settings.maxMlcSpeedInput*10;
                const currentMaxCollimatorSpeed=settings.maxCollimatorSpeedInput;
                const currentMaxGantryAccelDecel=settings.maxGantryAccelDecelInput;
                const currentMaxMlcAccelDecelMMPS2=settings.maxMlcAccelDecelInput*10;
                const currentMaxCollimatorAccelDecel=settings.maxCollimatorAccelDecelInput;
                const currentBeamStartOverheadSec=settings.beamStartOverheadMsInput/1000;
                const currentSegmentOverheadSec=settings.segmentOverheadMsInput/1000;
                if (!beamData || !controlPoints || controlPoints.length < 2) return 0;

                const defaults = beamData.isRDSMachine ? DEFAULTS_RDS : DEFAULTS_TDS;

                const MAX_GANTRY_SPEED = currentMaxGantrySpeed || defaults.MAX_GANTRY_SPEED_DEGPS;
                const MAX_MLC_SPEED_MMPS = currentMaxMlcSpeedMMPS || (defaults.MAX_MLC_SPEED_CMPS * 10);
                const MAX_COLL_SPEED = currentMaxCollimatorSpeed || defaults.MAX_COLLIMATOR_SPEED_DEGPS;
                const MAX_GANTRY_ACCEL = currentMaxGantryAccelDecel || defaults.MAX_GANTRY_ACCEL_DECEL_DEGPSS;
                const MAX_MLC_ACCEL_MMPS2 = currentMaxMlcAccelDecelMMPS2 || (defaults.MAX_MLC_ACCEL_DECEL_CMPS2 * 10);
                const MAX_COLL_ACCEL = currentMaxCollimatorAccelDecel || defaults.MAX_COLLIMATOR_ACCEL_DECEL_DEGPSS;
                const MAX_DOSE_RATE = primaryDoseRate || 600.0;
                const MAX_DOSE_RATE_PER_SEC = MAX_DOSE_RATE / 60.0;

                const BEAM_START_OVERHEAD_SEC = currentBeamStartOverheadSec || 0;
                const SEGMENT_OVERHEAD_SEC = currentSegmentOverheadSec || 0;

                let totalBeamSimTime = BEAM_START_OVERHEAD_SEC;

                const numSegments = controlPoints.length - 1;
                const segmentDeltaG = new Array(numSegments).fill(0);
                const segmentDeltaColl = new Array(numSegments).fill(0);
                const segmentMaxLeafTravel = new Array(numSegments).fill(0);
                const segmentDoseRateSet = new Array(numSegments).fill(MAX_DOSE_RATE);

                let leafDistances = null;
                const eff0 = getEffectiveMLCPositionsForCP(controlPoints[0], beamData);
                if (eff0 && eff0.length > 0) {
                    leafDistances = new Array(eff0.length);
                    for (let k = 0; k < eff0.length; k++) leafDistances[k] = new Float32Array(numSegments);
                }

                if (!dataToProcess[0]) dataToProcess[0] = { cp: controlPoints[0] };
                dataToProcess[0].cumulativeSimTime = totalBeamSimTime;
                dataToProcess[0].segmentDuration = 0;

                for (let i = 1; i < controlPoints.length; i++) {
                    const prevCP = controlPoints[i - 1];
                    const currentCP = controlPoints[i];
                    const segmentIndex = i - 1;

	                    let deltaGantryAngle = gantryAngleDeltaMagnitude(prevCP.gantryAngle, currentCP.gantryAngle, beamData);
                    let deltaCollAngle = Math.abs(currentCP.collimatorAngle - prevCP.collimatorAngle);
                    if (deltaCollAngle > 180) deltaCollAngle = 360 - deltaCollAngle;

                    let maxLeafTravel = 0;
                    if (beamData.mlcDefinitions && currentCP.mlcPositionData && prevCP.mlcPositionData) {
                        const prevEffective = getEffectiveMLCPositionsForCP(prevCP, beamData);
                        const currentEffective = getEffectiveMLCPositionsForCP(currentCP, beamData);

                        if (prevEffective && currentEffective && prevEffective.length === currentEffective.length) {
                            if (leafDistances && leafDistances.length === currentEffective.length) {
                                for (let l = 0; l < currentEffective.length; l++) {
                                    const d = Math.abs(currentEffective[l] - prevEffective[l]);
                                    leafDistances[l][segmentIndex] = d;
                                    if (d > maxLeafTravel) maxLeafTravel = d;
                                }
                            } else {
                                for (let l = 0; l < currentEffective.length; l++) {
                                    maxLeafTravel = Math.max(maxLeafTravel, Math.abs(currentEffective[l] - prevEffective[l]));
                                }
                            }
                        } else {
                            leafDistances = null;
                        }
                    }

                    if (isNaN(deltaGantryAngle)) deltaGantryAngle = 0;
                    if (isNaN(deltaCollAngle)) deltaCollAngle = 0;
                    if (isNaN(maxLeafTravel)) maxLeafTravel = 0;

                    segmentDeltaG[segmentIndex] = deltaGantryAngle;
                    segmentDeltaColl[segmentIndex] = deltaCollAngle;
                    segmentMaxLeafTravel[segmentIndex] = maxLeafTravel;
                    const drSet = (Number(currentCP.doseRateSet) || Number(prevCP.doseRateSet) || MAX_DOSE_RATE);
                    segmentDoseRateSet[segmentIndex] = drSet;
                }

                const gantryMinTimes = calculateContinuousMoveTimesForDistances(segmentDeltaG, MAX_GANTRY_SPEED, MAX_GANTRY_ACCEL);
                const collMinTimes = calculateContinuousMoveTimesForDistances(segmentDeltaColl, MAX_COLL_SPEED, MAX_COLL_ACCEL);
                let mlcMinTimes;
                if (leafDistances && leafDistances.length > 0) {
                    mlcMinTimes = new Array(numSegments).fill(0);
                    for (let l = 0; l < leafDistances.length; l++) {
                        const tLeaf = calculateContinuousMoveTimesForDistances(leafDistances[l], MAX_MLC_SPEED_MMPS, MAX_MLC_ACCEL_MMPS2);
                        for (let si = 0; si < numSegments; si++) mlcMinTimes[si] = Math.max(mlcMinTimes[si], tLeaf[si] || 0);
                    }
                } else {
                    mlcMinTimes = calculateContinuousMoveTimesForDistances(segmentMaxLeafTravel, MAX_MLC_SPEED_MMPS, MAX_MLC_ACCEL_MMPS2);
                }

                for (let i = 1; i < controlPoints.length; i++) {
                    const prevCP = controlPoints[i - 1];
                    const currentCP = controlPoints[i];
                    const segmentIndex = i - 1;

                    const deltaGantryAngle = segmentDeltaG[segmentIndex] || 0;
                    const deltaCollAngle = segmentDeltaColl[segmentIndex] || 0;
                    const maxLeafTravel = segmentMaxLeafTravel[segmentIndex] || 0;

                    const dMU_WEIGHT = currentCP.cumulativeMetersetWeight - prevCP.cumulativeMetersetWeight;
                    let deltaDose = (dMU_WEIGHT > 1e-6) ? beamData.totalMeterset * dMU_WEIGHT : 0;
                    if (isNaN(deltaDose)) deltaDose = 0;

                    const timeGantry = gantryMinTimes[segmentIndex] || 0;
                    const timeMlc = mlcMinTimes[segmentIndex] || 0;
                    const timeColl = collMinTimes[segmentIndex] || 0;
                    const maxDrPerSec = (Number(segmentDoseRateSet[segmentIndex]) || 0) / 60.0;
                    const timeDose = (maxDrPerSec > 1e-6) ? deltaDose / maxDrPerSec : 0;

                    const baseSegmentDuration = Math.max(timeGantry, timeMlc, timeColl, timeDose);
                    const segmentDuration = baseSegmentDuration + SEGMENT_OVERHEAD_SEC;
                    totalBeamSimTime += segmentDuration;

                    let limitingComponent = 'None';
                    if (baseSegmentDuration > 1e-9) {
                        const times = { Gantry: timeGantry, MLC: timeMlc, Collimator: timeColl, 'Dose Rate': timeDose };
                        limitingComponent = Object.keys(times).reduce((a, b) => times[a] >= times[b] ? a : b);
                    }

                    if (!dataToProcess[segmentIndex]) dataToProcess[segmentIndex] = { cp: prevCP };
                    dataToProcess[segmentIndex].segmentDuration = segmentDuration;
                    dataToProcess[segmentIndex].deltaGantryAngle = deltaGantryAngle;
                    dataToProcess[segmentIndex].deltaCollAngle = deltaCollAngle;
                    dataToProcess[segmentIndex].maxLeafTravel = maxLeafTravel;
                    dataToProcess[segmentIndex].limitingComponent = limitingComponent;

                    const motionDuration = Math.max(1e-9, segmentDuration - SEGMENT_OVERHEAD_SEC);
                    const avgGantrySpeed = (motionDuration > 1e-9) ? deltaGantryAngle / motionDuration : 0;
                    const avgMlcSpeed = (motionDuration > 1e-9) ? maxLeafTravel / motionDuration : 0;
                    const avgCollSpeed = (motionDuration > 1e-9) ? deltaCollAngle / motionDuration : 0;
                    const avgDoseRate = (segmentDuration > 1e-9) ? (deltaDose / segmentDuration) * 60 : 0;

                    dataToProcess[segmentIndex].gantryCapability = MAX_GANTRY_SPEED > 0 ? (avgGantrySpeed / MAX_GANTRY_SPEED) * 100 : 0;
                    dataToProcess[segmentIndex].mlcCapability = MAX_MLC_SPEED_MMPS > 0 ? (avgMlcSpeed / MAX_MLC_SPEED_MMPS) * 100 : 0;
                    dataToProcess[segmentIndex].collimatorCapability = MAX_COLL_SPEED > 0 ? (avgCollSpeed / MAX_COLL_SPEED) * 100 : 0;
                    dataToProcess[segmentIndex].doseRateCapability = MAX_DOSE_RATE > 0 ? (avgDoseRate / MAX_DOSE_RATE) * 100 : 0;

                    if (!dataToProcess[i]) dataToProcess[i] = { cp: currentCP };
                    dataToProcess[i].cumulativeSimTime = totalBeamSimTime;
                }

                return totalBeamSimTime;
            }


function singleLayerPositions(cp,beam){
    if(beam.isRDSMachine)throw new Error('RDS requires the simulator effective-aperture callback.');
    const layers=cp?.mlcPositionData;
    if(!layers?.length)return null;
    return (layers.find(layer=>layer.type.startsWith('MLCX'))||layers[0]).positions;
}
function predict(beam,settings,doseRate=600){
    const data=[];
    const totalTime=calculateSegmentTimes(beam,beam.controlPoints,data,doseRate,settings);
    return {data,totalTime};
}
const api={calculateSegmentTimes,predict};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LegacyTiming=api;
})(typeof globalThis!=='undefined'?globalThis:this);
