export interface WhipConnection {
  pc: RTCPeerConnection;
  stream: MediaStream;
  whipResourceUrl: string | null;
  stop: () => Promise<void>;
}

export function resolveWhipUrl(whipUrl: string): string {
  if (whipUrl.startsWith('http://') || whipUrl.startsWith('https://')) {
    // If on HTTPS, rewrite insecure HTTP to avoid Mixed Content
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && whipUrl.startsWith('http://')) {
      try {
        const parsed = new URL(whipUrl);
        // Proxy through Nginx /mediamtx/ endpoint
        return `${window.location.protocol}//${window.location.host}/mediamtx${parsed.pathname}`;
      } catch {
        // keep whipUrl
      }
    }
    return whipUrl;
  }
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const defaultMtxUrl = isSecure ? '/mediamtx' : 'http://localhost:8889';
  const baseUrl = (
    import.meta.env.VITE_MEDIAMTX_WEBRTC_URL ?? defaultMtxUrl
  ).replace(/\/+$/, '');
  const cleanPath = whipUrl.startsWith('/') ? whipUrl : `/${whipUrl}`;
  return `${baseUrl}${cleanPath}`;
}

async function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 2000
): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return;
  }
  return new Promise<void>((resolve) => {
    let checkState: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (checkState) {
        pc.removeEventListener('icegatheringstatechange', checkState);
      }
      resolve();
    }, timeoutMs);

    checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        if (checkState) {
          pc.removeEventListener('icegatheringstatechange', checkState);
        }
        resolve();
      }
    };

    pc.addEventListener('icegatheringstatechange', checkState);
  });
}

/**
 * Publishes a MediaStream track to MediaMTX via WebRTC WHIP.
 * Configures H.264 codec preference when supported and retrieves the Location resource header.
 */
export async function startWhipPublish(
  stream: MediaStream,
  whipUrl: string,
  iceTimeoutMs = 2000
): Promise<WhipConnection> {
  const pc = new RTCPeerConnection();

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    pc.close();
    throw new Error('No active video track found in the provided media stream');
  }

  const transceiver = pc.addTransceiver(videoTrack, { direction: 'sendonly' });

  // Prioritize H.264 codec if available in the browser's capabilities
  if (
    typeof RTCRtpSender.getCapabilities === 'function' &&
    transceiver.setCodecPreferences
  ) {
    const capabilities = RTCRtpSender.getCapabilities('video');
    if (capabilities && capabilities.codecs) {
      const h264Codecs = capabilities.codecs.filter(
        (c) => c.mimeType.toLowerCase() === 'video/h264'
      );
      const otherCodecs = capabilities.codecs.filter(
        (c) => c.mimeType.toLowerCase() !== 'video/h264'
      );
      if (h264Codecs.length > 0) {
        try {
          transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
        } catch {
          // Fall back to default browser codec preferences
        }
      }
    }
  }

  // Create local SDP offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete before sending the SDP
  await waitForIceGathering(pc, iceTimeoutMs);

  const localSdp = pc.localDescription?.sdp ?? offer.sdp;
  if (!localSdp) {
    pc.close();
    throw new Error('Failed to generate local SDP offer for WHIP publishing');
  }

  const targetUrl = resolveWhipUrl(whipUrl);
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
      },
      body: localSdp,
    });
  } catch {
    pc.close();
    throw new Error(
      'MediaMTX WHIP endpoint is unreachable. Verify MediaMTX WebRTC server is running.'
    );
  }

  if (!response.ok && response.status !== 201) {
    pc.close();
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `MediaMTX WHIP rejected stream (HTTP ${response.status}): ${detail || response.statusText}`
    );
  }

  const locationHeader = response.headers.get('Location');
  let whipResourceUrl: string | null = null;
  if (locationHeader) {
    try {
      whipResourceUrl = new URL(locationHeader, targetUrl).toString();
    } catch {
      whipResourceUrl = locationHeader;
    }
  }

  const answerSdp = await response.text();
  await pc.setRemoteDescription(
    new RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp,
    })
  );

  const stop = async () => {
    try {
      pc.close();
    } catch {
      // ignore
    }
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    if (whipResourceUrl) {
      try {
        await fetch(whipResourceUrl, { method: 'DELETE' });
      } catch {
        // best-effort WHIP resource teardown
      }
    }
  };

  return {
    pc,
    stream,
    whipResourceUrl,
    stop,
  };
}

/**
 * Best-effort cleanup for pagehide event using fetch keepalive.
 */
export function cleanupWhipKeepalive(
  whipResourceUrl: string | null,
  sessionId: string | null,
  apiUrl: string,
  token: string | null
): void {
  if (whipResourceUrl) {
    try {
      fetch(whipResourceUrl, { method: 'DELETE', keepalive: true }).catch(() => {});
    } catch {
      // ignore
    }
  }
  if (sessionId) {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      fetch(`${apiUrl}/demo/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }
}
