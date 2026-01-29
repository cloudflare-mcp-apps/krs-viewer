/**
 * API Key Management
 *
 * Generate, validate, and manage permanent API keys for non-OAuth MCP clients
 */

export interface ApiKeyEnv {
  DB: D1Database;
}

export interface ApiKey {
  api_key_id: string;
  user_id: string;
  api_key_hash: string;
  key_prefix: string;
  name: string;
  last_used_at?: number;
  created_at: number;
  expires_at?: number;
  is_active: number;
}

export interface ApiKeyGenerationResult {
  apiKey: string;
  record: ApiKey;
}

export interface ApiKeyValidationResult {
  userId: string;
  email: string;
}

/**
 * Generate a new API key for a user
 */
export async function generateApiKey(
  env: ApiKeyEnv,
  userId: string,
  name: string,
  expiresInDays?: number
): Promise<ApiKeyGenerationResult> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const apiKey = `wtyk_${randomHex}`;
  const keyPrefix = apiKey.substring(0, 16);
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyId = crypto.randomUUID();
  const expiresAt = expiresInDays ? Date.now() + (expiresInDays * 24 * 60 * 60 * 1000) : null;

  const record: ApiKey = {
    api_key_id: apiKeyId,
    user_id: userId,
    api_key_hash: apiKeyHash,
    key_prefix: keyPrefix,
    name: name,
    last_used_at: undefined,
    created_at: Date.now(),
    expires_at: expiresAt || undefined,
    is_active: 1,
  };

  await env.DB.prepare(`
    INSERT INTO api_keys (
      api_key_id, user_id, api_key_hash, key_prefix, name,
      last_used_at, created_at, expires_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.api_key_id, record.user_id, record.api_key_hash, record.key_prefix,
    record.name, null, record.created_at, record.expires_at || null, record.is_active
  ).run();

  return { apiKey, record };
}

/**
 * Validate an API key and return user info if valid
 */
export async function validateApiKey(
  apiKey: string,
  env: ApiKeyEnv
): Promise<ApiKeyValidationResult | null> {
  if (!apiKey.startsWith('wtyk_') || apiKey.length !== 69) {
    return null;
  }

  const apiKeyHash = await hashApiKey(apiKey);

  const keyRecord = await env.DB.prepare(`
    SELECT api_key_id, user_id, api_key_hash, expires_at, is_active
    FROM api_keys WHERE api_key_hash = ?
  `).bind(apiKeyHash).first<ApiKey>();

  if (!keyRecord || keyRecord.is_active !== 1) {
    return null;
  }

  if (keyRecord.expires_at && keyRecord.expires_at < Date.now()) {
    return null;
  }

  const user = await env.DB.prepare(`
    SELECT email, is_deleted FROM users WHERE user_id = ?
  `).bind(keyRecord.user_id).first<{ email: string; is_deleted: number }>();

  if (!user || user.is_deleted === 1) {
    return null;
  }

  // Update last_used_at
  try {
    await env.DB.prepare(`
      UPDATE api_keys SET last_used_at = ? WHERE api_key_id = ?
    `).bind(Date.now(), keyRecord.api_key_id).run();
  } catch {
    // Non-critical, continue
  }

  return { userId: keyRecord.user_id, email: user.email };
}

/**
 * List all API keys for a user
 */
export async function listUserApiKeys(
  env: ApiKeyEnv,
  userId: string
): Promise<ApiKey[]> {
  const results = await env.DB.prepare(`
    SELECT api_key_id, user_id, key_prefix, name, last_used_at, created_at, expires_at, is_active
    FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
  `).bind(userId).all<Omit<ApiKey, 'api_key_hash'>>();
  return results.results as ApiKey[];
}

/**
 * Revoke an API key (soft delete)
 */
export async function revokeApiKey(
  env: ApiKeyEnv,
  apiKeyId: string,
  userId: string
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE api_keys SET is_active = 0 WHERE api_key_id = ? AND user_id = ?
  `).bind(apiKeyId, userId).run();
  return (result.meta.changes || 0) > 0;
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}
