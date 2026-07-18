import { Env, Developer, TIER_FEATURES, TierFeatures } from "../types";

export async function authenticateDev(request: Request, env: Env): Promise<{ dev: Developer | null; error?: string; status?: number }> {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("api_key") || request.headers.get("x-api-key") || "";
  
  // Master key bypass
  const masterKey = url.searchParams.get("master_key") || request.headers.get("x-master-key") || "";
  if (masterKey === "megan_chat_master_admin_2026") {
    return {
      dev: {
        uid: "admin", username: "admin", email: "admin@megan.qzz.io",
        tier: "admin", api_key: "master", created_at: 0,
      }
    };
  }

  if (!apiKey) return { dev: null, error: "API key required. Get one at auth.megan.qzz.io", status: 401 };

  // Look up API key — check megan-auth via internal call
  try {
    const res = await fetch(`${env.AUTH_URL}/auth/verify-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": env.INTERNAL_SECRET },
      body: JSON.stringify({ key: apiKey }),
    });
    const data = await res.json() as any;
    
    if (data.valid && data.user) {
      return {
        dev: {
          uid: data.user.uid,
          username: data.user.username,
          email: data.user.email,
          tier: data.user.tier || "bronze",
          api_key: apiKey,
          created_at: Date.now(),
        }
      };
    }
  } catch {}

  return { dev: null, error: "Invalid or revoked API key", status: 403 };
}

export function getTierFeatures(tier: string): TierFeatures {
  return TIER_FEATURES[tier] || TIER_FEATURES.bronze;
}

export function canAccessFeature(dev: Developer, feature: keyof TierFeatures): boolean {
  const features = getTierFeatures(dev.tier);
  return features[feature] === true;
}
