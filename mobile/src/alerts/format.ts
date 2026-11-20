const TYPE_LABELS: Record<string, string> = {
  intrusion: 'Intrusión',
  weapon: 'Arma detectada',
  fire_smoke: 'Fuego / humo',
  fight: 'Pelea',
  face_match: 'Persona vetada',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  false_alarm: 'Falsa alarma',
};

export function alertTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function alertStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
