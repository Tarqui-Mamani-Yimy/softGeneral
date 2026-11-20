import { alertStatusLabel, alertTypeLabel, formatConfidence } from '../format';

describe('alert formatting', () => {
  it('labels every known alert type in Spanish', () => {
    expect(alertTypeLabel('intrusion')).toBe('Intrusión');
    expect(alertTypeLabel('weapon')).toBe('Arma detectada');
    expect(alertTypeLabel('fire_smoke')).toBe('Fuego / humo');
    expect(alertTypeLabel('fight')).toBe('Pelea');
    expect(alertTypeLabel('face_match')).toBe('Persona vetada');
  });

  it('falls back to the raw code for unknown types', () => {
    expect(alertTypeLabel('drone')).toBe('drone');
  });

  it('labels statuses', () => {
    expect(alertStatusLabel('pending')).toBe('Pendiente');
    expect(alertStatusLabel('confirmed')).toBe('Confirmada');
    expect(alertStatusLabel('false_alarm')).toBe('Falsa alarma');
  });

  it('formats confidence as a rounded percentage', () => {
    expect(formatConfidence(0.876)).toBe('88%');
    expect(formatConfidence(1)).toBe('100%');
  });
});
