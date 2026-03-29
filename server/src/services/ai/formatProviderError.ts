/**
 * Turn long provider responses (e.g. Stability JSON) into short copy for API clients.
 */
export const formatProviderError = (raw: string): string => {
  const s = raw.trim();

  if (/insufficient_balance|not have enough balance|negative balance|need \$[\d.]+.*have \$/i.test(s)) {
    return "Your image provider account is out of credits. Add billing or switch API keys.";
  }
  if (/\(401\)|unauthorized|invalid.?api.?key/i.test(s)) {
    return "The image provider rejected the API key. Check server configuration.";
  }
  if (/invalid_sdxl|invalid.*dimension/i.test(s)) {
    return "The provider rejected image dimensions. Try again after a server update or smaller upload.";
  }

  const jsonStart = s.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const j = JSON.parse(s.slice(jsonStart)) as {
        message?: string;
        errors?: Array<{ message?: string; name?: string }>;
      };
      const msg = j.errors?.[0]?.message ?? j.message;
      if (msg) {
        if (/insufficient_balance|enough balance/i.test(msg)) {
          return "Your image provider account is out of credits. Add billing or switch API keys.";
        }
        return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
      }
    } catch {
      /* ignore */
    }
  }

  if (/\(429\)/.test(s) && !/balance/i.test(s)) {
    return "The image provider rate-limited this request. Wait a moment and try again.";
  }

  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
};
