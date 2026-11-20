export const colors = {
  background: '#0B1220',
  surface: '#111A2E',
  surfaceAlt: '#18233B',
  border: '#24314F',
  text: '#E6EDF7',
  textMuted: '#8B9BB8',
  primary: '#3B82F6',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
};

export const alertTypeColors: Record<string, string> = {
  intrusion: colors.warning,
  weapon: colors.danger,
  fire_smoke: '#F97316',
  fight: '#E11D48',
  face_match: '#A855F7',
};

export const statusColors: Record<string, string> = {
  pending: colors.warning,
  confirmed: colors.danger,
  false_alarm: colors.textMuted,
};
