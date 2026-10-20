import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFacialAsymmetry,
  classifyAsymmetry,
  classifyAcousticAirway,
  getTriageProtocol,
  formatETA,
} from './triage.ts';

test('calculateFacialAsymmetry computes accurate ratio', () => {
  assert.equal(calculateFacialAsymmetry(100, 100), 0);
  assert.equal(calculateFacialAsymmetry(50, 100), 0.5);
  assert.equal(calculateFacialAsymmetry(100, 50), 0.5);
  assert.equal(calculateFacialAsymmetry(0, 100), 0);
  assert.equal(calculateFacialAsymmetry(70, 100), 0.3);
});

test('classifyAsymmetry correctly sets thresholds and labels', () => {
  const normal = classifyAsymmetry(0.2);
  assert.equal(normal.isAbnormal, false);
  assert.equal(normal.isTriggerThreshold, false);
  assert.equal(normal.color, '#10b981');

  const moderate = classifyAsymmetry(0.38);
  assert.equal(moderate.isAbnormal, true);
  assert.equal(moderate.isTriggerThreshold, false);
  assert.equal(moderate.color, '#f59e0b');

  const critical = classifyAsymmetry(0.45);
  assert.equal(critical.isAbnormal, true);
  assert.equal(critical.isTriggerThreshold, true);
  assert.equal(critical.color, '#ef4444');
});

test('classifyAcousticAirway classifies normal, tachypnea and stridor', () => {
  const normal = classifyAcousticAirway(40);
  assert.equal(normal.status, 'Normal Breathing');
  assert.equal(normal.alert, false);

  const tachy = classifyAcousticAirway(62);
  assert.equal(tachy.status, 'Tachypnea / Hyperventilation');
  assert.equal(tachy.alert, true);

  const stridor = classifyAcousticAirway(75);
  assert.equal(stridor.status, 'Inspiratory Stridor / Wheezing');
  assert.equal(stridor.alert, true);
});

test('getTriageProtocol returns complete condition protocols with 4 checklist items', () => {
  const conditions = ['STROKE', 'ANAPHYLAXIS', 'HEMORRHAGE', 'BURN'];
  for (const cond of conditions) {
    const protocol = getTriageProtocol(cond);
    assert.equal(protocol.condition, cond);
    assert.equal(protocol.esiLevel, 'RED - IMMEDIATE (ESI-1)');
    assert.equal(protocol.bystanderSteps.length, 4);
    assert.equal(protocol.edChecklist.length, 4);
    assert.ok(protocol.voiceScript.length > 20);
    assert.ok(protocol.defaultEtaSeconds > 0);
  }
});

test('formatETA formats seconds into MM:SS format', () => {
  assert.equal(formatETA(320), '05:20');
  assert.equal(formatETA(65), '01:05');
  assert.equal(formatETA(0), '00:00');
  assert.equal(formatETA(-10), '00:00');
});
